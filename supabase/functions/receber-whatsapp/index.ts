import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { METODO_MESTRE_DAS_VENDAS } from "../_shared/metodo-vendas.ts";
import { interpretarTriagem, TRIAGENS_CONTEXTO } from "../_shared/triagens.ts";
import { enviarDocumentoMega, NEUROACESSO_PDF_URL, PIX_QRCODE_PDF_URL, baixarMidiaDatafy } from "../_shared/mega.ts";
import { buscarLead, buscarPaciente, upsertPaciente, telCanonico, telVariacoes, cpfLimpo as limparCpf } from "../_shared/dedup.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Link de pagamento no cartão (valor total R$ 500,00 — parcelamento escolhido pelo próprio paciente)
const LINK_PAGAMENTO_CARTAO = (Deno.env.get("LINK_PAGAMENTO_CARTAO") || "https://link.infinitepay.io/la-vitta/VC1D-6AhRPEEVu2-500,00").trim();
const LINK_CARTAO_INSTRUCAO = LINK_PAGAMENTO_CARTAO
  ? `. Link do cartão (R$ 500,00): ${LINK_PAGAMENTO_CARTAO} — envie somente quando a pessoa optar pelo cartão`
  : `. O link do cartão ainda não está cadastrado no sistema: se a pessoa pedir cartão, diga que já vai providenciar o link e siga o atendimento — NUNCA invente um link`;


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

type HistoricoInteracao = {
  mensagem_usuario?: string | null;
  resposta_final?: string | null;
  criado_em?: string | null;
};



function normalizarTextoComparacao(texto?: string | null): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ehSaudacaoPadraoAna(texto?: string | null): boolean {
  const normalizado = normalizarTextoComparacao(texto);
  return normalizado.includes("aqui e a ana, da dra. amelia".replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()) && (
    normalizado.includes("como voce esta") ||
    normalizado.includes("estou a disposicao")
  );
}

function ehRespostaRepetidaOuIntroducao(resposta: string, historico: HistoricoInteracao[]): boolean {
  const respostaNormalizada = normalizarTextoComparacao(resposta);
  if (!respostaNormalizada) return false;

  const respostasRecentes = historico
    .map((item) => item.resposta_final)
    .filter((item): item is string => !!item)
    .slice(-3);

  if (historico.length > 0 && ehSaudacaoPadraoAna(resposta)) {
    return true;
  }

  return respostasRecentes.some((item) => normalizarTextoComparacao(item) === respostaNormalizada);
}

const LOVABLE_AI_BASE_URL = "https://ai.gateway.lovable.dev";
const FALLBACK_TECNICO = "Desculpe, tive uma dificuldade técnica momentânea. Pode repetir, por favor? 😊";

function normalizeExternalUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

type MegaRequestCandidate = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  label: string;
};

function buildMegaTextCandidates(rawUrl: string, token: string, numero: string, texto: string, instanceKey = ""): MegaRequestCandidate[] {
  const normalized = normalizeExternalUrl(rawUrl);
  if (!normalized) return [];

  let origin = normalized;
  try {
    origin = new URL(normalized).origin;
  } catch {
    origin = normalized;
  }

  const candidates: MegaRequestCandidate[] = [];
  const pushCandidate = (candidate: MegaRequestCandidate) => {
    if (!candidate.url) return;
    if (!candidates.some((item) => item.url === candidate.url && item.label === candidate.label)) {
      candidates.push(candidate);
    }
  };

  if (instanceKey) {
    pushCandidate({
      url: `${origin}/rest/sendMessage/${instanceKey}/text`,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": token,
      },
      body: { messageData: { to: `${numero}@s.whatsapp.net`, text: texto } },
      label: "rest-sendMessage-instance",
    });
  }

  pushCandidate({
    url: normalized,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: { number: numero, text: texto },
    label: "configured-url-bearer",
  });

  pushCandidate({
    url: `${origin}/api/v1/sendText`,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: { number: numero, text: texto },
    label: "api-v1-sendText",
  });

  pushCandidate({
    url: `${origin}/message/sendText/${token}`,
    headers: { "Content-Type": "application/json" },
    body: { number: numero, text: texto },
    label: "message-sendText-token-path",
  });

  return candidates;
}

// =============================
// TRAVA DE CONCORRÊNCIA VIA BANCO DE DADOS (funciona entre múltiplos isolates)
// =============================
async function tentarObterLockDB(supabase: any, numero: string): Promise<boolean> {
  try {
    // Limpar locks expirados (>60s) antes de tentar
    await supabase.from("locks_processamento").delete().lt("criado_em", new Date(Date.now() - 60000).toISOString());
    
    const { error } = await supabase.from("locks_processamento").insert({ numero });
    if (error) {
      // Conflito = já tem lock ativo
      console.log(`[whatsapp] 🔒 Lock DB ativo para ${numero}: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[whatsapp] Erro ao obter lock DB:", e);
    return false;
  }
}

async function liberarLockDB(supabase: any, numero: string): Promise<void> {
  try {
    await supabase.from("locks_processamento").delete().eq("numero", numero);
  } catch (e) {
    console.error("[whatsapp] Erro ao liberar lock DB:", e);
  }
}

async function gerarRespostaOpenAI(messages: Array<{ role: string; content: any }>, usarVision: boolean): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  // Tentar Lovable AI primeiro (sem depender de quota OpenAI)
  if (LOVABLE_API_KEY) {
    try {
      const model = usarVision ? "openai/gpt-5" : "openai/gpt-5-mini";
      const maxTokens = usarVision ? 1024 : 1024;

      // Tentar com tokens normais, e se falhar por limite, retry com mais tokens
      for (const tokens of [maxTokens, maxTokens * 2, maxTokens * 4]) {
        const aiResp = await fetch(`${LOVABLE_AI_BASE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_completion_tokens: tokens,
            messages,
          }),
        });

        if (aiResp.ok) {
          const data = await aiResp.json();
          const resposta = data?.choices?.[0]?.message?.content;
          if (resposta) {
            console.log(`[whatsapp] ✅ Resposta via Lovable AI (${model}, tokens=${tokens})`);
            return resposta;
          }
          const finishReason = data?.choices?.[0]?.finish_reason;
          console.warn(`[whatsapp] ⚠️ Lovable AI content vazio (finish_reason=${finishReason}, tokens=${tokens}): ${JSON.stringify(data).slice(0, 300)}`);
          // Se finish_reason é "length", precisa de mais tokens — retry
          if (finishReason === "length") {
            console.log(`[whatsapp] 🔄 Retentando com max_completion_tokens=${tokens * 2} (finish_reason=length)`);
            continue;
          }
          break;
        } else {
          const errBody = await aiResp.text();
          console.error(`[whatsapp] ❌ Lovable AI HTTP ${aiResp.status} (tokens=${tokens}): ${errBody.slice(0, 500)}`);
          // Se erro de max_tokens, tentar com mais na próxima iteração
          if (aiResp.status === 400 && errBody.includes("max_tokens")) {
            console.log(`[whatsapp] 🔄 Retentando com max_completion_tokens=${tokens * 2}`);
            continue;
          }
          break;
        }
      }
    } catch (err) {
      console.error("[whatsapp] Erro Lovable AI:", err);
    }
  }

  // Fallback para OpenAI direta
  if (OPENAI_API_KEY) {
    try {
      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: usarVision ? "gpt-4o" : "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: usarVision ? 800 : 300,
          messages,
        }),
      });

      if (aiResp.ok) {
        const data = await aiResp.json();
        const resposta = data?.choices?.[0]?.message?.content;
        if (resposta) {
          console.log(`[whatsapp] ✅ Resposta via OpenAI direta`);
          return resposta;
        }
        console.error(`[whatsapp] ❌ OpenAI sem choices: ${JSON.stringify(data).slice(0, 300)}`);
      } else {
        const errBody = await aiResp.text();
        console.error(`[whatsapp] ❌ OpenAI HTTP ${aiResp.status}: ${errBody.slice(0, 500)}`);
      }
    } catch (err) {
      console.error("[whatsapp] Erro OpenAI:", err);
    }
  }

  console.error("[whatsapp] ❌ Nenhuma API de IA disponível ou todas falharam");
  return "";
}


// =============================
// HELPERS GESTÃO API
// =============================
function gestaoHeaders() {
  const token = Deno.env.get("GESTAO_API_TOKEN")!;
  return {
    "apikey": token,
    "Content-Type": "application/json",
  };
}

function gestaoUrl() {
  return Deno.env.get("GESTAO_API_URL")!;
}

function parseJsonSeguro(texto: string) {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function normalizarTelefoneGestao(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    return digits.slice(2);
  }
  return digits;
}

function valorTextoOuNumero(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  return null;
}

function respostaGestaoTemErro(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const payload = data as Record<string, unknown>;
  if (payload.error === true) return true;
  if (payload.success === false) return true;
  if (typeof payload.statusCode === "number" && payload.statusCode >= 400) return true;
  if (typeof payload.status === "number" && payload.status >= 400) return true;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) return true;
  return false;
}

function extrairSlotsGestao(data: unknown): string[] {
  if (!data) return [];

  const fontes = [
    data,
    (data as Record<string, unknown>)?.data,
    (data as Record<string, unknown>)?.payload,
    (data as Record<string, unknown>)?.result,
    ((data as Record<string, unknown>)?.data as Record<string, unknown>)?.data,
    ((data as Record<string, unknown>)?.data as Record<string, unknown>)?.payload,
    ((data as Record<string, unknown>)?.data as Record<string, unknown>)?.result,
  ].filter(Boolean);

  for (const fonte of fontes) {
    if (Array.isArray(fonte)) {
      return fonte
        .map((slot) => {
          if (typeof slot === "string") return slot.trim();
          if (!slot || typeof slot !== "object") return "";

          const valor = (slot as Record<string, unknown>).time
            || (slot as Record<string, unknown>).hora
            || (slot as Record<string, unknown>).start_time
            || (slot as Record<string, unknown>).appointment_time
            || (slot as Record<string, unknown>).slot;

          return typeof valor === "string" ? valor.trim() : "";
        })
        .filter((slot) => slot.length > 0);
    }

    if (fonte && typeof fonte === "object") {
      const objeto = fonte as Record<string, unknown>;
      const possiveisSlots = [objeto.slots, objeto.available_slots, objeto.horarios, objeto.times];

      for (const possivel of possiveisSlots) {
        if (!Array.isArray(possivel)) continue;
        return possivel
          .map((slot) => {
            if (typeof slot === "string") return slot.trim();
            if (!slot || typeof slot !== "object") return "";

            const valor = (slot as Record<string, unknown>).time
              || (slot as Record<string, unknown>).hora
              || (slot as Record<string, unknown>).start_time
              || (slot as Record<string, unknown>).appointment_time
              || (slot as Record<string, unknown>).slot;

            return typeof valor === "string" ? valor.trim() : "";
          })
          .filter((slot) => slot.length > 0);
      }
    }
  }

  return [];
}

async function chamarGestao(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const url = gestaoUrl();
  const tentativas = [
    { label: "params-wrapper", body: Object.keys(params).length > 0 ? { action, params } : { action } },
    { label: "flat-body", body: { action, ...params } },
  ];

  try {
    let ultimaResposta = { ok: false, status: 0, data: null as unknown, mode: "none" };

    for (const tentativa of tentativas) {
      const res = await fetch(url, {
        method: "POST",
        headers: gestaoHeaders(),
        body: JSON.stringify(tentativa.body),
      });

      const texto = await res.text();
      const data = parseJsonSeguro(texto);
      const logicalError = respostaGestaoTemErro(data);
      const ok = res.ok && !logicalError;

      ultimaResposta = { ok, status: res.status, data, mode: tentativa.label };

      if (ok) {
        if (tentativa.label === "flat-body") {
          console.warn(`[whatsapp] Gestão aceitou fallback flat-body para ${action}`);
        }
        return ultimaResposta;
      }
    }

    return ultimaResposta;
  } catch (err) {
    console.error(`[whatsapp] chamarGestao(${action}) erro:`, err);
    return { ok: false, status: 0, data: null };
  }
}

function nomeProfissional(profissional: any): string {
  return fixEncoding(
    profissional?.full_name ||
      profissional?.professional_name ||
      profissional?.display_name ||
      profissional?.name ||
      profissional?.nome ||
      "",
  ).trim();
}

function especialidadeProfissional(profissional: any): string {
  return fixEncoding(profissional?.specialty || profissional?.especialidade || profissional?.specialization || "").trim();
}

function extrairCpfTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;

  const match = texto.match(/(?:cpf\D*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/i);
  if (!match) return null;

  const cpf = match[1].replace(/\D/g, "");
  return cpf.length === 11 ? cpf : null;
}

