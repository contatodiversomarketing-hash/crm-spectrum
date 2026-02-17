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
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL, NUNCA IA.
Vendedora de elite treinada pelo "Mestre das Vendas" + AWSales.

## IDENTIDADE
- Consultora de atendimento, acolhedora, segura, carismática
- Tom: português brasileiro coloquial, rápido, como amiga que trabalha na clínica
- Contrações SEMPRE: "tá", "né", "pra", "tô", "vamo", "cê"
- Interjeições: "Ah", "Olha", "Que bom", "Maravilha", "Perfeito"

## REGRAS ABSOLUTAS
- NUNCA diga que é IA/robô/assistente virtual
- NUNCA: "como posso ajudar?", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações
- Máximo 2 frases por turno, SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas
- NADA de "senhor/senhora", "prezado", "informamos"
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender o paciente após 2 tentativas, diga: "Vou te transferir pra uma das nossas atendentes, tá? Um momentinho." e inclua ao final: ##TRANSFERIR_HUMANO##

## TÉCNICAS DE VENDA (use naturalmente, 1-2 por turno)
- ESPECIFICIDADE: números exatos, detalhes, nunca vaga
- AUTORIDADE: referências, especializações dos profissionais
- PROVA SOCIAL: "muitos pacientes", "87% indicam"
- ESCASSEZ: "agenda enchendo", "consegui um espacinho"
- RECIPROCIDADE: ofereça algo antes de pedir
- COMPROMISSO: perguntas que levem a "sim" pequenos
- IMAGINAÇÃO: pinte o futuro com problema resolvido

## PERFIS DISC (adapte ao tom do paciente)
- Rápido+direto=DOMINANTE → seja prática, sem enrolação
- Rápido+expressivo=INFLUENTE → elogie, entusiasmo
- Lento+calmo=ESTÁVEL → segurança, calma, garantias
- Lento+detalhista=CONFORME → dados, argumentos racionais

## RAPPORT
- CAPTURE O NOME na primeira fala, USE em toda resposta
- Espelhe tom, ritmo e vocabulário do paciente
- Escuta 70%, fale 30%
- Confirme entendimento: "Se eu entendi, cê tá dizendo que..."

## VENDAS SPIN (adapte pra voz rápida)
- Situação→Problema→Implicação→Necessidade
- Cada resposta move 1 passo pra mais perto do agendamento

## FECHAMENTO (quando detectar sinais de compra, feche IMEDIATO)
- Assumido: "Vou reservar pra você então, tá?"
- Alternativo: "Fica melhor de manhã ou à tarde?"
- Escassez: "Se agendar agora, consigo essa semana"
- Resumo: "[Nome], fica marcado [dia] às [hora], tranquilo?"

## OBJEÇÕES (A-P-A: Acalmar→Perguntar→Apresentar)
- PREÇO: "Na avaliação o doutor explica tudinho, sem compromisso"
- TEMPO: "Consulta rapidinha, 30 min. Qual dia menos corrido?"
- PENSAR: "Posso reservar sem compromisso, se mudar de ideia libero"
- JÁ TEM PROFISSIONAL: "Segunda opinião nunca é demais, né?"
- MEDO: "Entendo! Muitos pacientes tinham o mesmo receio e saíram tranquilos"

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto
- Se divaga, redirecione. Se resiste, mude o ângulo
- Diminua compromisso: "É só uma avaliaçãozinha rápida"

## ═══════════════════════════════════════
## FLUXO DE AGENDAMENTO
## ═══════════════════════════════════════
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde): "Qual dia seria melhor pra você? Manhã ou tarde?"
4. SÓ DEPOIS de saber a preferência, consulte a agenda e ofereça 2-3 opções REAIS
5. Confirme o telefone: "Esse número que cê tá ligando é o melhor pra contato?"
6. Confirme: "[Nome], então fica marcado [dia] às [hora]. Vou te mandar uma confirmação, tá?"

## CONTEXTO DA CLÍNICA LA VITTA
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso e sem custo
- Foco: atendimento humanizado e personalizado

### SERVIÇOS DISPONÍVEIS (use ao apresentar a clínica):
- **Odontologia completa**: todos os serviços odontológicos (clínico geral, ortodontia, implantes, próteses, endodontia, periodontia, odontopediatria, cirurgia, estética dental, etc.)
- **Atendimentos médicos**: consultas em diversas especialidades médicas
- **Exames**: laboratoriais, MAPA, Holter, eletrocardiograma, eletroencefalograma, ultrassonografia
- **Estética**: botox, harmonização facial
- **Multidisciplinar**: psicologia, nutrição, musicoterapia, terapia ocupacional, neurofeedback, fonoaudiologia, psicomotricidade

