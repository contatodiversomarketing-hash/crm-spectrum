import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enviarTextoMega } from "../_shared/mega.ts";
import { avisoEstaVencido, TEXTO_AVISO_ESPERA } from "../_shared/aviso-espera.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Configuração ausente" }, 500);
  const db = createClient(url, key);
  const token = req.headers.get("x-espera-token");
  if (!token || token.length !== 64) return json({ error: "Não autorizado" }, 401);
  const { data: config, error: configError } = await db.from("aviso_espera_config").select("token").eq("id", true).single();
  if (configError || config?.token !== token) return json({ error: "Não autorizado" }, 401);

  const { data: fila, error } = await db.rpc("reservar_avisos_espera");
  if (error) return json({ error: "Não foi possível consultar a fila" }, 500);
  let enviados = 0;
  for (const item of fila || []) {
    if (!avisoEstaVencido(item.inicio_espera, Date.now())) continue;
    // Re-read immediately before sending: a human response cancels this episode.
    const { data: atual } = await db.from("avisos_espera_atendimento").select("estado, episodio").eq("telefone", item.telefone).single();
    if (atual?.estado !== "enviando" || atual.episodio !== item.episodio) continue;
    let estado = "falhou";
    try {
      const envio = await enviarTextoMega(item.telefone, TEXTO_AVISO_ESPERA);
      estado = envio.ok ? "enviado" : "falhou";
      const { error: logError } = await db.from("interacoes_ia").insert({
        paciente_externo_id: item.telefone, canal: "whatsapp", sistema_origem: "ana_aviso_espera",
        mensagem_usuario: null, resposta_final: TEXTO_AVISO_ESPERA,
        estado_conversa: "aviso_espera_atendente", intencao_detectada: "aviso_demora_2h",
        supervisionado: false, whatsapp_message_id: envio.messageId ?? null,
        whatsapp_status: envio.ok ? "accepted" : "failed",
        whatsapp_erro: envio.ok ? null : "WhatsApp recusou o aviso de espera",
      });
      if (logError) console.error("[aviso-espera] Não foi possível registrar o resultado");
      if (envio.ok) enviados++;
    } catch {
      // An ambiguous network outcome must not cause an automatic duplicate send.
      console.error("[aviso-espera] Resultado do envio não confirmado; sem repetição automática");
    }
    await db.from("avisos_espera_atendimento").update({ estado }).eq("telefone", item.telefone).eq("episodio", item.episodio).eq("estado", "enviando");
  }
  await db.rpc("desarmar_avisos_espera");
  return json({ enviados });
});