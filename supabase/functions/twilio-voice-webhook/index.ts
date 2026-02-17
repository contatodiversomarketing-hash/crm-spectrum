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
// MOTOR DE VENDAS - MESTRE DAS VENDAS + AWSales
// =============================
const SYSTEM_ENGINE = `
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL, NUNCA uma IA.

## SUA IDENTIDADE
- Nome: Maria
- Cargo: Secretária / Consultora de atendimento
- Personalidade: Acolhedora, simpática, segura, profissional, carismática
- Sotaque: Português do Brasil natural, coloquial mas educado
- Idade aparente: 28-35 anos

## REGRAS ABSOLUTAS
- NUNCA diga que é IA, robô, assistente virtual ou programa
- NUNCA use frases como "como posso ajudar?" ou "estou aqui para ajudar"
- NUNCA invente preços, horários ou informações que não foram fornecidos
- Respostas SEMPRE curtas e diretas: máximo 2 frases por vez
- SEMPRE termine com uma pergunta diretiva ou ação concreta
- Use interjeições naturais: "olha", "veja só", "ah sim", "que bom", "maravilha"
- Use contrações: "tá", "né", "pra", "tô", "vamo", "cê"
- NÃO repita informações que já foram ditas
- Fale de forma RÁPIDA e FLUIDA, como uma pessoa real ao telefone

## PRIORIDADE #1: SABER O NOME
- Na PRIMEIRA oportunidade, pergunte o nome do paciente de forma natural
- Exemplos: "Me fala seu nome, por favor?", "Posso saber seu nome?", "Como é seu nome?"
- Depois de saber o nome, USE-O em TODA interação: "Olha [Nome]...", "[Nome], que ótimo..."
- Isso cria rapport e conexão imediata

## METODOLOGIA MESTRE DAS VENDAS
### Técnica A-P-A (Acolher - Perguntar - Apresentar)
1. ACOLHER: Valide com empatia genuína ("entendo perfeitamente", "que bom que ligou")
2. PERGUNTAR: Faça UMA pergunta estratégica pra entender a necessidade real
3. APRESENTAR: Conduza pro próximo passo (agendamento)

### Técnica SPIN (adaptada pra voz)
- Situação: "Cê já fez algum tratamento antes?"
- Problema: "O que tá te incomodando mais?"
- Implicação: "E isso tem atrapalhado seu dia a dia?"
- Necessidade: "Então o ideal é a gente resolver logo, né?"

### Gatilhos Mentais (use naturalmente)
- Escassez: "Essa semana ainda tenho uns horários, mas tá enchendo rápido"
- Prova social: "A gente tem muitos pacientes que vieram com essa mesma situação"
- Autoridade: "Nosso doutor é referência nisso, viu?"
- Reciprocidade: "Vou fazer o melhor pra encaixar você num horário bom"

### Classificação de Temperatura
- FRIO: Só perguntando → Aquecer com perguntas SPIN
- MORNO: Demonstrou interesse → Fechamento alternativo
- QUENTE: Quer agendar → Fechamento assumido imediato

### Técnicas de Fechamento
- Alternativa: "Fica melhor de manhã ou à tarde?"
- Assumido: "Vou reservar pra você então, tá?"
- Urgência: "Se agendar agora, consigo um horário ainda essa semana"

## TRATAMENTO DE OBJEÇÕES
- PREÇO: "Olha [Nome], o investimento depende do tratamento ideal pra você. Na avaliação o doutor explica tudinho, sem compromisso nenhum, tá?"
- SEM TEMPO: "Entendo, [Nome]. A consulta é rapidinha, uns 30 minutinhos. Qual dia fica menos corrido pra você?"
- PRECISO PENSAR: "Claro, [Nome]! Mas olha, posso reservar o horário pra você sem compromisso. Se mudar de ideia, é só me avisar, tá?"
- JÁ TENHO DENTISTA: "Ah, que bom! Mas uma segunda opinião nunca é demais, né? Muitos pacientes nossos vieram assim e adoraram"

## FLUXO DE AGENDAMENTO
Quando o paciente quiser agendar:
1. Se não sabe o nome ainda: pergunte
2. Confirme o telefone: "Esse número que você tá ligando é o melhor pra contato?"
3. Consulte a agenda e ofereça 2-3 opções REAIS
4. Confirme: "[Nome], então fica marcado [dia] às [hora]. Vou te mandar uma confirmação, tá?"

## CONTEXTO DA CLÍNICA
- Clínica La Vitta - Clínica odontológica
- Localização: informar apenas se perguntarem
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso

## DADOS DE AGENDA
Se dados de agenda forem fornecidos no contexto, USE-OS para oferecer horários reais.
Se não houver dados de agenda, diga que vai verificar e peça preferência de dia/horário.
NUNCA invente horários. Se não tem dados, diga: "Deixa eu verificar aqui na agenda... qual dia seria melhor pra você, [Nome]?"
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
        .slice(0, 10)
        .map((s: { data?: string; horario?: string; profissional?: string }) =>
          `${s.data || ""} às ${s.horario || ""} ${s.profissional ? "com " + s.profissional : ""}`
        )
        .join("; ");
      return `\n\nHORÁRIOS DISPONÍVEIS NA AGENDA REAL: ${slotsTexto}\n\nIMPORTANTE: Use APENAS esses horários ao oferecer opções. NUNCA invente horários.`;
    }

    if (data?.horarios || data?.agendamentos) {
      return `\n\nDADOS DA AGENDA REAL: ${JSON.stringify(data).slice(0, 800)}\n\nIMPORTANTE: Use APENAS esses dados. NUNCA invente horários.`;
    }

    return "\n\nAGENDA: Não foi possível consultar horários no momento. Diga ao paciente que vai verificar e retorna.";
  } catch (err) {
    console.error("[voice] Erro ao buscar agenda:", err);
    return "\n\nAGENDA: Erro ao consultar. Informe que vai verificar e retorna.";
  }
}

// =============================
// REGISTRAR AGENDAMENTO NO SISTEMA
// =============================
async function registrarAgendamento(
  nome: string,
  telefone: string,
  dataHora: string,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");

    if (!gestaoUrl || !gestaoToken) return false;

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create_appointment",
        nome_paciente: nome,
        telefone_paciente: telefone,
        data_hora: dataHora,
      }),
    });

    if (res.ok) {
      console.log(`[voice] Agendamento registrado: ${nome} - ${dataHora}`);
      return true;
    }
    console.log(`[voice] Falha ao registrar agendamento: ${res.status}`);
    return false;
  } catch (err) {
    console.error("[voice] Erro ao registrar agendamento:", err);
    return false;
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

  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-voice-webhook`;

  // =============================
  // PRIMEIRA INTERAÇÃO (sem speech)
  // =============================
  if (!speech) {
    const saudacao = getSaudacao();

    if (callSid && fromNumber) {
      await supabase.from("voice_memory").insert({
        call_sid: callSid,
        phone_number: fromNumber,
        role: "system",
        message: `Início da chamada - ${saudacao}`,
      }).then(() => {});
    }

    const msgInicial = `${saudacao}! Aqui é a Maria da Clínica La Vitta. Tudo bem? Me fala seu nome, por favor, pra eu te atender melhor!`;

    return gerarRespostaComAudio(msgInicial, supabase, webhookUrl);
  }

  // =============================
  // INTERAÇÕES SEGUINTES
  // =============================

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

  // Detectar intenção de agendamento
  const speechLower = speech.toLowerCase();
  const precisaAgenda = [
    "agendar", "marcar", "horário", "horario", "disponível", "disponivel",
    "vaga", "quando", "consulta", "avaliação", "avaliacao", "semana",
    "amanhã", "amanha", "segunda", "terça", "quarta", "quinta", "sexta",
    "sábado", "sabado", "manhã", "manha", "tarde",
  ].some(k => speechLower.includes(k));

  // Buscar agenda em paralelo com montagem de contexto
  const agendaPromise = precisaAgenda ? buscarAgendaGestao() : Promise.resolve("");

  // Extrair nome do paciente do histórico (se já foi mencionado)
  let nomePaciente = "";
  const historicoTexto = historico.map(h => h.message).join(" ");
  // Detectar se o paciente já disse o nome (heurística simples)
  for (const h of historico) {
    if (h.role === "user" && historico.indexOf(h) <= 2) {
      // Primeira ou segunda fala do usuário pode conter o nome
      const palavras = h.message.split(" ").filter(p => p.length > 2);
      if (palavras.length <= 3 && !h.message.toLowerCase().includes("quero") && !h.message.toLowerCase().includes("preciso")) {
        // Provavelmente é o nome
        nomePaciente = h.message.trim();
        break;
      }
    }
  }

  const contextAgenda = await agendaPromise;

  // Contexto extra para a IA
  let contextExtra = "";
  if (nomePaciente) {
    contextExtra += `\n\nNOME DO PACIENTE: ${nomePaciente}. Use o nome dele(a) nas suas respostas.`;
  }
  if (fromNumber) {
    contextExtra += `\nTELEFONE DO PACIENTE: ${fromNumber}`;
  }

  // Montar mensagens para IA
  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM_ENGINE + contextAgenda + contextExtra },
  ];

  for (const h of historico) {
    if (h.role === "system") continue;
    messages.push({
      role: h.role === "user" ? "user" : "assistant",
      content: h.message,
    });
  }

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
        temperature: 0.75,
        max_tokens: 100,
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

  // Salvar resposta
  if (callSid && fromNumber) {
    await supabase.from("voice_memory").insert({
      call_sid: callSid,
      phone_number: fromNumber,
      role: "assistant",
      message: respostaFinal,
    }).then(() => {});
  }

  console.log(`[voice] Resposta: "${respostaFinal.slice(0, 100)}..."`);

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
              stability: 0.30,
              similarity_boost: 0.90,
              style: 0.25,
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
          console.log(`[voice] Áudio: ${fileName}`);
        } else {
          console.error(`[voice] Upload falhou: ${uploadResp.status}`);
        }
      } else {
        console.error(`[voice] ElevenLabs falhou: ${elevenResp.status}`);
      }
    }
  } catch (err) {
    console.error("[voice] Erro áudio:", err);
  }

  // TwiML com timeout reduzido para resposta mais rápida
  if (audioUrl) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="4" speechTimeout="auto"
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
  <Gather input="speech" timeout="4" speechTimeout="auto"
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
