import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { twilioEnv, userFromRequest } from "../_shared/twilio.ts";

const b64url = (s: string | Uint8Array) => {
  const bytes = typeof s === "string" ? new TextEncoder().encode(s) : s;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    const e = twilioEnv();
    if (!e.accountSid || !e.apiKey || !e.apiSecret || !e.twimlAppSid) return json({ error: "Configuração Twilio incompleta" }, 500);

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" };
    const payload = {
      jti: `${e.apiKey}-${now}`, iss: e.apiKey, sub: e.accountSid, iat: now, exp: now + 3600,
      grants: { identity: user.id, voice: { incoming: { allow: true }, outgoing: { application_sid: e.twimlAppSid } } },
    };
    const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(e.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
    return json({ token: `${data}.${b64url(sig)}`, identity: user.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
