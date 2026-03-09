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

## FLUXO DE PRIMEIRA INTERAÇÃO (OBRIGATÓRIO - siga esta ORDEM EXATA)
1. **Mensagem 1 (apresentação)**: Se apresente com nome, cumprimente e pergunte o nome do paciente:
   "${getSaudacao()}! Aqui é a Maria, da Clínica La Vitta 😊 Como você está? Qual é o seu nome?"
2. **Mensagem 2 (após receber o nome)**: Agradeça, repita o nome, diga que TAMBÉM está bem (se perguntarem), e pergunte o que a pessoa está buscando
3. **A partir da mensagem 3**: Siga o fluxo normal de atendimento/agendamento

## INTERAÇÃO SOCIAL HUMANIZADA (REGRAS CRÍTICAS)
- Se o paciente perguntar "como você está?", "tudo bem?", "e você?" → SEMPRE responda de forma calorosa
- Se o paciente disser "bom dia", "boa tarde", "boa noite" → Retribua a saudação ANTES de qualquer outra coisa
- NUNCA ignore saudações ou perguntas sociais

## APRESENTAÇÃO OBRIGATÓRIA
- Na PRIMEIRA mensagem da conversa (sem histórico), SEMPRE se apresente
- NUNCA pule a apresentação

## REGRAS ABSOLUTAS
- NUNCA diga que é IA/robô/assistente virtual/chatbot
- NUNCA: "como posso ajudar?", "em que posso ser útil?"
- NUNCA invente preços, horários ou informações
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- Pode usar "senhor/senhora" quando apropriado para demonstrar respeito
- NUNCA proponha horários sem ANTES perguntar a preferência do paciente (dia, turno)
- Se não conseguir entender após 2 tentativas, diga que vai chamar uma colega e inclua: ##ENCAMINHAR_HUMANO##

## TÉCNICAS DE VENDA (use SEMPRE, 1-2 por mensagem, de forma NATURAL)
- ESPECIFICIDADE: números exatos, detalhes concretos
- AUTORIDADE: referências, especializações dos profissionais
- PROVA SOCIAL: "muitos pacientes nos indicam", "87% dos nossos pacientes recomendam"
- ESCASSEZ: Ao oferecer horários, mostre NO MÁXIMO 2 opções
- RECIPROCIDADE: ofereça algo antes de pedir
- COMPROMISSO: perguntas que levem a "sim" pequenos
- URGÊNCIA: "quanto antes começar, melhor os resultados"

## CROSS-SELLING OBRIGATÓRIO
- APÓS confirmar um agendamento, SEMPRE ofereça um serviço complementar

## PERFIS DISC (adapte ao ton do paciente)
- Rápido+direto=DOMINANTE → seja prática
- Rápido+expressivo=INFLUENTE → elogie
- Lento+calmo=ESTÁVEL → segurança, garantias
- Lento+detalhista=CONFORME → dados, argumentos racionais

## RAPPORT
- CAPTURE O NOME na primeira mensagem, USE em toda resposta

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

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto

## REGRA CRÍTICA: FILTRO DE ESPECIALIDADE (MUITO IMPORTANTE!)
Quando o paciente pedir um serviço ou especialidade, você DEVE:
1. Identificar a ÁREA que o paciente está pedindo
2. Filtrar a lista de profissionais e indicar SOMENTE os da área correta
3. NUNCA misture áreas diferentes

### MAPEAMENTO DE TERMOS → ESPECIALIDADES:
- "dentista", "dente", "dor de dente", "cárie", "canal", "extração", "limpeza", "clareamento" → buscar profissionais de ODONTOLOGIA (Cirurgião dentista, Clínico geral odontológico, Ortodontista, Endodontista, Periodontista, Implantodontista, Odontopediatra)
- "aparelho", "ortodontia", "alinhador" → ORTODONTISTA
- "implante", "implante dentário" → IMPLANTODONTISTA
- "psiquiatra", "psiquiatria", "remédio controlado" → PSIQUIATRA (Dra. Mylena Moraes Carneiro - atende às QUINTAS)
- "psicólogo", "psicóloga", "terapia", "ansiedade", "depressão" → PSICÓLOGO/PSICÓLOGA
- "nutricionista", "dieta", "emagrecer", "alimentação" → NUTRICIONISTA
- "fono", "fonoaudiólogo", "fala", "linguagem" → FONOAUDIÓLOGO
- "médico", "clínico", "exame" → MÉDICO CLÍNICO
- "dermatologista", "pele", "acne" → DERMATOLOGISTA
- "cardiologista", "coração" → CARDIOLOGISTA
- "botox", "harmonização" → ESTÉTICA

### REGRA DE OURO:
- Se o paciente diz "dentista" → NUNCA sugira psicólogos, nutricionistas ou outros
- Se o paciente diz "psicólogo" → NUNCA sugira dentistas
- Se o paciente pede "psiquiatra" ou "Mylena" → ofereça a Dra. Mylena Moraes Carneiro (SÓ quintas-feiras)
- Se a especialidade pedida NÃO existe na lista de profissionais da API MAS está nas INSTRUÇÕES DO ADMINISTRADOR → use as informações das instruções
- Em caso de DÚVIDA sobre qual área → PERGUNTE ao paciente

## FLUXO DE AGENDAMENTO (SIGA ESTA ORDEM EXATA)
1. Se não sabe o nome: pergunte de forma natural
2. Pergunte qual serviço/especialidade o paciente precisa
3. FILTRE os profissionais pela especialidade correta (veja regras acima)
4. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde): "Qual dia seria melhor para você? Manhã ou tarde?"
5. SÓ DEPOIS de saber a preferência, ofereça 2 opções REAIS do turno pedido (se disponíveis na agenda)
6. Quando o paciente CONFIRMAR o horário:
   a) Se já tem nome completo do paciente → peça apenas o CPF se ainda não tiver
   b) Se não tem nome → peça nome completo + CPF
   c) Se o paciente já informou nome E CPF (ou está no cadastro) → CONFIRME IMEDIATAMENTE
