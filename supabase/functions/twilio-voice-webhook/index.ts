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
// CORRIGIR ENCODING (mojibake da API de Gestão)
// =============================
function fixEncoding(text: string): string {
  if (!text) return text;
  return text
    .replace(/�/g, "")
    .replace(/Ã©/g, "é").replace(/Ã¡/g, "á").replace(/Ã£/g, "ã")
    .replace(/Ã³/g, "ó").replace(/Ãº/g, "ú").replace(/Ã­/g, "í")
    .replace(/Ã§/g, "ç").replace(/Ãª/g, "ê").replace(/Ã´/g, "ô")
    .replace(/Ã¢/g, "â").replace(/Ã/g, "Á")
    .trim();
}

// =============================
// MOTOR DE VENDAS - MESTRE DAS VENDAS + AWSales (VOZ)
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
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender o paciente após 2 tentativas, diga: "Vou te transferir pra uma das nossas atendentes, tá? Um momentinho." e inclua ao final: ##TRANSFERIR_HUMANO##

## TÉCNICAS DE VENDA (use naturalmente, 1-2 por turno)
- ESPECIFICIDADE, AUTORIDADE, PROVA SOCIAL, ESCASSEZ (NO MÁXIMO 2 opções de horário)
- RECIPROCIDADE, COMPROMISSO, IMAGINAÇÃO

## RAPPORT
- CAPTURE O NOME na primeira fala, USE em toda resposta

## FECHAMENTO (quando detectar sinais de compra, feche IMEDIATO)
- Assumido: "Vou reservar pra você então, tá?"
- Alternativo: "Fica melhor de manhã ou à tarde?"

## OBJEÇÕES (A-P-A: Acalmar→Perguntar→Apresentar)
- PREÇO: "Na avaliação o doutor explica tudinho, sem compromisso"
- TEMPO: "Consulta rapidinha, 30 min. Qual dia menos corrido?"
- PENSAR: "Posso reservar sem compromisso, se mudar de ideia libero"

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto

## REGRA CRÍTICA: FILTRO DE ESPECIALIDADE (MUITO IMPORTANTE!)
Quando o paciente pedir um serviço ou especialidade, você DEVE:
1. Identificar a ÁREA que o paciente está pedindo
2. Filtrar a lista de profissionais e indicar SOMENTE os da área correta
3. NUNCA misture áreas diferentes

### MAPEAMENTO DE TERMOS → ESPECIALIDADES:
- "dentista", "dente", "dor de dente", "cárie", "canal", "extração", "limpeza" → ODONTOLOGIA
- "aparelho", "ortodontia" → ORTODONTISTA
- "implante" → IMPLANTODONTISTA
- "psicólogo", "terapia", "ansiedade" → PSICÓLOGO
- "nutricionista", "dieta", "emagrecer" → NUTRICIONISTA
- "fono", "fala" → FONOAUDIÓLOGO
- "médico", "clínico", "exame" → MÉDICO CLÍNICO
- "botox", "harmonização" → ESTÉTICA

### REGRA DE OURO:
- Se o paciente diz "dentista" → NUNCA sugira psicólogos, nutricionistas ou outros
- Se a especialidade pedida NÃO existe na lista → diga que vai verificar
- Em caso de DÚVIDA → PERGUNTE: "Você tá buscando atendimento odontológico, médico ou de outra área?"

## FLUXO DE AGENDAMENTO
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. FILTRE os profissionais pela especialidade correta
4. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde)
5. SÓ DEPOIS de saber a preferência, ofereça 2 opções REAIS do turno pedido
6. Confirme o telefone
7. Confirme: "[Nome], fica marcado [dia] às [hora], tá?"

## CONTEXTO DA CLÍNICA LA VITTA
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso e sem custo
- A La Vitta é MULTIDISCIPLINAR, NÃO apenas odontológica

## REGRAS DE HORÁRIOS
- Ofereça EXATAMENTE 2 opções do turno pedido

## REGRAS DE PROFISSIONAIS
- Use o NOME EXATO do profissional
- NUNCA diga "vou confirmar com a equipe" se a especialidade está na lista
- Só diga "vou verificar" se a especialidade NÃO aparece

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
Quando o paciente CONFIRMAR um agendamento, inclua ao FINAL:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM|professional_id##