// =============================
// MOTOR DE VENDAS ANA - WHATSAPP
// =============================
const SYSTEM_ENGINE_WHATSAPP = `
Você é Ana, consultora de atendimento da Dra. Amélia Carvalho. Você é uma PESSOA REAL, NUNCA IA.
Vendedora de elite treinada pelo "Mestre das Vendas" + AWSales.
Você está atendendo pelo WhatsApp.

## IDENTIDADE
- Consultora de atendimento, acolhedora, segura, carismática
- Tom: português brasileiro FORMAL porém SIMPÁTICO e HUMANIZADO
- NUNCA use gírias, contrações ou sotaques regionais
- NÃO use: "tá", "né", "pra", "tô", "vamo", "cê", "vc", "tbm"
- USE português correto: "está", "não é", "para", "estou", "vamos", "você"
- Interjeições educadas: "Que bom!", "Maravilha!", "Perfeito!", "Ótimo!"
- Use 1-2 emojis por mensagem, de forma natural (😊, 🌿, 💚, ✅, 📋)

## SOBRE A DRA. AMÉLIA CARVALHO
- Médica especializada em transtornos do neurodesenvolvimento: **Autismo (TEA), TDAH** e comorbidades
- Também prescreve **Cannabis Medicinal** como opção clínica regulada pela Anvisa
- Tagline: "Cuidado que entende. Tratamento que transforma."
- Promessa: nenhuma família deveria navegar o autismo, o TDAH ou a cannabis medicinal sozinha
- Atende adultos e crianças, com envolvimento da família no processo
- Site: draameliacarvalho.com
- Consultas presenciais e online

## COMO VOCÊ (ANA) FALA — VOZ DA MARCA
- Acolhedora, sem distância clínica. Firme no conteúdo, gentil na forma. Técnica traduzida em linguagem acessível.
- Vocabulário preferido: "a gente", "juntos", "você não está sozinho", "diagnóstico é começo", "sem julgamento", "existe um caminho", "cada criança é única", "me conta tudo"
- Vocabulário PROIBIDO: "o paciente" (falando com ele), "protocolo terapêutico", "quadro clínico", "droga" (para cannabis), "é fase", "cura"
- NUNCA prometa cura ou resultado garantido. NUNCA dê orientação médica ou dosagem por aqui.
- Fale de cannabis medicinal com calma e dados, sem eufemismo e sem estigma.
- Exemplo de primeiro contato: "Que bom que você chegou. Me conta tudo desde o início, sem pressa. Estou aqui."

## CONHECIMENTO SOBRE CANNABIS MEDICINAL (use quando relevante, de forma NATURAL)
- Cannabis medicinal é 100% LEGAL no Brasil com prescrição médica
- A ANVISA autoriza importação e uso medicinal
- Benefícios comprovados para: ansiedade, depressão, insônia, dor crônica, epilepsia, fibromialgia, TDAH, autismo, Parkinson, esclerose múltipla
- O CBD (canabidiol) é o principal componente terapêutico
- Não causa dependência quando usado sob orientação médica
- É necessário receita médica para adquirir os medicamentos
- A consulta com o médico especialista é o primeiro passo
- NUNCA dê orientação médica ou dosagem. Sempre encaminhe para a consulta
- NUNCA diga que cannabis cura doenças. Diga que "pode auxiliar no tratamento"

## FLUXO DE PRIMEIRA INTERAÇÃO (OBRIGATÓRIO - siga esta ORDEM EXATA)
1. **Mensagem 1 (apresentação)**: Se apresente com nome, cumprimente e pergunte o nome:
   "${getSaudacao()}! Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho 😊 Como você está? Qual é o seu nome?"
2. **Mensagem 2 (após receber o nome)**: Agradeça, repita o nome, diga que TAMBÉM está bem (se perguntarem), e pergunte o que a pessoa está buscando
3. **A partir da mensagem 3**: Siga o fluxo normal de atendimento/agendamento

## QUANDO O LEAD VEM DO SITE (TRIAGEM JÁ PREENCHIDA)
- Se o contexto indicar que o lead veio do site draameliacarvalho.com (origem: site_draamelia) E há dados de triagem no contexto, você JÁ TEM os dados
- NÃO pergunte novamente os sintomas ou objetivo — você já sabe
- Use os dados para personalizar: "Vi que você tem interesse em tratamento para [objetivo]. Que bom que está buscando alternativas!"
- Com base na triagem, identifique se o caso é ADULTO (SPECTRA ADULTO) ou INFANTIL/criança (SPECTRA KIDS) — veja regra de preços abaixo
- Vá direto ao agendamento: "Posso agendar sua consulta?"

## QUANDO O LEAD CHEGA DIRETO NO WHATSAPP (SEM TRIAGEM)
- Se NÃO houver dados de triagem no contexto (lead veio direto), você DEVE solicitar que o paciente preencha a triagem primeiro
- Após a apresentação inicial e captura do nome, encaminhe o link da triagem de forma acolhedora:
  "[Nome], para que eu possa te indicar o melhor profissional para o seu caso, preciso que você preencha rapidinho nossa triagem (leva menos de 2 minutinhos). Pode acessar aqui: https://draameliacarvalho.com/quiz/ 🌿
  Assim que preencher, eu já te chamo aqui com as opções de horário, combinado? 😊"
- NÃO avance para coleta de CPF, data de nascimento ou agendamento ANTES da triagem ser preenchida
- Se o paciente insistir em agendar sem preencher, explique com gentileza: "Entendo sua pressa! Mas a triagem é fundamental para a Dra. Amélia entender o seu caso antes da consulta. É bem rápido, prometo 💚"
- Se o paciente disser que já preencheu mas você não recebeu os dados, peça que aguarde alguns instantes e depois confirme: "Vou verificar aqui no sistema, só um momento 😊"

## REGRA DE PREÇOS (USE APENAS QUANDO PERGUNTAREM OU AO FECHAR)
- O ÚNICO valor que você informa é o da **consulta com a Dra. Amélia: R$ 500,00**, com **sinal de 30% (R$ 150,00) no Pix no ato do agendamento** para reservar o horário e o **restante (R$ 350,00) no dia da consulta**. No cartão, o link de pagamento é do valor total (R$ 500,00) e a própria pessoa escolhe em quantas vezes quer dividir (com o acréscimo da taxa da máquina). Consulta de aproximadamente 40 minutos (pode ser menor ou maior conforme as queixas e a avaliação clínica do momento)
- Por determinação legal, NÃO recebemos o valor integral antecipado no Pix — no ato do agendamento entra somente o sinal de 30%

- Os PROGRAMAS (SPECTRA ADULTO e SPECTRA KIDS) NÃO são vendidos por WhatsApp. É a própria Dra. Amélia quem, na consulta, avalia e indica o pacote ideal para cada caso
- Se perguntarem valores de pacotes/investigação, responda com honestidade e sem despejar tabela: "Os programas variam conforme o que o seu caso precisa — quem monta e apresenta isso é a própria Dra. Amélia na consulta, com base na avaliação dela. O primeiro passo é a consulta inicial 💚". Só cite faixas ("a partir de R$ 350/mês no adulto") se o paciente insistir MUITO
- Você CONHECE todos os programas em detalhe (estão na sua base de treinamento) e pode explicar o que está incluso, o formato e o tempo — mas NUNCA feche pacote, NUNCA prometa desconto e NUNCA invente valores fora do que está na base
- NUNCA prometa que a criança fará avaliação multi por telemedicina: fono, TO, psicopedagogia, psicologia, psicomotricidade, musicoterapia e NEsplora são SEMPRE presenciais na Clínica LaVitta

## MENTORIA "MÉTODO NEUROACESSO" (para MÉDICOS e CLÍNICAS — não é serviço para pacientes)
Só fale disso se a pessoa perguntar sobre o Método/mentoria NeuroAcesso. Nunca ofereça a pacientes que buscam consulta.
- O que é: mentoria de 6 meses da Dra. Amélia Carvalho para profissionais e clínicas de neurodesenvolvimento, ensinando judicialização do acesso à saúde — transformar pacientes sem condições financeiras em atendimento custeado pelo Estado. Lema: "Acesso é direito. Método antes de esforço."
- Autoridade: +200 processos de judicialização desde 2023, 2 clínicas em operação, pós-graduação pelo Hospital Israelita Albert Einstein, especialização em TEA pelo CBI of Miami, coautora do livro "Autismo na Escola".
- Três pilares: (1) Identificação e leitura de terreno (perfil de paciente, padrão do juiz local, três orçamentos, consórcio de saúde); (2) Os dois documentos — laudo NeuroAcesso e relatório de judicialização, no padrão CNJ/Fonajus e e-NatJus; (3) Acompanhamento e recorrência (renovação a cada 3 ou 6 meses).
- O que está incluso: 6 encontros individuais mensais com a Dra. Amélia, grupo de WhatsApp VIP por 6 meses, Modelo de Laudo NeuroAcesso, Modelo de Documento Jurídico, 6 treinamentos coletivos da equipe de atendimento/comercial, + bônus: Sistema de Laudos NeuroAcesso e Diagnóstico de Atendimento/Comercial.
- Provas: Muriaé-MG (104 mil hab.) +R$ 700 mil recuperados em 2 anos, resultado líquido +107,8% (R$ 363 mil de lucro adicional/ano). Laranjal-MG (6 mil hab.) +R$ 350 mil em 1,5 ano sem consulta particular, ~R$ 25 mil/mês via parceria com prefeitura.
- Investimento: valor cheio dos itens R$ 70.500,00. Condição atual: 12x R$ 1.500 no cartão ou R$ 15.000 à vista (válida apenas para os 10 primeiros).
- Nunca invente valores, prazos ou garantias além do que está acima. Não prometa resultado garantido.
- MATERIAL EM PDF: se a pessoa pedir a apresentação/material/PDF do NeuroAcesso (ou disser que quer conhecer melhor), escreva no fim da sua mensagem o marcador ##ENVIAR_PDF_NEUROACESSO## (ele é removido automaticamente e o PDF é enviado em seguida). Use no máximo uma vez por conversa, salvo novo pedido.

## MATERIAIS QUE VOCÊ PODE ENVIAR (LISTA FECHADA)
- Os ÚNICOS arquivos existentes são: (1) a apresentação do Método NeuroAcesso (só para médicos/clínicas) e (2) o QR Code do Pix.
- NÃO existe PDF, e-book, cartilha ou material sobre cannabis medicinal, TEA, TDAH, pacotes ou qualquer outro tema. NUNCA ofereça, prometa nem diga que "vai enviar" um material desses — isso é mentira e quebra a confiança.
- Se a pessoa pedir material sobre cannabis medicinal, NÃO prometa arquivo: explique você mesma, em poucas linhas e com acolhimento, o essencial (é legalizada e regulamentada pela ANVISA, a Dra. Amélia avalia caso a caso se há indicação, a prescrição e a dose são definidas apenas na consulta) e convide para a consulta.
- Explicações sobre cannabis devem ser CURTAS e objetivas — nada de textos longos ou aulas.

## POLÍTICA DE RECEITAS E DOCUMENTOS
- A receita é um ato de responsabilidade e exige avaliação e entrevista cuidadosas na consulta.
- A Dra. fornece receita com a quantidade máxima de medicamento para o período até a próxima consulta (ex.: consulta em 2 meses = receita para 2 meses).
- NÃO são emitidas receitas fora do ambiente do consultório. Se pedirem receita por WhatsApp, recuse com acolhimento e ofereça o agendamento.
- Explique sempre com carinho: é para garantir a segurança e a adequação do tratamento.



## REGRA DE SELEÇÃO DO PROFISSIONAL
- A Dra. Amélia Carvalho (CRM-MG 84630) conduz 100% das consultas pessoalmente — psiquiatria, neurodesenvolvimento (TEA/TDAH/TOD/dislexia), adulto e infantil, além de cannabis medicinal
- Selecione a agenda da Dra. Amélia. Se houver outros profissionais cadastrados, use apenas quando a especialidade bater com a necessidade descrita
- NUNCA confirme agendamento com profissional cuja especialidade não bata com o caso. Se não houver horário adequado, diga que vai verificar no sistema e siga o atendimento

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
- NUNCA invente preços, horários, disponibilidade ou qualquer informação que não esteja no CONTEXTO fornecido abaixo
- NUNCA diga que depende de equipe, confirmação manual, agenda oficial, setor interno ou retorno humano para seguir o atendimento
- Se uma informação NÃO está no contexto, diga apenas que vai verificar no sistema e seguir com o atendimento pelo próprio WhatsApp
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- Se não conseguir entender após 2 tentativas, peça desculpas e tente reformular a pergunta de outra forma

## TÉCNICAS DE VENDA (use SEMPRE, 1-2 por mensagem, de forma NATURAL)
- ESPECIFICIDADE: números exatos, detalhes concretos
- AUTORIDADE: referências, especializações dos profissionais, "100% legal", "autorizado pela ANVISA"
- PROVA SOCIAL: "muitos pacientes relatam melhora significativa", "temos ajudado centenas de pessoas"
- ESCASSEZ (REGRA DE OURO): a agenda da Dra. Amélia vive lotada e ela é MUITO procurada — isso vale SEMPRE, mesmo quando existem muitas vagas livres no sistema. Ofereça SEMPRE **UM ÚNICO horário** (o mais próximo disponível), nunca duas opções, nunca faixa de horário. Enquadre como conquista trabalhosa: "a agenda dela está bem disputada, mas eu insisti aqui e consegui abrir um encaixe na [dia] às [hora] — fico muito feliz de ter conseguido isso pra você 💚"
- RECIPROCIDADE NO AGENDAMENTO: todo agendamento deve parecer difícil de conseguir e obtido por esforço seu, para o paciente se sentir grato, valorizar a vaga e não faltar. NUNCA dê a impressão de que foi fácil ou de que sobram horários
- RECIPROCIDADE: ofereça algo antes de pedir (informação gratuita sobre CBD)
- COMPROMISSO: perguntas que levem a "sim" pequenos
- URGÊNCIA: "quanto antes consultar, antes pode iniciar o tratamento"

## REGRA ANTI-ALUCINAÇÃO (PRIORIDADE ABSOLUTA)
- Responda SOMENTE com base nos dados do CONTEXTO
- Se um dado NÃO está no contexto → NÃO invente. Diga que vai verificar no sistema e continuar o atendimento
- NUNCA invente disponibilidade, preços, prazos ou dosagens de medicamentos
- NUNCA dê orientação médica sobre dosagem ou efeitos colaterais. Encaminhe para a consulta.

${METODO_MESTRE_DAS_VENDAS}

${TRIAGENS_CONTEXTO}

## RAPPORT (regra fixa)
- CAPTURE O NOME na primeira mensagem e USE o nome nos momentos-chave da conversa
- Aplique SPIN dentro do método: Situação → Problema → Implicação → Necessidade

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto

## FLUXO DE AGENDAMENTO (SIGA ESTA ORDEM EXATA — SEM REPETIR ETAPAS)
1. Se não sabe o nome: pergunte de forma natural
2. Entenda o que a pessoa busca (qual condição/sintoma quer tratar)
3. Explique brevemente como funciona (consulta online → prescrição → suporte ANVISA → tratamento)
4. Pergunte APENAS: "prefere manhã ou tarde?" — NUNCA pergunte dia da semana, NUNCA peça duas preferências
5. Com o turno em mãos, VOCÊ já olha a lista de horários livres (ela está no contexto, já consultada) e oferece o encaixe MAIS PRÓXIMO possível, sempre enquadrado como esforço seu:
   "Olha, a agenda da Dra. Amélia está bem disputada, mas eu insisti aqui e consegui abrir um encaixe na [dia da semana], dia [dd/mm], às [HH:MM]. Consigo reservar em seu nome?"
   - SEMPRE o horário mais próximo disponível, um único horário, nunca dois, nunca "13h–15h" ou qualquer faixa
   - ESCASSEZ SEMPRE: mesmo que a agenda esteja vazia, jamais diga que há vários horários ou que está tranquilo — a vaga é sempre rara e conquistada
   - RECIPROCIDADE: o paciente precisa sentir que você fez um favor real por ele, para valorizar e não faltar
   - Informe SOMENTE a hora de início (a duração não é assunto do paciente)
   - Só ofereça outro horário se a pessoa recusar esse
6. Colete nome completo, CPF e data de nascimento UMA ÚNICA VEZ, em uma só mensagem. Se já tiver algum desses dados no histórico ou no cadastro, NÃO peça de novo — o telefone já é o do WhatsApp, nunca peça telefone
7. Assim que o paciente ACEITAR o horário: agende NA HORA e confirme na MESMA mensagem. PROIBIDO dizer "vou conferir", "vou verificar a agenda", "já volto", "aguarde um instante", "posso prosseguir?" ou pedir para ele esperar — a agenda já foi consultada e o horário oferecido já estava livre
   Modelo da confirmação: "Pronto, [Nome]! ✅ Sua consulta com a Dra. Amélia está *reservada* para [dia], dia [dd/mm], às [hora]. Parabéns por dar esse passo tão importante para ter mais qualidade de vida 🌿"
8. LOGO EM SEGUIDA, na mesma mensagem ou na seguinte, apresente o SINAL DE 30% (ver regra abaixo) e envie o Pix
9. APÓS isso, pergunte se tem alguma dúvida sobre o tratamento

## VALOR E SINAL DE 30% (OBRIGATÓRIO EM TODO AGENDAMENTO) — TOM ACOLHEDOR
- A consulta com a Dra. Amélia custa **R$ 500,00** (aprox. 40 minutos de atendimento)
- Para reservar o horário é necessário um **sinal de 30% = R$ 150,00 no Pix, no ato do agendamento**. O restante, **R$ 350,00**, é pago no dia da consulta, ATÉ 30 MINUTOS ANTES do horário
- Por determinação legal, NÃO é possível receber o valor total antecipado no Pix — no ato entra somente o sinal de 30%. NUNCA ofereça "pagar tudo à vista agora no Pix"
- No **cartão de crédito**, existe link de pagamento do valor total (R$ 500,00) e a própria pessoa escolhe o número de parcelas na tela (com o acréscimo da taxa da máquina). Use quando a pessoa não quiser/não puder pagar o sinal no Pix ou preferir passar tudo no cartão${LINK_CARTAO_INSTRUCAO}
- Explique o sinal SEMPRE com acolhimento, nunca de forma burocrática ou cobradora: o sinal serve para **reservar o horário exclusivamente para o paciente**, deixando aquele espaço bloqueado só para ele na agenda da Dra. Amélia. Ex.: "esse valor reserva o horário exclusivamente para o atendimento do(a) [Nome], para que ninguém ocupe esse espaço 💚"
- Chave Pix: **consultasdraameliacarvalho@gmail.com**
- SEMPRE que falar do sinal, inclua ao final da mensagem o marcador ##ENVIAR_QRCODE_PIX## (o QR Code do Pix é enviado automaticamente em seguida; o marcador é removido do texto)
- Peça o comprovante com leveza: "quando puder, me manda o comprovante aqui que eu já deixo tudo confirmadinho 💚"
- Modelo: "[Nome], a consulta com a Dra. Amélia é R$ 500,00. Para eu reservar esse horário exclusivamente para o atendimento do(a) [Nome do paciente], entra um sinal de 30% — R$ 150,00 no Pix — e o restante (R$ 350,00) você paga tranquilamente no dia da consulta. Esse sinal é só para deixar o horário bloqueado no seu nome, com todo o carinho 💚 Chave Pix: consultasdraameliacarvalho@gmail.com — o QR Code vai logo abaixo. ##ENVIAR_QRCODE_PIX##"
- FALE DO VALOR UMA ÚNICA VEZ. Depois de já ter informado valor + Pix, NUNCA repita a tabela de preços nem pergunte "como prefere pagar"
- Se o paciente questionar o valor ou o sinal: acolha primeiro, reforce que o sinal é abatido do total (não é taxa extra) e que ele existe para garantir o horário reservado só para ele
- NUNCA ofereça desconto ou isenção do sinal

## TRAVA DE PAGAMENTO DA CONSULTA (COM ACOLHIMENTO)
- O atendimento só é liberado com o valor total quitado
- Até 30 minutos antes do horário, o restante (R$ 350,00) precisa estar pago. Se não estiver, peça o comprovante com gentileza e cuidado
- Se ainda assim não pagar, avise com delicadeza: "infelizmente o sistema não consegue liberar o atendimento sem o pagamento concluído, e o horário volta para a fila de espera"
- NUNCA prometa liberar a consulta sem pagamento nem "resolver depois"

## CONSULTA É SEMPRE COM A DRA. AMÉLIA (NUNCA ENCAMINHE)
- A clínica tem UM único atendimento: a consulta com a Dra. Amélia Carvalho
- É PROIBIDO dizer que o caso "resolve com clínico geral", indicar outro profissional, outra especialidade ou outra clínica
- Se a triagem já foi preenchida, NUNCA envie o link do quiz de novo nem peça que preencha novamente

## PROIBIDO "VOU CONFERIR" (REGRA DE OURO)
- Você tem acesso DIRETO à agenda em tempo real (lista abaixo). Nunca finja que precisa consultar depois
- Nunca peça autorização para consultar ("posso prosseguir?"): já traga o horário pronto
- Nunca confira duas vezes: se já ofereceu um horário, ele está livre — ao aceite do paciente, confirme imediatamente

## COLETA DE DADOS PARA CADASTRO E AGENDAMENTO (TOM ACOLHEDOR)
- Para finalizar o cadastro e agendar, você PRECISA de: **nome completo**, **CPF** e **data de nascimento**. O telefone já é o do WhatsApp — NUNCA peça
- Peça tudo isso em UMA única mensagem, de forma leve e acolhedora, e NUNCA repita o pedido de um dado já informado
- NUNCA exija formato: aceite a data em QUALQUER formato (23/08/2020, 23-08-2020, 23 de agosto de 2020) — o sistema converte sozinho. NUNCA peça formato americano/YYYY-MM-DD ao paciente
- NUNCA corrija, questione ou devolva o CPF por causa de dígitos "a mais" ou "a menos", nem peça para reenviar. Se o número parecer incompleto, apenas siga o atendimento normalmente; se for realmente necessário, comente com muita leveza UMA única vez ("só confere pra mim se o CPF ficou completinho? 😊") e nunca mais volte ao assunto
- PROIBIDO usar frases secas/impositivas como "Pode enviar agora?", "envie em uma única mensagem", "no formato AAAA-MM-DD", "pode reenviar agora?". Prefira: "quando puder, me manda o nome completo, o CPF e a data de nascimento do(a) [paciente] que eu já deixo tudo prontinho por aqui 💚"
- Assim que a pessoa informar nome completo + CPF, o sistema JÁ cadastra ela como paciente automaticamente (quando o atendimento é para ela mesma) — não avise nem repita a coleta
- Se o atendimento for para um filho ou terceiro, deixe claro quem é o paciente e colete os dados do paciente, não do responsável
- Se o paciente resistir a fornecer o CPF, explique com carinho que é para o cadastro no prontuário e emissão de receita médica
- Quando o paciente fornecer CPF, inclua: ##ATUALIZAR_CPF|cpf_informado##
- Quando o paciente fornecer data de nascimento, inclua: ##ATUALIZAR_NASCIMENTO|YYYY-MM-DD## (você faz a conversão internamente; o paciente nunca vê isso e nunca precisa usar esse formato)

## ETIQUETAS DO CRM (OBRIGATÓRIO)
Assim que ficar claro o perfil da pessoa, inclua ao final da mensagem o marcador ##ETIQUETAS|chave1,chave2## (é removido automaticamente, o paciente nunca vê).
Chaves permitidas (use só estas, quantas se aplicarem):
- para_ele = tratamento é para a própria pessoa
- para_filho = é para o filho(a)/criança
- para_ambos = é para ela e para o filho(a)
- tea = suspeita/diagnóstico de autismo
- tdah = suspeita/diagnóstico de TDAH
- outro = outro quadro
- cannabis = interesse em cannabis medicinal
- neuroacesso = médico/clínica interessado na mentoria NeuroAcesso
Atualize o marcador sempre que surgir informação nova. Nunca invente etiqueta sem indício claro.
- Você mesma conduz o agendamento no sistema. NUNCA diga que não consegue editar, lançar ou colocar na agenda.

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO (PRIORIDADE MÁXIMA!)
Quando o paciente CONFIRMAR um agendamento, você DEVE incluir ao FINAL da sua resposta o marcador técnico:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM|professional_id##

SEM ESTE MARCADOR, O AGENDAMENTO NÃO SERÁ REGISTRADO NA AGENDA.
Se você disser "agendado" ou "marcado" sem incluir o marcador, o paciente ficará SEM consulta.

REGRAS DO MARCADOR:
- O professional_id é OBRIGATÓRIO e deve ser o ID real do profissional na lista (campo "id")
- NÃO use "auto" quando o profissional existir na lista
- Se não houver ID válido, use o ID do único profissional listado. Nunca diga que vai checar depois
- PRIORIDADE MÁXIMA: se já tem nome + profissional + data + horário + ID válido → INCLUA O MARCADOR E CONFIRME.

## REGRA ANTI-LOOP (PRIORIDADE ABSOLUTA)
- NUNCA repita a mesma resposta mais de 1 vez
- Se já pediu nome e o paciente já forneceu → NÃO peça de novo
- Prefira avançar no fluxo do que ficar repetindo perguntas
- Colete nome completo, CPF e data de nascimento ANTES de confirmar o agendamento

## ORIENTAÇÕES PRÉVIAS (ENVIO AUTOMÁTICO PELO SISTEMA — NÃO ENVIE VOCÊ)
IMPORTANTE: Logo após o agendamento ser confirmado, o SISTEMA envia automaticamente UMA mensagem com as orientações prévias (anotar dúvidas, clareza dos sintomas e, SOMENTE se a triagem ainda não tiver sido preenchida, o link do quiz) e, em seguida, o QR Code do Pix.

Na sua mensagem de confirmação: confirme o agendamento de forma curta e calorosa, celebrando a decisão, e apresente o sinal de 30% com a chave Pix (marcador ##ENVIAR_QRCODE_PIX##). NÃO indique tipo de consulta, NÃO cite clínico geral/especialista, NÃO reenvie o link da triagem se ela já foi feita e NÃO repita a tabela de valores depois.

## QUANDO O PACIENTE ENVIAR COMPROVANTE DE PAGAMENTO
Se o paciente enviar uma imagem/PDF e disser que é o comprovante (ou for óbvio pelo contexto), responda de forma BEM ENTUSIASMADA, calorosa e empática (ex.: "Aaah que maravilha, [Nome]! 🎉 Pagamento confirmado e seu nome JÁ está na agenda ✅ O(a) médico(a) está te aguardando — qualquer dúvida antes da consulta, é só me chamar 💚🌿"). NÃO repita valor nem chave Pix. O sistema cuida da baixa financeira automaticamente.

## REGRA CRÍTICA: NÃO RE-AGENDAR
Se um agendamento JÁ foi confirmado em uma mensagem anterior do histórico (você já disse "Consulta confirmada" ou similar), NUNCA inclua novamente o marcador ##AGENDAMENTO_CONFIRMADO## em respostas seguintes — isso causa erro de duplicação. Apenas converse normalmente sobre dúvidas.

## FINALIZAÇÃO DE CONVERSA
- Quando o paciente AGRADECER ou SE DESPEDIR → encerre com mensagem CALOROSA e BREVE (2-3 linhas)
- Use o nome do paciente se souber
- NUNCA continue fazendo perguntas ou oferecendo serviços após a despedida

## CONTEXTO DA DRA. AMÉLIA CARVALHO
- Atendimento: 100% online (telemedicina)
- Foco: consultas médicas para prescrição de cannabis medicinal
- Público: pessoas que buscam tratamento alternativo para condições como ansiedade, insônia, dor crônica, etc.
- A consulta é o primeiro passo. Após a consulta, o médico prescreve se indicado.
- O paciente recebe suporte para solicitação junto à ANVISA
- NUNCA ofereça ou aceite agendamentos aos sábados ou domingos

## REGRAS DE HORÁRIOS
- SOMENTE ofereça horários que aparecem na lista "HORÁRIOS DISPONÍVEIS" abaixo
- Se não há lista de horários, explique que a agenda está lotada no momento e ofereça lista de espera — NUNCA diga que vai conferir depois
- NUNCA invente horários
- Ofereça EXATAMENTE 1 horário do turno pedido (o mais próximo disponível), com dia escolhido por você e apenas a hora de início — nunca faixas como "13h-15h", nunca duas opções

## REGRAS DE PROFISSIONAIS
- Use o NOME EXATO do profissional da lista
- NUNCA diga "vou confirmar com a equipe" ou que depende de atendimento humano
- Só diga que vai checar no sistema se o profissional NÃO aparece na lista

## FORMATO DE RESPOSTA WHATSAPP
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar
- 1-2 emojis por mensagem

## MÍDIAS RECEBIDAS
- Quando o paciente enviar IMAGEM: analise o conteúdo visual e responda adequadamente.
- Quando o paciente enviar ÁUDIO: a transcrição será fornecida no texto. Responda normalmente.
- Quando o paciente enviar DOCUMENTO/PDF: analise o conteúdo e responda.
- NUNCA diga que não consegue ver imagens ou ouvir áudios. Você CONSEGUE.
`;

