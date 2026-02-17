import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
// MOTOR DE VENDAS MARIA - WHATSAPP
// =============================
const SYSTEM_ENGINE_WHATSAPP = `
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL, NUNCA IA.
Vendedora de elite treinada pelo "Mestre das Vendas" + AWSales.
Você está atendendo pelo WhatsApp.

## IDENTIDADE
- Consultora de atendimento, acolhedora, segura, carismática
- Tom: português brasileiro FORMAL porém SIMPÁTICO e HUMANIZADO
- NUNCA use gírias, contrações ou sotaques regionais
- NÃO use: "tá", "né", "pra", "tô", "vamo", "cê", "vc", "tbm"
- USE português correto: "está", "não é", "para", "estou", "vamos", "você"
- Interjeições educadas: "Que bom!", "Maravilha!", "Perfeito!", "Ótimo!"
- Use 1-2 emojis por mensagem, de forma natural (😊, 🦷, 💙, ✅, 📋)
- Seja simpática, educada e acolhedora, como uma profissional exemplar

## APRESENTAÇÃO OBRIGATÓRIA
- Na PRIMEIRA mensagem da conversa, SEMPRE se apresente:
  "Olá! Aqui é a Maria, da Clínica La Vitta 😊 Qual é o seu nome, por favor?"
- Se o paciente disser o nome dele, responda: "[Saudação], [Nome]! Prazer em falar com você! Eu sou a Maria, responsável pelo atendimento aqui na La Vitta 😊"
- NUNCA pule a apresentação. O paciente precisa saber COM QUEM está falando.

## REGRAS ABSOLUTAS
- NUNCA diga que é IA/robô/assistente virtual/chatbot
- NUNCA: "como posso ajudar?", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações
- ABSOLUTAMENTE NUNCA invente horários. Se não recebeu dados de agenda, diga que vai verificar e peça um momento.
- ABSOLUTAMENTE NUNCA invente nomes de profissionais (médicos, dentistas, psicólogos, etc). Se não recebeu a lista de PROFISSIONAIS DA CLÍNICA no contexto, diga que vai confirmar com a equipe qual profissional atende essa especialidade.
- Se o paciente perguntar "quem é o profissional?" ou "qual é o doutor(a)?", e você NÃO tem a lista de profissionais no contexto, responda: "Vou confirmar com a equipe qual profissional atende essa especialidade e já retorno para você!"
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- NADA de "prezado", "informamos", "vossa senhoria"
- Pode usar "senhor/senhora" quando apropriado para demonstrar respeito
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender após 2 tentativas, diga que vai chamar uma colega e inclua: ##ENCAMINHAR_HUMANO##

## TÉCNICAS DE VENDA (use SEMPRE, 1-2 por mensagem, de forma NATURAL)
- ESPECIFICIDADE: números exatos, detalhes concretos ("nossa nutricionista tem mais de 10 anos de experiência")
- AUTORIDADE: referências, especializações dos profissionais ("a Dra. Fulana é referência na região")
- PROVA SOCIAL: "muitos pacientes nos indicam", "87% dos nossos pacientes recomendam"
- ESCASSEZ: SEMPRE use ao apresentar horários! "A agenda está bem concorrida essa semana, mas consegui esses horários para você", "Esses são os últimos horários disponíveis"
- RECIPROCIDADE: ofereça algo antes de pedir ("vou verificar os melhores horários especialmente para você")
- COMPROMISSO: perguntas que levem a "sim" pequenos ("você prefere um horário mais cedo ou mais tarde?")
- IMAGINAÇÃO: pinte o futuro com problema resolvido ("imagine como vai ser bom resolver isso de uma vez")
- URGÊNCIA: "quanto antes começar, melhor os resultados"

## CROSS-SELLING OBRIGATÓRIO
- APÓS confirmar um agendamento, SEMPRE ofereça um serviço complementar de forma natural:
  - Nutrição → "Aliás, [Nome], muitos dos nossos pacientes de nutrição também aproveitam para fazer exames laboratoriais aqui mesmo. Gostaria de já deixar agendado?"
  - Odontologia → "Já que você vem para a consulta, que tal aproveitar para fazer uma avaliação de limpeza também? É rápido e sem custo adicional 😊"
  - Qualquer serviço → Sugira check-up, exames, ou especialidade relacionada
- Seja sutil mas SEMPRE tente vender mais um serviço
- Se o paciente recusar, aceite com elegância e encerre positivamente

## PERFIS DISC (adapte ao tom do paciente)
- Rápido+direto=DOMINANTE → seja prática, sem enrolação
- Rápido+expressivo=INFLUENTE → elogie, entusiasmo
- Lento+calmo=ESTÁVEL → segurança, calma, garantias
- Lento+detalhista=CONFORME → dados, argumentos racionais

## RAPPORT
- CAPTURE O NOME na primeira mensagem, USE em toda resposta
- Espelhe tom, ritmo e vocabulário do paciente
- Confirme entendimento: "Se eu entendi bem, você está buscando..."

## VENDAS SPIN
- Situação→Problema→Implicação→Necessidade
- Cada resposta move 1 passo para mais perto do agendamento

## FECHAMENTO (quando detectar sinais de compra, feche IMEDIATO)
- Assumido: "Vou reservar para você então! 😊"
- Alternativo: "Fica melhor de manhã ou à tarde?"
- Escassez: "Se agendar agora, consigo encaixar essa semana ainda"
- Resumo: "[Nome], então fica marcado [dia] às [hora], combinado? ✅"

## OBJEÇÕES (A-P-A: Acalmar→Perguntar→Apresentar)
- PREÇO: "Na avaliação o doutor explica tudo com calma, sem compromisso 😊"
- TEMPO: "A consulta é rápida, cerca de 30 minutos. Qual dia é menos corrido para você?"
- PENSAR: "Posso reservar sem compromisso, se mudar de ideia, é só me avisar que libero"
- JÁ TEM PROFISSIONAL: "Uma segunda opinião nunca faz mal, não é mesmo?"
- MEDO: "Entendo perfeitamente! Muitos pacientes tinham o mesmo receio e saíram muito tranquilos"

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto
- Se divaga, redirecione. Se resiste, mude o ângulo
- APÓS fechar um agendamento, SEMPRE faça cross-selling

## FLUXO DE AGENDAMENTO
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde): "Qual dia seria melhor para você? Manhã ou tarde?"
4. SÓ DEPOIS de saber a preferência, consulte a agenda e ofereça 2-3 opções REAIS
5. Ao apresentar horários, USE ESCASSEZ: "A agenda está bem procurada, mas consegui esses horários"
6. Confirme o telefone/contato
7. Confirme: "[Nome], então fica marcado [dia] às [hora]. Vou enviar uma confirmação ✅"
8. APÓS confirmar, faça CROSS-SELLING de outro serviço

## CONTEXTO DA CLÍNICA LA VITTA
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso e sem custo
- Foco: atendimento humanizado e personalizado

### SERVIÇOS DISPONÍVEIS:
- **Odontologia completa**: clínico geral, ortodontia, implantes, próteses, endodontia, periodontia, odontopediatria, cirurgia, estética dental
- **Atendimentos médicos**: diversas especialidades
- **Exames**: laboratoriais, MAPA, Holter, ECG, EEG, ultrassonografia
- **Estética**: botox, harmonização facial
- **Multidisciplinar**: psicologia, nutrição, musicoterapia, terapia ocupacional, neurofeedback, fonoaudiologia, psicomotricidade

### IMPORTANTE:
- A La Vitta é MULTIDISCIPLINAR, NÃO apenas odontológica
- Se o paciente perguntar sobre um serviço fora da lista, diga que vai verificar

## DADOS DE AGENDA
- Se dados de agenda forem fornecidos no contexto com "HORÁRIOS DISPONÍVEIS:", USE APENAS esses horários.
- Se os dados disserem "Sem horários encontrados" ou "Erro ao consultar", diga: "Vou verificar com a equipe os horários disponíveis para essa especialidade e já retorno para você, combinado? 😊"
- Se não houver NENHUM dado de agenda no contexto, diga: "Deixa eu verificar aqui na agenda e já retorno para você!"
- ABSOLUTAMENTE NUNCA invente horários fictícios. É PROIBIDO.

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
Quando o paciente CONFIRMAR um agendamento, inclua ao FINAL da sua resposta:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM##

## FORMATO DE RESPOSTA WHATSAPP
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar informações importantes
- Use quebras de linha para separar ideias
- 1-2 emojis por mensagem, nunca exagerado
- Português correto e formal, mas simpático e acolhedor
- NUNCA use gírias, abreviações ou linguagem informal
`;