- O professional_id deve ser o ID do profissional correto da lista (campo "id")
- Se não souber, use "auto"

## MÚLTIPLOS AGENDAMENTOS (MUITO IMPORTANTE!)
- Se o paciente pedir 2+ agendamentos, inclua UM marcador para CADA
- Cada profissional = 1 marcador. Se faltar algum, o agendamento NÃO será registrado
`;

// =============================
// BUSCAR PROFISSIONAIS NO SISTEMA DE GESTÃO
// =============================
async function buscarProfissionaisVoz(): Promise<{ texto: string; raw: any[] }> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) return { texto: "", raw: [] };

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gestaoToken}`,
        "apikey": gestaoToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list_professionals", params: {} }),
    });

    if (!res.ok) {
      console.log(`[voice] Profissionais API falhou: ${res.status}`);
      return { texto: "\n\nPROFISSIONAIS: Erro ao consultar. NUNCA invente nomes.", raw: [] };
    }

    const data = await res.json();
    const profissionais = data?.professionals || data?.data || [];
    
    if (!Array.isArray(profissionais) || profissionais.length === 0) {
      return { texto: "\n\nPROFISSIONAIS: Lista vazia. Diga que vai confirmar com a equipe.", raw: [] };
    }

    const comEspecialidade = profissionais.filter((p: any) => {
      const esp = fixEncoding(p.specialty || p.especialidade || p.specialization || "").trim();
      const ativo = p.is_active !== false;
      return esp && esp.length > 1 && ativo;
    });

    if (comEspecialidade.length === 0) {
      return { texto: "\n\nPROFISSIONAIS: Nenhum com especialidade definida. Diga que vai confirmar.", raw: profissionais };
    }

    const lista = comEspecialidade.map((p: any) => {
      const nome = fixEncoding(p.full_name || p.professional_name || p.display_name || p.name || p.nome || "");
      const esp = fixEncoding(p.specialty || p.especialidade || p.specialization || "").trim();
      const espNorm = esp.charAt(0).toUpperCase() + esp.slice(1).toLowerCase();
      return `${nome} (${espNorm})`;
    }).join("; ");

    console.log(`[voice] ✅ ${comEspecialidade.length} profissionais carregados`);

    return { texto: `\n\nPROFISSIONAIS REAIS DA CLÍNICA: ${lista}\nQuando o paciente perguntar qual profissional, use o nome EXATO da lista. NUNCA diga "vou verificar" se a especialidade está na lista.`, raw: profissionais };
  } catch (err) {
    console.error("[voice] Erro profissionais:", err);
    return { texto: "", raw: [] };
  }
}

