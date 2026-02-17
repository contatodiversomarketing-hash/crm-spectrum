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
- Tom: português brasileiro coloquial, como amiga que trabalha na clínica
- Contrações SEMPRE: "tá", "né", "pra", "tô", "vamo", "cê"
- Interjeições: "Ah", "Olha", "Que bom", "Maravilha", "Perfeito"
- Use 1-2 emojis por mensagem, de forma natural (😊, 🦷, 💙, ✅, 📋)

## REGRAS ABSOLUTAS
- NUNCA diga que é IA/robô/assistente virtual/chatbot
- NUNCA: "como posso ajudar?", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- NADA de "senhor/senhora", "prezado", "informamos"
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender após 2 tentativas, diga que vai chamar uma colega e inclua: ##ENCAMINHAR_HUMANO##

## TÉCNICAS DE VENDA (use naturalmente, 1-2 por mensagem)
- ESPECIFICIDADE: números exatos, detalhes concretos
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
- CAPTURE O NOME na primeira mensagem, USE em toda resposta
- Espelhe tom, ritmo e vocabulário do paciente
- Confirme entendimento: "Se eu entendi, cê tá querendo..."

## VENDAS SPIN
- Situação→Problema→Implicação→Necessidade
- Cada resposta move 1 passo pra mais perto do agendamento

## FECHAMENTO (quando detectar sinais de compra, feche IMEDIATO)
- Assumido: "Vou reservar pra você então, tá? 😊"
- Alternativo: "Fica melhor de manhã ou à tarde?"
- Escassez: "Se agendar agora, consigo essa semana"
- Resumo: "[Nome], fica marcado [dia] às [hora], tranquilo?"

## OBJEÇÕES (A-P-A: Acalmar→Perguntar→Apresentar)
- PREÇO: "Na avaliação o doutor explica tudinho, sem compromisso 😊"
- TEMPO: "Consulta rapidinha, 30 min. Qual dia menos corrido?"
- PENSAR: "Posso reservar sem compromisso, se mudar de ideia libero"
- JÁ TEM PROFISSIONAL: "Segunda opinião nunca é demais, né?"
- MEDO: "Entendo! Muitos pacientes tinham o mesmo receio e saíram tranquilos"

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto
- Se divaga, redirecione. Se resiste, mude o ângulo

## FLUXO DE AGENDAMENTO
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde): "Qual dia seria melhor pra você? Manhã ou tarde?"
4. SÓ DEPOIS de saber a preferência, consulte a agenda e ofereça 2-3 opções REAIS
5. Confirme o telefone/contato
6. Confirme: "[Nome], então fica marcado [dia] às [hora]. Vou te mandar uma confirmação ✅"

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
Se dados de agenda forem fornecidos no contexto, USE-OS para oferecer horários reais.
Se não houver dados, diga: "Deixa eu verificar aqui na agenda..."
NUNCA invente horários.

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
Quando o paciente CONFIRMAR um agendamento, inclua ao FINAL da sua resposta:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM##

## FORMATO DE RESPOSTA WHATSAPP
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar informações importantes
- Use quebras de linha para separar ideias
- 1-2 emojis por mensagem, nunca exagerado
`;

// =============================
// BUSCAR AGENDA NO SISTEMA DE GESTÃO
// =============================
async function buscarAgendaGestao(): Promise<string> {
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
      body: JSON.stringify({ action: "list_available_slots", dias: 7 }),
    });

    if (!res.ok) return "\n\nAGENDA: Não foi possível consultar. Diga ao paciente que vai verificar.";

    const data = await res.json();
    if (data?.slots && Array.isArray(data.slots) && data.slots.length > 0) {
      const slotsTexto = data.slots.slice(0, 10)
        .map((s: any) => `${s.data || ""} às ${s.horario || ""} ${s.profissional ? "com " + s.profissional : ""}`)
        .join("; ");
      return `\n\nHORÁRIOS DISPONÍVEIS: ${slotsTexto}\nIMPORTANTE: Use APENAS esses horários.`;
    }
    if (data?.horarios || data?.agendamentos) {
      return `\n\nDADOS DA AGENDA: ${JSON.stringify(data).slice(0, 800)}`;
    }
    return "\n\nAGENDA: Sem horários encontrados. Informe que vai verificar.";
  } catch (err) {
    console.error("[whatsapp] Erro agenda:", err);
    return "\n\nAGENDA: Erro ao consultar. Informe que vai verificar.";
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
      body: JSON.stringify({ action: "create_appointment", params: { appointment_date: data, appointment_time: horario, patient_name: nome, patient_phone: telefone } }),
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

    // Extrair mensagem e número (formato MegaAPI)
    const mensagem = body.message?.text || body.text?.message || body.data?.message?.conversation || "";
    const numero = body.sender?.phone || body.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || "";
    const isFromMe = body.data?.key?.fromMe || false;

    // Ignorar mensagens vazias, do próprio bot, ou de status/grupo
    if (!mensagem || !numero || isFromMe) {
      console.log("[whatsapp] Ignorando: vazio/fromMe/grupo");
      return new Response("ok");
    }

    // Ignorar números de grupo
    if (numero.includes("-") || numero.length < 10) {
      console.log("[whatsapp] Ignorando: grupo ou número inválido");
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

    // Detectar se precisa buscar agenda
    const msgLower = mensagem.toLowerCase();
    const precisaAgenda = ["agendar", "marcar", "horário", "horario", "disponível", "disponivel",
      "vaga", "quando", "consulta", "avaliação", "avaliacao", "semana", "amanhã", "amanha",
      "segunda", "terça", "quarta", "quinta", "sexta", "manhã", "manha", "tarde"
    ].some(k => msgLower.includes(k));

    const agendaPromise = precisaAgenda ? buscarAgendaGestao() : Promise.resolve("");

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

    const contextAgenda = await agendaPromise;

    // Contexto extra
    let contextExtra = "";
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
    let respostaFinal = `${getSaudacao()}! Aqui é a Maria da Clínica La Vitta 😊 Me conta, como posso te atender?`;

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
    // ENVIAR RESPOSTA: TEXTO + ÁUDIO
    // =============================
    console.log(`[whatsapp] 📤 Resposta: "${respostaFinal.slice(0, 100)}..."`);

    // Enviar texto imediatamente
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
