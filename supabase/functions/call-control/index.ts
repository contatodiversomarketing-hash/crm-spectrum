import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, basicAuth, twilioEnv, userFromRequest } from "../_shared/twilio.ts";

// Ações: end (encerra), test (verifica credenciais)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    const { action, callSid, callId } = await req.json().catch(() => ({}));
    const e = twilioEnv();

    if (action === "recording" && typeof callId === "string") {
      const sb = adminClient();
      const { data: call } = await sb.from("calls").select("agent_user_id, recording_url").eq("id", callId).maybeSingle();
      if (!call?.recording_url) return json({ error: "Sem gravação" }, 404);
      if (call.agent_user_id !== user.id) {
        const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
        if (!(roles ?? []).some((r) => r.role === "admin" || r.role === "supervisao")) return json({ error: "Sem permissão" }, 403);
      }
      const r = await fetch(call.recording_url, { headers: { Authorization: basicAuth() } });
      if (!r.ok) return json({ error: `Twilio ${r.status}` }, 502);
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
    }

    if (action === "test" || action === "configurar") {
      const issues: string[] = [];
      const base = `https://api.twilio.com/2010-04-01/Accounts/${e.accountSid}`;
      const voiceUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-outbound-call`;
      if (!/^AC[0-9a-f]{32}$/i.test(e.accountSid)) issues.push("Account SID em formato inválido");
      if (!/^AP[0-9a-f]{32}$/i.test(e.twimlAppSid)) issues.push("TwiML App SID em formato inválido");
      const a = await fetch(`${base}/Applications/${e.twimlAppSid}.json`, { headers: { Authorization: basicAuth() } });
      if (!a.ok) issues.push(`Twilio recusou o acesso (${a.status}) — confira Account SID, API Key e Secret`);
      else {
        const app = await a.json();
        if (app.voice_url !== voiceUrl) {
          if (action === "configurar") {
            const u = await fetch(`${base}/Applications/${e.twimlAppSid}.json`, {
              method: "POST", headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: "POST" }),
            });
            if (!u.ok) issues.push(`Não consegui ajustar a Voice URL (${u.status})`);
          } else issues.push(`Voice URL do TwiML App incorreta: ${app.voice_url || "(vazia)"}`);
        }
        const n = await fetch(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e.phone)}`, { headers: { Authorization: basicAuth() } });
        if (n.ok) {
          const nj = await n.json();
          if (!nj.incoming_phone_numbers?.length) issues.push(`O número ${e.phone} não foi encontrado nesta conta Twilio`);
        }
      }
      return json({ status: issues.length ? "ISSUES_FOUND" : "Twilio OK", issues });
    }

    if (action === "end" && typeof callSid === "string" && /^CA[0-9a-f]{32}$/i.test(callSid)) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.accountSid}/Calls/${callSid}.json`, {
        method: "POST", headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Status: "completed" }),
      });
      return json({ ok: true });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
