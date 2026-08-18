import { megaConfig, enviarTextoMega } from "../_shared/mega.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { origin, token, instanceKey, configurado } = megaConfig();
  const out: Record<string, unknown> = { configurado, origin, instanceKey };

  if (configurado) {
    try {
      const r = await fetch(`${origin}/rest/instance/${instanceKey}`, {
        headers: { Authorization: `Bearer ${token}`, apikey: token },
      });
      out.instancia_status = r.status;
      out.instancia_body = (await r.text()).slice(0, 800);
    } catch (e) {
      out.instancia_erro = String(e);
    }

    let numero: string | undefined;
    try {
      const b = await req.json();
      numero = b?.numero;
    } catch { /* sem body */ }

    if (numero) {
      const teste = await enviarTextoMega(numero, "Teste de conexão da Ana ✅");
      out.teste_envio = { ok: teste.ok, status: teste.status, body: teste.body.slice(0, 800) };
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