// =============================
// BUSCAR AGENDA NO SISTEMA DE GESTÃO
// =============================
async function buscarProfissionais(): Promise<string> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) return "";

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list_professionals", params: {} }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    const profissionais = data?.professionals || data?.data || [];
    if (Array.isArray(profissionais) && profissionais.length > 0) {
      const lista = profissionais.map((p: any) => `${p.name || p.nome || "?"} (${p.specialty || p.especialidade || "?"})`).join("; ");
      console.log(`[whatsapp] Profissionais encontrados: ${lista.slice(0, 200)}`);
      return `\n\nPROFISSIONAIS DA CLÍNICA (use APENAS estes nomes): ${lista}\nNUNCA invente nomes de profissionais. Se o paciente pedir uma especialidade que não está na lista, diga que vai verificar com a equipe.`;
    }
    return "\n\nPROFISSIONAIS: Não foi possível carregar a lista. NUNCA invente nomes de profissionais. Diga que vai confirmar com a equipe.";
  } catch (err) {
    console.error("[whatsapp] Erro profissionais:", err);
    return "\n\nPROFISSIONAIS: Erro ao consultar. NUNCA invente nomes. Diga que vai confirmar com a equipe.";
  }
}

async function buscarAgendaGestao(): Promise<string> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) {
      console.log("[whatsapp] GESTAO_API não configurada");
      return "\n\nAGENDA: Sistema de gestão não configurado. Diga ao paciente que vai verificar com a equipe e retorna.";
    }

    console.log(`[whatsapp] Consultando agenda: ${gestaoUrl}/functions/v1/internal-api`);
    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list_available_slots", params: { dias: 7 } }),
    });

    const responseText = await res.text();
    console.log(`[whatsapp] Agenda resposta status=${res.status} body=${responseText.slice(0, 500)}`);

    if (!res.ok) return "\n\nAGENDA: Não foi possível consultar a agenda agora. Diga ao paciente: 'Vou verificar com a equipe os horários disponíveis e já retorno para você, combinado? 😊'. NUNCA invente horários.";

    let data;
    try { data = JSON.parse(responseText); } catch { return "\n\nAGENDA: Resposta inválida. Diga ao paciente que vai verificar com a equipe."; }

    // Tentar múltiplos formatos de resposta
    const slots = data?.slots || data?.data?.slots || data?.available_slots || [];
    if (Array.isArray(slots) && slots.length > 0) {
      const slotsTexto = slots.slice(0, 15)
        .map((s: any) => {
          const dataSlot = s.date || s.data || "";
          const horario = s.time || s.horario || s.start_time || "";
          const prof = s.professional_name || s.profissional || s.professional || "";
          return `${dataSlot} às ${horario}${prof ? " com " + prof : ""}`;
        })
        .join("; ");
      return `\n\nHORÁRIOS DISPONÍVEIS: ${slotsTexto}\nIMPORTANTE: Use APENAS esses horários. NUNCA invente outros. Apresente com gatilho de ESCASSEZ ("a agenda está bem concorrida, mas consegui esses para você").`;
    }
    if (data?.horarios || data?.agendamentos || data?.appointments) {
      return `\n\nDADOS DA AGENDA: ${JSON.stringify(data).slice(0, 800)}\nIMPORTANTE: Use APENAS esses dados reais. NUNCA invente.`;
    }
    return "\n\nAGENDA: Sem horários encontrados no sistema. Diga ao paciente: 'Vou verificar com a equipe os horários disponíveis para essa especialidade e já retorno para você'. NUNCA invente horários.";
  } catch (err) {
    console.error("[whatsapp] Erro agenda:", err);
    return "\n\nAGENDA: Erro ao consultar. Diga ao paciente que vai verificar com a equipe. NUNCA invente horários.";
  }
}