7. Com os dados, confirme: "[Nome], marcado [dia] às [hora] com [profissional]. Vou enviar uma confirmação ✅"
8. APÓS confirmar, faça CROSS-SELLING de outro serviço

## AGENDAMENTO DIRETO (QUANDO O PACIENTE JÁ DEU TODOS OS DADOS)
- Se o paciente já disse o PROFISSIONAL + DATA + HORÁRIO na mesma mensagem → NÃO pergunte tudo de novo
- Confirme os dados e peça apenas o que falta (nome/CPF)
- Se já tem o cadastro no sistema → AGENDE DIRETAMENTE sem ficar "verificando"

## COLETA DE DADOS PARA AGENDAMENTO (REGRAS DE PRIORIDADE)
- O CPF é OPCIONAL. NUNCA bloqueie um agendamento por falta de CPF.
- Se o paciente já disse o nome → isso é SUFICIENTE para agendar.
- Se o paciente tem cadastro no sistema (mostrado no CONTEXTO) → USE os dados do cadastro, NÃO peça novamente.
- Se o cadastro existe mas sem CPF → agende normalmente e peça o CPF DEPOIS, de forma casual.
- Se o paciente fornecer o CPF voluntariamente, inclua: ##ATUALIZAR_CPF|cpf_informado##
- NUNCA diga "preciso do seu CPF para prosseguir" ou "para proceder, preciso do CPF". O CPF NÃO É obrigatório.

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO
Quando o paciente CONFIRMAR um agendamento E você já tiver pelo menos o NOME (CPF é opcional), inclua ao FINAL da sua resposta:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM|professional_id##

- O professional_id deve ser o ID do profissional correto da lista (campo "id" dos profissionais)
- Se o profissional é externo (ex: Dra. Mylena) ou não tem ID na lista, use "auto"
- NUNCA fique em loop dizendo "vou verificar" ou "aguardando confirmação da equipe"
- Se o paciente pediu data+horário+profissional específicos → CONFIRME E AGENDE imediatamente
- O sistema registrará no gestão automaticamente. Se houver conflito, a equipe resolverá.
- PRIORIDADE MÁXIMA: se já tem nome + profissional + data + horário → INCLUA O MARCADOR E CONFIRME. NÃO peça mais dados.

## REGRA ANTI-LOOP (MUITO IMPORTANTE!)
- NUNCA repita a mesma resposta de "verificar disponibilidade" mais de 1 vez
- Se já disse que vai verificar e o paciente insistiu → CONFIRME o agendamento diretamente
- Prefira AGENDAR e ajustar depois do que ficar "verificando" infinitamente

## MÚLTIPLOS AGENDAMENTOS NA MESMA CONVERSA (MUITO IMPORTANTE!)
- Se o paciente pedir 2 ou mais agendamentos na mesma mensagem, você DEVE incluir UM marcador ##AGENDAMENTO_CONFIRMADO## para CADA agendamento
- Cada profissional = 1 marcador separado
- Se esquecer algum, o agendamento NÃO será registrado

## CONTEXTO DA CLÍNICA LA VITTA
- Endereço: Rua Capitão José Justino, 68 - Muriaé, MG
- Horário: segunda a sexta, 8h às 18h
- Avaliação inicial sem compromisso e sem custo
- Foco: atendimento humanizado e personalizado
- A La Vitta é MULTIDISCIPLINAR, NÃO apenas odontológica
- Quando o paciente perguntar endereço, localização, onde fica, como chegar → forneça o endereço REAL acima
- NUNCA invente endereços fictícios como "Rua Exemplo"

## REGRAS DE HORÁRIOS (MUITO IMPORTANTE - NUNCA VIOLE)
- SOMENTE ofereça horários que aparecem na lista "HORÁRIOS DISPONÍVEIS DA CLÍNICA" abaixo
- Se não há lista de horários, diga que vai verificar a agenda e retorna em breve
- NUNCA invente horários como 8h, 9h, 14h se NÃO estão na lista
- Ofereça EXATAMENTE 2 opções do turno pedido, DA LISTA REAL
- Se pediu manhã: 2 horários de manhã DA LISTA
- Se pediu tarde: 2 horários de tarde DA LISTA
- Se não especificou: 1 de manhã e 1 de tarde DA LISTA
- Se o turno pedido não tem opções na lista, avise e ofereça do outro turno

## REGRAS DE PROFISSIONAIS
- Use o NOME EXATO do profissional da lista
- NUNCA diga "vou confirmar com a equipe" se o profissional da especialidade está na lista
- Só diga "vou verificar" se a especialidade NÃO aparece na lista

## FORMATO DE RESPOSTA WHATSAPP
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar
- 1-2 emojis por mensagem