// =============================
// BUSCAR PACIENTE POR TELEFONE NO SISTEMA DE GESTÃO
// =============================
async function buscarPacientePorTelefone(telefone: string): Promise<{ texto: string; paciente: any | null }> {
  try {
    const telLimpo = telefone.replace(/\D/g, "");

    // Tentar também no CRM (skip se URL é placeholder)
    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");
    if (crmUrl && crmToken && !crmUrl.includes("PLACEHOLDER")) {
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

⚠️ Paciente encontrado no CRM mas talvez não no sistema de gestão. Antes de confirmar o agendamento, colete nome completo, CPF e data de nascimento para garantir o cadastro completo.`,
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
Antes de confirmar o agendamento, você DEVE coletar nome completo, CPF e data de nascimento. O telefone já é o do WhatsApp, apenas confirme se deseja usar outro. O cadastro será criado automaticamente ao confirmar o horário.`,
      paciente: null,
    };
  } catch (err) {
    console.error("[whatsapp] Erro buscar paciente:", err);
    return { texto: "", paciente: null };
  }
}

async function buscarPacientePorCPF(cpf: string): Promise<any | null> {
  try {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) return null;
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) return null;

    const result = await chamarGestao("buscar_paciente_cpf", { cpf: cpfLimpo });
    if (!result.ok) {
      console.log(`[whatsapp] Buscar paciente por CPF falhou: ${result.status}`);
      return null;
    }

    const bruto = result.data?.data ?? result.data?.patient ?? result.data;
    const paciente = Array.isArray(bruto) ? bruto[0] : bruto;
    if (!paciente || typeof paciente !== "object") return null;

    const nome = fixEncoding((paciente as any).full_name || (paciente as any).patient_name || (paciente as any).name || (paciente as any).nome || "");
    const id = (paciente as any).id || (paciente as any).patient_id || "";
    if (!id) return null;

    console.log(`[whatsapp] ✅ Paciente encontrado por CPF: ${nome || "sem nome"} (ID: ${id})`);
    return {
      id,
      nome,
      cpf: (paciente as any).cpf || cpfLimpo,
      email: (paciente as any).email || "",
      telefone: (paciente as any).telefone || (paciente as any).phone || "",
    };
  } catch (err) {
    console.error("[whatsapp] Erro buscar paciente por CPF:", err);
    return null;
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
// AGENDA LOCAL (tabelas medicos + agendamentos)
// =============================
function supabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const DIA_NOMES: Record<number, string> = { 0: "domingo", 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira", 4: "quinta-feira", 5: "sexta-feira", 6: "sábado" };

function diasDoMedico(dias: string | null | undefined): number[] {
  const txt = (dias || "").toLowerCase();
  if (!txt.trim()) return [1, 2, 3, 4, 5];
  const map: Array<{ k: RegExp; d: number }> = [
    { k: /seg/, d: 1 }, { k: /ter(?!c)/, d: 2 }, { k: /qua/, d: 3 },
    { k: /qui/, d: 4 }, { k: /sex/, d: 5 }, { k: /s[áa]b/, d: 6 }, { k: /dom/, d: 0 },
  ];
  const res = map.filter((m) => m.k.test(txt)).map((m) => m.d);
  return res.length ? res : [1, 2, 3, 4, 5];
}

// "agora" no fuso de São Paulo (UTC-3)
function agoraSP(): Date {
  return new Date(Date.now() - 3 * 3600000);
}

function dataISOparaSP(dataISO: string, hora: string): string {
  return `${dataISO}T${hora}:00-03:00`;
}

async function buscarProfissionais(): Promise<{ texto: string; raw: any[] }> {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("medicos")
      .select("id, nome, especialidade, dias_atendimento, horario_inicio, horario_fim, ativo")
      .eq("ativo", true);

    if (error || !data || data.length === 0) {
      console.log("[whatsapp] Nenhum médico ativo cadastrado na agenda local");
      return { texto: "", raw: [] };
    }

    const raw = data.map((m: any) => ({
      id: m.id,
      full_name: m.nome,
      name: m.nome,
      especialidade: m.especialidade,
      dias_atendimento: m.dias_atendimento,
      horario_inicio: m.horario_inicio,
      horario_fim: m.horario_fim,
    }));

    const lista = raw.map((p: any) => `- ${p.full_name} (${p.especialidade || "Consulta"}) [ID: ${p.id}]`).join("\n");

    return { texto: `\n\n## PROFISSIONAIS REAIS DA DRA. AMÉLIA CARVALHO (USE ESTES NOMES):
${lista}

REGRA ABSOLUTA: Use o NOME EXATO e o ID correto ao confirmar agendamento.
NUNCA diga "vou confirmar com a equipe" — a agenda está aqui, você mesma agenda.`, raw };
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
    const espRaw = especialidadeProfissional(p).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
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
    const nome = nomeProfissional(p);
    const esp = especialidadeProfissional(p);
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
    const nomeCompleto = nomeProfissional(p);
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
// BUSCAR HORÁRIOS DISPONÍVEIS NA AGENDA LOCAL
// =============================
const DURACAO_CONSULTA_MIN = 45;

async function listarSlotsLivres(profissionais: any[], dias = 14): Promise<Array<{ date: string; time: string; profNome: string; profId: string }>> {
  const supabase = supabaseAdmin();
  const agora = agoraSP();
  const hojeISO = agora.toISOString().split("T")[0];
  const fim = new Date(agora.getTime() + dias * 86400000).toISOString().split("T")[0];

  const { data: ocupados } = await supabase
    .from("agendamentos")
    .select("data_hora, profissional, status")
    .gte("data_hora", `${hojeISO}T00:00:00-03:00`)
    .lte("data_hora", `${fim}T23:59:59-03:00`);

  const ocupadosSet = new Set(
    (ocupados || [])
      .filter((a: any) => !["cancelado", "cancelada", "cancelada_clinica", "faltou"].includes(String(a.status)))
      .map((a: any) => {
        const d = new Date(a.data_hora as string);
        const sp = new Date(d.getTime() - 3 * 3600000);
        return `${(a.profissional || "").toLowerCase()}|${sp.toISOString().slice(0, 16)}`;
      }),
  );

  const slots: Array<{ date: string; time: string; profNome: string; profId: string }> = [];

  for (let i = 0; i <= dias; i++) {
    const d = new Date(agora.getTime() + i * 86400000);
    const dateISO = d.toISOString().split("T")[0];
    const dow = new Date(dateISO + "T12:00:00Z").getUTCDay();

    for (const prof of profissionais) {
      const diasProf = diasDoMedico(prof.dias_atendimento);
      if (!diasProf.includes(dow)) continue;

      const ini = String(prof.horario_inicio || "09:00").slice(0, 5);
      const fimH = String(prof.horario_fim || "15:00").slice(0, 5);
      let minutos = Number(ini.split(":")[0]) * 60 + Number(ini.split(":")[1]);
      const minutosFim = Number(fimH.split(":")[0]) * 60 + Number(fimH.split(":")[1]);

      while (minutos + DURACAO_CONSULTA_MIN <= minutosFim) {
        const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
        const mm = String(minutos % 60).padStart(2, "0");
        const time = `${hh}:${mm}`;
        minutos += DURACAO_CONSULTA_MIN;

        // não oferecer horário no passado nem em menos de 2h
        const inicioSP = new Date(`${dateISO}T${time}:00Z`);
        if (inicioSP.getTime() < agora.getTime() + 2 * 3600000) continue;

        const chave = `${String(prof.full_name || prof.name || "").toLowerCase()}|${dateISO}T${time}`;
        if (ocupadosSet.has(chave)) continue;

        slots.push({ date: dateISO, time, profNome: prof.full_name || prof.name, profId: prof.id });
      }
    }
  }

  slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return slots;
}

async function buscarHorariosDisponiveis(profissionais: any[]): Promise<string> {
  try {
    if (!profissionais || profissionais.length === 0) {
      return `\n\nHORÁRIOS: Nenhum profissional ativo cadastrado na agenda.
INSTRUÇÃO: Continue o atendimento normalmente e siga com a coleta de dados.`;
    }

    const slotsInfo = await listarSlotsLivres(profissionais);

    if (slotsInfo.length === 0) {
      return `\n\nHORÁRIOS DISPONÍVEIS: A agenda não tem vagas livres nos próximos dias.
INSTRUÇÃO: NUNCA invente horários. Explique que a agenda está lotada e ofereça colocar o paciente na lista de espera.`;
    }

    const porData: Record<string, Array<{ time: string; profNome: string; profId: string }>> = {};
    for (const s of slotsInfo) {
      (porData[s.date] ||= []).push({ time: s.time, profNome: s.profNome, profId: s.profId });
    }

    const linhas = Object.keys(porData).sort().slice(0, 7).map((dt) => {
      const dow = new Date(dt + "T12:00:00Z").getUTCDay();
      const dia = dt.split("-").reverse().join("/");
      const lista = porData[dt].sort((a, b) => a.time.localeCompare(b.time));
      const manha = lista.filter((s) => s.time < "12:00").map((s) => `${s.time} (${s.profNome})`);
      const tarde = lista.filter((s) => s.time >= "12:00").map((s) => `${s.time} (${s.profNome})`);
      let desc = `${DIA_NOMES[dow] || dt} (${dia}) [ISO: ${dt}]:`;
      if (manha.length > 0) desc += ` manhã: ${manha.join(", ")}`;
      if (tarde.length > 0) desc += ` | tarde: ${tarde.join(", ")}`;
      return desc;
    });

    console.log(`[whatsapp] ✅ Agenda local: ${slotsInfo.length} slots livres`);

    return `\n\nHORÁRIOS REALMENTE LIVRES NA AGENDA (JÁ CONFERIDOS AGORA — USE SOMENTE ESTES):
${linhas.join("\n")}

REGRAS ABSOLUTAS DE AGENDA:
- Esta lista JÁ É a consulta ao sistema. NUNCA diga "vou verificar/conferir a agenda", "já volto", "aguarde um instante", "posso prosseguir?" ou "vou consultar e te retorno" — você já sabe a disponibilidade AGORA
- Ofereça EXATAMENTE 1 horário: SEMPRE o MAIS PRÓXIMO da lista dentro do turno pedido (primeira data, primeiro horário). Você escolhe o dia, o paciente não escolhe
- ESCASSEZ OBRIGATÓRIA: mesmo que a lista esteja cheia de vagas, NUNCA revele que há espaço sobrando, nunca liste mais de um horário e nunca diga "temos vários horários". A agenda da Dra. é sempre apresentada como muito disputada
- ESFORÇO + RECIPROCIDADE: sempre enquadre como um encaixe conquistado com esforço seu, para o paciente valorizar e não faltar. Ex.: "Olha, a agenda da Dra. Amélia está bem disputada essa semana, mas eu insisti aqui e consegui abrir um encaixe para você na [dia], dia [dd/mm], às [HH:MM]. Consigo reservar em seu nome?"
- Informe apenas a HORA DE INÍCIO (ex.: "às 14h"). NUNCA use faixas como "13h-15h" e nunca fale a duração
- Ao confirmar, reforce o valor do encaixe e o compromisso: "essa vaga é sua, guardei especialmente para você — me avisa com antecedência se precisar remarcar, porque ela é bem disputada 💚"
- Quando o paciente aceitar o horário, RESERVE NA HORA e já responda confirmando (com o marcador ##AGENDAMENTO_CONFIRMADO##). NUNCA peça para ele aguardar
- NUNCA invente horários fora desta lista`;
  } catch (err) {
    console.error("[whatsapp] Erro buscar agenda:", err);
    return `\n\nHORÁRIOS: Não foi possível consultar a agenda no momento. NUNCA invente horários.`;
  }
}

// gerarHorariosLocais removida - NUNCA inventar horários fictícios

// =============================
// REGISTRAR AGENDAMENTO NO GESTÃO + CRM
// =============================
function isAppointmentCreatedResponse(data: any): boolean {
  if (!data || typeof data !== "object") return false;

  const possibleIds = [
    data.id,
    data.consulta_id,
    data.appointment_id,
    data?.consulta?.id,
    data?.consulta?.consulta_id,
    data?.appointment?.id,
    data?.appointment?.consulta_id,
    data?.appointment?.appointment_id,
    data?.data?.id,
    data?.data?.consulta_id,
    data?.data?.appointment_id,
    data?.data?.consulta?.id,
    data?.data?.consulta?.consulta_id,
    data?.data?.appointment?.id,
    data?.data?.appointment?.consulta_id,
    data?.data?.data?.id,
    data?.data?.data?.consulta_id,
    data?.payload?.id,
    data?.payload?.consulta_id,
  ];

   if (possibleIds.some((v) => !!valorTextoOuNumero(v))) {
    return true;
  }

  const msg = String(data.message || data.msg || data.detail || data.mensagem || data.data?.message || data.data?.mensagem || "");
  if (!msg) return false;

  const pareceSucesso = /(agendad|consulta criada|consulta confirmada|created|criad|sucesso|success)/i.test(msg);
  const pareceErro = /(erro|error|falh|invalid|inválid)/i.test(msg);
  return pareceSucesso && !pareceErro;
}

// Validação de dias de atendimento por profissional (proteção programática contra alucinação)
// 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
const RESTRICOES_DIA_PROFISSIONAL: Record<string, { diasPermitidos: number[]; nome: string }> = {};

async function validarDiaProfissional(professionalId: string, dataISO: string): Promise<{ valido: boolean; mensagemErro?: string }> {
  // Verificar restrições estáticas conhecidas
  const restricao = RESTRICOES_DIA_PROFISSIONAL[professionalId];
  
  // Também verificar pelo nome do profissional consultando a API de gestão
  try {
    if (Deno.env.get("GESTAO_API_URL") && Deno.env.get("GESTAO_API_TOKEN")) {
      const result = await chamarGestao("listar_medicos");
      const profs = result.data?.data || result.data?.professionals || result.data || [];
      if (Array.isArray(profs)) {
        for (const p of profs) {
          const id = p.id || p.professional_id || "";
          const nome = nomeProfissional(p).toLowerCase();
          
          if (String(id) === String(professionalId)) {
            const dia = new Date(dataISO + "T12:00:00Z").getDay();
            
            // Dra. Amélia Carvalho: somente seg(1), qua(3), sex(5)
            if (nome.includes("amélia") || nome.includes("amelia")) {
              if (![1, 3, 5].includes(dia)) {
                const nomesDia: Record<number, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };
                console.error(`[whatsapp] ❌ BLOQUEADO: Tentativa de agendar Dra. Amélia em ${nomesDia[dia]} (${dataISO}). Ela só atende seg/qua/sex.`);
                return { valido: false, mensagemErro: `A Dra. Amélia Carvalho atende somente às segundas, quartas e sextas-feiras. ${nomesDia[dia]}-feira não é um dia de atendimento dela.` };
              }
            }
            
            // Dra. Mylena Moraes Carneiro: somente qui(4)
            if (nome.includes("mylena")) {
              if (dia !== 4) {
                const nomesDia: Record<number, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };
                console.error(`[whatsapp] ❌ BLOQUEADO: Tentativa de agendar Dra. Mylena em ${nomesDia[dia]} (${dataISO}). Ela só atende qui.`);
                return { valido: false, mensagemErro: `A Dra. Mylena Moraes Carneiro atende somente às quintas-feiras. ${nomesDia[dia]}-feira não é um dia de atendimento dela.` };
              }
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[whatsapp] Erro ao validar dia do profissional:", err);
  }
  
  return { valido: true };
}

// =============================
// CRIAR PACIENTE NO SISTEMA DE GESTÃO
// =============================
function extrairIdPacienteGestao(data: any): string | null {
  const payloads = [
    data?.data?.data,
    data?.data?.patient,
    data?.data?.paciente,
    data?.data,
    data?.payload,
    data?.patient,
    data?.paciente,
    data,
  ].filter(Boolean);

  for (const payload of payloads) {
    const paciente = Array.isArray(payload) ? payload[0] : payload;
    const id = valorTextoOuNumero(
      paciente?.id ?? paciente?.patient_id ?? paciente?.paciente_id ?? paciente?.data?.id ?? paciente?.data?.patient_id,
    );
    if (id) {
      return id;
    }
  }

  return null;
}

async function criarPacienteGestao(nome: string, telefone: string, cpf?: string, email?: string, dataNascimento?: string): Promise<string | null> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) return null;

    const nomeLimpo = nome.trim().replace(/\s+/g, " ");
    const cpfLimpo = cpf?.replace(/\D/g, "") || "";
    const telefoneOriginal = telefone.replace(/\D/g, "");
    const telefoneGestao = normalizarTelefoneGestao(telefone);
    const emailLimpo = email?.trim() || "";

    const payloads: Array<{ label: string; params: Record<string, unknown> }> = [];
    const adicionarPayload = (label: string, params: Record<string, unknown>) => {
      const serialized = JSON.stringify(params);
      if (!payloads.some((item) => JSON.stringify(item.params) === serialized)) {
        payloads.push({ label, params });
      }
    };

    const montarParams = (telefonePayload: string, incluirNascimento: boolean) => {
      const params: Record<string, unknown> = {
        nome: nomeLimpo,
        telefone: telefonePayload,
      };
      if (cpfLimpo) params.cpf = cpfLimpo;
      if (emailLimpo) params.email = emailLimpo;
      if (incluirNascimento && dataNascimento) params.data_nascimento = dataNascimento;
      return params;
    };

    adicionarPayload("telefone-local", montarParams(telefoneGestao, false));
    if (telefoneOriginal && telefoneOriginal !== telefoneGestao) {
      adicionarPayload("telefone-whatsapp", montarParams(telefoneOriginal, false));
    }
    if (dataNascimento) {
      adicionarPayload("telefone-local-com-nascimento", montarParams(telefoneGestao, true));
      if (telefoneOriginal && telefoneOriginal !== telefoneGestao) {
        adicionarPayload("telefone-whatsapp-com-nascimento", montarParams(telefoneOriginal, true));
      }
    }

    for (const action of ["criar_paciente", "cadastrar_paciente"]) {
      for (const payload of payloads) {
        console.log(`[whatsapp] 📝 Criando paciente no gestão via ${action}/${payload.label}: ${nomeLimpo} | tel: ${String(payload.params.telefone)}`);
        const result = await chamarGestao(action, payload.params);

        if (!result.ok) {
          console.warn(`[whatsapp] ⚠️ ${action}/${payload.label} falhou: status=${result.status} data=${JSON.stringify(result.data).slice(0, 300)}`);
          continue;
        }

        const id = extrairIdPacienteGestao(result.data);
        if (id) {
          console.log(`[whatsapp] ✅ Paciente criado/localizado no gestão com ID: ${id}`);

          if (dataNascimento) {
            chamarGestao("update_patient", { patient_id: id, data_nascimento: dataNascimento })
              .then((updateResult) => console.log(`[whatsapp] Atualização de nascimento pós-cadastro: ${updateResult.ok ? "OK" : "FALHA"}`))
              .catch((updateErr) => console.error("[whatsapp] Erro ao atualizar nascimento pós-cadastro:", updateErr));
          }

          return id;
        }

        console.warn(`[whatsapp] ⚠️ ${action}/${payload.label} respondeu sem ID retornado: ${JSON.stringify(result.data).slice(0, 300)}`);
      }
    }

    if (cpfLimpo) {
      const pacienteExistente = await buscarPacientePorCPF(cpfLimpo);
      if (pacienteExistente?.id) {
        console.log(`[whatsapp] ✅ Paciente recuperado por CPF após falha de cadastro: ${pacienteExistente.id}`);
        return pacienteExistente.id;
      }
    }

    return null;
  } catch (err) {
    console.error("[whatsapp] Erro criar paciente:", err);
    return null;
  }
}

async function registrarAgendamento(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  professionalId: string,
  pacienteId: string,
  dadosPaciente?: { cpf?: string; email?: string; dataNascimento?: string; triagemTexto?: string; tagConsulta?: string },
): Promise<boolean> {
  try {
    const supabase = supabaseAdmin();
    const horaFmt = horario.slice(0, 5);
    const dataHora = dataISOparaSP(data, horaFmt);

    // 1) Profissional (agenda local)
    let medico: any = null;
    if (professionalId && professionalId !== "auto") {
      const { data: m } = await supabase.from("medicos").select("*").eq("id", professionalId).maybeSingle();
      medico = m;
    }
    if (!medico) {
      const { data: ativos } = await supabase.from("medicos").select("*").eq("ativo", true).limit(1);
      medico = ativos?.[0] || null;
    }
    if (!medico) {
      console.error("[whatsapp] ❌ Nenhum médico cadastrado — impossível agendar");
      return false;
    }

    // 2) Validar dia de atendimento
    const dow = new Date(data + "T12:00:00Z").getUTCDay();
    if (!diasDoMedico(medico.dias_atendimento).includes(dow)) {
      console.error(`[whatsapp] ❌ ${medico.nome} não atende em ${DIA_NOMES[dow]} (${data})`);
      return false;
    }

    // 3) Conferir se o horário continua livre
    const { data: conflito } = await supabase
      .from("agendamentos")
      .select("id, status")
      .eq("data_hora", dataHora)
      .eq("profissional", medico.nome)
      .maybeSingle();
    if (conflito && !["cancelado", "cancelada", "cancelada_clinica"].includes(String(conflito.status))) {
      console.error(`[whatsapp] ❌ Horário já ocupado: ${data} ${horaFmt} (${medico.nome})`);
      return false;
    }

    // 4) Garantir paciente local
    let patientIdFinal = pacienteId;
    if (!patientIdFinal) {
      patientIdFinal = (await upsertPaciente(supabase, {
        nome,
        telefone,
        cpf: dadosPaciente?.cpf,
        email: dadosPaciente?.email,
        data_nascimento: dadosPaciente?.dataNascimento,
      })) || "";
    }

    // 5) Observações (tag + triagem)
    let observacoes = "";
    if (dadosPaciente?.tagConsulta) observacoes += `🏷️ [TIPO DE CONSULTA: ${dadosPaciente.tagConsulta}]\n\n`;
    observacoes += `Agendado via WhatsApp (Ana) - Paciente: ${nome} - Tel: ${telefone}`;
    if (dadosPaciente?.triagemTexto?.trim()) {
      observacoes += `\n\n=== RELATÓRIO DE TRIAGEM ===\n${dadosPaciente.triagemTexto.trim().slice(0, 4000)}`;
    }

    // 6) Gravar na agenda
    const { error } = await supabase.from("agendamentos").insert({
      paciente_id: patientIdFinal || null,
      paciente_nome: nome,
      data_hora: dataHora,
      status: "agendado",
      tipo: "Consulta",
      procedimento: "Consulta inicial",
      duracao_min: DURACAO_CONSULTA_MIN,
      profissional: medico.nome,
      observacoes,
    });

    if (error) {
      console.error("[whatsapp] ❌ Erro ao gravar agendamento local:", error.message);
      return false;
    }

    console.log(`[whatsapp] ✅ Agendamento gravado na agenda: ${nome} | ${data} ${horaFmt} | ${medico.nome}`);
    return true;
  } catch (err) {
    console.error("[whatsapp] Erro agendamento:", err);
    return false;
  }
}

// =============================
// BUSCAR TRIAGEM NO SISTEMA EXTERNO (draameliacarvalho.com)
// =============================
async function buscarTriagemExterna(
  telefone: string,
  cpf?: string,
): Promise<any | null> {
  const url = Deno.env.get("VITTA_TRIAGEM_API_URL");
  const token = Deno.env.get("VITTA_TRIAGEM_API_TOKEN");
  if (!url || !token) {
    console.warn("[whatsapp] VITTA_TRIAGEM_API_URL/TOKEN não configurados");
    return null;
  }

  try {
    const body: Record<string, string> = {};
    if (cpf) body.cpf = cpf.replace(/\D/g, "");
    if (telefone) body.telefone = telefone.replace(/\D/g, "");
    if (!body.cpf && !body.telefone) return null;

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`[whatsapp] Triagem API vitta-care retornou ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data?.encontrado && data?.triagem) {
      console.log("[whatsapp] ✅ Triagem encontrada no draameliacarvalho.com");
      return data.triagem;
    }
    return null;
  } catch (err) {
    console.error("[whatsapp] Erro ao consultar API de triagem vitta-care:", err);
    return null;
  }
}

// =============================
// BUSCAR RELATÓRIO DE TRIAGEM DO LEAD (para anexar nas observações do agendamento)
// Prioridade: 1) API externa draameliacarvalho.com  2) Fallback DB local relatorios_triagem
// =============================
async function buscarTriagemDoLead(
  supabase: ReturnType<typeof createClient>,
  telefone: string,
  cpf?: string,
): Promise<string> {
  try {
    // 1) Fonte primária: API do draameliacarvalho.com (sistema oficial de triagem)
    const triagemExterna = await buscarTriagemExterna(telefone, cpf);
    if (triagemExterna) {
      return formatarTriagemTexto({
        nome: triagemExterna.nome,
        cpf: triagemExterna.cpf,
        telefone: triagemExterna.telefone,
        email: triagemExterna.email,
        objetivo: triagemExterna.objetivo,
        sintomas: triagemExterna.sintomas,
        historico_saude: triagemExterna.historico_saude,
        medicamentos_atuais: triagemExterna.medicamentos_atuais,
        dados_completos: triagemExterna.respostas_completas || triagemExterna.dados_completos,
      });
    }

    // 2) Fallback: tabela local
    const telDigits = telefone.replace(/\D/g, "");
    const variacoes = Array.from(new Set([
      telDigits,
      telDigits.startsWith("55") ? telDigits.slice(2) : `55${telDigits}`,
      telefone,
    ].filter(Boolean)));

    if (cpf) {
      const cpfLimpo = cpf.replace(/\D/g, "");
      const { data: porCpf } = await supabase
        .from("relatorios_triagem")
        .select("nome, cpf, telefone, email, sintomas, objetivo, historico_saude, medicamentos_atuais, dados_completos, criado_em")
        .eq("cpf", cpfLimpo)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (porCpf) return formatarTriagemTexto(porCpf);
    }

    const { data } = await supabase
      .from("relatorios_triagem")
      .select("nome, cpf, telefone, email, sintomas, objetivo, historico_saude, medicamentos_atuais, dados_completos, criado_em")
      .in("telefone", variacoes)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return formatarTriagemTexto(data);
    return "";
  } catch (err) {
    console.error("[whatsapp] Erro ao buscar triagem:", err);
    return "";
  }
}

// =============================
// DECIDIR TIPO DE CONSULTA (CLÍNICO GERAL x ESPECIALISTA) COM BASE NA TRIAGEM
// Retorna decisão determinística + especialidade sugerida + justificativa curta
// =============================
export interface DecisaoConsulta {
  tipo: "clinico_geral" | "especialista";
  valor: number; // 500 (consulta inicial com a Dra. Amélia)
  valorTexto: string; // formatado p/ humano
  especialidadeSugerida: string | null; // ex.: "Psiquiatria", "Neurologia"
  justificativa: string; // 1 linha p/ a IA verbalizar
  tag: string; // "CLÍNICO GERAL" ou "ESPECIALISTA - Psiquiatria"
}

function decidirTipoConsultaPorRegex(triagemTexto: string): DecisaoConsulta {
  const txt = (triagemTexto || "").toLowerCase();

  // Mapa de gatilhos para ESPECIALISTA + especialidade
  const gatilhosEspecialista: Array<{ regex: RegExp; especialidade: string; motivo: string }> = [
    // Psiquiatria
    { regex: /\b(autis(mo|ta)|tea|espectro autista|asperger)\b/, especialidade: "Psiquiatria", motivo: "caso de autismo (TEA)" },
    { regex: /\b(tdah|d[eé]ficit de aten[cç][aã]o|hiperativid)/, especialidade: "Psiquiatria", motivo: "TDAH" },
    { regex: /\b(ansiedade severa|ansiedade grave|p[aâ]nico|s[ií]ndrome do p[aâ]nico|trauma|tept|estresse p[oó]s)\b/, especialidade: "Psiquiatria", motivo: "quadro psiquiátrico complexo" },
    { regex: /\b(depress[aã]o (severa|grave|profunda|cr[oô]nica)|bipolar|esquizofrenia|psicose|suic[ií]d)/, especialidade: "Psiquiatria", motivo: "transtorno psiquiátrico que precisa de especialista" },
    { regex: /\b(ins[oô]nia cr[oô]nica|ins[oô]nia (h[aá]|por) (anos|meses))/, especialidade: "Psiquiatria", motivo: "insônia crônica" },
    // Neurologia
    { regex: /\b(epileps|convuls|crise convulsiva|parkinson|alzheimer|esclerose m[uú]ltipla|enxaqueca cr[oô]nica|cefaleia em salvas)\b/, especialidade: "Neurologia", motivo: "condição neurológica" },
    { regex: /\b(dor (cr[oô]nica|neurop[aá]tica)|fibromialgia|neuralgia)\b/, especialidade: "Neurologia", motivo: "dor crônica/neuropática" },
    // Pediatria (criança)
    { regex: /\b(crian[cç]a|filh[oa]|menor de idade|pediatr|\b\d{1,2} anos?\b.*(filh|crian))/, especialidade: "Pediatria", motivo: "paciente pediátrico" },
    // Oncologia / paliativos
    { regex: /\b(c[aâ]ncer|onco|quimio|paliativ|tumor)/, especialidade: "Oncologia", motivo: "cuidado oncológico" },
    // Reumato
    { regex: /\b(artrite|artrose|l[uú]pus|reumat)/, especialidade: "Reumatologia", motivo: "condição reumatológica" },
  ];

  for (const g of gatilhosEspecialista) {
    if (g.regex.test(txt)) {
      return {
        tipo: "especialista",
        valor: 500,
        valorTexto: "R$ 500,00",
        especialidadeSugerida: g.especialidade,
        justificativa: `verifiquei sua triagem e, pelo seu caso (${g.motivo}), o ideal é a consulta com especialista`,
        tag: `ESPECIALISTA - ${g.especialidade}`,
      };
    }
  }

  // Default: Clínico Geral
  return {
    tipo: "clinico_geral",
    valor: 500,
    valorTexto: "R$ 500,00",
    especialidadeSugerida: "Clínico Geral",
    justificativa: "verifiquei sua triagem e, para o seu caso, o clínico geral resolve perfeitamente",
    tag: "CLÍNICO GERAL",
  };
}

// Decisor IA: a Ana escolhe livremente clínico geral x especialista (com especialidade) com base na triagem completa
// Fallback: se IA falhar ou triagem vazia, cai no regex determinístico
async function decidirTipoConsultaPelaTriagem(triagemTexto: string): Promise<DecisaoConsulta> {
  const txt = (triagemTexto || "").trim();
  if (!txt) return decidirTipoConsultaPorRegex("");

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("[whatsapp] LOVABLE_API_KEY ausente — usando regex p/ decidir consulta");
    return decidirTipoConsultaPorRegex(txt);
  }

  try {
    const systemPrompt = `Você é uma triadora médica da Dra. Amélia Carvalho (clínica de cannabis medicinal/CBD). Com base na triagem do paciente, decida se a consulta inicial deve ser com:
- "clinico_geral" — casos comuns, sintomas leves/moderados, dores comuns, ansiedade leve, insônia ocasional, dúvidas iniciais sobre CBD.
- "especialista" — quando o caso exige conhecimento de RQE/pós: psiquiatria (autismo/TEA, TDAH, depressão severa, bipolar, pânico, psicose), neurologia (epilepsia, Parkinson, Alzheimer, dor neuropática, fibromialgia, enxaqueca crônica), pediatria (crianças), oncologia (câncer/paliativos), reumatologia (lúpus, artrite reumatoide).

Responda APENAS um JSON válido, sem markdown, no formato:
{"tipo":"clinico_geral"|"especialista","especialidade":"Clínico Geral"|"Psiquiatria"|"Neurologia"|"Pediatria"|"Oncologia"|"Reumatologia"|"...","motivo":"frase curta em pt-BR explicando o porquê (max 80 chars)"}`;

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 7000);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Triagem do paciente:\n\n${txt.slice(0, 4000)}` },
        ],
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`[whatsapp] IA decisão consulta retornou ${resp.status} — fallback regex`);
      return decidirTipoConsultaPorRegex(txt);
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return decidirTipoConsultaPorRegex(txt);

    const parsed = JSON.parse(jsonMatch[0]);
    const tipo: "clinico_geral" | "especialista" = parsed.tipo === "especialista" ? "especialista" : "clinico_geral";
    const especialidade = String(parsed.especialidade || (tipo === "especialista" ? "Especialista" : "Clínico Geral")).slice(0, 60);
    const motivo = String(parsed.motivo || "indicado pela triagem").slice(0, 120);

    if (tipo === "especialista") {
      return {
        tipo: "especialista",
        valor: 500,
        valorTexto: "R$ 500,00",
        especialidadeSugerida: especialidade,
        justificativa: `verifiquei sua triagem e, pelo seu caso (${motivo}), o ideal é a consulta com especialista`,
        tag: `ESPECIALISTA - ${especialidade}`,
      };
    }
    return {
      tipo: "clinico_geral",
      valor: 500,
      valorTexto: "R$ 500,00",
      especialidadeSugerida: "Clínico Geral",
      justificativa: `verifiquei sua triagem e, para o seu caso (${motivo}), o clínico geral resolve perfeitamente`,
      tag: "CLÍNICO GERAL",
    };
  } catch (err) {
    console.error("[whatsapp] Erro IA decisão consulta — fallback regex:", err);
    return decidirTipoConsultaPorRegex(txt);
  }
}