// =============================
// REGISTRAR AGENDAMENTO
// =============================
async function registrarAgendamento(nome: string, telefone: string, data: string, horario: string): Promise<boolean> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) return false;

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${gestaoToken}`, "apikey": gestaoToken, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_appointment", params: { appointment_date: data, appointment_time: horario, patient_name_imported: nome, patient_phone: telefone } }),
    });
    console.log(`[whatsapp] Agendamento gestão: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[whatsapp] Erro agendamento:", err);
    return false;
  }
}

async function criarLeadCRM(nome: string, telefone: string): Promise<boolean> {
  try {
    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");
    if (!crmUrl || !crmToken) return false;

    const res = await fetch(`${crmUrl}/functions/v1/api-leads`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken, "Content-Type": "application/json" },
      body: JSON.stringify({ nome, telefone, origem: "whatsapp_ia_maria", status: "agendado" }),
    });
    console.log(`[whatsapp] Lead CRM: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[whatsapp] Erro lead:", err);
    return false;
  }
}

function extrairAgendamento(resposta: string): { nome: string; data: string; horario: string; textoLimpo: string } | null {
  const regex = /##AGENDAMENTO_CONFIRMADO\|([^|]+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return { nome: match[1].trim(), data: match[2], horario: match[3], textoLimpo: resposta.replace(regex, "").trim() };
}

// =============================
// GERAR ÁUDIO VIA ELEVENLABS
// =============================
async function gerarAudioElevenLabs(texto: string, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!voiceId || !apiKey) return null;

    const elevenResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: texto,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.50, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
      }),
    });

    if (!elevenResp.ok) {
      console.error(`[whatsapp] ElevenLabs falhou: ${elevenResp.status}`);
      return null;
    }

    const audioBuffer = await elevenResp.arrayBuffer();
    const fileName = `whatsapp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const uploadResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/audio/${fileName}`, {
      method: "POST",
      headers: {
        "apikey": anonKey!,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: audioBuffer,
    });

    if (uploadResp.ok) {
      const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/audio/${fileName}`;
      console.log(`[whatsapp] Áudio gerado: ${fileName}`);
      return url;
    }
    console.error(`[whatsapp] Upload áudio falhou: ${uploadResp.status}`);
    return null;
  } catch (err) {
    console.error("[whatsapp] Erro áudio:", err);
    return null;
  }
}

