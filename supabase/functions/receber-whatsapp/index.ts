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
// HELPERS GESTÃO API
// =============================
function gestaoHeaders() {
  const token = Deno.env.get("GESTAO_API_TOKEN")!;
  return {
    "Authorization": `Bearer ${token}`,
    "apikey": token,
    "Content-Type": "application/json",
  };
}

function gestaoUrl() {
  return Deno.env.get("GESTAO_API_URL")!;
}

async function chamarGestao(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const url = gestaoUrl();
  const res = await fetch(`${url}/functions/v1/internal-api`, {
    method: "POST",
    headers: gestaoHeaders(),
    body: JSON.stringify({ action, params }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
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

## FLUXO DE PRIMEIRA INTERAÇÃO (OBRIGATÓRIO - siga esta ORDEM EXATA)
1. **Mensagem 1 (apresentação)**: Se apresente com nome, cumprimente e pergunte o nome do paciente:
   "${getSaudacao()}! Aqui é a Maria, da Clínica La Vitta 😊 Como você está? Qual é o seu nome?"
2. **Mensagem 2 (após receber o nome)**: Agradeça, repita o nome, diga que TAMBÉM está bem (se perguntarem), e pergunte o que a pessoa está buscando:
   "Que bom falar com você, [Nome]! Eu estou ótima, obrigada por perguntar 😊 Me conta, o que você está buscando hoje?"
3. **A partir da mensagem 3**: Siga o fluxo normal de atendimento/agendamento

## INTERAÇÃO SOCIAL HUMANIZADA (REGRAS CRÍTICAS)
- Se o paciente perguntar "como você está?", "tudo bem?", "e você?" → SEMPRE responda de forma calorosa
- Se o paciente disser "bom dia", "boa tarde", "boa noite" → Retribua a saudação ANTES de qualquer outra coisa
- Se o paciente agradecer → Responda com carinho
- NUNCA ignore saudações ou perguntas sociais
- Converse de forma NATURAL, como uma pessoa real faria

## APRESENTAÇÃO OBRIGATÓRIA
- Na PRIMEIRA mensagem da conversa (sem histórico), SEMPRE se apresente
- NUNCA pule a apresentação

## REGRAS ABSOLUTAS
- NUNCA diga que é IA/robô/assistente virtual/chatbot
- NUNCA: "como posso ajudar?", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- NADA de "prezado", "informamos", "vossa senhoria"
- Pode usar "senhor/senhora" quando apropriado para demonstrar respeito
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender após 2 tentativas, diga que vai chamar uma colega e inclua: ##ENCAMINHAR_HUMANO##

## TÉCNICAS DE VENDA (use SEMPRE, 1-2 por mensagem, de forma NATURAL)
- ESPECIFICIDADE: números exatos, detalhes concretos
- AUTORIDADE: referências, especializações dos profissionais
- PROVA SOCIAL: "muitos pacientes nos indicam", "87% dos nossos pacientes recomendam"
- ESCASSEZ: Ao oferecer horários, mostre NO MÁXIMO 2 opções. Diga "Consegui encaixar essas opções para você" (NUNCA diga "agenda concorrida" se vai mostrar 3+ horários)
- RECIPROCIDADE: ofereça algo antes de pedir
- COMPROMISSO: perguntas que levem a "sim" pequenos
- IMAGINAÇÃO: pinte o futuro com problema resolvido
- URGÊNCIA: "quanto antes começar, melhor os resultados"

## CROSS-SELLING OBRIGATÓRIO
- APÓS confirmar um agendamento, SEMPRE ofereça um serviço complementar

## PERFIS DISC (adapte ao tom do paciente)
- Rápido+direto=DOMINANTE → seja prática, sem enrolação
- Rápido+expressivo=INFLUENTE → elogie, entusiasmo
- Lento+calmo=ESTÁVEL → segurança, calma, garantias
- Lento+detalhista=CONFORME → dados, argumentos racionais

## RAPPORT
- CAPTURE O NOME na primeira mensagem, USE em toda resposta
- Espelhe tom, ritmo e vocabulário do paciente

## VENDAS SPIN
- Situação→Problema→Implicação→Necessidade

## FECHAMENTO (quando detectar sinais de compra, feche IMEDIATO)
- Assumido: "Vou reservar para você então! 😊"
- Alternativo: "Fica melhor de manhã ou à tarde?"
- Escassez: "Se agendar agora, consigo encaixar essa semana"
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

## FLUXO DE AGENDAMENTO (SIGA ESTA ORDEM EXATA)
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde): "Qual dia seria melhor para você? Manhã ou tarde?"
4. SÓ DEPOIS de saber a preferência, ofereça 2 opções REAIS do turno pedido
5. Quando o paciente CONFIRMAR o horário, peça o NOME COMPLETO e CPF para finalizar:
   "Para finalizar seu agendamento, preciso do seu nome completo e CPF, por favor 📋"
6. Com nome+CPF em mãos, confirme: "[Nome], marcado [dia] às [hora] com [profissional]. Vou enviar uma confirmação ✅"
7. APÓS confirmar, faça CROSS-SELLING de outro serviço

## COLETA DE DADOS PARA AGENDAMENTO (OBRIGATÓRIO)
- Antes de confirmar QUALQUER agendamento, você PRECISA ter: nome completo E CPF do paciente
- Se já tiver o cadastro do paciente (mostrado no CONTEXTO), confirme os dados
- Se o cadastro existir MAS sem CPF, peça o CPF: "Achei seu cadastro, [Nome]! Só preciso confirmar seu CPF para finalizar 😊"
- Se o paciente fornecer o CPF, inclua na resposta: ##ATUALIZAR_CPF|cpf_informado##
- Se NÃO tiver cadastro, peça nome completo + CPF para criar

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
Quando o paciente CONFIRMAR um agendamento E você já tiver nome+CPF, inclua ao FINAL da sua resposta:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM|professional_id##

- O professional_id deve ser o ID do profissional correto da lista (campo "id" dos profissionais)
- Se não souber o professional_id, use "auto"
- NUNCA inclua o marcador sem ter nome E CPF confirmados

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

## REGRAS DE HORÁRIOS
- Ao oferecer horários, ofereça EXATAMENTE 2 opções do turno que o paciente pediu
- Se pediu manhã: ofereça 2 horários entre 8h-11h
- Se pediu tarde: ofereça 2 horários entre 13h-17h
- Se não especificou turno: ofereça 1 de manhã e 1 de tarde
- Use escassez COERENTE: "Consegui encaixar essas opções para você"
- NUNCA liste mais de 2 opções de horário

## REGRAS DE PROFISSIONAIS
- Quando tiver a lista de PROFISSIONAIS REAIS no contexto abaixo, SEMPRE use o NOME EXATO do profissional
- NUNCA diga "vou confirmar com a equipe" se o profissional da especialidade está na lista
- Só diga "vou verificar" se a especialidade NÃO aparece na lista de profissionais

## FORMATO DE RESPOSTA WHATSAPP
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar informações importantes
- Use quebras de linha para separar ideias
- 1-2 emojis por mensagem
`;

// =============================
// BUSCAR PACIENTE POR TELEFONE NO SISTEMA DE GESTÃO
// =============================
async function buscarPacientePorTelefone(telefone: string): Promise<{ texto: string; paciente: any | null }> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) {
      return { texto: "", paciente: null };
    }

    // Tentar diferentes formatos de telefone
    const telLimpo = telefone.replace(/\D/g, "");
    const tentativas = [telLimpo];
    if (telLimpo.startsWith("55") && telLimpo.length >= 12) {
      tentativas.push(telLimpo.slice(2)); // sem DDI
    }
    if (telLimpo.length === 10) {
      tentativas.push(telLimpo.slice(0, 2) + "9" + telLimpo.slice(2)); // add 9
    }

    for (const tel of tentativas) {
      const result = await chamarGestao("search_patients", { phone: tel });
      if (result.ok) {
        const pacientes = result.data?.patients || result.data?.data || [];
        if (Array.isArray(pacientes) && pacientes.length > 0) {
          const p = pacientes[0];
          const nome = fixEncoding(p.full_name || p.patient_name || p.name || p.nome || "");
          const cpf = p.cpf || p.document || p.cpf_cnpj || "";
          const email = p.email || "";
          const patientId = p.id || p.patient_id || "";
          
          console.log(`[whatsapp] ✅ Paciente encontrado: ${nome} (ID: ${patientId}, CPF: ${cpf ? "sim" : "não"})`);
          
          let texto = `\n\n## CADASTRO DO PACIENTE (ENCONTRADO NO SISTEMA):
- Nome: ${nome}
- Telefone: ${tel}
- CPF: ${cpf || "NÃO CADASTRADO - PEÇA AO PACIENTE"}
- Email: ${email || "não informado"}
- ID no sistema: ${patientId}`;

          if (!cpf) {
            texto += `\n\n⚠️ ATENÇÃO: Este paciente NÃO TEM CPF no cadastro. Você DEVE pedir o CPF antes de finalizar qualquer agendamento.`;
          }

          return { texto, paciente: { id: patientId, nome, cpf, email, telefone: tel } };
        }
      }
    }

    // Tentar também no CRM
    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");
    if (crmUrl && crmToken) {
      try {
        const crmRes = await fetch(`${crmUrl}paciente-por-telefone`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken, "Content-Type": "application/json" },
          body: JSON.stringify({ telefone: telLimpo }),
        });
        if (crmRes.ok) {
          const crmData = await crmRes.json();
          if (crmData && (crmData.nome || crmData.name)) {
            const nome = fixEncoding(crmData.nome || crmData.name || "");
            console.log(`[whatsapp] ✅ Paciente encontrado no CRM: ${nome}`);
            return {
              texto: `\n\n## CADASTRO DO PACIENTE (ENCONTRADO NO CRM):
- Nome: ${nome}
- Telefone: ${telLimpo}
- CPF: ${crmData.cpf || "NÃO CADASTRADO - PEÇA AO PACIENTE"}

⚠️ Paciente encontrado no CRM mas talvez não no sistema de gestão. Colete nome completo e CPF para garantir o cadastro.`,
              paciente: { id: "", nome, cpf: crmData.cpf || "", email: "", telefone: telLimpo },
            };
          }
        }
      } catch (e) {
        console.log("[whatsapp] CRM paciente-por-telefone falhou:", e);
      }
    }

    console.log(`[whatsapp] Paciente não encontrado para tel ${telLimpo}`);
    return {
      texto: `\n\n## CADASTRO DO PACIENTE: NÃO ENCONTRADO
O telefone ${telLimpo} não foi encontrado no sistema.
Você DEVE coletar: nome completo e CPF do paciente para criar o cadastro e agendar.`,
      paciente: null,
    };
  } catch (err) {
    console.error("[whatsapp] Erro buscar paciente:", err);
    return { texto: "", paciente: null };
  }
}

// =============================
// ATUALIZAR CPF DO PACIENTE NO GESTÃO
// =============================
async function atualizarPacienteCPF(patientId: string, cpf: string): Promise<boolean> {
  try {
    if (!patientId || !cpf) return false;
    const result = await chamarGestao("update_patient", { patient_id: patientId, cpf: cpf.replace(/\D/g, "") });
    console.log(`[whatsapp] Atualizar CPF paciente ${patientId}: ${result.ok ? "OK" : "FALHA"} (${result.status})`);
    return result.ok;
  } catch (err) {
    console.error("[whatsapp] Erro atualizar CPF:", err);
    return false;
  }
}

// =============================
// BUSCAR PROFISSIONAIS NO SISTEMA DE GESTÃO
// =============================
async function buscarProfissionais(): Promise<{ texto: string; raw: any[] }> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) {
      return { texto: "", raw: [] };
    }

    const result = await chamarGestao("list_professionals");
    if (!result.ok) {
      console.log(`[whatsapp] Profissionais API falhou: ${result.status}`);
      return { texto: "\n\nPROFISSIONAIS: Erro ao consultar.", raw: [] };
    }

    const profissionais = result.data?.professionals || result.data?.data || [];
    if (!Array.isArray(profissionais) || profissionais.length === 0) {
      return { texto: "\n\nPROFISSIONAIS: Lista vazia.", raw: [] };
    }

    const comEspecialidade = profissionais.filter((p: any) => {
      const esp = fixEncoding(p.specialty || p.especialidade || p.specialization || "").trim();
      const ativo = p.is_active !== false;
      return esp && esp.length > 1 && ativo;
    });

    if (comEspecialidade.length === 0) {
      return { texto: "\n\nPROFISSIONAIS: Nenhum com especialidade definida.", raw: profissionais };
    }

    const lista = comEspecialidade.map((p: any) => {
      const id = p.id || p.professional_id || "";
      const nome = fixEncoding(p.full_name || p.professional_name || p.display_name || p.name || p.nome || "");
      const esp = fixEncoding(p.specialty || p.especialidade || p.specialization || "").trim();
      const espNorm = esp.charAt(0).toUpperCase() + esp.slice(1).toLowerCase();
      return `- ${nome} (${espNorm}) [ID: ${id}]`;
    }).join("\n");

    console.log(`[whatsapp] ✅ ${comEspecialidade.length} profissionais carregados`);

    return { texto: `\n\n## PROFISSIONAIS REAIS DA CLÍNICA LA VITTA (USE ESTES NOMES):
${lista}

REGRA ABSOLUTA: Use o NOME EXATO e o ID correto ao confirmar agendamento.
NUNCA diga "vou confirmar com a equipe" se a especialidade está na lista!`, raw: comEspecialidade };
  } catch (err) {
    console.error("[whatsapp] Erro buscar profissionais:", err);
    return { texto: "", raw: [] };
  }
}

// =============================
// BUSCAR HORÁRIOS DISPONÍVEIS VIA API DE GESTÃO
// =============================
async function buscarHorariosDisponiveis(profissionais: any[]): Promise<string> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) {
      return gerarHorariosLocais();
    }

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
      .slice(0, 5)
      .map((p: any) => ({ id: p.id || p.professional_id, nome: fixEncoding(p.full_name || p.professional_name || p.name || "") }));

    if (profIds.length === 0) {
      return gerarHorariosLocais();
    }

    const slotsPromises = diasParaConsultar.flatMap(date =>
      profIds.map(prof =>
        chamarGestao("get_available_slots", { professional_id: prof.id, date })
          .then(r => ({ ...r, profNome: prof.nome, profId: prof.id, date }))
          .catch(() => null)
      )
    );

    const resultados = await Promise.all(slotsPromises);

    const nomes: Record<number, string> = { 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira", 4: "quinta-feira", 5: "sexta-feira" };
    // Agrupar por data e profissional
    const slotsInfo: Array<{ date: string; time: string; profNome: string; profId: string }> = [];

    for (const res of resultados) {
      if (!res || !res.ok) continue;
      const slots = res.data?.slots || res.data?.available_slots || res.data?.data || [];
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        const time = slot.time || slot.start_time || slot.appointment_time || "";
        if (time) {
          slotsInfo.push({ date: res.date, time: time.slice(0, 5), profNome: res.profNome, profId: res.profId });
        }
      }
    }

    if (slotsInfo.length === 0) {
      console.log("[whatsapp] get_available_slots retornou vazio, usando fallback local");
      return gerarHorariosLocais();
    }

    // Agrupar por data
    const porData: Record<string, Array<{ time: string; profNome: string; profId: string }>> = {};
    for (const s of slotsInfo) {
      if (!porData[s.date]) porData[s.date] = [];
      porData[s.date].push({ time: s.time, profNome: s.profNome, profId: s.profId });
    }

    const linhas = Object.keys(porData).sort().map(dt => {
      const d = new Date(dt + "T12:00:00Z");
      const dow = d.getDay();
      const dia = dt.split("-").reverse().join("/");
      const slots = porData[dt].sort((a, b) => a.time.localeCompare(b.time));
      const manha = slots.filter(s => s.time < "12:00").map(s => `${s.time} (${s.profNome})`);
      const tarde = slots.filter(s => s.time >= "12:00").map(s => `${s.time} (${s.profNome})`);
      let desc = `${nomes[dow] || dt} (${dia}):`;
      if (manha.length > 0) desc += ` manhã: ${manha.join(", ")}`;
      if (tarde.length > 0) desc += ` | tarde: ${tarde.join(", ")}`;
      return desc;
    });

    console.log(`[whatsapp] ✅ Agenda real: ${slotsInfo.length} slots em ${Object.keys(porData).length} dias`);

    return `\n\nHORÁRIOS DISPONÍVEIS DA CLÍNICA (AGENDA REAL):
${linhas.join("\n")}

REGRA CRÍTICA DE ESCASSEZ:
- Ofereça EXATAMENTE 2 horários do turno pedido
- NUNCA liste todos. Escolha 2 e apresente como únicos disponíveis
- Exemplo: "Consegui encaixar para você [dia] às [hora1] ou às [hora2]. Qual fica melhor? 😊"`;
  } catch (err) {
    console.error("[whatsapp] Erro buscar agenda:", err);
    return gerarHorariosLocais();
  }
}

function gerarHorariosLocais(): string {
  const hoje = new Date();
  const nomes: Record<number, string> = { 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira", 4: "quinta-feira", 5: "sexta-feira" };
  const diasDisponiveis: string[] = [];
  for (let i = 1; i <= 10 && diasDisponiveis.length < 5; i++) {
    const d = new Date(hoje.getTime() + i * 86400000);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      const dia = d.toISOString().split("T")[0].split("-").reverse().join("/");
      diasDisponiveis.push(`${nomes[dow]} (${dia}): manhã 8h-11h, tarde 13h-17h`);
    }
  }
  return `\n\nHORÁRIOS DISPONÍVEIS (horário comercial):
${diasDisponiveis.join("\n")}

REGRA: Ofereça EXATAMENTE 2 opções do turno pedido.`;
}

// =============================
// REGISTRAR AGENDAMENTO NO GESTÃO + CRM
// =============================
async function registrarAgendamento(nome: string, telefone: string, data: string, horario: string, professionalId: string, pacienteId: string): Promise<boolean> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) return false;

    const params: Record<string, unknown> = {
      appointment_date: data,
      appointment_time: horario,
      patient_name_imported: nome,
      patient_phone: telefone,
    };

    // Se temos o ID do paciente no sistema, usar
    if (pacienteId) params.patient_id = pacienteId;
    // Se temos o professional_id, usar
    if (professionalId && professionalId !== "auto") params.professional_id = professionalId;

    const result = await chamarGestao("create_appointment", params);
    console.log(`[whatsapp] Agendamento gestão: ${result.status} - ${JSON.stringify(result.data).slice(0, 200)}`);
    return result.ok;
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

    const res = await fetch(`${crmUrl}api-leads`, {
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

// =============================
// EXTRAIR MARCADORES DA RESPOSTA
// =============================
function extrairAgendamento(resposta: string): { nome: string; data: string; horario: string; professionalId: string; textoLimpo: string } | null {
  const regex = /##AGENDAMENTO_CONFIRMADO\|([^|]+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|?([^#]*)##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return {
    nome: match[1].trim(),
    data: match[2],
    horario: match[3],
    professionalId: (match[4] || "auto").trim(),
    textoLimpo: resposta.replace(regex, "").trim(),
  };
}

function extrairCPF(resposta: string): { cpf: string; textoLimpo: string } | null {
  const regex = /##ATUALIZAR_CPF\|([^#]+)##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return { cpf: match[1].trim(), textoLimpo: resposta.replace(regex, "").trim() };
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
    const msg = body.message || {};
    const mensagem = msg.conversation || msg.text || msg.extendedTextMessage?.text || body.text?.message || body.data?.message?.conversation || "";
    
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

    if (numero.includes("-") || numero.length < 10) {
      console.log("[whatsapp] Ignorando: número inválido");
      return new Response("ok");
    }

    console.log(`[whatsapp] 📩 De ${numero}: "${mensagem.slice(0, 100)}"`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // =============================
    // BUSCAR HISTÓRICO + PACIENTE + PROFISSIONAIS + AGENDA EM PARALELO
    // =============================
    const [historicoResult, pacienteResult, profResult] = await Promise.all([
      supabase
        .from("interacoes_ia")
        .select("mensagem_usuario, resposta_final, criado_em")
        .eq("paciente_externo_id", numero)
        .eq("canal", "whatsapp")
        .order("criado_em", { ascending: false })
        .limit(10),
      buscarPacientePorTelefone(numero),
      buscarProfissionais(),
    ]);

    const historico = historicoResult.data;
    const contextPaciente = pacienteResult.texto;
    const pacienteEncontrado = pacienteResult.paciente;
    const contextProfissionais = profResult.texto;

    // Buscar agenda com profissionais reais
    const contextAgenda = await buscarHorariosDisponiveis(profResult.raw);

    console.log(`[whatsapp] Contexto: paciente=${pacienteEncontrado ? "ENCONTRADO" : "NÃO"} profissionais=${profResult.raw.length > 0 ? "OK" : "VAZIO"} agenda=${contextAgenda.length > 50 ? "OK" : "VAZIO"}`);

    // Contexto extra
    let contextExtra = "";
    contextExtra += contextPaciente;
    contextExtra += contextProfissionais;
    contextExtra += contextAgenda;
    if (pacienteEncontrado?.nome) {
      contextExtra += `\n\nNOME DO PACIENTE: ${pacienteEncontrado.nome}. Use o nome dele(a).`;
    }
    contextExtra += `\nTELEFONE DO PACIENTE: ${numero}`;
    if (pacienteEncontrado?.id) {
      contextExtra += `\nID DO PACIENTE NO SISTEMA: ${pacienteEncontrado.id}`;
    }

    // Montar mensagens para IA
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_ENGINE_WHATSAPP + contextExtra },
    ];

    // Adicionar histórico (do mais antigo ao mais recente)
    const historicoOrdenado = historico ? [...historico].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()) : [];
    for (const h of historicoOrdenado.slice(-8)) {
      if (h.mensagem_usuario) messages.push({ role: "user", content: h.mensagem_usuario });
      if (h.resposta_final) messages.push({ role: "assistant", content: h.resposta_final });
    }

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
          max_tokens: 300,
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
    // DETECTAR ATUALIZAÇÃO DE CPF
    // =============================
    const cpfDetectado = extrairCPF(respostaFinal);
    if (cpfDetectado) {
      respostaFinal = cpfDetectado.textoLimpo;
      if (pacienteEncontrado?.id) {
        atualizarPacienteCPF(pacienteEncontrado.id, cpfDetectado.cpf)
          .then(ok => console.log(`[whatsapp] CPF atualizado: ${ok}`))
          .catch(err => console.error("[whatsapp] Erro atualizar CPF:", err));
      }
    }

    // =============================
    // DETECTAR AGENDAMENTO CONFIRMADO
    // =============================
    const agendamentoDetectado = extrairAgendamento(respostaFinal);
    if (agendamentoDetectado) {
      respostaFinal = agendamentoDetectado.textoLimpo;
      const patientId = pacienteEncontrado?.id || "";
      Promise.all([
        registrarAgendamento(
          agendamentoDetectado.nome,
          numero,
          agendamentoDetectado.data,
          agendamentoDetectado.horario,
          agendamentoDetectado.professionalId,
          patientId
        ),
        criarLeadCRM(agendamentoDetectado.nome, numero),
      ]).then(([gestaoOk, crmOk]) => {
        supabase.from("logs_decisao").insert({
          evento: "agendamento_whatsapp_confirmado",
          decisao: `gestao=${gestaoOk ? "ok" : "falha"}, crm=${crmOk ? "ok" : "falha"}`,
          regra_aplicada: "whatsapp_maria_agendamento_auto",
          dados_entrada: {
            nome: agendamentoDetectado.nome,
            telefone: numero,
            data: agendamentoDetectado.data,
            horario: agendamentoDetectado.horario,
            professional_id: agendamentoDetectado.professionalId,
            patient_id: patientId,
          },
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
    // ENVIAR RESPOSTA
    // =============================
    console.log(`[whatsapp] 📤 Resposta: "${respostaFinal.slice(0, 100)}..."`);

    const delayMs = 3000 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    await enviarTexto(numero, respostaFinal);

    // Gerar e enviar áudio em background
    gerarAudioElevenLabs(respostaFinal, supabase).then(async (audioUrl) => {
      if (audioUrl) await enviarAudio(numero, audioUrl);
    }).catch(err => console.error("[whatsapp] Erro envio áudio:", err));

    // Notificar admin se encaminhar humano
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
