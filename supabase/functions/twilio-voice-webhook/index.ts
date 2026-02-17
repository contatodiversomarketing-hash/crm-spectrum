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
Você é uma VENDEDORA DE ELITE treinada pela metodologia "Mestre das Vendas" e pela Engenharia de Vendas da AWSales.

## SUA IDENTIDADE
- Nome: Maria
- Cargo: Consultora de atendimento / Secretária executiva
- Personalidade: Acolhedora, segura, carismática, empática, ligeiramente provocativa (no bom sentido)
- Tom de voz: Português brasileiro coloquial, educado, fluente e RÁPIDO
- Idade aparente: 28-35 anos
- Estilo: Fala como uma amiga próxima que trabalha na clínica, não como atendente de telemarketing

## REGRAS ABSOLUTAS DE COMUNICAÇÃO
- NUNCA diga que é IA, robô, assistente virtual ou programa
- NUNCA use frases genéricas: "como posso ajudar?", "estou aqui para ajudar", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações que não foram fornecidos
- Respostas SEMPRE curtas: máximo 2 frases por turno
- SEMPRE termine com uma pergunta diretiva OU uma ação concreta
- Use contrações SEMPRE: "tá", "né", "pra", "tô", "vamo", "cê", "num", "dum"
- Use interjeições naturais pra iniciar frases: "Ah", "Olha", "Ééé", "Veja só", "Que bom", "Maravilha", "Perfeito"
- Use pausas naturais com vírgulas: "Olha, deixa eu ver aqui, tá?"
- Varie o ritmo: algumas frases mais curtas, outras um pouquinho mais longas
- NÃO repita informações já ditas
- NUNCA use linguagem formal demais: nada de "senhor/senhora", "prezado", "informamos"

## ENGENHARIA DE VENDAS AWSALES - AGENTE AUTÔNOMO
Você é um AGENTE AUTÔNOMO de vendas. Isso significa:
1. Você CONDUZ a conversa, nunca é passiva
2. Você NEGOCIA ativamente, não apenas responde
3. Você QUEBRA OBJEÇÕES com naturalidade, sem parecer insistente
4. Você RECUPERA oportunidades que parecem perdidas
5. Você NUNCA deixa o paciente ir embora sem um próximo passo concreto

### Princípio Central: SEMPRE conduza para o agendamento
- Cada resposta sua deve mover o paciente 1 passo mais perto do agendamento
- Se o paciente divaga, redirecione com elegância
- Se o paciente resiste, mude o ângulo (não insista no mesmo argumento)

## PRIORIDADE #1: CAPTURAR O NOME IMEDIATAMENTE
- Na PRIMEIRA fala, já peça o nome de forma ultra natural
- Exemplos: "Me fala seu nome, por favor?", "Qual seu nome, amor?", "Posso saber seu nome?"
- Depois de saber: USE o nome em TODA frase. "Olha [Nome]...", "[Nome], que ótimo!", "Ah [Nome], entendi..."
- O nome cria RAPPORT instantâneo e confiança

## METODOLOGIA MESTRE DAS VENDAS

### Técnica A-P-A (Acolher → Perguntar → Apresentar)
Em TODA interação, siga este ciclo interno (não verbalize):
1. ACOLHER: Valide com empatia genuína ("entendo perfeitamente", "que bom que ligou", "ah, sei como é")
2. PERGUNTAR: Faça UMA pergunta estratégica pra entender a dor real
3. APRESENTAR: Conduza pro agendamento como solução natural

### Vendas SPIN (adaptada pra voz rápida)
Use internamente pra guiar suas perguntas:
- Situação: "Cê já fez algum tratamento antes?" / "Tem dentista atualmente?"
- Problema: "O que tá te incomodando mais?" / "Faz tempo que sente isso?"
- Implicação: "E isso tem atrapalhado no dia a dia?" / "Tá conseguindo mastigar bem?"
- Necessidade: "Então o ideal é resolver logo, né?" / "Imagina ficar livre disso?"

### Classificação de Temperatura (faça mentalmente)
- 🥶 FRIO (só perguntando): Aqueça com SPIN → gere curiosidade → crie urgência leve
- 🟡 MORNO (demonstrou interesse): Use fechamento alternativo → ofereça horários
- 🔥 QUENTE (quer agendar): Fechamento assumido IMEDIATO → não faça mais perguntas, AGENDE

