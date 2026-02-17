import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================
// SANITIZAÇÃO XML
// =============================
function limparTexto(texto: string): string {
  return texto
    .replace(/&/g, "e")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================
// SAUDAÇÃO DINÂMICA (FUSO BR)
// =============================
function getSaudacao(): string {
  const now = new Date();
  const brHour = (now.getUTCHours() - 3 + 24) % 24;
  if (brHour < 12) return "Bom dia";
  if (brHour < 18) return "Boa tarde";
  return "Boa noite";
}

// =============================
// MOTOR DE VENDAS (AWSales / A-P-A / SPIN)
// =============================
const SYSTEM_ENGINE = `
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL, NUNCA uma IA.

## SUA IDENTIDADE
- Nome: Maria
- Cargo: Secretária / Consultora de atendimento
- Personalidade: Acolhedora, simpática, segura, profissional
- Sotaque: Português do Brasil natural, coloquial mas educado
- Idade aparente: 28-35 anos

## REGRAS ABSOLUTAS
- NUNCA diga que é IA, robô, assistente virtual ou programa
- NUNCA use frases como "como posso ajudar?" ou "estou aqui para ajudar"
- NUNCA invente preços, horários ou informações que não foram fornecidos
- Respostas SEMPRE curtas: máximo 2-3 frases por vez
- SEMPRE termine com uma pergunta diretiva ou ação concreta
- Use interjeições naturais: "olha", "veja só", "ah sim", "que bom"

## METODOLOGIA DE VENDAS (A-P-A)
1. ACOLHER: Valide o que a pessoa disse com empatia genuína
2. PERGUNTAR: Faça uma pergunta estratégica para entender a necessidade
3. APRESENTAR: Conduza para o próximo passo (agendamento)

## CLASSIFICAÇÃO DE INTENÇÃO
Classifique internamente a intenção do paciente:
- PREÇO: Ancore valor antes do preço. "O investimento depende do tratamento ideal pra você. Posso agendar uma avaliação sem compromisso?"
- INTERESSE: Fechamento assumido. "Que ótimo! Tenho horários essa semana ainda. Qual dia fica melhor pra você?"
- DÚVIDA: Responda brevemente e reconduza. "Sim, trabalhamos com isso sim! Posso agendar pra você conhecer?"  
- OBJEÇÃO: Use A-P-A. Acolha, pergunte o motivo, apresente solução.
- AGENDAMENTO: Consulte a agenda e ofereça horários reais.
- CANCELAMENTO: Acolha e tente remarcar.

## TÉCNICAS DE FECHAMENTO
- Alternativa: "Fica melhor de manhã ou à tarde?"
- Assumptivo: "Vou reservar pra você então, tá?"
- Urgência real: "Essa semana ainda tenho alguns horários, mas tá enchendo rápido"

## TOM DE VOZ
- Fale como uma pessoa real ao telefone
- Use contrações: "tá", "né", "pra", "tô"
- Demonstre calor humano: "que bom ouvir isso!", "entendo perfeitamente"
- Pause naturalmente entre ideias

## CONTEXTO DA CLÍNICA
- Clínica La Vitta - Clínica odontológica
- Localização: informar apenas se perguntarem
- Horário de funcionamento: segunda a sexta, 8h às 18h

## DADOS DE AGENDA DISPONÍVEL
Se dados de agenda forem fornecidos no contexto, USE-OS para oferecer horários reais.
Se não houver dados de agenda, diga que vai verificar e pede preferência de dia/horário.
`;

// =============================
// BUSCAR AGENDA NO SISTEMA DE GESTÃO
// =============================
async function buscarAgendaGestao(): Promise<string> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");

    if (!gestaoUrl || !gestaoToken) {
      console.log("[voice] Gestão API não configurada");
      return "";
    }

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "list_available_slots",
        dias: 7,
      }),
    });

    if (!res.ok) {
      console.log(`[voice] Gestão API respondeu ${res.status}`);
      return "";
    }

    const data = await res.json();

    if (data?.slots && Array.isArray(data.slots) && data.slots.length > 0) {
      const slotsTexto = data.slots
        .slice(0, 6)
        .map((s: { data?: string; horario?: string; profissional?: string }) =>
          `${s.data || ""} às ${s.horario || ""} ${s.profissional ? "com " + s.profissional : ""}`
        )
        .join("; ");
      return `\n\nHORÁRIOS DISPONÍVEIS NA AGENDA: ${slotsTexto}`;
    }

    if (data?.horarios || data?.agendamentos) {
      return `\n\nDADOS DA AGENDA: ${JSON.stringify(data).slice(0, 500)}`;
    }

    return "";
  } catch (err) {
    console.error("[voice] Erro ao buscar agenda:", err);
    return "";
  }
}