## MÍDIAS RECEBIDAS
- Quando o paciente enviar IMAGEM: analise o conteúdo visual e responda adequadamente. Se for exame, receita ou documento, extraia informações e oriente.
- Quando o paciente enviar ÁUDIO: a transcrição será fornecida no texto. Responda normalmente ao conteúdo falado.
- Quando o paciente enviar DOCUMENTO/PDF: analise o conteúdo e responda. Se for exame ou receita, oriente sobre próximos passos.
- NUNCA diga que não consegue ver imagens ou ouvir áudios. Você CONSEGUE.
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
// DETECTAR ESPECIALIDADE E FILTRAR PROFISSIONAIS
// =============================
// Érika Coimbra Almeida (cadastrada como "ORTODONTISTA") atua em: dentista clínico geral, ortodontia, botox e harmonização
// Por isso "ortodontista" aparece em múltiplas categorias
const MAPA_ESPECIALIDADE: Array<{ termos: string[]; especialidades: string[] }> = [
  { termos: ["dentista", "dente", "dor de dente", "cárie", "canal", "extração", "limpeza dental", "clareamento", "odontologia", "odontológica", "odontológico", "avaliação odontológica"], especialidades: ["odontologia", "cirurgião dentista", "cirurgia dentista", "clinico geral odontologico", "clínico geral odontológico", "dentista clinico geral", "dentista", "odontopediatra", "periodontista", "endodontista", "protesista", "ortodontista", "ortodontia", "implantodontista", "implantodontia"] },
  { termos: ["dentística", "restauração", "restauração dentária"], especialidades: ["dentística", "dentistica", "cirurgiao dentista especialista em dentistica"] },
  { termos: ["aparelho", "ortodontia", "alinhador", "ortodontista"], especialidades: ["ortodontia", "ortodontista"] },
  { termos: ["implante", "implante dentário", "implantodontista"], especialidades: ["implantodontia", "implantodontista"] },
  { termos: ["psiquiatra", "psiquiatria", "medicamento psiquiátrico", "remédio controlado"], especialidades: ["psiquiatria", "psiquiatra"] },
  { termos: ["psicólogo", "psicóloga", "psicologia", "terapia", "ansiedade", "depressão"], especialidades: ["psicologia", "psicólogo", "psicóloga", "psicologa clinica", "psicologo clinico", "psicologa infantil"] },
  { termos: ["nutricionista", "nutrição", "dieta", "emagrecer", "alimentação"], especialidades: ["nutrição", "nutricionista"] },
  { termos: ["fono", "fonoaudiólogo", "fonoaudióloga", "fonoaudiologia", "fala", "linguagem"], especialidades: ["fonoaudiologia", "fonoaudiólogo", "fonoaudióloga", "fonoaudiologa"] },
  { termos: ["dermatologista", "dermatologia", "pele", "acne"], especialidades: ["dermatologia", "dermatologista"] },
  { termos: ["cardiologista", "cardiologia", "coração"], especialidades: ["cardiologia", "cardiologista"] },
  { termos: ["botox", "harmonização", "estética", "harmonização facial"], especialidades: ["estética", "estetica", "harmonização", "ortodontista"] },
  { termos: ["médico", "clínico", "clínico geral"], especialidades: ["clínico geral", "clinico geral", "médico", "medicina"] },
];

function detectarEspecialidade(mensagemAtual: string, historico: Array<{ mensagem_usuario?: string | null; resposta_final?: string | null }> | null): string[] | null {
  // Junta mensagem atual + últimas 4 mensagens do histórico para contexto
  const textos = [mensagemAtual];
  if (historico) {
    for (const h of historico.slice(0, 4)) {
      if (h.mensagem_usuario) textos.push(h.mensagem_usuario);
      if (h.resposta_final) textos.push(h.resposta_final);
    }
  }
  const textoCompleto = textos.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const mapa of MAPA_ESPECIALIDADE) {
    for (const termo of mapa.termos) {
      const termoNorm = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (textoCompleto.includes(termoNorm)) {
        console.log(`[whatsapp] 🔍 Especialidade detectada: "${termo}" → filtrar por: ${mapa.especialidades.join(", ")}`);
        return mapa.especialidades;
      }
    }
  }
  return null; // Sem especialidade detectada, mostrar todos
}

