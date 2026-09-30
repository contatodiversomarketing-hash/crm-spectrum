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
    const { action, callSid } = await req.json().catch(() => ({}));
    const e = twilioEnv();

    if (action === "test") {
      const issues: string[] = [];
      for (const [k, v] of Object.entries(e)) if (!v) issues.push(`${k} ausente`);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.accountSid}.json`, { headers: { Authorization: basicAuth() } });
      if (!r.ok) issues.push(`Conta Twilio respondeu ${r.status} (SID começa com "${e.accountSid.slice(0, 2)}", ${e.accountSid.length} caracteres; token com ${e.authToken.length} caracteres)`);
      if (!/^AC[0-9a-f]{32}$/i.test(e.accountSid)) issues.push("TWILIO_ACCOUNT_SID não tem o formato AC + 32 caracteres");
      if (!/^SK[0-9a-f]{32}$/i.test(e.apiKey)) issues.push("TWILIO_API_KEY não tem o formato SK + 32 caracteres");
      if (!/^AP[0-9a-f]{32}$/i.test(e.twimlAppSid)) issues.push("TWILIO_TWIML_APP_SID não tem o formato AP + 32 caracteres");
      if (e.twimlAppSid) {
        const a = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.accountSid}/Applications/${e.twimlAppSid}.json`, { headers: { Authorization: basicAuth() } });
        if (!a.ok) issues.push(`TwiML App respondeu ${a.status}`);
        else {
          const app = await a.json();
          if (!String(app.voice_url ?? "").includes("twilio-outbound-call")) issues.push(`Voice URL do TwiML App incorreta: ${app.voice_url || "(vazia)"}`);
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
