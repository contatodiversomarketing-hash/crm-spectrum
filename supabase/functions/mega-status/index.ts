import { megaConfig, datafyConfig, provedorAtivo, instanciaConectada, instanciaMegaConectada, enviarTextoMega } from "../_shared/mega.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const provedor = provedorAtivo();
  const datafy = datafyConfig();
  const mega = megaConfig();

  const out: Record<string, unknown> = {
    provedor,
    datafy: { configurado: datafy.configurado, base: datafy.base, phone_number_id: datafy.phoneNumberId },
    mega: { configurado: mega.configurado, origin: mega.origin, instanceKey: mega.instanceKey },
  };

  out.conexao = await instanciaConectada();
  out.conexao_reserva = await instanciaMegaConectada();

  let numero: string | undefined;
  try {
    const b = await req.json();
    numero = b?.numero;
  } catch { /* sem body */ }

  if (numero) {
    const teste = await enviarTextoMega(numero, "Teste de conexão da Ana ✅");
    out.teste_envio = { ok: teste.ok, status: teste.status, body: teste.body.slice(0, 800) };
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