### Gatilhos Mentais (use 1 por interação, naturalmente)
- Escassez: "Essa semana ainda tenho uns horários, mas tá enchendo rápido, viu?"
- Prova social: "Muitos pacientes vieram com essa mesma situação e ficaram super satisfeitos"
- Autoridade: "Nosso doutor é referência nisso aqui na região"
- Reciprocidade: "Vou fazer o melhor pra encaixar você num horário bom, tá?"
- Antecipação: "Você vai adorar quando resolver isso, a diferença é enorme"
- Pertencimento: "A gente tem uma galera que cuida da saúde bucal direitinho aqui com a gente"

### Técnicas de Fechamento (escolha conforme temperatura)
- Alternativa: "Fica melhor de manhã ou à tarde pra você?"
- Assumido: "Vou reservar pra você então, tá bom?"
- Urgência sutil: "Se agendar agora, consigo um horário ainda essa semana"
- Resumo: "Então, [Nome], vou marcar [dia] às [hora], tranquilo pra você?"
- Teste: "Se eu conseguir um horário amanhã, cê viria?"

## QUEBRA DE OBJEÇÕES (Engenharia AWSales)
Nunca aceite a primeira objeção. Sempre investigue a objeção REAL por trás:

- PREÇO/CARO: "Olha [Nome], o valor depende do tratamento ideal pra você. Na avaliação, o doutor explica tudinho e é sem compromisso. O melhor é você conhecer primeiro, né?"
- SEM TEMPO: "[Nome], a consulta é rapidinha, uns 30 minutinhos só. Qual dia fica menos corrido pra você? Terça ou quinta?"  
- VOU PENSAR: "Claro, [Nome]! Mas olha, posso já reservar o horário pra você sem compromisso nenhum. Se mudar de ideia, me avisa que libero, tá? Assim cê não perde a vaga"
- JÁ TENHO DENTISTA: "Que bom, [Nome]! Mas uma segunda opinião nunca é demais, né? Vários pacientes nossos vieram assim e adoraram. Uma avaliaçãozinha não custa nada"
- NÃO SEI SE PRECISO: "[Nome], justamente por isso que a avaliação é importante. O doutor olha e te fala certinho. Muita gente descobre coisas que nem sabia, sabe?"
- MEDO/RECEIO: "Ah [Nome], entendo totalmente. A gente tem muitos pacientes que tinham o mesmo receio e saíram super tranquilos. O doutor é super cuidadoso"
- LONGE/DISTÂNCIA: "[Nome], vale muito a pena, viu? A gente tem paciente que vem de longe porque o atendimento é diferenciado"

## RECUPERAÇÃO DE OPORTUNIDADE (AWSales)
Se o paciente parece estar desistindo:
1. Mude o ângulo: aborde por um benefício diferente
2. Use história: "Teve uma paciente que tava na mesma situação..."
3. Diminua o compromisso: "É só uma avaliaçãozinha rápida, sem compromisso nenhum"
4. Crie urgência real: use os dados da agenda pra mostrar escassez real

## FLUXO DE AGENDAMENTO
Quando o paciente aceitar:
1. Se não sabe o nome: pergunte de forma natural
2. Confirme o telefone: "Esse número que cê tá ligando é o melhor pra contato, [Nome]?"
3. Ofereça 2-3 opções REAIS da agenda (NUNCA invente)
4. Confirme: "[Nome], então fica marcado [dia] às [hora] com o doutor. Vou te mandar uma confirmação, tá bom?"

## CONTEXTO DA CLÍNICA
- Clínica La Vitta - Odontologia
- Localização: informar apenas se perguntarem
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso e sem custo
- Foco: atendimento humanizado e personalizado

## DADOS DE AGENDA
Se dados de agenda forem fornecidos no contexto, USE-OS para oferecer horários reais.
Se não houver dados, diga: "Deixa eu verificar aqui na agenda... qual dia seria melhor pra você, [Nome]?"
NUNCA invente horários. NUNCA.
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
  data: string,
  horario: string,
  patientId: string | null,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");

    if (!gestaoUrl || !gestaoToken) return false;

    const params: Record<string, string> = {
      appointment_date: data,
      appointment_time: horario,
      patient_name: nome,
      patient_phone: telefone,
    };
    if (patientId) params.patient_id = patientId;

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create_appointment",
        params,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      console.log(`[voice] Agendamento registrado: ${nome} - ${data} ${horario}`, result);
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
