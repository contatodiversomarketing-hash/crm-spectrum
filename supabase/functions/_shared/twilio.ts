import { createClient } from "npm:@supabase/supabase-js@2";

export const normalizeSecret = (v?: string | null) => (v ?? "").trim().replace(/^['"]|['"]$/g, "");

export function twilioEnv() {
  return {
    accountSid: normalizeSecret(Deno.env.get("TWILIO_ACCOUNT_SID")),
    authToken: normalizeSecret(Deno.env.get("TWILIO_AUTH_TOKEN")),
    phone: normalizePhoneBR(normalizeSecret(Deno.env.get("TWILIO_PHONE_NUMBER"))) || normalizeSecret(Deno.env.get("TWILIO_PHONE_NUMBER")),
    apiKey: normalizeSecret(Deno.env.get("TWILIO_API_KEY")),
    apiSecret: normalizeSecret(Deno.env.get("TWILIO_API_SECRET")),
    twimlAppSid: normalizeSecret(Deno.env.get("TWILIO_TWIML_APP_SID")),
  };
}

export function basicAuth() {
  const e = twilioEnv();
  return "Basic " + btoa(`${e.accountSid}:${e.authToken}`);
}

/** +55 + DDD + número. Retorna null se inválido. */
export function normalizePhoneBR(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55") || d.length <= 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return "+" + d;
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function userFromRequest(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await sb.auth.getUser(auth.slice(7));
  return data.user ?? null;
}

export const twiml = (inner: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

export const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function transcrever(mp3Url: string): Promise<string> {
  const audio = await fetch(mp3Url, { headers: { Authorization: basicAuth() } });
  if (!audio.ok) throw new Error(`download gravação ${audio.status}`);
  const b64 = toBase64(await audio.arrayBuffer());
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.5-transcribe",
      messages: [
        { role: "system", content: "Transcreva a ligação em português do Brasil, identificando 'Atendente:' e 'Paciente:' quando possível. Responda só com a transcrição." },
        { role: "user", content: [
          { type: "text", text: "Transcreva este áudio." },
          { type: "input_audio", input_audio: { data: b64, format: "mp3" } },
        ] },
      ],
    }),
  });
  if (!r.ok) throw new Error(`transcrição ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j?.choices?.[0]?.message?.content ?? "").trim();
}

async function analisar(transcricao: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions:
        "Você avalia ligações comerciais da equipe da Dra. Amélia Carvalho (TEA, TDAH, cannabis medicinal). Dê notas de 0 a 100. Responda SOMENTE um JSON: {\"nota_geral\":n,\"rapport\":n,\"objecoes\":n,\"fechamento\":n,\"cordialidade\":n,\"feedback\":\"até 4 frases práticas em português\"}.",
      input: [{ role: "user", content: `Transcrição da ligação:\n${transcricao.slice(0, 30000)}` }],
    }),
  });
  if (!r.ok || !r.body) throw new Error(`análise ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const p = l.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
      } catch { /* ignore */ }
    }
  }
  const m = out.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

/** Transcreve a gravação e gera nota do atendente. Seguro para rodar em segundo plano. */
export async function processarGravacaoLigacao(callId: string) {
  const sb = adminClient();
  const { data: call } = await sb.from("calls").select("*").eq("id", callId).maybeSingle();
  if (!call?.recording_url || call.transcription) return;
  try {
    const texto = await transcrever(call.recording_url);
    await sb.from("calls").update({ transcription: texto || "(sem fala detectada)" }).eq("id", callId);
    if (texto.length < 40) return;
    const nota = await analisar(texto);
    if (!nota) return;
    const n = (k: string) => (typeof nota[k] === "number" ? Math.round(nota[k] as number) : null);
    await sb.from("consultant_scores").insert({
      call_id: callId, agent_user_id: call.agent_user_id,
      nota_geral: n("nota_geral"), rapport: n("rapport"), objecoes: n("objecoes"),
      fechamento: n("fechamento"), cordialidade: n("cordialidade"),
      feedback: typeof nota.feedback === "string" ? nota.feedback : null,
    });
  } catch (e) {
    console.error("[ligacao] processamento falhou", (e as Error).message);
    await sb.from("call_events").insert({ call_id: callId, event: "processamento_erro", payload: { erro: (e as Error).message } });
  }
}
