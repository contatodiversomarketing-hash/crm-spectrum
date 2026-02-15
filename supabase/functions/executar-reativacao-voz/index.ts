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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER")!;
    const twilioAuth = btoa(`${twilioSid}:${twilioToken}`);

    if (!twilioSid || !twilioToken || !twilioPhone) {
      throw new Error("Configuração Twilio ausente");
    }

    // 1. Buscar automações de reativação enviadas há mais de 48h sem resposta
    const limite48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: candidatos, error: fetchError } = await supabase
      .from("automacoes")
      .select("*")
      .eq("tipo", "reativacao_score")
      .eq("status", "enviado")
      .eq("respondeu", false)
      .lt("criado_em", limite48h)
      .order("criado_em", { ascending: true })
      .limit(100); // buscar mais para filtrar por score

    if (fetchError) {
      throw new Error(`Erro ao buscar automações: ${fetchError.message}`);
    }

    if (!candidatos || candidatos.length === 0) {
      return new Response(
        JSON.stringify({ status: "sem_candidatos", ligacoes: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Filtrar por score > 70 e limitar a 20
    const filtrados = candidatos
      .filter((a) => {
        const payload = a.payload as Record<string, unknown> | null;
        const score = Number(payload?.score ?? 0);
        return score > 70;
      })
      .slice(0, 20);

    console.log(`[reativacao-voz] ${filtrados.length} candidatos com score > 70 (de ${candidatos.length} total)`);

    // 2b. Filtrar pacientes com bloqueio ativo (opt-out temporário)
    const pacienteIds = filtrados.map((a) => a.paciente_externo_id);
    const { data: bloqueados } = await supabase
      .from("memorias_ia")
      .select("paciente_externo_id, bloqueio_ate")
      .in("paciente_externo_id", pacienteIds)
      .gt("bloqueio_ate", new Date().toISOString());

    const bloqueadosSet = new Set((bloqueados || []).map((b) => b.paciente_externo_id));
    const filtradosSemBloqueio = filtrados.filter((a) => !bloqueadosSet.has(a.paciente_externo_id));
    console.log(`[reativacao-voz] ${bloqueadosSet.size} bloqueados por opt-out, ${filtradosSemBloqueio.length} aptos`);

    // 3. Verificar ligações já feitas hoje para evitar duplicação
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioHoje = hoje.toISOString();

    const { data: jaLigados } = await supabase
      .from("automacoes")
      .select("paciente_externo_id")
      .eq("tipo", "reativacao_voz")
      .gte("criado_em", inicioHoje);

    const jaLigadosSet = new Set((jaLigados || []).map((r) => r.paciente_externo_id));

    const relatorio: Array<{
      paciente_externo_id: string;
      status: string;
      call_sid?: string;
      erro?: string;
    }> = [];

    for (const automacao of filtradosSemBloqueio) {
      const pacienteId = automacao.paciente_externo_id;

      // Evitar duplicação no mesmo dia
      if (jaLigadosSet.has(pacienteId)) {
        relatorio.push({ paciente_externo_id: pacienteId, status: "ja_ligado_hoje" });
        continue;
      }

      // Extrair telefone do paciente_externo_id (formato tel:XXXXXXXXXX)
      const telefoneRaw = pacienteId.replace("tel:", "");
      if (!telefoneRaw || telefoneRaw.length < 10) {
        relatorio.push({ paciente_externo_id: pacienteId, status: "telefone_invalido" });
        continue;
      }

      const telefoneFormatado = telefoneRaw.startsWith("+") ? telefoneRaw : `+55${telefoneRaw.replace(/\D/g, "")}`;

      // Extrair nome do payload se disponível
      const payload = automacao.payload as Record<string, unknown> | null;
      const nome = (payload?.nome as string) || "Paciente";

      // Montar URL do webhook
      const webhookParams = new URLSearchParams({
        tipo: "reativacao",
        nome,
      });
      const webhookUrl = `https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook?${webhookParams.toString()}`;

      try {
        const callParams = new URLSearchParams({
          To: telefoneFormatado,
          From: twilioPhone,
          Url: webhookUrl,
        });

        const callRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: callParams.toString(),
          }
        );

        if (!callRes.ok) {
          const errText = await callRes.text();
          console.error(`[reativacao-voz] Erro Twilio para ${pacienteId}:`, errText);
          relatorio.push({ paciente_externo_id: pacienteId, status: "erro_twilio", erro: errText.slice(0, 200) });
          continue;
        }

        const callData = await callRes.json();
        console.log(`[reativacao-voz] Chamada iniciada para ${pacienteId}: ${callData.sid}`);

        // Registrar nova automação tipo reativacao_voz
        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteId,
          tipo: "reativacao_voz",
          status: "ligado",
          sistema_alvo: "twilio",
          payload: {
            call_sid: callData.sid,
            score: payload?.score,
            origem_automacao_id: automacao.id,
          },
        });

        jaLigadosSet.add(pacienteId);
        relatorio.push({ paciente_externo_id: pacienteId, status: "ligacao_iniciada", call_sid: callData.sid });
      } catch (callError) {
        console.error(`[reativacao-voz] Erro ao ligar para ${pacienteId}:`, callError.message);
        relatorio.push({ paciente_externo_id: pacienteId, status: "erro", erro: callError.message });
      }
    }

    // Registrar log
    await supabase.from("logs_decisao").insert({
      evento: "reativacao_voz_batch",
      decisao: `${relatorio.filter((r) => r.status === "ligacao_iniciada").length} ligacoes iniciadas`,
      regra_aplicada: "score>70, max=20/dia, 48h sem resposta",
      confianca: 1.0,
      dados_entrada: { total_candidatos: candidatos.length, filtrados: filtrados.length, relatorio },
    });

    return new Response(
      JSON.stringify({
        status: "executado",
        total_candidatos: candidatos.length,
        filtrados: filtrados.length,
        ligacoes_iniciadas: relatorio.filter((r) => r.status === "ligacao_iniciada").length,
        relatorio,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[reativacao-voz] Erro:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