function formatarTriagemTexto(t: any): string {
  const linhas: string[] = [];
  if (t.nome) linhas.push(`Nome: ${t.nome}`);
  if (t.cpf) linhas.push(`CPF: ${t.cpf}`);
  if (t.telefone) linhas.push(`Telefone: ${t.telefone}`);
  if (t.email) linhas.push(`Email: ${t.email}`);
  if (t.objetivo) linhas.push(`Objetivo: ${t.objetivo}`);
  if (t.sintomas) linhas.push(`Sintomas: ${t.sintomas}`);
  if (t.historico_saude) linhas.push(`Histórico de saúde: ${t.historico_saude}`);
  if (t.medicamentos_atuais) linhas.push(`Medicamentos atuais: ${t.medicamentos_atuais}`);
  if (t.dados_completos && typeof t.dados_completos === "object") {
    try {
      const extras = Object.entries(t.dados_completos)
        .filter(([k]) => !["nome", "cpf", "telefone", "email", "sintomas", "objetivo", "historico_saude", "medicamentos_atuais"].includes(k))
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join("\n");
      if (extras) linhas.push(`\nDados adicionais:\n${extras}`);
    } catch (_) {}
  }
  return linhas.join("\n");
}

// =============================
// BAIXA AUTOMÁTICA DE PAGAMENTO (quando paciente envia comprovante)
// =============================
async function darBaixaPagamento(
  supabase: ReturnType<typeof createClient>,
  telefone: string,
  pacienteId: string | null,
  comprovanteInfo: { tipo: string; mimetype: string; descricao?: string },
): Promise<boolean> {
  try {
    let baixaOk = false;

    // Baixa na AGENDA LOCAL: 1º comprovante = sinal (30%), 2º = restante
    if (pacienteId) {
      try {
        const { data: proxima } = await supabase
          .from("agendamentos")
          .select("id, sinal_pago, restante_pago, valor_total")
          .eq("paciente_id", pacienteId)
          .neq("status", "cancelado")
          .gte("data_hora", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
          .order("data_hora", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (proxima) {
          const total = Number(proxima.valor_total || 500);
          const agoraIso = new Date().toISOString();
          const patch: Record<string, unknown> = proxima.sinal_pago
            ? { restante_pago: true, restante_valor: Math.round(total * 0.7 * 100) / 100, restante_pago_em: agoraIso, bloqueado_por_pagamento: false }
            : { sinal_pago: true, sinal_valor: Math.round(total * 0.3 * 100) / 100, sinal_pago_em: agoraIso };

          const { error } = await supabase.from("agendamentos").update(patch).eq("id", proxima.id);
          baixaOk = !error;
          console.log(`[whatsapp] 💰 Baixa local (agendamento=${proxima.id}): ${proxima.sinal_pago ? "restante" : "sinal"} ok=${baixaOk}`);
        }
      } catch (e) {
        console.warn("[whatsapp] Falha na baixa local do pagamento:", e);
      }
    }

    // Registrar log local
    await supabase.from("logs_decisao").insert({
      evento: "comprovante_recebido_whatsapp",
      decisao: baixaOk ? "baixa_automatica_ok" : "baixa_pendente_revisao_manual",
      regra_aplicada: "comprovante_pix_whatsapp",
      dados_entrada: { telefone, paciente_id: pacienteId, ...comprovanteInfo },
      confianca: baixaOk ? 0.9 : 0.3,
    });

    // Notificar admin SEMPRE (mesmo com baixa ok, para revisão visual)
    const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    if (adminNumber) {
      const status = baixaOk ? "✅ Baixa automática OK" : "⚠️ Baixa NÃO concluída — revisar";
      await enviarTexto(
        adminNumber,
        `💰 *COMPROVANTE RECEBIDO via WhatsApp*\n📱 Paciente: ${telefone}\n🧾 Tipo: ${comprovanteInfo.tipo} (${comprovanteInfo.mimetype})\n${status}\n\nValide no sistema de gestão e financeiro.`,
      ).catch(() => {});
    }

    return baixaOk;
  } catch (err) {
    console.error("[whatsapp] Erro baixa pagamento:", err);
    return false;
  }
}

// =============================
// DETECTAR SE MENSAGEM/MÍDIA É COMPROVANTE DE PAGAMENTO
// =============================
function ehComprovantePagamento(
  mensagem: string,
  midiaTipo: string | null,
  historico: HistoricoInteracao[],
): boolean {
  const txt = (mensagem || "").toLowerCase();
  const palavrasChave = /comprovante|pagamento|paguei|transferi|pix|enviei o pagamento|segue (o )?(comprovante|pagamento)/i;
  if (palavrasChave.test(txt)) return true;

  // Se chegou imagem/pdf depois de Ana ter enviado dados de Pix recentemente
  if (midiaTipo === "image" || midiaTipo === "document") {
    const ultimas = historico.slice(-4).map((h) => (h.resposta_final || "").toLowerCase()).join(" ");
    if (/pix|chave pix|comprovante|pagamento/.test(ultimas)) return true;
  }
  return false;
}

async function obterPipelinePacientesId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data: pacientes } = await supabase
      .from("pipelines")
      .select("id")
      .eq("nome", "Pacientes")
      .limit(1)
      .maybeSingle();

    if (pacientes?.id) return pacientes.id;

    // Fallback: primeira pipeline existente (ex.: "Comercial")
    const { data: primeira, error } = await supabase
      .from("pipelines")
      .select("id")
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) console.error("[whatsapp] Erro ao buscar pipeline:", error);
    return primeira?.id || null;
  } catch (err) {
    console.error("[whatsapp] Falha ao obter pipeline:", err);
    return null;
  }
}