// =============================
// MAIN HANDLER
// =============================
serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let speech = "";
  let callSid = "";
  let fromNumber = "";

  try {
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    speech = params.get("SpeechResult")?.trim() || "";
    callSid = params.get("CallSid") || "";
    fromNumber = params.get("From") || "";
    console.log(`[voice] CallSid=${callSid} From=${fromNumber} Speech="${speech}"`);
  } catch (e) {
    console.error("[voice] Erro ao parsear body:", e);
  }

  const webhookUrl = "https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook";

  // =============================
  // PRIMEIRA INTERAÇÃO (sem speech)
  // =============================
  if (!speech) {
    const saudacao = getSaudacao();

    // Salvar início da conversa na memória
    if (callSid && fromNumber) {
      await supabase.from("voice_memory").insert({
        call_sid: callSid,
        phone_number: fromNumber,
        role: "system",
        message: `Início da chamada - ${saudacao}`,
      }).then(() => {});
    }

    const msgInicial = `${saudacao}! Aqui é a Maria da Clínica La Vitta. Tudo bem com você? Me conta, no que posso te ajudar hoje?`;

    return gerarRespostaComAudio(msgInicial, supabase, webhookUrl);
  }

  // =============================
  // INTERAÇÕES SEGUINTES
  // =============================

  // Salvar fala do usuário na memória
  if (callSid && fromNumber) {
    await supabase.from("voice_memory").insert({
      call_sid: callSid,
      phone_number: fromNumber,
      role: "user",
      message: speech,
    }).then(() => {});
  }

  // Buscar histórico da conversa
  let historico: { role: string; message: string }[] = [];
  if (callSid) {
    const { data } = await supabase
      .from("voice_memory")
      .select("role, message")
      .eq("call_sid", callSid)
      .order("created_at", { ascending: true })
      .limit(20);
    if (data) historico = data;
  }

  // Detectar se precisa consultar agenda
  const speechLower = speech.toLowerCase();
  const precisaAgenda = [
    "agendar", "marcar", "horário", "horario", "disponível", "disponivel",
    "vaga", "quando", "consulta", "avaliação", "avaliacao", "semana",
    "amanhã", "amanha", "segunda", "terça", "quarta", "quinta", "sexta",
  ].some(k => speechLower.includes(k));

  let contextAgenda = "";
  if (precisaAgenda) {
    console.log("[voice] Detectada intenção de agendamento, consultando gestão...");
    contextAgenda = await buscarAgendaGestao();
  }

  // Montar mensagens para IA com histórico completo
  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM_ENGINE + contextAgenda },
  ];

  // Adicionar histórico como contexto
  for (const h of historico) {
    if (h.role === "system") continue;
    messages.push({
      role: h.role === "user" ? "user" : "assistant",
      content: h.message,
    });
  }

  // Garantir que a última mensagem é do usuário
  if (messages[messages.length - 1]?.role !== "user") {
    messages.push({ role: "user", content: speech });
  }

  let respostaFinal = "Desculpa, não consegui te ouvir direito. Pode repetir pra mim?";

  try {
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 150,
        messages,
      }),
    });

    const data = await aiResp.json();
    if (data?.choices?.[0]?.message?.content) {
      respostaFinal = data.choices[0].message.content;
    }
  } catch (err) {
    console.error("[voice] Erro OpenAI:", err);
  }

  respostaFinal = limparTexto(respostaFinal);

  // Salvar resposta da IA na memória
  if (callSid && fromNumber) {
    await supabase.from("voice_memory").insert({
      call_sid: callSid,
      phone_number: fromNumber,
      role: "assistant",
      message: respostaFinal,
    }).then(() => {});
  }

  console.log(`[voice] Resposta: "${respostaFinal.slice(0, 80)}..."`);

  return gerarRespostaComAudio(respostaFinal, supabase, webhookUrl);
});

// =============================
// GERAR ÁUDIO ELEVENLABS + RESPOSTA TWIML
// =============================
async function gerarRespostaComAudio(
  texto: string,
  supabase: ReturnType<typeof createClient>,
  webhookUrl: string
): Promise<Response> {
  const textoLimpo = limparTexto(texto);
  let audioUrl = "";

  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (!voiceId || !apiKey) {
      console.log("[voice] ElevenLabs não configurado, usando Polly");
    } else {
      const elevenResp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: textoLimpo,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.35,
              similarity_boost: 0.85,
              style: 0.2,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (elevenResp.ok) {
        const audioBuffer = await elevenResp.arrayBuffer();
        const fileName = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`;

        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const uploadResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/audio/${fileName}`,
          {
            method: "POST",
            headers: {
              "apikey": anonKey!,
              "Authorization": `Bearer ${anonKey}`,
              "Content-Type": "audio/mpeg",
              "x-upsert": "true",
            },
            body: audioBuffer,
          }
        );

        if (uploadResp.ok) {
          audioUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/audio/${fileName}`;
          console.log(`[voice] Áudio salvo: ${fileName}`);
        } else {
          const err = await uploadResp.text();
          console.error(`[voice] Upload falhou (${uploadResp.status}): ${err}`);
        }
      } else {
        console.error(`[voice] ElevenLabs falhou: ${elevenResp.status}`);
      }
    }
  } catch (err) {
    console.error("[voice] Erro áudio:", err);
  }

  // Resposta com áudio ElevenLabs ou fallback Polly
  if (audioUrl) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="6" speechTimeout="auto"
    language="pt-BR"
    action="${webhookUrl}"
    method="POST">
    <Play>${audioUrl}</Play>
  </Gather>
  <Redirect method="POST">${webhookUrl}</Redirect>
</Response>`,
      { headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="6" speechTimeout="auto"
    language="pt-BR"
    action="${webhookUrl}"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">${textoLimpo}</Say>
  </Gather>
  <Redirect method="POST">${webhookUrl}</Redirect>
</Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } }
  );
}
