import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Twilio envia como application/x-www-form-urlencoded
    const body = await req.text();
    const params = new URLSearchParams(body);
    const digits = params.get("Digits") || "";
    const callSid = params.get("CallSid") || "";
    const from = params.get("From") || "";

    console.log(`Gather recebido: Digits=${digits}, CallSid=${callSid}, From=${from}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let twiml: string;

    if (digits === "1") {
      // Confirmar agendamento
      await supabase.from("logs_decisao").insert({
        evento: "confirmacao_voz",
        decisao: "confirmado",
        regra_aplicada: "gather_digit_1",
        dados_entrada: { call_sid: callSid, from, digits },
        confianca: 1.0,
      });

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">
    Obrigado. Sua consulta está confirmada.
    Até breve.
  </Say>
</Response>`;
    } else if (digits === "2") {
      const numeroLimpo = from.replace(/[^\d+]/g, "").replace(/^\+55/, "");
      const pacienteExternoId = `tel:${numeroLimpo}`;

      // Verificar se veio de uma chamada de reativação (checando automacoes recentes)
      const { data: reativacaoRecente } = await supabase
        .from("automacoes")
        .select("id")
        .eq("paciente_externo_id", pacienteExternoId)
        .eq("tipo", "reativacao_voz")
        .eq("status", "ligado")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reativacaoRecente) {
        // === OPT-OUT REATIVAÇÃO: 90 dias de bloqueio ===
        const bloqueioAte = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        // Atualizar automação
        await supabase
          .from("automacoes")
          .update({ status: "nao_interessado_temporario" })
          .eq("id", reativacaoRecente.id);

        // Upsert memória com bloqueio
        const { data: memoriaExistente } = await supabase
          .from("memorias_ia")
          .select("id")
          .eq("paciente_externo_id", pacienteExternoId)
          .maybeSingle();

        if (memoriaExistente) {
          await supabase.from("memorias_ia").update({
            risco_classificacao: "opt_out_temporario",
            ultima_interacao: new Date().toISOString(),
            bloqueio_ate: bloqueioAte,
          }).eq("id", memoriaExistente.id);
        } else {
          await supabase.from("memorias_ia").insert({
            paciente_externo_id: pacienteExternoId,
            risco_classificacao: "opt_out_temporario",
            ultima_interacao: new Date().toISOString(),
            bloqueio_ate: bloqueioAte,
          });
        }

        await supabase.from("logs_decisao").insert({
          evento: "opt_out_90_dias",
          decisao: "nao_interessado_temporario",
          regra_aplicada: "gather_digit_2_reativacao",
          dados_entrada: { call_sid: callSid, from, digits, bloqueio_ate: bloqueioAte },
          confianca: 1.0,
        });

        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">
    Entendido. Não entraremos em contato pelos próximos meses.
    Se precisar de algo, estaremos à disposição.
    Obrigado.
  </Say>
</Response>`;
      } else {
        // === REMARCAR CONSULTA (fluxo original) ===
        await supabase.from("logs_decisao").insert({
          evento: "confirmacao_voz",
          decisao: "remarcar",
          regra_aplicada: "gather_digit_2",
          dados_entrada: { call_sid: callSid, from, digits },
          confianca: 1.0,
        });

        let whatsappOk = false;
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

          const orqRes = await fetch(`${supabaseUrl}/functions/v1/orquestrador-principal`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              numero_remetente: numeroLimpo,
              mensagem: "Preciso remarcar minha consulta.",
              timestamp: new Date().toISOString(),
            }),
          });

          const orqData = await orqRes.json();
          whatsappOk = orqRes.ok;
          console.log(`Orquestrador resposta (${orqRes.status}):`, JSON.stringify(orqData).slice(0, 200));
        } catch (orqError) {
          console.error("Erro ao chamar orquestrador-principal:", orqError.message);
        }

        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">
    Sem problemas.
    ${whatsappOk ? "Enviaremos uma mensagem pelo WhatsApp para reagendar." : "Tentaremos enviar uma mensagem para reagendar em breve."}
  </Say>
</Response>`;
      }
    } else {
      // Entrada inválida
      await supabase.from("logs_decisao").insert({
        evento: "confirmacao_voz",
        decisao: "sem_resposta",
        regra_aplicada: "gather_invalid",
        dados_entrada: { call_sid: callSid, from, digits },
        confianca: 0,
      });

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">
    Não entendemos sua resposta. Encerrando a chamada.
  </Say>
</Response>`;
    }

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Erro no twilio-gather-handler:", error.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">Ocorreu um erro. Encerrando chamada.</Say>
</Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
});