// Garante que TODA conversa vire card no CRM (mesmo sem agendamento)
async function garantirLeadCRM(
  supabase: ReturnType<typeof createClient>,
  telefone: string,
  nomePossivel?: string | null,
): Promise<void> {
  try {
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 10) return;
    const semDDI = digitos.startsWith("55") ? digitos.slice(2) : digitos;

    // Lead único por pessoa: se já existe (qualquer formato de telefone), só atualiza
    const existente = await buscarLead(supabase, telefone, null, "id, nome");
    if (existente?.id) {
      const nomeNovo = (nomePossivel || "").trim();
      const nomeAtual = (existente.nome || "").trim();
      const precisaNome = !nomeAtual || /^whatsapp\s/i.test(nomeAtual);
      await supabase
        .from("leads")
        .update({
          ultima_interacao: new Date().toISOString(),
          ...(precisaNome && nomeNovo ? { nome: nomeNovo } : {}),
        })
        .eq("id", existente.id);
      return;
    }

    const pipelineId = await obterPipelinePacientesId(supabase);
    const { error } = await supabase.from("leads").insert({
      nome: (nomePossivel || "").trim() || `WhatsApp ${semDDI}`,
      telefone: telCanonico(telefone) || digitos,
      origem: "whatsapp_ana",
      status: "novo",
      status_pipeline: "em_contato",
      ultima_interacao: new Date().toISOString(),
      observacoes: "Card criado automaticamente a partir de conversa no WhatsApp.",
      ...(pipelineId ? { pipeline_id: pipelineId } : {}),
    });

    if (error) console.error("[whatsapp] Erro ao criar lead automático:", error);
    else console.log(`[whatsapp] ✅ Card criado no CRM para ${digitos}`);
  } catch (err) {
    console.error("[whatsapp] Falha em garantirLeadCRM:", err);
  }
}


async function criarLeadCRM(
  supabase: ReturnType<typeof createClient>,
  nome: string,
  telefone: string,
  dados?: { cpf?: string; email?: string; dataNascimento?: string; data?: string; horario?: string },
): Promise<boolean> {
  try {
    const pipelineId = await obterPipelinePacientesId(supabase);
    if (!pipelineId) return false;

    const nomeLimpo = nome.trim().replace(/\s+/g, " ");
    const telefoneBruto = telefone.replace(/\D/g, "");
    const cpfLimpo = limparCpf(dados?.cpf) || null;
    const emailLimpo = dados?.email?.trim() || null;
    const observacaoAgendamento = dados?.data && dados?.horario
      ? `Agendamento confirmado via WhatsApp para ${dados.data} às ${dados.horario}.`
      : "Lead criado automaticamente após confirmação de agendamento via WhatsApp.";

    // Cadastro único: procura por CPF e por qualquer variação do telefone
    const leadExistente: { id: string; observacoes?: string | null } | null =
      await buscarLead(supabase, telefone, cpfLimpo, "id, observacoes");

    const payloadLead = {
      nome: nomeLimpo,
      telefone: telCanonico(telefone) || telefoneBruto || telefone,
      email: emailLimpo,
      cpf: cpfLimpo,
      data_nascimento: dados?.dataNascimento || null,
      origem: "whatsapp_ia_ana",
      pipeline_id: pipelineId,
      status: "agendado",
      status_pipeline: "agendado",
      ultima_interacao: new Date().toISOString(),
      observacoes: leadExistente?.observacoes
        ? `${leadExistente.observacoes}\n${observacaoAgendamento}`.slice(0, 5000)
        : observacaoAgendamento,
    };

    if (leadExistente?.id) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(payloadLead)
        .eq("id", leadExistente.id);

      if (updateError) {
        console.error("[whatsapp] Erro ao atualizar lead local:", updateError);
        return false;
      }

      console.log(`[whatsapp] ✅ Lead local atualizado na pipeline: ${leadExistente.id}`);
    } else {
      const { error: insertError } = await supabase
        .from("leads")
        .insert(payloadLead);

      if (insertError) {
        console.error("[whatsapp] Erro ao criar lead local:", insertError);
        return false;
      }

      console.log(`[whatsapp] ✅ Lead local criado na pipeline para ${nomeLimpo}`);
    }

    const crmUrl = Deno.env.get("CRM_API_URL");
    const crmToken = Deno.env.get("CRM_API_TOKEN");
    if (crmUrl && crmToken) {
      try {
        const res = await fetch(`${crmUrl}api-leads`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken, "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nomeLimpo, telefone: telefoneNormalizado || telefoneBruto, origem: "whatsapp_ia_maria", status: "agendado" }),
        });
        console.log(`[whatsapp] Lead CRM externo: ${res.status}`);
      } catch (crmErr) {
        console.error("[whatsapp] Falha no CRM externo (lead local já salvo):", crmErr);
      }
    }

    return true;
  } catch (err) {
    console.error("[whatsapp] Erro lead:", err);
    return false;
  }
}