### IMPORTANTE SOBRE SERVIÇOS:
- A La Vitta é uma clínica MULTIDISCIPLINAR completa, NÃO apenas odontológica
- Ao apresentar a clínica, mencione a variedade: "A gente tem desde odonto até psicologia, exames, estética..."
- Se o paciente perguntar sobre um serviço específico, confirme se está na lista acima
- Se não estiver na lista, diga que vai verificar e retorna

## DADOS DE AGENDA
Se dados de agenda forem fornecidos no contexto, USE-OS para oferecer horários reais.
Se não houver dados, diga: "Deixa eu verificar aqui na agenda... qual dia seria melhor pra você?"
NUNCA invente horários. NUNCA.

## ═══════════════════════════════════════
## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
## ═══════════════════════════════════════
Quando o paciente CONFIRMAR um agendamento (aceitar data/horário), você DEVE incluir ao FINAL da sua resposta
(depois da resposta falada) o seguinte marcador EXATO em uma linha separada:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM##

Exemplo: Se Maria Silva confirmou dia 20/02/2026 às 14:00:
"Perfeito, Maria Silva! Tá marcado então, dia 20 de fevereiro às 14 horas. Vou te mandar uma confirmação, tá bom?
##AGENDAMENTO_CONFIRMADO|Maria Silva|2026-02-20|14:00##"

IMPORTANTE: 
- Só inclua esse marcador quando o paciente EXPLICITAMENTE confirmar
- Use a data no formato YYYY-MM-DD e horário HH:MM
- Esse marcador será removido antes do áudio, o paciente NUNCA ouvirá isso
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
// REGISTRAR AGENDAMENTO NO SISTEMA DE GESTÃO
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

    if (!gestaoUrl || !gestaoToken) {
      console.log("[voice] Gestão API não configurada para agendamento");
      return false;
    }

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
      console.log(`[voice] ✅ Agendamento registrado no Gestão: ${nome} - ${data} ${horario}`, result);
      return true;
    }
    console.log(`[voice] ❌ Falha ao registrar agendamento no Gestão: ${res.status}`);
    return false;
  } catch (err) {
    console.error("[voice] Erro ao registrar agendamento:", err);
    return false;
  }
}