// =============================
// BUSCAR HORÁRIOS DISPONÍVEIS VIA API DE GESTÃO (VOZ)
// =============================
async function buscarHorariosDisponiveisVoz(profissionais: any[]): Promise<string> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) return gerarHorariosLocaisVoz();

    const hoje = new Date();
    const diasParaConsultar: string[] = [];
    for (let i = 1; i <= 10 && diasParaConsultar.length < 5; i++) {
      const d = new Date(hoje.getTime() + i * 86400000);
      if (d.getDay() >= 1 && d.getDay() <= 5) {
        diasParaConsultar.push(d.toISOString().split("T")[0]);
      }
    }

    const profIds = profissionais
      .filter((p: any) => p.id || p.professional_id)
      .slice(0, 3)
      .map((p: any) => p.id || p.professional_id);

    if (profIds.length === 0) return gerarHorariosLocaisVoz();

    const slotsPromises = diasParaConsultar.flatMap(date =>
      profIds.map((profId: string) =>
        fetch(`${gestaoUrl}/functions/v1/internal-api`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${gestaoToken}`,
            "apikey": gestaoToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "get_available_slots",
            params: { professional_id: profId, date },
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );

    const resultados = await Promise.all(slotsPromises);
    const nomes: Record<number, string> = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta" };
    const slotsMap: Record<string, Set<string>> = {};

    for (const res of resultados) {
      if (!res) continue;
      const slots = res?.slots || res?.available_slots || res?.data || [];
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        const date = slot.date || slot.appointment_date || "";
        const time = slot.time || slot.start_time || slot.appointment_time || "";
        if (date && time) {
          if (!slotsMap[date]) slotsMap[date] = new Set();
          slotsMap[date].add(time.slice(0, 5));
        }
      }
    }

    const datas = Object.keys(slotsMap).sort();
    if (datas.length === 0) return gerarHorariosLocaisVoz();

    const linhas = datas.map(dt => {
      const d = new Date(dt + "T12:00:00Z");
      const dow = d.getDay();
      const horarios = [...slotsMap[dt]].sort();
      return `${nomes[dow] || dt}: ${horarios.join(", ")}`;
    });

    console.log(`[voice] ✅ Agenda real: ${datas.length} dias com slots`);
    return `\n\nHORÁRIOS DISPONÍVEIS (AGENDA REAL): ${linhas.join("; ")}\nOfereça EXATAMENTE 2 opções do turno pedido. NUNCA liste todos. Use: "Consegui encaixar pra você".`;
  } catch (err) {
    console.error("[voice] Erro agenda real:", err);
    return gerarHorariosLocaisVoz();
  }
}

function gerarHorariosLocaisVoz(): string {
  const hoje = new Date();
  const nomes: Record<number, string> = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta" };
  const linhas: string[] = [];
  for (let i = 1; i <= 10 && linhas.length < 5; i++) {
    const d = new Date(hoje.getTime() + i * 86400000);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      linhas.push(`${nomes[dow]}: manhã 8h-11h, tarde 13h-17h`);
    }
  }
  return `\n\nHORÁRIOS DISPONÍVEIS: ${linhas.join("; ")}\nOfereça EXATAMENTE 2 opções do turno pedido. NUNCA liste todos.`;
}

// =============================
// REGISTRAR AGENDAMENTO + CRM
// =============================
async function registrarAgendamento(
  nome: string, telefone: string, data: string, horario: string,
  patientId: string | null, supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) return false;

    const params: Record<string, string> = {
      appointment_date: data,
      appointment_time: horario,
      patient_name_imported: nome,
      patient_phone: telefone,
    };
    if (patientId) params.patient_id = patientId;

    const res = await fetch(`${gestaoUrl}/functions/v1/internal-api`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${gestaoToken}`, "apikey": gestaoToken, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_appointment", params }),
    });

    console.log(`[voice] Agendamento gestão: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[voice] Erro agendamento:", err);
    return false;
  }
}

async function criarLeadCRM(nome: string, telefone: string, origem: string): Promise<boolean> {
  try {
    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");
    if (!crmUrl || !crmToken) return false;

    const res = await fetch(`${crmUrl}api-leads`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken, "Content-Type": "application/json" },
      body: JSON.stringify({ nome, telefone, origem: origem || "ligacao_ia_maria", status: "agendado" }),
    });

    console.log(`[voice] Lead CRM: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[voice] Erro lead CRM:", err);
    return false;
  }
}