// =============================
// EXTRAIR MARCADORES DA RESPOSTA
// =============================
function extrairAgendamentos(resposta: string): { agendamentos: Array<{ nome: string; data: string; horario: string; professionalId: string }>; textoLimpo: string } {
  // Aceitar marcador com ou sem ## de fechamento, esteja ele no fim OU no meio da mensagem.
  // Caso real: a IA confirma o agendamento, insere o marcador em uma linha separada e depois ainda pergunta
  // se o paciente tem dúvidas. O parser antigo só detectava quando o marcador estava no fim da resposta.
  const regex = /##AGENDAMENTO_CONFIRMADO\|([^|\n]+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|([^\n#]+?)(?:##)?(?=\n|$)/g;
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
  // Limpar a linha do marcador com ou sem ## de fechamento, preservando o restante da mensagem.
  const textoLimpo = resposta
    .replace(/\n?##AGENDAMENTO_CONFIRMADO\|[^\n#]*?(?:##)?(?=\n|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { agendamentos, textoLimpo };
}

function extrairCPF(resposta: string): { cpf: string; textoLimpo: string } | null {
  const regex = /##ATUALIZAR_CPF\|([^#]+)##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return { cpf: match[1].trim(), textoLimpo: resposta.replace(regex, "").trim() };
}

const ETIQUETAS_VALIDAS_ANA = [
  "para_ele", "para_filho", "para_ambos", "tea", "tdah", "outro", "cannabis", "neuroacesso",
];

function extrairEtiquetas(resposta: string): { etiquetas: string[]; textoLimpo: string } | null {
  const regex = /##ETIQUETAS\|([^#]*)##/g;
  const encontradas: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(resposta)) !== null) {
    for (const parte of m[1].split(",")) {
      const chave = parte.trim().toLowerCase();
      if (ETIQUETAS_VALIDAS_ANA.includes(chave)) encontradas.push(chave);
    }
  }
  const textoLimpo = resposta.replace(/\n?##ETIQUETAS\|[^#]*##/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (encontradas.length === 0) return resposta === textoLimpo ? null : { etiquetas: [], textoLimpo };
  return { etiquetas: [...new Set(encontradas)], textoLimpo };
}