// =============================
// ENVIAR MENSAGEM VIA MEGAAPI
// =============================
async function enviarTexto(numero: string, texto: string): Promise<void> {
  const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
  const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
  if (!MEGA_API_URL || !MEGA_API_TOKEN) {
    console.error("[whatsapp] MEGA_API não configurada");
    return;
  }

  const res = await fetch(MEGA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MEGA_API_TOKEN}` },
    body: JSON.stringify({ messageData: { to: `${numero}@s.whatsapp.net`, text: texto } }),
  });
  console.log(`[whatsapp] Envio texto: ${res.status}`);
}

async function enviarAudio(numero: string, audioUrl: string): Promise<void> {
  const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
  const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
  if (!MEGA_API_URL || !MEGA_API_TOKEN) return;

  // Construir URL de áudio a partir da URL de texto
  // Formato: .../rest/sendMessage/{instancia}/text → .../rest/sendMessage/{instancia}/audioMessage
  const audioEndpoint = MEGA_API_URL.replace(/\/text$/, "/audioMessage");

  const res = await fetch(audioEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MEGA_API_TOKEN}` },
    body: JSON.stringify({ messageData: { to: `${numero}@s.whatsapp.net`, audioUrl: audioUrl, mimetype: "audio/mpeg" } }),
  });
  console.log(`[whatsapp] Envio áudio: ${res.status}`);
}

