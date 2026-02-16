import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paciente_externo_id } = await req.json();

    if (!paciente_externo_id) {
      return new Response(
        JSON.stringify({ error: "paciente_externo_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar paciente via API Gestão
    const gestaoApiUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoApiToken = Deno.env.get("GESTAO_API_TOKEN");

    if (!gestaoApiUrl || !gestaoApiToken) {
      throw new Error("Configuração da API de Gestão ausente");
    }

    const pacienteRes = await fetch(`${gestaoApiUrl}/internal-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gestaoApiToken}`,
      },
      body: JSON.stringify({
        action: "get_patient",
        patient_id: paciente_externo_id,
      }),
    });

    if (!pacienteRes.ok) {
      throw new Error(`Erro ao buscar paciente: ${pacienteRes.status}`);
    }

    const paciente = await pacienteRes.json();
    const telefone = paciente?.phone || paciente?.telefone;
    const nomePaciente = paciente?.name || paciente?.nome || "paciente";

    // Validar telefone
    if (!telefone || typeof telefone !== "string" || telefone.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Telefone do paciente inválido ou não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formatar telefone (garantir prefixo +55 se necessário)
    const telefoneFormatado = telefone.startsWith("+") ? telefone : `+55${telefone.replace(/\D/g, "")}`;

    // Iniciar chamada via Twilio
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioSid || !twilioToken || !twilioPhone) {
      throw new Error("Configuração do Twilio ausente");
    }

    const twilioAuth = btoa(`${twilioSid}:${twilioToken}`);

    // Buscar dados do agendamento (data/horário) se disponíveis
    const dataConsulta = paciente?.next_appointment_date || paciente?.data_consulta || "";
    const horarioConsulta = paciente?.next_appointment_time || paciente?.horario_consulta || "";

    // Montar URL do webhook com query params dinâmicos
    const coreApiUrl = Deno.env.get("CORE_API_URL")!;
    const webhookParams = new URLSearchParams({
      tipo: "confirmacao",
      nome: nomePaciente,
      ...(dataConsulta && { data: dataConsulta }),
      ...(horarioConsulta && { horario: horarioConsulta }),
    });
    const webhookUrl = `${coreApiUrl}/functions/v1/twilio-voice-webhook?${webhookParams.toString()}`;

    const recordingCallback = `${coreApiUrl}/functions/v1/processar-gravacao`;
    const statusCallback = `${coreApiUrl}/functions/v1/call-events`;

    const callParams = new URLSearchParams({
      To: telefoneFormatado,
      From: twilioPhone,
      Url: webhookUrl,
      Record: "true",
      RecordingStatusCallback: recordingCallback,
      RecordingStatusCallbackEvent: "completed",
      StatusCallback: statusCallback,
      StatusCallbackEvent: "initiated ringing answered completed",
      StatusCallbackMethod: "POST",
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
      const errBody = await callRes.text();
      console.error("Twilio error:", errBody);
      throw new Error(`Erro ao iniciar chamada Twilio: ${callRes.status}`);
    }

    const callData = await callRes.json();
    console.log("Chamada iniciada:", callData.sid);

    return new Response(
      JSON.stringify({ status: "ligacao_iniciada", call_sid: callData.sid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro em ligar-confirmacao-agendamento:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
