import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    const digits = params.get("Digits") || "";
    const callSid = params.get("CallSid") || "";
    const from = params.get("From") || "";

    // clinica_id pode vir via query param do webhook URL
    const url = new URL(req.url);
    const clinica_id = url.searchParams.get("clinica_id");

    console.log(`Gather recebido: Digits=${digits}, CallSid=${callSid}, From=${from}`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let twiml: string;

    if (digits === "1") {
      await supabase.from("logs_decisao").insert({
        evento: "confirmacao_voz", decisao: "confirmado", regra_aplicada: "gather_digit_1",
        dados_entrada: { call_sid: callSid, from, digits }, confianca: 1.0,
        ...(clinica_id && { clinica_id }),
      });
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="pt-BR">Obrigado. Sua consulta está confirmada. Até breve.</Say></Response>`;
    } else if (digits === "2") {
      const numeroLimpo = from.replace(/[^\d+]/g, "").replace(/^\+55/, "");
      const pacienteExternoId = `tel:${numeroLimpo}`;

      let reativQuery = supabase.from("automacoes").select("id").eq("paciente_externo_id", pacienteExternoId).eq("tipo", "reativacao_voz").eq("status", "ligado").order("criado_em", { ascending: false }).limit(1);
      if (clinica_id) reativQuery = reativQuery.eq("clinica_id", clinica_id);
      const { data: reativacaoRecente } = await reativQuery.maybeSingle();

      if (reativacaoRecente) {
        const bloqueioAte = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("automacoes").update({ status: "nao_interessado_temporario" }).eq("id", reativacaoRecente.id);

        let memQuery = supabase.from("memorias_ia").select("id").eq("paciente_externo_id", pacienteExternoId);
        if (clinica_id) memQuery = memQuery.eq("clinica_id", clinica_id);
        const { data: memoriaExistente } = await memQuery.maybeSingle();

        if (memoriaExistente) {
          await supabase.from("memorias_ia").update({ risco_classificacao: "opt_out_temporario", ultima_interacao: new Date().toISOString(), bloqueio_ate: bloqueioAte }).eq("id", memoriaExistente.id);
        } else {
          await supabase.from("memorias_ia").insert({ paciente_externo_id: pacienteExternoId, risco_classificacao: "opt_out_temporario", ultima_interacao: new Date().toISOString(), bloqueio_ate: bloqueioAte, ...(clinica_id && { clinica_id }) });
        }

        await supabase.from("logs_decisao").insert({ evento: "opt_out_90_dias", decisao: "nao_interessado_temporario", regra_aplicada: "gather_digit_2_reativacao", dados_entrada: { call_sid: callSid, from, digits, bloqueio_ate: bloqueioAte }, confianca: 1.0, ...(clinica_id && { clinica_id }) });

        twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="pt-BR">Entendido. Não entraremos em contato pelos próximos meses. Se precisar, estaremos à disposição. Obrigado.</Say></Response>`;
      } else {
        await supabase.from("logs_decisao").insert({ evento: "confirmacao_voz", decisao: "remarcar", regra_aplicada: "gather_digit_2", dados_entrada: { call_sid: callSid, from, digits }, confianca: 1.0, ...(clinica_id && { clinica_id }) });

        let whatsappOk = false;
        try {
          const orqRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orquestrador-principal`, {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
            body: JSON.stringify({ numero_remetente: numeroLimpo, mensagem: "Preciso remarcar minha consulta.", timestamp: new Date().toISOString(), ...(clinica_id && { clinica_id }) }),
          });
          whatsappOk = orqRes.ok;
          await orqRes.json();
        } catch (orqError) { console.error("Erro orquestrador:", orqError); }

        twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="pt-BR">Sem problemas. ${whatsappOk ? "Enviaremos uma mensagem pelo WhatsApp para reagendar." : "Tentaremos enviar uma mensagem em breve."}</Say></Response>`;
      }
    } else {
      await supabase.from("logs_decisao").insert({ evento: "confirmacao_voz", decisao: "sem_resposta", regra_aplicada: "gather_invalid", dados_entrada: { call_sid: callSid, from, digits }, confianca: 0, ...(clinica_id && { clinica_id }) });
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="pt-BR">Não entendemos sua resposta. Encerrando a chamada.</Say></Response>`;
    }

    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    console.error("Erro twilio-gather-handler:", error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="pt-BR">Ocorreu um erro. Encerrando chamada.</Say></Response>`, { headers: { "Content-Type": "text/xml" } });
  }
});
