import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);

    const callSid = params.get("CallSid") || "";
    const callStatus = params.get("CallStatus") || "";
    const from = params.get("From") || "";
    const to = params.get("To") || "";
    const duration = params.get("CallDuration") || "0";
    const direction = params.get("Direction") || "";
    const timestamp = params.get("Timestamp") || new Date().toISOString();

    console.log(`[call-events] CallSid=${callSid} Status=${callStatus} From=${from} To=${to} Duration=${duration}s`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Log every status event
    await supabase.from("logs_decisao").insert({
      evento: "call_status_event",
      decisao: callStatus,
      regra_aplicada: `twilio_callback_${callStatus}`,
      confianca: 1.0,
      dados_entrada: {
        call_sid: callSid,
        from,
        to,
        duration: parseInt(duration),
        direction,
        timestamp,
        all_params: Object.fromEntries(params.entries()),
      },
    });

    // On completed/failed/busy/no-answer, update the automation record
    if (["completed", "failed", "busy", "no-answer", "canceled"].includes(callStatus)) {
      const statusMap: Record<string, string> = {
        completed: "atendido",
        failed: "falhou",
        busy: "ocupado",
        "no-answer": "sem_resposta",
        canceled: "cancelado",
      };

      const { data: automacao } = await supabase
        .from("automacoes")
        .select("id")
        .filter("payload->>call_sid", "eq", callSid)
        .in("tipo", ["reativacao_voz", "confirmacao_voz"])
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (automacao) {
        await supabase
          .from("automacoes")
          .update({
            status: statusMap[callStatus] || callStatus,
            ...(callStatus === "completed" && { respondeu: true }),
          })
          .eq("id", automacao.id);

        console.log(`[call-events] Automação ${automacao.id} atualizada para ${statusMap[callStatus]}`);
      }
    }

    // Twilio expects 200 + TwiML or empty
    return new Response("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[call-events] Erro:", (error as Error).message);
    return new Response("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  }
});
