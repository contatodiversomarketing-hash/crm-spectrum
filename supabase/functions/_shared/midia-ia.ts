// Ana entende áudio, imagem e PDF recebidos pelo WhatsApp.
const GW = "https://ai.gateway.lovable.dev/v1";

function b64Limpo(b64: string) {
  let s = b64.replace(/^data:[^,]+,/, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const r = s.length % 4;
  if (r === 2) s += "=="; else if (r === 3) s += "="; else if (r === 1) s = s.slice(0, -1);
  return s;
}
const bytesDe = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function transcreverAudioIA(base64: string, mimetype: string): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const mime = (mimetype || "audio/ogg").split(";")[0].trim();
  const ext = mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
    : mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : "ogg";
  const fd = new FormData();
  fd.append("file", new Blob([bytesDe(b64Limpo(base64))], { type: mime }), `audio.${ext}`);
  fd.append("model", "openai/gpt-transcribe");
  fd.append("language", "pt");
  const r = await fetch(`${GW}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!r.ok) { console.error(`[midia-ia] transcrição ${r.status}: ${(await r.text()).slice(0, 300)}`); return null; }
  const j = await r.json().catch(() => null);
  const t = (j?.text ?? "").trim();
  return t || null;
}

/** Lê imagem ou PDF e devolve um resumo em texto do conteúdo. */
export async function lerArquivoIA(base64: string, mimetype: string, nome = "arquivo"): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const b64 = b64Limpo(base64);
  const mime = (mimetype || "").split(";")[0].trim();
  const parte = mime.includes("pdf")
    ? { type: "input_file", filename: nome.endsWith(".pdf") ? nome : `${nome}.pdf`, file_data: `data:application/pdf;base64,${b64}` }
    : { type: "input_image", image_url: `data:${mime || "image/jpeg"};base64,${b64}` };
  const r = await fetch(`${GW}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true, store: false,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [
        { type: "input_text", text: "Um paciente de uma clínica de neurodesenvolvimento enviou este arquivo pelo WhatsApp. Descreva em português, de forma objetiva (até 15 linhas), o que ele contém: transcreva textos importantes (laudos, receitas, exames, comprovantes de Pix com valor, data e nome). Não invente nada." },
        parte,
      ] }],
    }),
  });
  if (!r.ok || !r.body) { console.error(`[midia-ia] leitura ${r.status}: ${(await r.text()).slice(0, 300)}`); return null; }
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const linhas = buf.split("\n"); buf = linhas.pop() ?? "";
    for (const l of linhas) {
      if (!l.startsWith("data:")) continue;
      try { const ev = JSON.parse(l.slice(5).trim()); if (ev.type === "response.output_text.delta") out += ev.delta ?? ""; } catch { /* */ }
    }
  }
  return out.trim() || null;
}
