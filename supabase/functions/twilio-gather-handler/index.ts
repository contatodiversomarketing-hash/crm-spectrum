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
    const formData = await req.formData();
    const digits = formData.get("Digits")?.toString() || "";
    const callSid = formData.get("CallSid")?.toString() || "";
    const from = formData.get("From")?.toString() || "";

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
    Sua consulta foi confirmada com sucesso. Obrigado!
  </Say>
</Response>`;
    } else if (digits === "2") {
      // Remarcar - enviar WhatsApp
      await supabase.from("logs_decisao").insert({
        evento: "confirmacao_voz",
        decisao: "remarcar",
        regra_aplicada: "gather_digit_2",
        dados_entrada: { call_sid: callSid, from, digits },
        confianca: 1.0,
      });

      // Notificar via WhatsApp para reagendamento
      try {
        const coreApiUrl = Deno.env.get("CORE_API_URL");
        if (coreApiUrl) {
          await fetch(`${coreApiUrl}/receber-mensagem-whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: from,
              body: "Gostaria de remarcar minha consulta",
              tipo_interno: "remarcacao_via_ligacao",
            }),
          });
        }
      } catch (whatsappError) {
        console.error("Erro ao notificar WhatsApp:", whatsappError.message);
      }

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">
    Entendido. Vamos enviar uma mensagem pelo WhatsApp para reagendar sua consulta. Obrigado!
  </Say>
</Response>`;
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
