import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Verificar assinatura Twilio
async function verificarAssinaturaTwilio(
  req: Request,
  bodyText: string
): Promise<boolean> {
  const twilioSignature = req.headers.get("X-Twilio-Signature");
  if (!twilioSignature) {
    console.warn("[processar-gravacao] X-Twilio-Signature ausente");
    return false;
  }

  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!twilioToken) {
    console.error("[processar-gravacao] TWILIO_AUTH_TOKEN não configurado");
    return false;
  }

  try {
    const url = new URL(req.url);
    const fullUrl = url.origin + url.pathname;

    // Ordenar parâmetros POST e concatenar
    const params = new URLSearchParams(bodyText);
    const sortedKeys = Array.from(params.keys()).sort();
    let dataToSign = fullUrl;
    for (const key of sortedKeys) {
      dataToSign += key + params.get(key);
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(twilioToken),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
    const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return computed === twilioSignature;
  } catch (err) {
    console.error("[processar-gravacao] Erro verificando assinatura:", err);
    return false;
  }
}

async function transcreverAudio(recordingUrl: string): Promise<string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY não configurada");

  // Baixar áudio do Twilio (formato WAV)
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const twilioAuth = btoa(`${twilioSid}:${twilioToken}`);

  const audioUrl = `${recordingUrl}.wav`;
  console.log(`[processar-gravacao] Baixando áudio: ${audioUrl}`);

  const audioRes = await fetch(audioUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` },
  });

  if (!audioRes.ok) {
    throw new Error(`Erro ao baixar áudio: ${audioRes.status}`);
  }

  const audioBlob = await audioRes.blob();
  console.log(`[processar-gravacao] Áudio baixado: ${audioBlob.size} bytes`);

  // Enviar para Whisper
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.wav");
  formData.append("model", "whisper-1");
  formData.append("language", "pt");
  formData.append("response_format", "text");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
    },
    body: formData,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    throw new Error(`Whisper erro ${whisperRes.status}: ${errText.slice(0, 300)}`);
  }

  const transcricao = await whisperRes.text();
  return transcricao.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Twilio envia POST com application/x-www-form-urlencoded
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);

    // Verificar assinatura Twilio
    const assinaturaValida = await verificarAssinaturaTwilio(req, bodyText);
    if (!assinaturaValida) {
      console.warn("[processar-gravacao] Assinatura inválida - prosseguindo com cautela");
      // Em produção, considere retornar 403 aqui
      // return new Response("Forbidden", { status: 403 });
    }

    const recordingUrl = params.get("RecordingUrl");
    const callSid = params.get("CallSid");
    const recordingSid = params.get("RecordingSid");
    const recordingStatus = params.get("RecordingStatus");
    const recordingDuration = params.get("RecordingDuration");

    console.log(`[processar-gravacao] CallSid=${callSid} RecordingSid=${recordingSid} Status=${recordingStatus} Duração=${recordingDuration}s`);

    if (!recordingUrl || !callSid) {
      console.warn("[processar-gravacao] RecordingUrl ou CallSid ausente");
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    // Só processar gravações completas
    if (recordingStatus && recordingStatus !== "completed") {
      console.log(`[processar-gravacao] Status ${recordingStatus}, ignorando`);
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Salvar metadados na call_recordings (registro rápido)
    const durationInt = parseInt(recordingDuration || "0", 10);
    const { error: recErr } = await supabase.from("call_recordings").insert({
      call_sid: callSid,
      recording_url: `${recordingUrl}.mp3`,
      duration: durationInt,
      analyzed: false,
    });
    if (recErr) {
      console.error("[processar-gravacao] Erro ao salvar call_recording:", recErr);
    } else {
      console.log(`[processar-gravacao] call_recording salva para CallSid=${callSid}`);
    }

    // Buscar automação correspondente para obter paciente_externo_id e clinica_id
    const { data: automacao } = await supabase
      .from("automacoes")
      .select("paciente_externo_id, clinica_id, payload")
      .or(`payload->>call_sid.eq.${callSid}`)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pacienteExternoId = automacao?.paciente_externo_id || callSid;
    const clinicaId = automacao?.clinica_id || null;

    // Transcrever áudio via Whisper
    let transcricao: string;
    try {
      transcricao = await transcreverAudio(recordingUrl);
      console.log(`[processar-gravacao] Transcrição: "${transcricao.slice(0, 100)}..."`);
    } catch (transcErr) {
      console.error("[processar-gravacao] Erro na transcrição:", transcErr);
      // Salvar registro sem transcrição
      await supabase.from("transcricoes_ligacoes").insert({
        call_sid: callSid,
        paciente_externo_id: pacienteExternoId,
        transcricao: null,
        resultado: "erro_transcricao",
        ...(clinicaId && { clinica_id: clinicaId }),
      });
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    // Salvar transcrição
    const { data: transcricaoSalva, error: insertErr } = await supabase
      .from("transcricoes_ligacoes")
      .insert({
        call_sid: callSid,
        paciente_externo_id: pacienteExternoId,
        transcricao,
        resultado: "transcrito",
        ...(clinicaId && { clinica_id: clinicaId }),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[processar-gravacao] Erro ao salvar transcrição:", insertErr);
      return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    console.log(`[processar-gravacao] Transcrição salva: ${transcricaoSalva.id}`);

    // Buscar vendedora associada (se houver)
    let vendedoraId: string | null = null;
    if (clinicaId) {
      const { data: vendedora } = await supabase
        .from("vendedoras")
        .select("id")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      vendedoraId = vendedora?.id || null;
    }

    // Chamar avaliar-ligacao-metodo se temos vendedora
    if (vendedoraId && transcricao.length > 50) {
      try {
        const avaliacaoRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/avaliar-ligacao-metodo`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              transcricao,
              vendedora_id: vendedoraId,
              resultado_venda: false, // Será atualizado posteriormente se houver conversão
              clinica_id: clinicaId,
              transcricao_ligacao_id: transcricaoSalva.id,
            }),
          }
        );

        if (avaliacaoRes.ok) {
          const avaliacaoData = await avaliacaoRes.json();
          console.log(`[processar-gravacao] Avaliação concluída: nota=${avaliacaoData.nota_geral}`);
        } else {
          const errText = await avaliacaoRes.text();
          console.error(`[processar-gravacao] Erro na avaliação: ${avaliacaoRes.status} ${errText.slice(0, 200)}`);
        }
      } catch (avalErr) {
        console.error("[processar-gravacao] Erro ao chamar avaliação:", avalErr);
        // Não bloqueia o fluxo principal
      }
    } else {
      console.log(`[processar-gravacao] Avaliação ignorada: vendedora=${vendedoraId} transcricao.len=${transcricao.length}`);
    }

    // Retornar TwiML vazio (Twilio espera XML)
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    console.error("[processar-gravacao] Erro:", error);
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }
});