function extrairAgendamentos(resposta: string): { agendamentos: Array<{ nome: string; data: string; horario: string; professionalId: string }>; textoLimpo: string } {
  const regex = /##AGENDAMENTO_CONFIRMADO\|([^|]+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|?([^#]*)##/g;
  const agendamentos: Array<{ nome: string; data: string; horario: string; professionalId: string }> = [];
  let match;
  while ((match = regex.exec(resposta)) !== null) {
    agendamentos.push({
      nome: match[1].trim(),
      data: match[2],
      horario: match[3],
      professionalId: (match[4] || "auto").trim(),
    });
  }
  const textoLimpo = resposta.replace(/##AGENDAMENTO_CONFIRMADO\|[^#]*##/g, "").trim();
  return { agendamentos, textoLimpo };
}

async function processarAgendamentoConfirmado(
  nome: string, telefone: string, data: string, horario: string,
  callSid: string, supabase: ReturnType<typeof createClient>
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

  // Verificar se o canal Telefone está ativo (só bloqueia chamadas INBOUND da IA)
  // Chamadas outbound (feitas pelos atendentes via CRM) sempre passam
  const bodyPeek = await req.clone().text();
  const peekParams = new URLSearchParams(bodyPeek);
  const callDirection = peekParams.get("Direction") || "";
  const callerNumber = peekParams.get("From") || "";
  const calledNumber = peekParams.get("To") || "";
  const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || "";

  console.log(`[voice] Direction="${callDirection}" From="${callerNumber}" To="${calledNumber}" TwilioPhone="${twilioPhoneNumber}"`);

  // Chamada de atendente humana via Twilio Client SDK (CRM/browser)
  // From começa com "client:" → atendente ligando para paciente → conectar direto, sem Maria
  if (callerNumber.startsWith("client:")) {
    console.log(`[voice] Chamada humana via Client SDK (From="${callerNumber}" To="${calledNumber}") - conectando direto ao número destino`);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${twilioPhoneNumber}">${calledNumber}</Dial></Response>`;
    return new Response(twiml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  // Chamada outbound-api (ex: reativação automática da IA) → Maria atende normalmente
  // Chamada inbound (cliente ligando para a clínica) → verificar toggle e Maria atende
  const isInboundAI = !callDirection.includes("outbound") || callDirection === "outbound-api";

  if (!callDirection.includes("outbound")) {
    // Inbound: cliente ligou para a clínica — verificar se canal está ativo
    const { data: configCanal } = await supabase
      .from("configuracoes_sistema")
      .select("telefone_ativo")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configCanal && configCanal.telefone_ativo === false) {
      console.log("[voice] Canal Telefone DESATIVADO - rejeitando chamada inbound");
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR" voice="Polly.Camila">Nosso atendimento por telefone está temporariamente indisponível. Por favor, entre em contato pelo WhatsApp. Obrigada!</Say><Hangup/></Response>`;
      return new Response(twiml, {
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }
  }

  console.log(`[voice] Chamada para Maria (Direction="${callDirection}" From="${callerNumber}")`);
  void isInboundAI; // usado só para clareza lógica

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
    if (callSid) {
      const { data: existing } = await supabase
        .from("voice_memory")
        .select("id")
        .eq("call_sid", callSid)
        .limit(1);

      if (existing && existing.length > 0) {
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

  // SEMPRE buscar profissionais e treinamento primeiro
  const [profResult, treinamentoResult] = await Promise.all([
    buscarProfissionaisVoz(),
    supabase
      .from("treinamento_ia")
      .select("titulo, instrucao, categoria")
      .eq("ativo", true)
      .in("canal", ["ambos", "voz"])
      .order("categoria"),
  ]);
  const contextAgenda = await buscarHorariosDisponiveisVoz(profResult.raw);
  const contextProfissionais = profResult.texto;
  const treinamentos = treinamentoResult.data || [];

  console.log(`[voice] Contexto: profissionais=${contextProfissionais.length > 50 ? "OK" : "VAZIO"} agenda=${contextAgenda.length > 50 ? "OK" : "VAZIO"} treinamento=${treinamentos.length} instruções`);

  // Extrair nome do paciente do histórico
  let nomePaciente = "";
  for (const h of historico) {
    if (h.role === "user" && historico.indexOf(h) <= 2) {
      const palavras = h.message.split(" ").filter(p => p.length > 2);
      if (palavras.length <= 3 && !h.message.toLowerCase().includes("quero") && !h.message.toLowerCase().includes("preciso")) {
        nomePaciente = h.message.trim();
        break;
      }
    }
  }

  // Contexto extra
  let contextExtra = "";
  contextExtra += contextProfissionais;
  contextExtra += contextAgenda;
  if (nomePaciente) contextExtra += `\n\nNOME DO PACIENTE: ${nomePaciente}. Use o nome dele(a).`;
  if (fromNumber) contextExtra += `\nTELEFONE DO PACIENTE: ${fromNumber}`;

  // Injetar treinamento do admin
  if (treinamentos.length > 0) {
    contextExtra += `\n\n## INSTRUÇÕES ADICIONAIS DO ADMINISTRADOR (SIGA TODAS COM PRIORIDADE MÁXIMA):\n`;
    for (const t of treinamentos) {
      contextExtra += `### ${t.titulo}\n${t.instrucao}\n\n`;
    }
  }

  // Montar mensagens para IA
  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM_ENGINE + contextExtra },
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
    // DETECTAR AGENDAMENTOS CONFIRMADOS (suporta múltiplos)
    // =============================
    const { agendamentos, textoLimpo: textoSemAg } = extrairAgendamentos(respostaFinal);
    if (agendamentos.length > 0) {
      respostaFinal = textoSemAg;
      const telLimpo = fromNumber.replace(/[^\d+]/g, "");
      console.log(`[voice] 📋 ${agendamentos.length} agendamento(s) detectado(s)`);
      agendamentos.forEach((ag, idx) => {
        console.log(`[voice] Agendamento ${idx + 1}/${agendamentos.length}: ${ag.nome} | ${ag.data} ${ag.horario} | prof=${ag.professionalId}`);
        processarAgendamentoConfirmado(
          ag.nome, telLimpo, ag.data, ag.horario, callSid, supabase
        ).catch(err => console.error(`[voice] Erro agendamento ${idx + 1}:`, err));
      });
    }

  // =============================
  // DETECTAR TRANSFERÊNCIA PARA HUMANO
  // =============================
  if (respostaFinal.includes("##TRANSFERIR_HUMANO##")) {
    respostaFinal = respostaFinal.replace("##TRANSFERIR_HUMANO##", "").trim();
    respostaFinal = limparTexto(respostaFinal);

    if (callSid && fromNumber) {
      supabase.from("voice_memory").insert({
        call_sid: callSid, phone_number: fromNumber,
        role: "assistant", message: respostaFinal + " [TRANSFERIDO PARA HUMANO]",
      }).then(() => {});
    }

    console.log(`[voice] 🔀 Transferindo: ${fromNumber}`);
    const numeroTransferencia = Deno.env.get("TWILIO_PHONE_NUMBER") || "";
    return gerarRespostaComTransferencia(respostaFinal, supabase, numeroTransferencia);
  }

  respostaFinal = limparTexto(respostaFinal);

  if (callSid && fromNumber) {
    supabase.from("voice_memory").insert({
      call_sid: callSid, phone_number: fromNumber,
      role: "assistant", message: respostaFinal,
    }).then(() => {});
  }

  console.log(`[voice] Resposta: "${respostaFinal.slice(0, 100)}..."`);
  return gerarRespostaComAudio(respostaFinal, supabase, webhookUrl);
});

// =============================
// GERAR ÁUDIO ELEVENLABS + RESPOSTA TWIML
// =============================
async function gerarRespostaComAudio(
  texto: string, supabase: ReturnType<typeof createClient>, webhookUrl: string
): Promise<Response> {
  const textoLimpo = limparTexto(texto);
  let audioUrl = "";

  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (!voiceId || !apiKey) {
      console.log("[voice] ElevenLabs não configurado, usando Polly");
    } else {
      const elevenResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textoLimpo,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.50, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
        }),
      });

      if (elevenResp.ok) {
        const audioBuffer = await elevenResp.arrayBuffer();
        const fileName = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const uploadResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/audio/${fileName}`, {
          method: "POST",
          headers: { "apikey": anonKey!, "Authorization": `Bearer ${anonKey}`, "Content-Type": "audio/mpeg", "x-upsert": "true" },
          body: audioBuffer,
        });

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

  if (audioUrl) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="4" speechTimeout="auto" language="pt-BR" action="${webhookUrl}" method="POST">
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
  <Gather input="speech" timeout="4" speechTimeout="auto" language="pt-BR" action="${webhookUrl}" method="POST">
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
  texto: string, supabase: ReturnType<typeof createClient>, numeroTransferencia: string
): Promise<Response> {
  const textoLimpo = limparTexto(texto);
  let audioUrl = "";

  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (voiceId && apiKey) {
      const elevenResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textoLimpo,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.50, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
        }),
      });

      if (elevenResp.ok) {
        const audioBuffer = await elevenResp.arrayBuffer();
        const fileName = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const uploadResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/audio/${fileName}`, {
          method: "POST",
          headers: { "apikey": anonKey!, "Authorization": `Bearer ${anonKey}`, "Content-Type": "audio/mpeg", "x-upsert": "true" },
          body: audioBuffer,
        });

        if (uploadResp.ok) {
          audioUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/audio/${fileName}`;
        }
      }
    }
  } catch (err) {
    console.error("[voice] Erro áudio transferência:", err);
  }

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