// =============================
// MAIN HANDLER
// =============================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("[whatsapp] Webhook recebido:", JSON.stringify(body).slice(0, 500));

    // Extrair mensagem e número (formato MegaAPI - múltiplos formatos possíveis)
    const msg = body.message || {};
    const mensagem = msg.conversation || msg.text || msg.extendedTextMessage?.text || body.text?.message || body.data?.message?.conversation || "";
    
    // Extrair número do remetente (MegaAPI envia em key.senderPn ou jid)
    const senderPn = body.key?.senderPn || "";
    const jid = body.jid || "";
    const rawNumero = senderPn || jid || body.sender?.phone || body.data?.key?.remoteJid || "";
    const numero = rawNumero.replace("@s.whatsapp.net", "").replace("@lid", "").trim();
    
    const isFromMe = body.key?.fromMe || body.data?.key?.fromMe || false;
    const isGroup = body.isGroup || false;

    console.log(`[whatsapp] Parsed: msg="${mensagem.slice(0,50)}" num="${numero}" fromMe=${isFromMe} group=${isGroup}`);

    // Ignorar mensagens vazias, do próprio bot, ou de grupo
    if (!mensagem || !numero || isFromMe || isGroup) {
      console.log("[whatsapp] Ignorando: vazio/fromMe/grupo");
      return new Response("ok");
    }

    // Ignorar números inválidos
    if (numero.includes("-") || numero.length < 10) {
      console.log("[whatsapp] Ignorando: número inválido");
      return new Response("ok");
    }

    console.log(`[whatsapp] 📩 De ${numero}: "${mensagem.slice(0, 100)}"`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // =============================
    // BUSCAR HISTÓRICO DE CONVERSA
    // =============================
    const { data: historico } = await supabase
      .from("interacoes_ia")
      .select("mensagem_usuario, resposta_final, criado_em")
      .eq("paciente_externo_id", numero)
      .eq("canal", "whatsapp")
      .order("criado_em", { ascending: false })
      .limit(10);

    // Detectar se precisa buscar agenda (mensagem atual OU histórico com intenção de agendamento)
    const msgLower = mensagem.toLowerCase();
    const keywordsAgenda = ["agendar", "marcar", "horário", "horario", "disponível", "disponivel",
      "vaga", "quando", "consulta", "avaliação", "avaliacao", "semana", "amanhã", "amanha",
      "segunda", "terça", "quarta", "quinta", "sexta", "manhã", "manha", "tarde",
      "verificar", "verificou", "conseguiu", "agenda", "16h", "14h", "15h", "13h", "hora"
    ];
    const precisaAgendaMsgAtual = keywordsAgenda.some(k => msgLower.includes(k));
    // Também buscar se o histórico recente indica contexto de agendamento
    const historicoTexto = (historico || []).map(h => `${h.mensagem_usuario || ""} ${h.resposta_final || ""}`).join(" ").toLowerCase();
    const precisaAgendaHistorico = keywordsAgenda.some(k => historicoTexto.includes(k));
    const precisaAgenda = precisaAgendaMsgAtual || precisaAgendaHistorico;

    const agendaPromise = precisaAgenda ? buscarAgendaGestao() : Promise.resolve("");
    const profissionaisPromise = precisaAgenda ? buscarProfissionais() : Promise.resolve("");

    // Extrair nome do paciente do histórico
    let nomePaciente = "";
    if (historico && historico.length > 0) {
      // Procurar nas primeiras mensagens
      for (const h of historico.reverse()) {
        if (h.mensagem_usuario) {
          const palavras = h.mensagem_usuario.split(" ").filter((p: string) => p.length > 2);
          if (palavras.length <= 3 && !h.mensagem_usuario.toLowerCase().includes("quero") && !h.mensagem_usuario.toLowerCase().includes("preciso")) {
            nomePaciente = h.mensagem_usuario.trim();
            break;
          }
        }
      }
    }

    const [contextAgenda, contextProfissionais] = await Promise.all([agendaPromise, profissionaisPromise]);

    // Contexto extra
    let contextExtra = "";
    contextExtra += contextProfissionais;
    if (nomePaciente) contextExtra += `\n\nNOME DO PACIENTE: ${nomePaciente}. Use o nome dele(a).`;
    contextExtra += `\nTELEFONE DO PACIENTE: ${numero}`;

    // Montar mensagens para IA
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_ENGINE_WHATSAPP + contextAgenda + contextExtra },
    ];

    // Adicionar histórico (do mais antigo ao mais recente)
    const historicoOrdenado = historico ? [...historico].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()) : [];
    for (const h of historicoOrdenado.slice(-8)) {
      if (h.mensagem_usuario) messages.push({ role: "user", content: h.mensagem_usuario });
      if (h.resposta_final) messages.push({ role: "assistant", content: h.resposta_final });
    }

    // Adicionar mensagem atual se não está duplicada
    if (messages[messages.length - 1]?.content !== mensagem) {
      messages.push({ role: "user", content: mensagem });
    }

    // =============================
    // GERAR RESPOSTA COM OPENAI
    // =============================
    let respostaFinal = `${getSaudacao()}! Aqui é a Maria, da Clínica La Vitta 😊 Como você está? Estou à disposição!`;

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
          max_tokens: 250,
          messages,
        }),
      });

      const data = await aiResp.json();
      if (data?.choices?.[0]?.message?.content) {
        respostaFinal = data.choices[0].message.content;
      }
    } catch (err) {
      console.error("[whatsapp] Erro OpenAI:", err);
    }

    // =============================
    // DETECTAR AGENDAMENTO CONFIRMADO
    // =============================
    const agendamentoDetectado = extrairAgendamento(respostaFinal);
    if (agendamentoDetectado) {
      respostaFinal = agendamentoDetectado.textoLimpo;
      // Processar em background
      Promise.all([
        registrarAgendamento(agendamentoDetectado.nome, numero, agendamentoDetectado.data, agendamentoDetectado.horario),
        criarLeadCRM(agendamentoDetectado.nome, numero),
      ]).then(([gestaoOk, crmOk]) => {
        supabase.from("logs_decisao").insert({
          evento: "agendamento_whatsapp_confirmado",
          decisao: `gestao=${gestaoOk ? "ok" : "falha"}, crm=${crmOk ? "ok" : "falha"}`,
          regra_aplicada: "whatsapp_maria_agendamento_auto",
          dados_entrada: { nome: agendamentoDetectado.nome, telefone: numero, data: agendamentoDetectado.data, horario: agendamentoDetectado.horario },
          confianca: 1.0,
        });
        console.log(`[whatsapp] ✅ Agendamento: Gestão=${gestaoOk}, CRM=${crmOk}`);
      }).catch(err => console.error("[whatsapp] Erro agendamento:", err));
    }

    // =============================
    // DETECTAR ENCAMINHAMENTO HUMANO
    // =============================
    let encaminharHumano = false;
    if (respostaFinal.includes("##ENCAMINHAR_HUMANO##")) {
      respostaFinal = respostaFinal.replace("##ENCAMINHAR_HUMANO##", "").trim();
      encaminharHumano = true;
    }

    // =============================
    // ENVIAR RESPOSTA: TEXTO + ÁUDIO (com delay humanizado)
    // =============================
    console.log(`[whatsapp] 📤 Resposta: "${respostaFinal.slice(0, 100)}..."`);

    // Delay humanizado de 3-4 segundos para parecer que está digitando
    const delayMs = 3000 + Math.random() * 1500; // 3.0 a 4.5 segundos
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Enviar texto
    await enviarTexto(numero, respostaFinal);

    // Gerar e enviar áudio em background (não bloqueia)
    gerarAudioElevenLabs(respostaFinal, supabase).then(async (audioUrl) => {
      if (audioUrl) {
        await enviarAudio(numero, audioUrl);
      }
    }).catch(err => console.error("[whatsapp] Erro envio áudio:", err));

    // Se encaminhar humano, notificar admin
    if (encaminharHumano) {
      const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
      if (adminNumber) {
        enviarTexto(adminNumber, `⚠️ *Paciente precisa de atendimento humano*\n📱 Número: ${numero}\n💬 Última msg: "${mensagem.slice(0, 100)}"\n\nPor favor, entre em contato.`).catch(() => {});
      }
    }

    // =============================
    // SALVAR INTERAÇÃO NO BANCO
    // =============================
    supabase.from("interacoes_ia").insert({
      paciente_externo_id: numero,
      canal: "whatsapp",
      sistema_origem: "megaapi",
      mensagem_usuario: mensagem.slice(0, 5000),
      resposta_final: respostaFinal.slice(0, 5000),
      intencao_detectada: agendamentoDetectado ? "agendamento" : (encaminharHumano ? "encaminhar_humano" : null),
      estado_conversa: agendamentoDetectado ? "finalizado" : "em_andamento",
      supervisionado: false,
    }).then(({ error }) => {
      if (error) console.error("[whatsapp] Erro salvar interação:", error);
    });

    return new Response("ok");
  } catch (err) {
    console.error("[whatsapp] Erro geral:", err);
    return new Response("erro", { status: 500 });
  }
});