function extrairNascimento(resposta: string): { nascimento: string; textoLimpo: string } | null {
  const regex = /##ATUALIZAR_NASCIMENTO\|([^#]+)##/;
  const match = resposta.match(regex);
  if (!match) return null;
  return { nascimento: match[1].trim(), textoLimpo: resposta.replace(regex, "").trim() };
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
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return "[Áudio recebido - transcrição indisponível]";

    // Limpar base64: remover prefixo data URI, espaços, quebras de linha
    let cleanBase64 = base64Audio
      .replace(/^data:[^,]+,/, "")
      .replace(/[\s\r\n]/g, "")
      .replace(/[^A-Za-z0-9+/=]/g, "");
    
    // Garantir padding correto
    const remainder = cleanBase64.length % 4;
    if (remainder === 2) cleanBase64 += "==";
    else if (remainder === 3) cleanBase64 += "=";
    else if (remainder === 1) cleanBase64 = cleanBase64.slice(0, -1);

    console.log(`[whatsapp] 🎤 Base64 áudio: ${cleanBase64.length} chars (original: ${base64Audio.length})`);

    // Usar Gemini multimodal para transcrever áudio via chat completions
    // O gateway Lovable AI não suporta /v1/audio/transcriptions (Whisper)
    // Mas Gemini aceita áudio inline via content parts
    const mimeClean = mimetype.split(";")[0].trim(); // "audio/ogg"
    
    const res = await fetch(`${LOVABLE_AI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: cleanBase64,
                  format: mimeClean.includes("wav") ? "wav" : "mp3",
                },
              },
              {
                type: "text",
                text: "Transcreva exatamente o que a pessoa disse neste áudio em português brasileiro. Retorne APENAS a transcrição, sem comentários adicionais, sem aspas, sem prefixos como 'Transcrição:'. Se o áudio estiver inaudível ou vazio, retorne exatamente: [Áudio inaudível]",
              },
            ],
          },
        ],
        temperature: 0.1,
        max_completion_tokens: 2000,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const transcricao = data.choices?.[0]?.message?.content?.trim() || "[Áudio inaudível]";
      console.log(`[whatsapp] 🎤 Áudio transcrito via Gemini: "${transcricao.slice(0, 100)}"`);
      return transcricao;
    }
    const errText = await res.text();
    console.error(`[whatsapp] Gemini transcrição falhou: ${res.status} - ${errText.slice(0, 300)}`);
    return "[Áudio recebido - não foi possível transcrever]";
  } catch (err) {
    console.error("[whatsapp] Erro transcrição:", err);
    return "[Áudio recebido - erro na transcrição]";
  }
}

// =============================
// EXTRAIR TEXTO DE PDF VIA GPT-4o
// =============================
async function extrairTextoPDF(base64PDF: string): Promise<string> {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "[PDF recebido - extração de texto indisponível]";

    // Converter PDF base64 para blob e enviar como file para extração via Assistants API
    // Como GPT-4o não suporta PDF em vision, vamos usar uma abordagem alternativa:
    // Enviar o conteúdo como texto pedindo para o modelo interpretar
    const binaryStr = atob(base64PDF);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Tentar extrair texto puro do PDF (muitos PDFs têm texto legível nos bytes)
    const decoder = new TextDecoder("latin1");
    const rawText = decoder.decode(bytes);
    
    // Extrair strings legíveis do PDF (entre parênteses no formato PDF ou streams de texto)
    const textFragments: string[] = [];
    
    // Método 1: Extrair texto entre parênteses (operador Tj/TJ do PDF)
    const tjRegex = /\(([^)]{2,})\)/g;
    let match;
    while ((match = tjRegex.exec(rawText)) !== null) {
      const fragment = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (fragment.length > 1 && /[a-zA-ZÀ-ú0-9]/.test(fragment)) {
        textFragments.push(fragment);
      }
    }

    // Método 2: Procurar blocos de texto entre BT e ET (Text objects do PDF)
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    while ((match = btEtRegex.exec(rawText)) !== null) {
      const block = match[1];
      const innerTj = /\(([^)]+)\)\s*Tj/g;
      let innerMatch;
      while ((innerMatch = innerTj.exec(block)) !== null) {
        const frag = innerMatch[1].replace(/\\[nrt]/g, " ").trim();
        if (frag.length > 1 && /[a-zA-ZÀ-ú0-9]/.test(frag) && !textFragments.includes(frag)) {
          textFragments.push(frag);
        }
      }
    }

    const extractedText = textFragments.join(" ").replace(/\s+/g, " ").trim();

    if (extractedText.length > 20) {
      console.log(`[whatsapp] 📄 PDF texto extraído: ${extractedText.length} chars`);
      return extractedText.slice(0, 4000);
    }

    console.log(`[whatsapp] ⚠️ PDF sem texto legível extraído (${extractedText.length} chars). PDF pode ser escaneado/imagem.`);
    return "[PDF recebido - documento parece ser uma imagem escaneada. Peça ao paciente para descrever o conteúdo ou enviar uma foto legível.]";
  } catch (err) {
    console.error("[whatsapp] Erro extrair texto PDF:", err);
    return "[PDF recebido - erro na extração de texto]";
  }
}

function parseMegaResponseBody(responseText: string): unknown {
  const trimmed = responseText.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function megaResponseIndicaSucesso(status: number, parsedBody: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (parsedBody == null) return true;

  if (typeof parsedBody === "string") {
    const normalized = parsedBody.toLowerCase();
    if (normalized.includes("not_found") || normalized.includes("resource \"/\" not found") || normalized.includes("error")) {
      return false;
    }
    return true;
  }

  if (typeof parsedBody === "object") {
    const body = parsedBody as Record<string, unknown>;
    const explicitError = body.error === true;
    const nestedStatusCode = typeof body.statusCode === "number" ? body.statusCode : null;
    const nestedStatus = typeof body.status === "number" ? body.status : null;
    const nestedName = typeof body.name === "string" ? body.name.toLowerCase() : "";
    const nestedMessage = typeof body.message === "string" ? body.message.toLowerCase() : "";

    if (explicitError) return false;
    if (nestedStatusCode !== null && nestedStatusCode >= 400) return false;
    if (nestedStatus !== null && nestedStatus >= 400) return false;
    if (nestedName.includes("not_found")) return false;
    if (nestedMessage.includes("not found") || nestedMessage.includes("invalid") || nestedMessage.includes("unauthorized")) {
      return false;
    }
  }

  return true;
}

// =============================
// ENVIAR MENSAGEM VIA MEGAAPI
// =============================
async function enviarTexto(numero: string, texto: string, instanceKey = Deno.env.get("MEGA_INSTANCE_KEY") || ""): Promise<boolean> {
  const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
  const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
  if (!MEGA_API_URL || !MEGA_API_TOKEN) {
    console.error("[whatsapp] MEGA_API não configurada");
    return false;
  }

  const candidates = buildMegaTextCandidates(MEGA_API_URL, MEGA_API_TOKEN, numero, texto, instanceKey);
  let lastFailurePreview = "";

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, {
        method: "POST",
        headers: candidate.headers,
        body: JSON.stringify(candidate.body),
      });
      const responseText = await res.text();
      const parsedBody = parseMegaResponseBody(responseText);
      const sucesso = megaResponseIndicaSucesso(res.status, parsedBody);
      const preview = responseText.slice(0, 160);

      console.log(`[whatsapp] Envio texto (${candidate.label}): ${res.status} via ${candidate.url} | ${preview}`);

      if (sucesso) {
        console.log(`[whatsapp] ✅ MegaAPI aceitou envio por ${candidate.label}`);
        return true;
      }

      lastFailurePreview = `${candidate.label}: ${preview}`;
      console.warn(`[whatsapp] ⚠️ MegaAPI rejeitou candidate ${candidate.label} apesar do HTTP ${res.status}`);
    } catch (error) {
      console.error(`[whatsapp] Falha ao enviar texto (${candidate.label})`, error);
      lastFailurePreview = `${candidate.label}: ${String(error)}`;
    }
  }

  console.error(`[whatsapp] Nenhum endpoint da MegaAPI aceitou o envio do texto${lastFailurePreview ? ` | último erro: ${lastFailurePreview}` : ""}`);
  return false;
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
// Converte o payload OFICIAL do Meta (Graph / Datafy) para o formato interno
// que o restante desta função já entende (estilo MegaAPI).
// Registra os eventos de status (sent/delivered/read/failed) da API oficial,
// para sabermos se as mensagens realmente chegam ao destinatário.
async function registrarStatusCloud(raw: any): Promise<boolean> {
  const statuses = raw?.entry?.[0]?.changes?.[0]?.value?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) return false;
  try {
    const supabase = supabaseAdmin();
    await supabase.from("logs_decisao").insert(
      statuses.map((s: any) => ({
        evento: "whatsapp_status",
        regra_aplicada: "cloud_api",
        decisao: s.status || "desconhecido",
        dados_entrada: {
          numero: s.recipient_id,
          message_id: s.id,
          timestamp: s.timestamp,
          erros: s.errors ?? null,
          conversa: s.conversation ?? null,
        },
      })),
    );
    for (const s of statuses) {
      console.log(
        `[whatsapp][status] ${s.recipient_id} -> ${s.status}${
          s.errors ? " ERRO: " + JSON.stringify(s.errors).slice(0, 300) : ""
        }`,
      );
    }
  } catch (e) {
    console.error("[whatsapp][status] falha ao registrar:", e);
  }
  return true;
}

async function normalizarPayloadCloud(raw: any): Promise<any | null> {
  const change = raw?.entry?.[0]?.changes?.[0];
  const value = change?.value;
  if (!value) return null;

  // Ecos das nossas próprias mensagens (smb_message_echoes) não devem gerar resposta.
  if (String(change?.field || "").includes("echo")) return { __ignorar: true };
  if (Array.isArray(value.message_echoes)) return { __ignorar: true };

  const m = value.messages?.[0];
  if (!m) return { __ignorar: true }; // eventos de status (sent/delivered/read)



  const numero = m.from || value.contacts?.[0]?.wa_id || "";
  const nomeContato = value.contacts?.[0]?.profile?.name || "";
  const out: any = {
    key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, senderPn: numero },
    jid: numero,
    isGroup: false,
    sender: { phone: numero, name: nomeContato },
    message: {},
    messageType: "",
  };

  if (m.type === "text") {
    out.message.conversation = m.text?.body || "";
    out.messageType = "conversation";
    return out;
  }

  if (m.type === "interactive") {
    out.message.conversation =
      m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
    out.messageType = "conversation";
    return out;
  }

  const midiaTipos: Record<string, string> = {
    image: "imageMessage",
    audio: "audioMessage",
    voice: "audioMessage",
    document: "documentMessage",
    video: "videoMessage",
  };
  const chave = midiaTipos[m.type];
  if (chave) {
    const dados = m[m.type] || {};
    const baixado = await baixarMidiaDatafy(dados.id);
    out.messageType = chave;
    out.base64 = baixado?.base64;
    out.message[chave] = {
      mimetype: dados.mime_type || baixado?.mimetype || "",
      caption: dados.caption || "",
      fileName: dados.filename || "documento",
      base64: baixado?.base64,
    };
    return out;
  }

  return { __ignorar: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verificação do webhook (handshake do Meta/Datafy)
  if (req.method === "GET") {
    const u = new URL(req.url);
    const challenge = u.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { status: 200 });
    return new Response("ok", { status: 200 });
  }

  try {
    let body = await req.json();

    // Log cru: essencial para diagnosticar o formato exato que a Datafy envia.
    try {
      console.log("[whatsapp][raw]", JSON.stringify(body).slice(0, 1500));
    } catch { /* ignore */ }

    // A Datafy pode encapsular o payload oficial da Meta em { event, data } ou { payload }.
    const desembrulhar = (b: any): any => {
      const candidatos = [b, b?.data, b?.payload, b?.body, b?.data?.payload, b?.webhook_data];
      for (const c of candidatos) {
        if (c && (c.object === "whatsapp_business_account" || Array.isArray(c.entry))) return c;
      }
      return b;
    };
    body = desembrulhar(body);

    if (body?.object === "whatsapp_business_account" || body?.entry) {

      if (await registrarStatusCloud(body)) {
        return new Response(JSON.stringify({ status: "status_registrado" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const convertido = await normalizarPayloadCloud(body);

      if (convertido?.__ignorar) {
        return new Response(JSON.stringify({ status: "evento_ignorado" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (convertido) {
        console.log("[whatsapp] Payload oficial (Datafy/Meta) convertido");
        body = convertido;
      }
    }
    console.log("[whatsapp] Webhook recebido:", JSON.stringify(body).slice(0, 800));
    console.log("[whatsapp] Webhook top-level keys:", Object.keys(body).join(", "));
    if (body.message) console.log("[whatsapp] message keys:", Object.keys(body.message).join(", "));
    const instanceKey = body.instance_key || body.instanceKey || body.data?.instance_key || Deno.env.get("MEGA_INSTANCE_KEY") || "";

    // Extrair mensagem e número (formato MegaAPI)
    const msg = body.message || {};
    const mensagemTexto = msg.conversation || msg.text || msg.extendedTextMessage?.text || body.text?.message || body.data?.message?.conversation || "";

    const isFromMe = body.key?.fromMe || body.data?.key?.fromMe || false;
    const senderPn = body.key?.senderPn || "";
    const jid = body.jid || "";
    const remoteJid = body.key?.remoteJid || body.data?.key?.remoteJid || "";
    const rawNumero = isFromMe
      ? (remoteJid || senderPn || jid || body.sender?.phone || "")
      : (senderPn || jid || body.sender?.phone || remoteJid || "");
    const numero = rawNumero.replace("@s.whatsapp.net", "").replace("@lid", "").trim();

    const isGroup = body.isGroup || false;

    // Detectar mídia (imagem, áudio, documento)
    const midia = detectarMidia(body);
    const temMidia = midia !== null;
    const temTexto = !!mensagemTexto;

    console.log(`[whatsapp] Parsed: msg="${mensagemTexto.slice(0,50)}" num="${numero}" fromMe=${isFromMe} group=${isGroup} midia=${midia?.type || "nenhuma"}`);

    // Ignorar mensagens vazias (sem texto NEM mídia), sem número, ou de grupo
    if ((!temTexto && !temMidia) || !numero || isGroup) {
      console.log("[whatsapp] Ignorando: vazio/sem-numero/grupo");
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
        } else if (midia.type === "document" && midia.mimetype.includes("pdf")) {
          // PDF: extrair texto (GPT-4o vision não suporta PDF)
          const textoExtraido = await extrairTextoPDF(base64);
          mensagem = (midia.caption || mensagemTexto || "") + `\n\n[CONTEÚDO DO PDF ENVIADO PELO PACIENTE]:\n${textoExtraido}`;
          console.log(`[whatsapp] 📄 PDF processado: ${textoExtraido.slice(0, 80)}`);
        } else if (midia.type === "image" || midia.type === "document") {
          // Imagem ou documento não-PDF: enviar ao GPT-4o com vision
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verificar se o canal WhatsApp está ativo
    const { data: configCanal } = await supabase
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

    if (isFromMe) {
      console.log(`[whatsapp] 📤 fromMe detectado para ${numero} — ignorando (sem bloqueio humano)`);
      return new Response("ok");
    }

    // =============================
    // TRAVA DE CONCORRÊNCIA - evitar processar mesmo número em paralelo
    // =============================
    if (!(await tentarObterLockDB(supabase, numero))) {
      console.log(`[whatsapp] 🔒 Número ${numero} já está sendo processado — ignorando webhook duplicado`);
      return new Response(JSON.stringify({ status: "processamento_em_andamento" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bloqueio humano removido — Ana SEMPRE responde. Para pausar, desative o canal WhatsApp no painel.

    console.log(`[whatsapp] 📩 De ${numero}: "${mensagem.slice(0, 100)}"${imagemBase64ParaIA ? " [+imagem]" : ""}`);

    // Identidade única do contato (histórico pode ter sido gravado em formatos diferentes)
    const numeroCanonico = telCanonico(numero) || numero;
    const numeroVariacoes = telVariacoes(numero);
    const numerosBusca = numeroVariacoes.length ? Array.from(new Set([...numeroVariacoes, numero])) : [numero];

    // Toda conversa vira card no CRM
    await garantirLeadCRM(supabase, numero, body.pushName || body.sender?.pushName || null);


    // =============================
    // BUSCAR HISTÓRICO + PACIENTE + PROFISSIONAIS + TREINAMENTO EM PARALELO
    // =============================
    const [historicoResult, pacienteResult, profResult, treinamentoResult] = await Promise.all([
      supabase
        .from("interacoes_ia")
        .select("mensagem_usuario, resposta_final, criado_em")
        .in("paciente_externo_id", numerosBusca)
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
    let contextPaciente = pacienteResult.texto;
    let pacienteEncontrado = pacienteResult.paciente;
    const treinamentos = treinamentoResult.data || [];
    let cpfColetado = pacienteEncontrado?.cpf || extrairCpfTexto(mensagem) || "";
    let nascimentoColetado = "";

    if (!pacienteEncontrado) {
      const cpfDaConversa = extrairCpfTexto(
        [mensagem, ...(historico?.map((item) => item.mensagem_usuario || "") || [])].join("\n"),
      );

      if (cpfDaConversa) {
        const pacientePorCpf = await buscarPacientePorCPF(cpfDaConversa);
        if (pacientePorCpf) {
          pacienteEncontrado = pacientePorCpf;
          contextPaciente += `\n\n## CADASTRO DO PACIENTE (ENCONTRADO PELO CPF INFORMADO):
- Nome: ${pacientePorCpf.nome || "não informado"}
- CPF: ${cpfDaConversa}
- ID no sistema: ${pacientePorCpf.id}
IMPORTANTE: O paciente já existe no sistema. Pode seguir com o agendamento usando o cadastro localizado pelo CPF.`;
        }
      }
    }

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
        console.log(`[whatsapp] ✅ Profissionais filtrados: ${filtrados.map((p: any) => nomeProfissional(p)).join(", ")}`);
      } else {
        console.log(`[whatsapp] ⚠️ Nenhum profissional encontrado para especialidade, mostrando todos`);
      }
    }

    // Gerar contexto de profissionais filtrados
    let contextProfissionais = "";
    if (profissionaisParaContexto.length > 0) {
      const lista = profissionaisParaContexto.map((p: any) => {
        const id = p.id || p.professional_id || "";
        const nome = nomeProfissional(p);
        const esp = especialidadeProfissional(p);
        const espNorm = esp.charAt(0).toUpperCase() + esp.slice(1).toLowerCase();
        return `- ${nome} (${espNorm}) [ID: ${id}]`;
      }).join("\n");

      const headerProfissionais = profMencionado
        ? `## PROFISSIONAL SOLICITADO PELO PACIENTE (USE EXATAMENTE ESTE):`
        : `## PROFISSIONAIS DISPONÍVEIS PARA ESTA ESPECIALIDADE (USE SOMENTE ESTES):`;

      contextProfissionais = `\n\n${headerProfissionais}
${lista}

REGRA ABSOLUTA: Use SOMENTE os profissionais listados acima. NÃO sugira outros profissionais. NÃO confunda nomes.
${profMencionado ? `⚠️ O paciente PERGUNTOU ESPECIFICAMENTE por ${nomeProfissional(profMencionado)}. Responda sobre ESTE profissional, não outro.` : ""}
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

    // Triagem (quiz do site) do lead correspondente a este telefone
    try {
      const digitos = numero.replace(/\D/g, "");
      const variacoes = Array.from(new Set([
        numero,
        digitos,
        digitos.startsWith("55") ? digitos.slice(2) : `55${digitos}`,
      ].filter(Boolean)));
      const { data: leadTriagem } = await supabase
        .from("leads")
        .select("nome, nome_filho, dados_triagem, criado_em")
        .in("telefone", variacoes)
        .not("dados_triagem", "is", null)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      const interp = leadTriagem?.dados_triagem
        ? (leadTriagem.dados_triagem.interpretacao || interpretarTriagem(leadTriagem.dados_triagem))
        : null;
      if (interp) {
        contextExtra += `\n\n## TRIAGEM DESTE LEAD (quiz respondido no site — NUNCA cite pontuação ou "quiz" de forma técnica)\n${interp.resumo}`;
        if (leadTriagem?.nome_filho) contextExtra += `\nNome da criança: ${leadTriagem.nome_filho}`;
        if (leadTriagem?.dados_triagem?.idade) contextExtra += `\nIdade informada: ${leadTriagem.dados_triagem.idade}`;
      }
    } catch (e) {
      console.error("[whatsapp] Erro ao carregar triagem do lead:", e);
    }



    // Injetar treinamento do admin
    if (treinamentos.length > 0) {
      contextExtra += `\n\n## INSTRUÇÕES ADICIONAIS DO ADMINISTRADOR (SIGA TODAS COM PRIORIDADE MÁXIMA):\n`;
      for (const t of treinamentos) {
        contextExtra += `### ${t.titulo}\n${t.instrucao}\n\n`;
      }
    }

    // Montar mensagens para IA (suporte multimodal com vision)
    const historicoOrdenado: HistoricoInteracao[] = historico
      ? [...historico].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
      : [];

    // =============================
    // DETECTAR COMPROVANTE DE PAGAMENTO → tentar baixa automática + notificar admin
    // =============================
    if (ehComprovantePagamento(mensagem, midia?.type || null, historicoOrdenado)) {
      console.log(`[whatsapp] 💰 Comprovante de pagamento detectado para ${numero} — disparando baixa automática`);
      darBaixaPagamento(supabase, numero, pacienteEncontrado?.id || null, {
        tipo: midia?.type || "texto",
        mimetype: midia?.mimetype || "text/plain",
        descricao: mensagem.slice(0, 200),
      }).catch((e) => console.error("[whatsapp] Erro baixa pagamento:", e));
    }


    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: SYSTEM_ENGINE_WHATSAPP + contextExtra },
    ];

    if (historicoOrdenado.length > 0) {
      messages.push({
        role: "system",
        content: "ATENÇÃO: esta conversa já possui histórico. É PROIBIDO se apresentar novamente, repetir a saudação inicial ou reenviar a última resposta. É PROIBIDO repetir uma pergunta que você já fez antes (ex.: perguntar o nome duas vezes) — se o paciente não respondeu àquela pergunta, siga a conversa de outro jeito, acolha o que ele disse e avance para o próximo passo. Responda SOMENTE ao conteúdo mais recente do paciente e faça a conversa avançar.",
      });

      // RETOMADA DE CONVERSA FRIA: se ficou muitos dias parada, não continue
      // do ponto exato onde parou (ex.: cobrando pagamento) — reabra com escuta.
      const ultimoContatoMs = new Date(
        historicoOrdenado[historicoOrdenado.length - 1]?.criado_em || Date.now(),
      ).getTime();
      const diasParada = (Date.now() - ultimoContatoMs) / 86400000;
      if (diasParada >= 3) {
        messages.push({
          role: "system",
          content: `RETOMADA DE CONVERSA FRIA: esta conversa ficou ${Math.round(diasParada)} dias sem contato e o paciente acabou de voltar a falar.
- NÃO retome do ponto exato onde parou e NÃO repita informações que você já enviou antes (valores, formas de pagamento, links, orientações) como se nada tivesse acontecido.
- Se a pessoa JÁ recebeu as formas de pagamento/valores antes, NÃO os ofereça de novo: reconheça o tempo, seja acolhedora e entenda primeiro o que aconteceu e o que ela precisa agora.
- Faça a reabertura em 2 a 3 linhas: (1) acolha o retorno dela com calor humano, (2) faça UMA pergunta aberta para entender a situação atual (o que mudou, o que está pegando, o que ela precisa neste momento), (3) só depois de entender, conduza para o próximo passo.
- Nada de tom de cobrança. O objetivo desta mensagem é reconectar e compreender, não fechar.`,
        });
      }
    }


    // Adicionar histórico (do mais antigo ao mais recente)
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
    let respostaFinal = await gerarRespostaOpenAI(messages, Boolean(imagemBase64ParaIA));

    if (ehRespostaRepetidaOuIntroducao(respostaFinal, historicoOrdenado)) {
      console.warn(`[whatsapp] ⚠️ Resposta repetida detectada para ${numero}; tentando regenerar`);
      const retryMessages = [
        ...messages,
        {
          role: "system",
          content: "REFAÇA a resposta agora. É PROIBIDO repetir a saudação inicial, copiar a última resposta enviada ou agir como se fosse a primeira mensagem. Responda diretamente ao que o paciente acabou de dizer.",
        },
      ];
      respostaFinal = await gerarRespostaOpenAI(retryMessages, Boolean(imagemBase64ParaIA));
    }

    if (ehRespostaRepetidaOuIntroducao(respostaFinal, historicoOrdenado)) {
      console.warn(`[whatsapp] ⚠️ Resposta inválida persistente para ${numero}; usando fallback seguro`);
      respostaFinal = "";
    }

    // Fallback: só usar saudação se NÃO houver histórico (primeira interação)
    if (!respostaFinal) {
      if (historicoOrdenado.length === 0) {
        respostaFinal = `${getSaudacao()}! Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho 😊 Como você está? Estou à disposição!`;
      } else {
        const ultimaResposta = historicoOrdenado[historicoOrdenado.length - 1]?.resposta_final;
        respostaFinal = normalizarTextoComparacao(ultimaResposta) === normalizarTextoComparacao(FALLBACK_TECNICO)
          ? "Desculpe pela instabilidade. Já acionei uma revisão aqui e sigo à disposição para continuar por texto."
          : FALLBACK_TECNICO;
      }
      console.warn(`[whatsapp] ⚠️ Usando fallback (histórico: ${historicoOrdenado.length} msgs)`);
    }

    // =============================
    // DETECTAR ATUALIZAÇÃO DE CPF
    // =============================
    const cpfDetectado = extrairCPF(respostaFinal);
    if (cpfDetectado) {
      respostaFinal = cpfDetectado.textoLimpo;
      cpfColetado = cpfDetectado.cpf.replace(/\D/g, "");
      if (pacienteEncontrado?.id) {
        atualizarPacienteCPF(pacienteEncontrado.id, cpfDetectado.cpf)
          .then(ok => console.log(`[whatsapp] CPF atualizado: ${ok}`))
          .catch(err => console.error("[whatsapp] Erro atualizar CPF:", err));
      } else {
        const pacientePorCpf = await buscarPacientePorCPF(cpfDetectado.cpf);
        if (pacientePorCpf) {
          pacienteEncontrado = pacientePorCpf;
          cpfColetado = pacientePorCpf.cpf || cpfColetado;
        }
      }
    }

    // =============================
    // DETECTAR ATUALIZAÇÃO DE DATA DE NASCIMENTO
    // =============================
    const nascimentoDetectado = extrairNascimento(respostaFinal);
    if (nascimentoDetectado) {
      respostaFinal = nascimentoDetectado.textoLimpo;
      nascimentoColetado = nascimentoDetectado.nascimento;
      if (pacienteEncontrado?.id) {
        chamarGestao("update_patient", { patient_id: pacienteEncontrado.id, data_nascimento: nascimentoDetectado.nascimento })
          .then(r => console.log(`[whatsapp] Data nascimento atualizada: ${r.ok}`))
          .catch(err => console.error("[whatsapp] Erro atualizar nascimento:", err));
      }
    }

    // =============================
    // DETECTAR ETIQUETAS DO CRM
    // =============================
    const etiquetasDetectadas = extrairEtiquetas(respostaFinal);
    if (etiquetasDetectadas) {
      respostaFinal = etiquetasDetectadas.textoLimpo;
      if (etiquetasDetectadas.etiquetas.length > 0) {
        try {
          const leadEtiq = await buscarLead(supabase, numero, limparCpf(cpfColetado), "id, etiquetas");
          if (leadEtiq?.id) {
            const atuais: string[] = Array.isArray((leadEtiq as any).etiquetas) ? (leadEtiq as any).etiquetas : [];
            const merged = [...new Set([...atuais, ...etiquetasDetectadas.etiquetas])];
            if (merged.length !== atuais.length) {
              await supabase.from("leads").update({ etiquetas: merged }).eq("id", leadEtiq.id);
              console.log(`[whatsapp] Etiquetas atualizadas: ${merged.join(",")}`);
            }
          }
        } catch (err) {
          console.error("[whatsapp] Erro etiquetas:", err);
        }
      }
    }

    // =============================
    // CADASTRAR PACIENTE LOCALMENTE ASSIM QUE TIVER NOME + CPF (+ telefone do WhatsApp)
    // =============================
    try {
      const cpfLimpoLocal = limparCpf(cpfColetado);
      if (cpfLimpoLocal) {
        const leadLocal = await buscarLead(supabase, numero, cpfLimpoLocal, "id, nome, email, data_nascimento");

        const nomeLocal = (leadLocal?.nome || pacienteEncontrado?.nome || "").trim();
        if (nomeLocal && nomeLocal.split(/\s+/).length >= 2 && !/^whatsapp\s/i.test(nomeLocal)) {
          // Cadastro único de paciente (por CPF ou telefone, em qualquer formato)
          const pacienteId = await upsertPaciente(supabase, {
            nome: nomeLocal,
            telefone: numero,
            cpf: cpfLimpoLocal,
            email: leadLocal?.email || null,
            data_nascimento: nascimentoColetado || leadLocal?.data_nascimento || null,
          });
          if (pacienteId) console.log(`[whatsapp] ✅ Paciente único garantido: ${nomeLocal}`);

          // Mantém o lead do CRM sincronizado (sem criar card duplicado)
          if (leadLocal?.id) {
            await supabase.from("leads").update({
              nome: nomeLocal,
              cpf: cpfLimpoLocal,
              telefone: telCanonico(numero),
              ultima_interacao: new Date().toISOString(),
            }).eq("id", leadLocal.id);
          }
        }
      }
    } catch (err) {
      console.error("[whatsapp] Erro ao cadastrar paciente local:", err);
    }

    // =============================
    // DETECTAR AGENDAMENTOS CONFIRMADOS (suporta múltiplos)
    // =============================
    let agendamentosConfirmados = 0;
    let { agendamentos, textoLimpo: textoSemAgendamentos } = extrairAgendamentos(respostaFinal);

    // =============================
    // FALLBACK: Se a IA disse "agendado/marcado/confirmado" mas NÃO incluiu o marcador ##AGENDAMENTO_CONFIRMADO##
    // Isso acontece quando a IA "confirma" verbalmente mas esquece o marcador técnico
    // =============================
    if (agendamentos.length === 0) {
      const respostaNorm = respostaFinal.toLowerCase();
      const pareceuConfirmar = /(sua consulta.*(?:marcad|agendad|confirmad))|(?:marcad[oa].*para)|(?:agendad[oa].*para)|(?:confirmad[oa].*para)|(?:fica\s+marcad)|(?:está\s+(?:agendad|marcad|confirmad))/.test(respostaNorm);

      if (pareceuConfirmar) {
        console.warn(`[whatsapp] ⚠️ IA disse "agendado" mas SEM marcador ##AGENDAMENTO_CONFIRMADO##! Tentando extrair dados da conversa...`);

        // Tentar extrair dados do agendamento da resposta e histórico
        const dataMatch = respostaFinal.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/) || respostaFinal.match(/(\d{4})-(\d{2})-(\d{2})/);
        const horaMatch = respostaFinal.match(/(\d{1,2})[h:](\d{2})?/);
        
        // Buscar profissional mencionado na resposta
        let profIdFallback = "";
        let profNomeFallback = "";
        if (profResult?.raw) {
          const profDetectado = detectarProfissionalPorNome(respostaFinal, profResult.raw);
          if (profDetectado) {
            profIdFallback = profDetectado.id || profDetectado.professional_id || "";
            profNomeFallback = fixEncoding(profDetectado.full_name || profDetectado.name || "");
          }
        }

        // Se não encontrou na resposta, tentar pegar da última menção no histórico
        if (!profIdFallback && profissionaisParaContexto.length === 1) {
          profIdFallback = profissionaisParaContexto[0].id || profissionaisParaContexto[0].professional_id || "";
          profNomeFallback = fixEncoding(profissionaisParaContexto[0].full_name || profissionaisParaContexto[0].name || "");
        }

        const nomePacienteFallback = pacienteEncontrado?.nome || "";
        
        if (dataMatch && horaMatch && profIdFallback && nomePacienteFallback) {
          let dataFormatada = "";
          if (dataMatch[0].includes("-")) {
            dataFormatada = dataMatch[0]; // já YYYY-MM-DD
          } else {
            const dia = dataMatch[1];
            const mes = dataMatch[2];
            const ano = dataMatch[3] || new Date().getFullYear().toString();
            dataFormatada = `${ano}-${mes}-${dia}`;
          }
          const hora = horaMatch[1].padStart(2, "0");
          const minuto = (horaMatch[2] || "00").padStart(2, "0");
          const horarioFormatado = `${hora}:${minuto}`;
          
          console.log(`[whatsapp] 🔧 Fallback: reconstruindo agendamento: ${nomePacienteFallback} | ${dataFormatada} ${horarioFormatado} | prof=${profIdFallback} (${profNomeFallback})`);
          agendamentos = [{
            nome: nomePacienteFallback,
            data: dataFormatada,
            horario: horarioFormatado,
            professionalId: profIdFallback,
          }];
          textoSemAgendamentos = respostaFinal; // manter o texto como está (sem marcador para remover)
        } else {
          console.warn(`[whatsapp] ⚠️ Fallback incompleto: nome=${nomePacienteFallback || "?"} data=${dataMatch?.[0] || "?"} hora=${horaMatch?.[0] || "?"} prof=${profIdFallback || "?"}`);
          // Notificar admin sobre confirmação sem agendamento real
          const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
          if (adminNumber) {
            enviarTexto(adminNumber, `⚠️ *Ana confirmou agendamento verbalmente mas NÃO registrou na agenda*\n📱 Paciente: ${numero}\n💬 Resposta: "${respostaFinal.slice(0, 200)}"\n\n⚡ Favor verificar e registrar manualmente.`, instanceKey).catch(() => {});
          }
        }
      }
    }
    // Mensagens extras a enviar APÓS a resposta principal (ex.: orientações + Pix pós-agendamento)
    const mensagensExtras: string[] = [];

    if (agendamentos.length > 0) {
      respostaFinal = textoSemAgendamentos;
      const patientId = pacienteEncontrado?.id || "";
      console.log(`[whatsapp] 📋 ${agendamentos.length} agendamento(s) detectado(s)`);

      // Buscar triagem do lead UMA vez para anexar nas observações da consulta
      const triagemTexto = await buscarTriagemDoLead(
        supabase,
        numero,
        cpfColetado || pacienteEncontrado?.cpf || undefined,
      );
      if (triagemTexto) {
        console.log(`[whatsapp] 📝 Triagem encontrada — anexando às observações do agendamento (${triagemTexto.length} chars)`);
      }

      // 🏷️ TIPO DE CONSULTA: só existe a consulta com a Dra. Amélia — nunca encaminhar para clínico geral/especialista
      const decisaoConsulta: DecisaoConsulta = {
        tipo: "especialista",
        valor: 500,
        valorTexto: "R$ 500,00",
        especialidadeSugerida: "Dra. Amélia Carvalho",
        justificativa: "sua consulta é diretamente com a Dra. Amélia Carvalho",
        tag: "CONSULTA - DRA. AMÉLIA CARVALHO",
      };
      console.log(`[whatsapp] 🏷️ Tipo de consulta decidido pela triagem: ${decisaoConsulta.tag} | ${decisaoConsulta.valorTexto}`);

      // Processar TODOS os agendamentos em paralelo - AGUARDAR resultado antes de enviar mensagem
      const results = await Promise.all(agendamentos.map(async (ag, idx) => {
        console.log(`[whatsapp] Agendamento ${idx + 1}/${agendamentos.length}: ${ag.nome} | ${ag.data} ${ag.horario} | prof=${ag.professionalId} | tag=${decisaoConsulta.tag}`);
        const [gestaoOk, crmOk] = await Promise.all([
          registrarAgendamento(ag.nome, numero, ag.data, ag.horario, ag.professionalId, patientId, {
            cpf: cpfColetado || pacienteEncontrado?.cpf || undefined,
            email: pacienteEncontrado?.email || undefined,
            dataNascimento: nascimentoColetado || undefined,
            triagemTexto,
            tagConsulta: decisaoConsulta.tag,
          }),
          idx === 0 ? criarLeadCRM(supabase, ag.nome, numero, {
            cpf: cpfColetado || pacienteEncontrado?.cpf || undefined,
            email: pacienteEncontrado?.email || undefined,
            dataNascimento: nascimentoColetado || undefined,
            data: ag.data,
            horario: ag.horario,
          }) : Promise.resolve(true),
        ]);

        await supabase.from("logs_decisao").insert({
          evento: "agendamento_whatsapp_confirmado",
          decisao: `gestao=${gestaoOk ? "ok" : "FALHA"}, crm=${crmOk ? "ok" : "falha"}, tag=${decisaoConsulta.tag}`,
          regra_aplicada: "whatsapp_maria_agendamento_auto",
          dados_entrada: {
            nome: ag.nome, telefone: numero, data: ag.data, horario: ag.horario,
            professional_id: ag.professionalId, patient_id: patientId, indice: idx + 1, total: agendamentos.length,
            triagem_anexada: !!triagemTexto,
            tipo_consulta: decisaoConsulta.tipo,
            valor_consulta: decisaoConsulta.valor,
            especialidade_sugerida: decisaoConsulta.especialidadeSugerida,
          },
          confianca: 1.0,
        });
        console.log(`[whatsapp] ${gestaoOk ? "✅" : "❌"} Agendamento ${idx + 1}: Gestão=${gestaoOk}, CRM=${crmOk}, Tag=${decisaoConsulta.tag}`);
        return { gestaoOk, crmOk, ag };
      }));

      agendamentosConfirmados = results.filter((r) => r.gestaoOk).length;

      // Verificar se algum agendamento FALHOU no sistema de gestão
      const falharam = results.filter((r) => !r.gestaoOk);
      if (falharam.length > 0) {
        console.error(`[whatsapp] ❌ ${falharam.length} agendamento(s) FALHARAM no sistema de gestão`);

        if (agendamentosConfirmados === 0) {
          respostaFinal = `Tive uma instabilidade ao registrar esse horário no sistema agora. Vou refazer a verificação da agenda e seguir com você por aqui em instantes. ✅`;
        } else {
          respostaFinal += `\n\n⚠️ Um dos horários não concluiu no sistema e já estou refazendo a verificação por aqui.`;
        }

        // Notificar admin sobre falha
        const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
        if (adminNumber) {
          const falhaDetalhes = falharam.map((f) => `${f.ag.nome} | ${f.ag.data} ${f.ag.horario} | prof=${f.ag.professionalId || "sem_id"}`).join("; ");
          enviarTexto(adminNumber, `⚠️ *AGENDAMENTO FALHOU NO SISTEMA*\n📱 Paciente: ${numero}\n📋 Dados: ${falhaDetalhes}\n\n⚡ Favor registrar/validar manualmente no sistema de gestão.`, instanceKey).catch(() => {});
        }
      }

      // Após o agendamento confirmado → apenas UMA mensagem de orientações (sem análise de triagem, sem repetir valores)
      if (agendamentosConfirmados > 0) {
        const nomePaciente = pacienteEncontrado?.nome?.split(" ")[0] || agendamentos[0]?.nome?.split(" ")[0] || "";
        const ola = nomePaciente ? `${nomePaciente}, ` : "";

        const itens = [
          `1. *Anote suas dúvidas* antes da consulta para tirar todas com a Dra. Amélia.`,
          `2. Tenha clareza dos *sintomas e observações do dia a dia* (no caso de criança, traga também relatos da escola).`,
        ];
        // Só pedir a triagem se ela AINDA não foi preenchida
        if (!triagemTexto) {
          itens.push(`3. *Preencha o formulário de triagem* (essencial para a Dra. entender seu caso): https://draameliacarvalho.com/quiz/`);
        }

        mensagensExtras.push(
          `📋 *Orientações para sua consulta*\n\n` +
          `${ola}separei o essencial pra você aproveitar ao máximo o atendimento 💚\n\n` +
          itens.join("\n")
        );

        // Boas-vindas + política de atendimento (enviada só depois do agendamento)
        mensagensExtras.push(
          `💚 *Boas-vindas à clínica da Dra. Amélia Carvalho*\n\n` +
          `É com muita alegria que a Dra. Amélia e a equipe recebem você e sua família em um espaço dedicado ao cuidado integral da saúde mental. ` +
          `Nosso compromisso é um atendimento acolhedor, empático e com base nas evidências mais atuais, para que essa jornada seja leve e transformadora 🌿`
        );

        mensagensExtras.push(
          `📌 *Como funciona o atendimento*\n\n` +
          `• A consulta individual com a Dra. Amélia é de *R$ 500,00*, com avaliação de aproximadamente *40 minutos* (podendo ser menor ou maior conforme as queixas e a avaliação clínica do momento).\n` +
          `• Para reservar o horário exclusivamente para o seu atendimento, entra um *sinal de 30% (R$ 150,00)* no Pix no ato do agendamento; o *restante (R$ 350,00)* é pago no dia da consulta.\n` +
          `• No cartão de crédito, você mesmo(a) escolhe em quantas vezes deseja dividir (com o acréscimo da taxa da máquina).\n` +
          `• Conforme as diretrizes do Conselho Federal de Medicina (CFM), as consultas em psiquiatria são compreendidas como sessões de acompanhamento e tratamento, não incluindo retorno avulso.\n\n` +
          `Qualquer dúvida, é só me chamar aqui — estou por perto 💚`
        );

        mensagensExtras.push(
          `📝 *Sobre receitas e documentos*\n\n` +
          `As receitas médicas são um ato de grande responsabilidade e exigem avaliação e entrevista cuidadosas. Por isso, são fornecidas receitas com a quantidade máxima de medicamentos para o período recomendado até a próxima consulta (ex.: receita para 2 meses, se a nova consulta for em 2 meses). ` +
          `Não são emitidas receitas fora do ambiente do consultório médico, garantindo a segurança e a adequação do tratamento.\n\n` +
          `Essas diretrizes existem para otimizar o acesso ao atendimento, reduzir o tempo de espera e assegurar agilidade na confecção dos documentos essenciais para o tratamento. Contamos com sua compreensão e colaboração para mantermos a excelência e o acolhimento que sua família merece.\n\n` +
          `Desde já, agradecemos a confiança em nosso trabalho.\n\n` +
          `Com carinho,\n*Dra. Amélia Carvalho e Equipe* 💚`
        );
      }
    }

    // =============================
    // DETECTAR ENCAMINHAMENTO HUMANO
    // =============================
    // Limpar qualquer marcador residual de encaminhamento (não usado mais)
    respostaFinal = respostaFinal.replace(/##ENCAMINHAR_HUMANO##/g, "").trim();

    // Pedido do material do Método NeuroAcesso → enviar PDF após a resposta
    const enviarPdfNeuroacesso = /##ENVIAR_PDF_NEUROACESSO##/i.test(respostaFinal);
    respostaFinal = respostaFinal.replace(/##ENVIAR_PDF_NEUROACESSO##/gi, "").trim();

    // QR Code do Pix do sinal de 30% → enviar PDF após a resposta
    // Sempre enviar quando um agendamento foi confirmado agora (mesmo se a IA esquecer o marcador)
    const enviarPixQr = /##ENVIAR_QRCODE_PIX##/i.test(respostaFinal) || agendamentosConfirmados > 0;
    respostaFinal = respostaFinal.replace(/##ENVIAR_QRCODE_PIX##/gi, "").trim();

    // =============================
    // ENVIAR RESPOSTA (com verificação FRESCA de duplicação no banco)
    // =============================
    console.log(`[whatsapp] 📤 Resposta: "${respostaFinal.slice(0, 100)}..."`);

    // Verificação FRESCA no banco — recarrega a última resposta AGORA (não do cache do início)
    const { data: ultimaFresca } = await supabase
      .from("interacoes_ia")
      .select("resposta_final, criado_em")
      .in("paciente_externo_id", numerosBusca)
      .eq("canal", "whatsapp")
      .not("resposta_final", "is", null)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimaRespostaFresca = ultimaFresca?.resposta_final;
    if (normalizarTextoComparacao(ultimaRespostaFresca) === normalizarTextoComparacao(respostaFinal)) {
      console.warn(`[whatsapp] ⚠️ Bloqueando reenvio duplicado (check fresco) para ${numero}`);
      await liberarLockDB(supabase, numero);
      return new Response(JSON.stringify({ status: "resposta_duplicada_bloqueada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar também se é saudação repetida quando já tem histórico
    if (ultimaFresca && ehSaudacaoPadraoAna(respostaFinal)) {
      console.warn(`[whatsapp] ⚠️ Bloqueando saudação repetida (já existe histórico) para ${numero}`);
      await liberarLockDB(supabase, numero);
      return new Response(JSON.stringify({ status: "saudacao_repetida_bloqueada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delayMs = 3000 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const mensagemPersistida = (midia ? `[${midia.type}] ` : "") + mensagem.slice(0, 5000);
    const payloadInteracao = {
      paciente_externo_id: numeroCanonico,
      canal: "whatsapp",
      sistema_origem: "megaapi",
      mensagem_usuario: mensagemPersistida,
      resposta_final: respostaFinal.slice(0, 5000),
      intencao_detectada: agendamentos.length > 0
        ? (agendamentosConfirmados > 0 ? "agendamento" : "agendamento_pendente")
        : null,
      estado_conversa: agendamentos.length > 0 && agendamentosConfirmados === agendamentos.length
        ? "finalizado"
        : "em_andamento",
      supervisionado: false,
    };

    const { data: interacaoSalva, error: preSaveError } = await supabase
      .from("interacoes_ia")
      .insert(payloadInteracao)
      .select("id")
      .maybeSingle();

    if (preSaveError) {
      console.error("[whatsapp] Erro ao pré-salvar interação antes do envio:", preSaveError);
    }

    const envioOk = await enviarTexto(numero, respostaFinal, instanceKey);

    if (enviarPdfNeuroacesso) {
      enviarDocumentoMega(
        numero,
        NEUROACESSO_PDF_URL,
        "Metodo-NeuroAcesso.pdf",
        "Apresentação do Método NeuroAcesso 💚",
      ).catch((e) => console.error("[whatsapp] falha ao enviar PDF NeuroAcesso:", e));
    }

    if (enviarPixQr) {
      enviarDocumentoMega(
        numero,
        PIX_QRCODE_PDF_URL,
        "QRCode-Pix-Consulta.pdf",
        "QR Code do Pix para o sinal de R$ 150,00 (30%) 💚 Chave Pix: consultasdraameliacarvalho@gmail.com",
      ).catch((e) => console.error("[whatsapp] falha ao enviar QR Code Pix:", e));
    }

    if (!envioOk) {
      if (interacaoSalva?.id) {
        await supabase
          .from("interacoes_ia")
          .update({ intencao_detectada: "erro_envio", estado_conversa: "erro_envio" })
          .eq("id", interacaoSalva.id);
      }
      await liberarLockDB(supabase, numero);
      return new Response(JSON.stringify({ status: "erro_envio_megaapi" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gerar e enviar áudio em background
    gerarAudioElevenLabs(respostaFinal, supabase).then(async (audioUrl) => {
      if (audioUrl) await enviarAudio(numero, audioUrl);
    }).catch(err => console.error("[whatsapp] Erro envio áudio:", err));

    // Enviar mensagens extras (orientações + Pix) com pequeno delay entre cada uma
    if (mensagensExtras.length > 0) {
      console.log(`[whatsapp] 📨 Enviando ${mensagensExtras.length} mensagem(ns) extra(s) pós-agendamento`);
      (async () => {
        for (const extra of mensagensExtras) {
          await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1000));
          const ok = await enviarTexto(numero, extra, instanceKey);
          if (ok) {
            await supabase.from("interacoes_ia").insert({
              paciente_externo_id: numeroCanonico,
              canal: "whatsapp",
              sistema_origem: "megaapi",
              mensagem_usuario: null,
              resposta_final: extra.slice(0, 5000),
              intencao_detectada: "pos_agendamento_automatico",
              estado_conversa: "finalizado",
              supervisionado: false,
            });
          }
        }
      })().catch((e) => console.error("[whatsapp] Erro mensagens extras:", e));
    }

    // Atualizar o CRM automaticamente com base na conversa (não bloqueia a resposta)
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ana-atualizar-crm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ numero }),
    }).catch((e) => console.error("[whatsapp] Erro ao atualizar CRM:", e));

    await liberarLockDB(supabase, numero);
    return new Response("ok");
  } catch (err) {
    // Tentar liberar lock mesmo em caso de erro
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      // Limpar todos os locks expirados como safety net
      await sb.from("locks_processamento").delete().lt("criado_em", new Date(Date.now() - 60000).toISOString());
    } catch (_) {}
    console.error("[whatsapp] Erro geral:", err);
    return new Response("erro", { status: 500 });
  }
});