function filtrarProfissionaisPorEspecialidade(profissionais: any[], especialidadesPermitidas: string[]): any[] {
  const normsPermitidas = especialidadesPermitidas.map(e => e.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

  const filtrados = profissionais.filter((p: any) => {
    const espRaw = fixEncoding(p.specialty || p.especialidade || p.specialization || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // Correspondência mais precisa: verificar se a especialidade do profissional 
    // corresponde exatamente a alguma especialidade permitida (palavra completa)
    return normsPermitidas.some(perm => {
      // Correspondência exata
      if (espRaw === perm) return true;
      // A especialidade do profissional contém a permitida como palavra completa
      const regex = new RegExp(`\\b${perm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (regex.test(espRaw)) return true;
      // A permitida contém a especialidade do profissional como palavra completa
      const regex2 = new RegExp(`\\b${espRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (regex2.test(perm)) return true;
      return false;
    });
  });

  console.log(`[whatsapp] 🔍 Filtro: ${profissionais.length} profissionais → ${filtrados.length} da especialidade`);
  
  // Log dos profissionais filtrados para debug
  filtrados.forEach((p: any) => {
    const nome = fixEncoding(p.full_name || p.name || "");
    const esp = fixEncoding(p.specialty || p.especialidade || "");
    console.log(`[whatsapp]   → ${nome} (${esp})`);
  });
  
  return filtrados;
}

// =============================
// DETECTAR PROFISSIONAL MENCIONADO PELO NOME
// =============================
function detectarProfissionalPorNome(mensagem: string, profissionais: any[]): any | null {
  const msgNorm = mensagem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const p of profissionais) {
    const nomeCompleto = fixEncoding(p.full_name || p.professional_name || p.display_name || p.name || p.nome || "");
    if (!nomeCompleto) continue;
    
    // Extrair primeiro nome e sobrenome
    const partes = nomeCompleto.split(/\s+/).filter((s: string) => s.length > 2);
    for (const parte of partes) {
      const parteNorm = parte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Ignorar títulos comuns
      if (["dra", "dr", "dra.", "dr."].includes(parteNorm)) continue;
      if (parteNorm.length < 4) continue;
      
      if (msgNorm.includes(parteNorm)) {
        console.log(`[whatsapp] 👤 Profissional detectado pelo nome: "${parte}" → ${nomeCompleto}`);
        return p;
      }
    }
  }
  return null;
}

// =============================
// BUSCAR HORÁRIOS DISPONÍVEIS VIA API DE GESTÃO
// =============================
async function buscarHorariosDisponiveis(profissionais: any[]): Promise<string> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) {
      return `\n\nHORÁRIOS: Sistema de gestão não configurado.
INSTRUÇÃO: Mesmo assim, se o paciente informou data, horário e profissional, CONFIRME o agendamento usando o marcador ##AGENDAMENTO_CONFIRMADO##. O sistema tentará registrar.`;
    }

    const hoje = new Date();
    const diasParaConsultar: string[] = [];
    for (let i = 0; i <= 10 && diasParaConsultar.length < 7; i++) {
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
      return `\n\nHORÁRIOS: Nenhum profissional com ID encontrado.
INSTRUÇÃO: Se o paciente já informou data+horário+profissional, CONFIRME o agendamento usando ##AGENDAMENTO_CONFIRMADO##.`;
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
      console.log("[whatsapp] get_available_slots retornou vazio");
      // Gerar lista dos profissionais disponíveis para que a IA possa agendar diretamente
      const profListaIds = profIds.map(p => `${p.nome} [ID: ${p.id}]`).join(", ");
      return `\n\nHORÁRIOS DISPONÍVEIS: A API de agenda não retornou horários específicos no momento.

INSTRUÇÃO CRÍTICA - SIGA ESTA REGRA:
- Se o paciente JÁ INFORMOU uma data, horário E profissional específicos → NÃO diga "vou verificar". Em vez disso, CONFIRME o agendamento diretamente e inclua o marcador ##AGENDAMENTO_CONFIRMADO|nome|data_YYYY-MM-DD|horario_HH:MM|professional_id##
- O sistema tentará registrar automaticamente e, se houver indisponibilidade, a equipe entrará em contato.
- Se o paciente ainda NÃO informou data/horário, pergunte a preferência de dia e turno e depois confirme.
- Profissionais disponíveis: ${profListaIds}
- Horário de funcionamento: segunda a sexta, 8h às 18h
- NUNCA fique em loop dizendo "vou verificar" repetidamente`;
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

    return `\n\nHORÁRIOS DISPONÍVEIS DA CLÍNICA (AGENDA REAL - USE SOMENTE ESTES):
${linhas.join("\n")}

REGRAS ABSOLUTAS DE AGENDA:
- Ofereça EXATAMENTE 2 horários do turno pedido, escolhidos da lista ACIMA
- NUNCA invente horários que NÃO estão nesta lista
- NUNCA ofereça horários fora do expediente do profissional
- Se o turno pedido não tem horários na lista, informe e sugira o outro turno
- Use o formato: dia (data) às hora com Profissional
- Exemplo: "Consegui encaixar para você [dia] às [hora1] ou às [hora2]. Qual fica melhor? 😊"`;
  } catch (err) {
    console.error("[whatsapp] Erro buscar agenda:", err);
    return `\n\nHORÁRIOS: Não foi possível consultar a agenda no momento.
INSTRUÇÃO: Informe ao paciente que vai verificar a disponibilidade e retornará em breve. NUNCA invente horários.`;
  }
}

// gerarHorariosLocais removida - NUNCA inventar horários fictícios

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
// PROCESSAR MÍDIAS (IMAGEM, ÁUDIO, PDF)
// =============================
interface MediaInfo {
  type: "image" | "audio" | "document";
  mimetype: string;
  base64?: string;
  url?: string;
  fileName?: string;
  caption?: string;
}

function detectarMidia(body: any): MediaInfo | null {
  const msg = body.message || {};
  const messageType = body.messageType || "";

  // Imagem
  if (msg.imageMessage || messageType === "imageMessage") {
    const img = msg.imageMessage || {};
    console.log(`[whatsapp] 🔍 imageMessage keys: ${Object.keys(img).join(", ")}`);
    console.log(`[whatsapp] 🔍 body.base64 present: ${!!body.base64}, img.base64 present: ${!!img.base64}`);
    return {
      type: "image",
      mimetype: img.mimetype || "image/jpeg",
      base64: body.base64 || img.base64 || undefined,
      url: img.url || img.directPath || undefined,
      caption: img.caption || "",
    };
  }

  // Áudio (inclui PTT - push to talk / áudio gravado)
  if (msg.audioMessage || messageType === "audioMessage" || messageType === "pttMessage") {
    const aud = msg.audioMessage || {};
    console.log(`[whatsapp] 🔍 audioMessage keys: ${Object.keys(aud).join(", ")}`);
    return {
      type: "audio",
      mimetype: aud.mimetype || "audio/ogg; codecs=opus",
      base64: body.base64 || aud.base64 || undefined,
      url: aud.url || aud.directPath || undefined,
    };
  }

  // Documento (PDF, etc)
  if (msg.documentMessage || messageType === "documentMessage") {
    const doc = msg.documentMessage || {};
    console.log(`[whatsapp] 🔍 documentMessage keys: ${Object.keys(doc).join(", ")}`);
    return {
      type: "document",
      mimetype: doc.mimetype || "application/pdf",
      base64: body.base64 || doc.base64 || undefined,
      url: doc.url || doc.directPath || undefined,
      fileName: doc.fileName || doc.title || "documento",
      caption: doc.caption || "",
    };
  }

  // Vídeo
  if (msg.videoMessage || messageType === "videoMessage") {
    const vid = msg.videoMessage || {};
    console.log(`[whatsapp] 🔍 videoMessage keys: ${Object.keys(vid).join(", ")}`);
    return {
      type: "image", // Tratar como imagem para thumbnail/análise
      mimetype: vid.mimetype || "video/mp4",
      base64: body.base64 || vid.base64 || undefined,
      url: vid.url || vid.directPath || undefined,
      caption: vid.caption || "",
    };
  }

  return null;
}

async function downloadMidiaBase64(media: MediaInfo, webhookBody: any): Promise<string | null> {
  // Se já temos base64, retornar direto
  if (media.base64) {
    console.log(`[whatsapp] ✅ Base64 já presente no webhook (${media.base64.length} chars)`);
    return media.base64;
  }

  const MEGA_API_URL = Deno.env.get("MEGA_API_URL") || "";
  const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN") || "";

  if (!MEGA_API_URL || !MEGA_API_TOKEN) {
    console.error("[whatsapp] ❌ MEGA_API_URL ou MEGA_API_TOKEN não configurados para download de mídia");
    return null;
  }

  // Extrair a base URL e instance key da MegaAPI URL
  // URL típica: https://apinocode01.megaapi.com.br/rest/sendMessage/megacode-M82Emx0E8aQ/text
  const megaUrlMatch = MEGA_API_URL.match(/^(https?:\/\/[^/]+\/rest)\/sendMessage\/([^/]+)/);
  const restBase = megaUrlMatch ? megaUrlMatch[1] : MEGA_API_URL.replace(/\/message\/.*$/, "").replace(/\/text$/, "").replace(/\/sendText$/, "").replace(/\/send-text$/, "");
  const instanceKey = megaUrlMatch ? megaUrlMatch[2] : (MEGA_API_URL.match(/\/([^/]+)\/text$/)?.[1] || "");

  console.log(`[whatsapp] 📥 REST base: ${restBase}, instance: ${instanceKey}`);

  // Tentar múltiplos endpoints de download da MegaAPI
  const messageKey = webhookBody.key || webhookBody.data?.key || {};
  const messageObj = webhookBody.message || webhookBody.data?.message || {};

  // Extrair mediaKey, directPath, url, mimetype da mensagem do tipo de mídia
  const mediaMsg = messageObj.imageMessage || messageObj.audioMessage || messageObj.documentMessage || {};
  const mediaFields = {
    mediaKey: mediaMsg.mediaKey || "",
    directPath: mediaMsg.directPath || "",
    url: mediaMsg.url || "",
    mimetype: mediaMsg.mimetype || media.mimetype || "",
  };

  console.log(`[whatsapp] 📥 Media fields: mediaKey=${mediaFields.mediaKey ? "SIM" : "NÃO"}, directPath=${mediaFields.directPath ? "SIM" : "NÃO"}, url=${mediaFields.url ? mediaFields.url.slice(0, 60) : "NÃO"}`);

  // Determinar messageType para a MegaAPI (NUNCA usar o messageType do webhook)
  const mediaTypeMap: Record<string, string> = {
    "image": "image",
    "audio": "audio",
    "document": "document",
    "video": "video",
  };
  const messageType = mediaTypeMap[media.type] || "image";

  // Formato OFICIAL da MegaAPI: messageKeys com mediaKey, directPath, url, mimetype E messageType DENTRO
  // Docs: https://doc.mega-api.app.br/api-10983731
  // curl example mostra messageType DENTRO de messageKeys
  const downloadPayloads = [
    // Formato 1: MegaAPI OFICIAL - messageType DENTRO de messageKeys
    {
      url: `${restBase}/instance/downloadMediaMessage/${instanceKey}`,
      body: {
        messageKeys: {
          mediaKey: mediaFields.mediaKey,
          directPath: mediaFields.directPath,
          url: mediaFields.url,
          mimetype: mediaFields.mimetype,
          messageType: messageType,
        }
      }
    },
    // Formato 2: Atributos FLAT (sem wrapper messageKeys - versões antigas)
    {
      url: `${restBase}/instance/downloadMediaMessage/${instanceKey}`,
      body: {
        mediaKey: mediaFields.mediaKey,
        directPath: mediaFields.directPath,
        url: mediaFields.url,
        mimetype: mediaFields.mimetype,
        messageType: messageType,
      }
    },
    // Formato 3: messageType fora de messageKeys (variação)
    {
      url: `${restBase}/instance/downloadMediaMessage/${instanceKey}`,
      body: {
        messageKeys: {
          mediaKey: mediaFields.mediaKey,
          directPath: mediaFields.directPath,
          url: mediaFields.url,
          mimetype: mediaFields.mimetype,
        },
        messageType: messageType,
      }
    },
  ];

  for (const payload of downloadPayloads) {
    try {
      console.log(`[whatsapp] 📥 Tentando download: ${payload.url}`);
      console.log(`[whatsapp] 📥 Body: ${JSON.stringify(payload.body).slice(0, 500)}`);
      const res = await fetch(payload.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MEGA_API_TOKEN}`,
          "apikey": MEGA_API_TOKEN,
        },
        body: JSON.stringify(payload.body),
      });

      console.log(`[whatsapp] 📥 Response status: ${res.status}, content-type: ${res.headers.get("content-type")}`);

      const contentType = res.headers.get("content-type") || "";
      
      // Se retornou binário direto, converter para base64
      if (res.ok && (contentType.startsWith("image/") || contentType.startsWith("audio/") || contentType.startsWith("application/octet-stream"))) {
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 8192;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
        }
        const b64 = btoa(binary);
        if (b64.length > 100) {
          console.log(`[whatsapp] ✅ Mídia baixada como binário (${b64.length} chars base64)`);
          return b64;
        }
      }

      // Ler resposta como texto/JSON
      const responseText = await res.text();
      console.log(`[whatsapp] 📥 Response body (preview): ${responseText.slice(0, 500)}`);

      if (res.ok || res.status === 200) {
        try {
          const data = JSON.parse(responseText);
          
          // MegaAPI pode retornar erro lógico
          if (data.error === true || data.statusCode === 404) {
            console.log(`[whatsapp] ⚠️ Endpoint retornou erro lógico: ${data.message || JSON.stringify(data).slice(0, 200)}`);
            continue;
          }
          
          // FORMATO OFICIAL MegaAPI: { error: false, message: "...", data: "base64string" }
          // data.data É a string base64 diretamente, NÃO um objeto
          let b64 = "";
          if (typeof data.data === "string" && data.data.length > 100) {
            b64 = data.data;
          } else if (typeof data.base64 === "string" && data.base64.length > 100) {
            b64 = data.base64;
          } else if (typeof data.data === "object" && data.data?.base64) {
            b64 = data.data.base64;
          } else if (typeof data.mediaData?.base64 === "string") {
            b64 = data.mediaData.base64;
          } else if (typeof data.media === "string" && data.media.length > 100) {
            b64 = data.media;
          }
          
          if (b64 && b64.length > 100) {
            // Remover prefixo data URI se presente
            b64 = b64.replace(/^data:[^;]+;base64,/, "");
            console.log(`[whatsapp] ✅ Mídia baixada via API (${b64.length} chars base64)`);
            return b64;
          }
          
          console.log(`[whatsapp] ⚠️ Resposta OK mas sem base64 válido. Keys: ${Object.keys(data).join(", ")}. data type: ${typeof data.data}`);
        } catch {
          // Se não é JSON mas é longo, pode ser base64 puro
          if (responseText.length > 100 && !responseText.startsWith("{") && !responseText.startsWith("<")) {
            console.log(`[whatsapp] ✅ Mídia baixada como base64 direto (${responseText.length} chars)`);
            return responseText;
          }
        }
      }
    } catch (err) {
      console.warn(`[whatsapp] ⚠️ Endpoint ${payload.url} falhou:`, err);
    }
  }

  console.error(`[whatsapp] ❌ Todas as tentativas de download de mídia falharam`);
  return null;
}

async function transcreverAudio(base64Audio: string, mimetype: string): Promise<string> {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "[Áudio recebido - transcrição indisponível]";

    // Converter base64 para blob
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const ext = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "mp4" : mimetype.includes("mpeg") ? "mp3" : "ogg";
    const blob = new Blob([bytes], { type: mimetype });

    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[whatsapp] 🎤 Áudio transcrito: "${(data.text || "").slice(0, 100)}"`);
      return data.text || "[Áudio inaudível]";
    }
    console.error(`[whatsapp] Whisper falhou: ${res.status}`);
    return "[Áudio recebido - não foi possível transcrever]";
  } catch (err) {
    console.error("[whatsapp] Erro transcrição:", err);
    return "[Áudio recebido - erro na transcrição]";
  }
}

