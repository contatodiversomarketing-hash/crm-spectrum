import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER")!;
    const twilioAuth = btoa(`${twilioSid}:${twilioToken}`);

    if (!twilioSid || !twilioToken || !twilioPhone) throw new Error("Configuração Twilio ausente");

    // Validar plano
    if (clinica_id) {
      const validacao = await fetch(`https://chilmuwijkkdefqizleh.supabase.co/functions/v1/validar-plano-clinica`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        body: JSON.stringify({ clinica_id, tipo_uso: "ligacao" }),
      });
      if (!validacao.ok) {
        const vData = await validacao.json();
        return new Response(JSON.stringify({ error: vData.erro || "Limite atingido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const limite48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    let candidatosQuery = supabase.from("automacoes").select("*").eq("tipo", "reativacao_score").eq("status", "enviado").eq("respondeu", false).lt("criado_em", limite48h).order("criado_em", { ascending: true }).limit(100);
    if (clinica_id) candidatosQuery = candidatosQuery.eq("clinica_id", clinica_id);

    const { data: candidatos, error: fetchError } = await candidatosQuery;
    if (fetchError) throw new Error(`Erro ao buscar automações: ${fetchError.message}`);
    if (!candidatos || candidatos.length === 0) {
      return new Response(JSON.stringify({ status: "sem_candidatos", ligacoes: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const filtrados = candidatos.filter((a) => {
      const payload = a.payload as Record<string, unknown> | null;
      return Number(payload?.score ?? 0) > 70;
    }).slice(0, 20);

    const pacienteIds = filtrados.map((a) => a.paciente_externo_id);
    let bloqQuery = supabase.from("memorias_ia").select("paciente_externo_id, bloqueio_ate").in("paciente_externo_id", pacienteIds).gt("bloqueio_ate", new Date().toISOString());
    if (clinica_id) bloqQuery = bloqQuery.eq("clinica_id", clinica_id);
    const { data: bloqueados } = await bloqQuery;
    const bloqueadosSet = new Set((bloqueados || []).map((b) => b.paciente_externo_id));
    const filtradosSemBloqueio = filtrados.filter((a) => !bloqueadosSet.has(a.paciente_externo_id));

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let jaLigQuery = supabase.from("automacoes").select("paciente_externo_id").eq("tipo", "reativacao_voz").gte("criado_em", hoje.toISOString());
    if (clinica_id) jaLigQuery = jaLigQuery.eq("clinica_id", clinica_id);
    const { data: jaLigados } = await jaLigQuery;
    const jaLigadosSet = new Set((jaLigados || []).map((r) => r.paciente_externo_id));

    const relatorio: Array<{ paciente_externo_id: string; status: string; call_sid?: string; erro?: string }> = [];

    for (const automacao of filtradosSemBloqueio) {
      const pacienteId = automacao.paciente_externo_id;
      if (jaLigadosSet.has(pacienteId)) { relatorio.push({ paciente_externo_id: pacienteId, status: "ja_ligado_hoje" }); continue; }

      const telefoneRaw = pacienteId.replace("tel:", "");
      if (!telefoneRaw || telefoneRaw.length < 10) { relatorio.push({ paciente_externo_id: pacienteId, status: "telefone_invalido" }); continue; }

      const telefoneFormatado = telefoneRaw.startsWith("+") ? telefoneRaw : `+55${telefoneRaw.replace(/\D/g, "")}`;
      const payload = automacao.payload as Record<string, unknown> | null;
      const nome = (payload?.nome as string) || "Paciente";

      const webhookParams = new URLSearchParams({ tipo: "reativacao", nome });
      const webhookUrl = `https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook?${webhookParams.toString()}`;

      try {
        const recordingCallback = "https://chilmuwijkkdefqizleh.supabase.co/functions/v1/processar-gravacao";
        const callParams = new URLSearchParams({ To: telefoneFormatado, From: twilioPhone, Url: webhookUrl, Record: "true", RecordingStatusCallback: recordingCallback, RecordingStatusCallbackEvent: "completed" });
        const callRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${twilioAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: callParams.toString(),
        });

        if (!callRes.ok) {
          const errText = await callRes.text();
          relatorio.push({ paciente_externo_id: pacienteId, status: "erro_twilio", erro: errText.slice(0, 200) });
          continue;
        }

        const callData = await callRes.json();
        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteId, tipo: "reativacao_voz", status: "ligado", sistema_alvo: "twilio",
          payload: { call_sid: callData.sid, score: payload?.score, origem_automacao_id: automacao.id },
          ...(clinica_id && { clinica_id }),
        });

        jaLigadosSet.add(pacienteId);
        relatorio.push({ paciente_externo_id: pacienteId, status: "ligacao_iniciada", call_sid: callData.sid });
      } catch (callError) {
        relatorio.push({ paciente_externo_id: pacienteId, status: "erro", erro: (callError as Error).message });
      }
    }

    await supabase.from("logs_decisao").insert({
      evento: "reativacao_voz_batch",
      decisao: `${relatorio.filter((r) => r.status === "ligacao_iniciada").length} ligacoes iniciadas`,
      regra_aplicada: "score>70, max=20/dia, 48h sem resposta",
      confianca: 1.0,
      dados_entrada: { total_candidatos: candidatos.length, filtrados: filtrados.length, relatorio },
      ...(clinica_id && { clinica_id }),
    });

    // Incrementar uso mensal
    if (clinica_id) {
      const ligacoesFeitas = relatorio.filter((r) => r.status === "ligacao_iniciada").length;
      if (ligacoesFeitas > 0) {
        const agora = new Date();
        const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
        const { data: existing } = await supabase.from("uso_mensal_clinica").select("id, ligacoes_realizadas").eq("clinica_id", clinica_id).eq("mes_referencia", mesRef).maybeSingle();
        if (existing) {
          await supabase.from("uso_mensal_clinica").update({ ligacoes_realizadas: (existing.ligacoes_realizadas || 0) + ligacoesFeitas }).eq("id", existing.id);
        } else {
          await supabase.from("uso_mensal_clinica").insert({ clinica_id, mes_referencia: mesRef, ligacoes_realizadas: ligacoesFeitas });
        }
      }
    }

    return new Response(JSON.stringify({
      status: "executado", total_candidatos: candidatos.length, filtrados: filtrados.length,
      ligacoes_iniciadas: relatorio.filter((r) => r.status === "ligacao_iniciada").length, relatorio,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[reativacao-voz] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