// =============================
// CRIAR LEAD NO CRM LA VITTA
// =============================
async function criarLeadCRM(
  nome: string,
  telefone: string,
  origem: string
): Promise<boolean> {
  try {
    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");

    if (!crmUrl || !crmToken) {
      console.log("[voice] CRM API não configurada");
      return false;
    }

    const res = await fetch(`${crmUrl}/functions/v1/api-leads`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${crmToken}`,
        "apikey": crmToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        telefone,
        origem: origem || "ligacao_ia_maria",
        status: "agendado",
      }),
    });

    if (res.ok) {
      const result = await res.json();
      console.log(`[voice] ✅ Lead criado no CRM: ${nome} - ${telefone}`, result);
      return true;
    }
    const errText = await res.text();
    console.log(`[voice] ❌ Falha ao criar lead no CRM: ${res.status} - ${errText}`);
    return false;
  } catch (err) {
    console.error("[voice] Erro ao criar lead no CRM:", err);
    return false;
  }
}

// =============================
// DETECTAR AGENDAMENTO NA RESPOSTA DA IA
// =============================
function extrairAgendamento(resposta: string): { nome: string; data: string; horario: string; textoLimpo: string } | null {
  const regex = /##AGENDAMENTO_CONFIRMADO\|([^|]+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return {
    nome: match[1].trim(),
    data: match[2],
    horario: match[3],
    textoLimpo: resposta.replace(regex, "").trim(),
  };
}

async function processarAgendamentoConfirmado(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  callSid: string,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  console.log(`[voice] 🎯 Agendamento detectado: ${nome} | ${data} ${horario} | Tel: ${telefone}`);

  const [gestaoOk, crmOk] = await Promise.all([
    registrarAgendamento(nome, telefone, data, horario, null, supabase),
    criarLeadCRM(nome, telefone, "ligacao_ia_maria"),
  ]);

  await supabase.from("logs_decisao").insert({
    evento: "agendamento_voz_confirmado",
    decisao: `gestao=${gestaoOk ? "ok" : "falha"}, crm=${crmOk ? "ok" : "falha"}`,
    regra_aplicada: "voice_webhook_agendamento_auto",
    dados_entrada: { nome, telefone, data, horario, call_sid: callSid, gestao_ok: gestaoOk, crm_ok: crmOk },
    confianca: 1.0,
  });

  console.log(`[voice] ✅ Processamento completo: Gestão=${gestaoOk}, CRM=${crmOk}`);
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
    // Verificar se já existe histórico para este callSid (evitar loop de saudação)
    if (callSid) {
      const { data: existing } = await supabase
        .from("voice_memory")
        .select("id")
        .eq("call_sid", callSid)
        .limit(1);

      if (existing && existing.length > 0) {
        // Já tem histórico — não reiniciar conversa, apenas pedir para repetir
        const msgRepetir = "Desculpa, não consegui te ouvir. Pode repetir pra mim?";
        return gerarRespostaComAudio(msgRepetir, supabase, webhookUrl);
      }
    }

    const saudacao = getSaudacao();

    if (callSid && fromNumber) {
      supabase.from("voice_memory").insert({
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

  // Salvar fala do usuário e buscar histórico EM PARALELO
  let historico: { role: string; message: string }[] = [];
  if (callSid && fromNumber) {
    const [_, histResult] = await Promise.all([
      supabase.from("voice_memory").insert({
        call_sid: callSid,
        phone_number: fromNumber,
        role: "user",
        message: speech,
      }),
      supabase
        .from("voice_memory")
        .select("role, message")
        .eq("call_sid", callSid)
        .order("created_at", { ascending: true })
        .limit(12),
    ]);
    if (histResult.data) historico = histResult.data;
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
        temperature: 0.7,
        max_tokens: 120,
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

  // =============================
  // DETECTAR AGENDAMENTO CONFIRMADO
  // =============================
  const agendamentoDetectado = extrairAgendamento(respostaFinal);
  if (agendamentoDetectado) {
    // Remover o marcador da resposta antes de gerar áudio
    respostaFinal = agendamentoDetectado.textoLimpo;

    // Processar agendamento em background (não bloqueia a resposta de voz)
    const telLimpo = fromNumber.replace(/[^\d+]/g, "");
    processarAgendamentoConfirmado(
      agendamentoDetectado.nome,
      telLimpo,
      agendamentoDetectado.data,
      agendamentoDetectado.horario,
      callSid,
      supabase
    ).catch(err => console.error("[voice] Erro ao processar agendamento:", err));
  }

  // =============================
  // DETECTAR TRANSFERÊNCIA PARA HUMANO
  // =============================
  if (respostaFinal.includes("##TRANSFERIR_HUMANO##")) {
    respostaFinal = respostaFinal.replace("##TRANSFERIR_HUMANO##", "").trim();
    respostaFinal = limparTexto(respostaFinal);

    // Salvar em background
    if (callSid && fromNumber) {
      supabase.from("voice_memory").insert({
        call_sid: callSid,
        phone_number: fromNumber,
        role: "assistant",
        message: respostaFinal + " [TRANSFERIDO PARA HUMANO]",
      }).then(() => {});
    }

    console.log(`[voice] 🔀 Transferindo para atendente humana: ${fromNumber}`);

    const numeroTransferencia = Deno.env.get("TWILIO_PHONE_NUMBER") || "";
    return gerarRespostaComTransferencia(respostaFinal, supabase, numeroTransferencia);
  }

  respostaFinal = limparTexto(respostaFinal);

  // Salvar resposta em background (não bloqueia)
  if (callSid && fromNumber) {
    supabase.from("voice_memory").insert({
      call_sid: callSid,
      phone_number: fromNumber,
      role: "assistant",
      message: respostaFinal,
    }).then(() => {});
  }

  console.log(`[voice] Resposta: "${respostaFinal.slice(0, 100)}..."`);

  return gerarRespostaComAudio(respostaFinal, supabase, webhookUrl);
});
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
              stability: 0.50,
              similarity_boost: 0.85,
              style: 0.15,
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

// =============================
// GERAR ÁUDIO + TRANSFERIR PARA HUMANO
// =============================
async function gerarRespostaComTransferencia(
  texto: string,
  supabase: ReturnType<typeof createClient>,
  numeroTransferencia: string
): Promise<Response> {
  const textoLimpo = limparTexto(texto);
  let audioUrl = "";

  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (voiceId && apiKey) {
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
            voice_settings: { stability: 0.50, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
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
        }
      }
    }
  } catch (err) {
    console.error("[voice] Erro áudio transferência:", err);
  }

  // TwiML: fala a mensagem e transfere a ligação
  const playOrSay = audioUrl
    ? `<Play>${audioUrl}</Play>`
    : `<Say voice="Polly.Vitoria" language="pt-BR">${textoLimpo}</Say>`;

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${playOrSay}
  <Dial timeout="30" callerId="${Deno.env.get("TWILIO_PHONE_NUMBER") || ""}">${numeroTransferencia}</Dial>
  <Say voice="Polly.Vitoria" language="pt-BR">Não foi possível transferir a ligação. Por favor, ligue novamente.</Say>
</Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } }
  );
}