async function descreverImagemOuDocumento(base64: string, mimetype: string, caption?: string): Promise<{ texto: string; imageContent: any }> {
  const imageUrl = `data:${mimetype};base64,${base64}`;
  
  const descPrompt = caption 
    ? `O paciente enviou esta imagem/documento com a legenda: "${caption}". Descreva o conteúdo de forma objetiva para que você possa responder adequadamente.`
    : `O paciente enviou esta imagem/documento pelo WhatsApp. Descreva o conteúdo de forma objetiva para que você possa responder adequadamente. Se for um exame, receita ou documento médico, extraia as informações relevantes.`;

  return {
    texto: caption || "[Paciente enviou uma imagem/documento]",
    imageContent: {
      type: "image_url",
      image_url: { url: imageUrl, detail: "low" },
    },
  };
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
    console.log("[whatsapp] Webhook recebido:", JSON.stringify(body).slice(0, 800));
    console.log("[whatsapp] Webhook top-level keys:", Object.keys(body).join(", "));
    if (body.message) console.log("[whatsapp] message keys:", Object.keys(body.message).join(", "));

    // Extrair mensagem e número (formato MegaAPI)
    const msg = body.message || {};
    const mensagemTexto = msg.conversation || msg.text || msg.extendedTextMessage?.text || body.text?.message || body.data?.message?.conversation || "";
    
    const senderPn = body.key?.senderPn || "";
    const jid = body.jid || "";
    const rawNumero = senderPn || jid || body.sender?.phone || body.data?.key?.remoteJid || "";
    const numero = rawNumero.replace("@s.whatsapp.net", "").replace("@lid", "").trim();
    
    const isFromMe = body.key?.fromMe || body.data?.key?.fromMe || false;
    const isGroup = body.isGroup || false;

    // Detectar mídia (imagem, áudio, documento)
    const midia = detectarMidia(body);
    const temMidia = midia !== null;
    const temTexto = !!mensagemTexto;

    console.log(`[whatsapp] Parsed: msg="${mensagemTexto.slice(0,50)}" num="${numero}" fromMe=${isFromMe} group=${isGroup} midia=${midia?.type || "nenhuma"}`);

    // Ignorar mensagens vazias (sem texto NEM mídia), do próprio bot, ou de grupo
    if ((!temTexto && !temMidia) || !numero || isFromMe || isGroup) {
      console.log("[whatsapp] Ignorando: vazio/fromMe/grupo");
      return new Response("ok");
    }

    // Processar mídia se presente
    let mensagem = mensagemTexto;
    let imagemBase64ParaIA: string | null = null;
    let imagemMimetype: string | null = null;

    if (midia) {
      console.log(`[whatsapp] 📎 Mídia recebida: ${midia.type} (${midia.mimetype})`);
      const base64 = await downloadMidiaBase64(midia, body);

      if (base64) {
        if (midia.type === "audio") {
          // Transcrever áudio e usar como mensagem
          const transcricao = await transcreverAudio(base64, midia.mimetype);
          mensagem = transcricao + (mensagemTexto ? `\n\n(Texto acompanhando: ${mensagemTexto})` : "");
          console.log(`[whatsapp] 🎤 Áudio processado: "${transcricao.slice(0, 80)}"`);
        } else if (midia.type === "image" || midia.type === "document") {
          // Guardar imagem/doc para enviar ao GPT-4o com vision
          imagemBase64ParaIA = base64;
          imagemMimetype = midia.mimetype;
          mensagem = midia.caption || mensagemTexto || "[Paciente enviou " + (midia.type === "image" ? "uma imagem" : `um documento: ${midia.fileName || "arquivo"}`) + "]";
          console.log(`[whatsapp] 🖼️ ${midia.type} salva para análise visual`);
        }
      } else {
        console.warn(`[whatsapp] ⚠️ Não foi possível baixar a mídia ${midia.type}`);
        if (!temTexto) {
          mensagem = `[Paciente enviou ${midia.type === "image" ? "uma imagem" : midia.type === "audio" ? "um áudio" : "um documento"}, mas não foi possível processar. Peça para enviar novamente ou descrever em texto.]`;
        }
      }
    }

    // Verificar se o canal WhatsApp está ativo
    const supabaseCheck = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: configCanal } = await supabaseCheck
      .from("configuracoes_sistema")
      .select("whatsapp_ativo")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configCanal && configCanal.whatsapp_ativo === false) {
      console.log("[whatsapp] Canal WhatsApp DESATIVADO - ignorando mensagem");
      return new Response(JSON.stringify({ status: "canal_desativado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (numero.includes("-") || numero.length < 10) {
      console.log("[whatsapp] Ignorando: número inválido");
      return new Response("ok");
    }

    console.log(`[whatsapp] 📩 De ${numero}: "${mensagem.slice(0, 100)}"${imagemBase64ParaIA ? " [+imagem]" : ""}`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // =============================
    // BUSCAR HISTÓRICO + PACIENTE + PROFISSIONAIS + TREINAMENTO EM PARALELO
    // =============================
    const [historicoResult, pacienteResult, profResult, treinamentoResult] = await Promise.all([
      supabase
        .from("interacoes_ia")
        .select("mensagem_usuario, resposta_final, criado_em")
        .eq("paciente_externo_id", numero)
        .eq("canal", "whatsapp")
        .order("criado_em", { ascending: false })
        .limit(10),
      buscarPacientePorTelefone(numero),
      buscarProfissionais(),
      supabase
        .from("treinamento_ia")
        .select("titulo, instrucao, categoria")
        .eq("ativo", true)
        .in("canal", ["ambos", "whatsapp"])
        .order("categoria"),
    ]);

    const historico = historicoResult.data;
    const contextPaciente = pacienteResult.texto;
    const pacienteEncontrado = pacienteResult.paciente;
    const treinamentos = treinamentoResult.data || [];

    // Detectar profissional mencionado pelo NOME na mensagem atual
    const profMencionado = detectarProfissionalPorNome(mensagem, profResult.raw);
    
    // Detectar especialidade e filtrar profissionais ANTES de enviar ao prompt
    const especialidadesDetectadas = detectarEspecialidade(mensagem, historico);
    let profissionaisParaContexto = profResult.raw;
    let profissionaisParaAgenda = profResult.raw;

    if (profMencionado) {
      // Se o paciente mencionou um profissional pelo nome, priorizar esse profissional
      profissionaisParaContexto = [profMencionado];
      profissionaisParaAgenda = [profMencionado];
      const nomeMencionado = fixEncoding(profMencionado.full_name || profMencionado.name || "");
      const espMencionado = fixEncoding(profMencionado.specialty || profMencionado.especialidade || "");
      console.log(`[whatsapp] ✅ Paciente perguntou por profissional específico: ${nomeMencionado} (${espMencionado})`);
    } else if (especialidadesDetectadas && profResult.raw.length > 0) {
      const filtrados = filtrarProfissionaisPorEspecialidade(profResult.raw, especialidadesDetectadas);
      if (filtrados.length > 0) {
        profissionaisParaContexto = filtrados;
        profissionaisParaAgenda = filtrados;
        console.log(`[whatsapp] ✅ Profissionais filtrados: ${filtrados.map((p: any) => fixEncoding(p.full_name || p.name || "")).join(", ")}`);
      } else {
        console.log(`[whatsapp] ⚠️ Nenhum profissional encontrado para especialidade, mostrando todos`);
      }
    }

    // Gerar contexto de profissionais filtrados
    let contextProfissionais = "";
    if (profissionaisParaContexto.length > 0) {
      const lista = profissionaisParaContexto.map((p: any) => {
        const id = p.id || p.professional_id || "";
        const nome = fixEncoding(p.full_name || p.professional_name || p.display_name || p.name || p.nome || "");
        const esp = fixEncoding(p.specialty || p.especialidade || p.specialization || "").trim();
        const espNorm = esp.charAt(0).toUpperCase() + esp.slice(1).toLowerCase();
        return `- ${nome} (${espNorm}) [ID: ${id}]`;
      }).join("\n");

      const headerProfissionais = profMencionado
        ? `## PROFISSIONAL SOLICITADO PELO PACIENTE (USE EXATAMENTE ESTE):`
        : `## PROFISSIONAIS DISPONÍVEIS PARA ESTA ESPECIALIDADE (USE SOMENTE ESTES):`;

      contextProfissionais = `\n\n${headerProfissionais}
${lista}

REGRA ABSOLUTA: Use SOMENTE os profissionais listados acima. NÃO sugira outros profissionais. NÃO confunda nomes.
${profMencionado ? `⚠️ O paciente PERGUNTOU ESPECIFICAMENTE por ${fixEncoding(profMencionado.full_name || profMencionado.name || "")}. Responda sobre ESTE profissional, não outro.` : ""}
${especialidadesDetectadas ? `ESPECIALIDADE DETECTADA: ${especialidadesDetectadas.join(", ")}. Ofereça APENAS profissionais desta área.` : ""}`;
    } else {
      contextProfissionais = profResult.texto;
    }

    // Buscar agenda com profissionais FILTRADOS
    const contextAgenda = await buscarHorariosDisponiveis(profissionaisParaAgenda);

    console.log(`[whatsapp] Contexto: paciente=${pacienteEncontrado ? "ENCONTRADO" : "NÃO"} profissionais=${profissionaisParaContexto.length}/${profResult.raw.length} agenda=${contextAgenda.length > 50 ? "OK" : "VAZIO"} treinamento=${treinamentos.length} especialidade=${especialidadesDetectadas?.join(",") || "nenhuma"}`);

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

    // Injetar treinamento do admin
    if (treinamentos.length > 0) {
      contextExtra += `\n\n## INSTRUÇÕES ADICIONAIS DO ADMINISTRADOR (SIGA TODAS COM PRIORIDADE MÁXIMA):\n`;
      for (const t of treinamentos) {
        contextExtra += `### ${t.titulo}\n${t.instrucao}\n\n`;
      }
    }

    // Montar mensagens para IA (suporte multimodal com vision)
    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: SYSTEM_ENGINE_WHATSAPP + contextExtra },
    ];

    // Adicionar histórico (do mais antigo ao mais recente)
    const historicoOrdenado = historico ? [...historico].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()) : [];
    for (const h of historicoOrdenado.slice(-8)) {
      if (h.mensagem_usuario) messages.push({ role: "user", content: h.mensagem_usuario });
      if (h.resposta_final) messages.push({ role: "assistant", content: h.resposta_final });
    }

    // Se tem imagem/documento, enviar como conteúdo multimodal (vision)
    if (imagemBase64ParaIA && imagemMimetype) {
      const imageDataUrl = `data:${imagemMimetype};base64,${imagemBase64ParaIA}`;
      const userContent: any[] = [
        { type: "text", text: mensagem || "O paciente enviou esta imagem. Analise o conteúdo visual com atenção: leia textos, números, datas, nomes e qualquer informação visível. Responda de forma útil." },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
      ];
      messages.push({ role: "user", content: userContent });
      console.log(`[whatsapp] 🖼️ Enviando imagem para GPT-4o vision`);
    } else if (messages[messages.length - 1]?.content !== mensagem) {
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
          model: imagemBase64ParaIA ? "gpt-4o" : "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: imagemBase64ParaIA ? 800 : 300,
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
    // DETECTAR AGENDAMENTOS CONFIRMADOS (suporta múltiplos)
    // =============================
    const { agendamentos, textoLimpo: textoSemAgendamentos } = extrairAgendamentos(respostaFinal);
    if (agendamentos.length > 0) {
      respostaFinal = textoSemAgendamentos;
      const patientId = pacienteEncontrado?.id || "";
      console.log(`[whatsapp] 📋 ${agendamentos.length} agendamento(s) detectado(s)`);

      // Processar TODOS os agendamentos em paralelo - AGUARDAR resultado antes de enviar mensagem
      const results = await Promise.all(agendamentos.map(async (ag, idx) => {
        console.log(`[whatsapp] Agendamento ${idx + 1}/${agendamentos.length}: ${ag.nome} | ${ag.data} ${ag.horario} | prof=${ag.professionalId}`);
        const [gestaoOk, crmOk] = await Promise.all([
          registrarAgendamento(ag.nome, numero, ag.data, ag.horario, ag.professionalId, patientId),
          idx === 0 ? criarLeadCRM(ag.nome, numero) : Promise.resolve(true),
        ]);
        
        await supabase.from("logs_decisao").insert({
          evento: "agendamento_whatsapp_confirmado",
          decisao: `gestao=${gestaoOk ? "ok" : "FALHA"}, crm=${crmOk ? "ok" : "falha"}`,
          regra_aplicada: "whatsapp_maria_agendamento_auto",
          dados_entrada: {
            nome: ag.nome, telefone: numero, data: ag.data, horario: ag.horario,
            professional_id: ag.professionalId, patient_id: patientId, indice: idx + 1, total: agendamentos.length,
          },
          confianca: 1.0,
        });
        console.log(`[whatsapp] ${gestaoOk ? "✅" : "❌"} Agendamento ${idx + 1}: Gestão=${gestaoOk}, CRM=${crmOk}`);
        return { gestaoOk, crmOk, ag };
      }));

      // Verificar se algum agendamento FALHOU no sistema de gestão
      const falharam = results.filter(r => !r.gestaoOk);
      if (falharam.length > 0) {
        console.error(`[whatsapp] ❌ ${falharam.length} agendamento(s) FALHARAM no sistema de gestão`);
        // Adicionar aviso à resposta para o paciente saber que precisa confirmar
        respostaFinal += `\n\n⚠️ Estou finalizando seu agendamento no sistema. Se houver qualquer ajuste, entrarei em contato para confirmar, tudo bem?`;
        
        // Notificar admin sobre falha
        const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
        if (adminNumber) {
          const falhaDetalhes = falharam.map(f => `${f.ag.nome} | ${f.ag.data} ${f.ag.horario}`).join("; ");
          enviarTexto(adminNumber, `⚠️ *AGENDAMENTO FALHOU NO SISTEMA*\n📱 Paciente: ${numero}\n📋 Dados: ${falhaDetalhes}\n\n⚡ Favor registrar manualmente no sistema de gestão.`).catch(() => {});
        }
      }
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
      mensagem_usuario: (midia ? `[${midia.type}] ` : "") + mensagem.slice(0, 5000),
      resposta_final: respostaFinal.slice(0, 5000),
      intencao_detectada: agendamentos.length > 0 ? "agendamento" : (encaminharHumano ? "encaminhar_humano" : null),
      estado_conversa: agendamentos.length > 0 ? "finalizado" : "em_andamento",
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
