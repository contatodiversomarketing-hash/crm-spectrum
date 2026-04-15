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

type HistoricoInteracao = {
  mensagem_usuario?: string | null;
  resposta_final?: string | null;
  criado_em?: string | null;
};

const HUMAN_HANDOFF_MINUTES = 120;

// Detectar prefixo de identificação: "R:", "MR:", "r:", "mr:", "R ", "MR " etc.
function detectarPrefixoAtendente(texto?: string | null): { atendente: string; textoLimpo: string } {
  if (!texto) return { atendente: "", textoLimpo: texto || "" };
  const trimmed = texto.trimStart();
  
  // Padrões de prefixo: R: MR: r: mr: R- MR- com ou sem espaço depois
  const prefixRebeka = /^[Rr]\s*[:;\-\.]\s*/;
  const prefixMaria = /^[Mm][Rr]\s*[:;\-\.]\s*/;
  
  if (prefixMaria.test(trimmed)) {
    return { atendente: "Maria Rita", textoLimpo: trimmed.replace(prefixMaria, "").trim() };
  }
  if (prefixRebeka.test(trimmed)) {
    return { atendente: "Rebeka", textoLimpo: trimmed.replace(prefixRebeka, "").trim() };
  }
  
  return { atendente: "", textoLimpo: texto };
}

function detectarAtendentePorTexto(texto?: string | null): string {
  const textoId = normalizarTextoComparacao(texto);
  if (!textoId) return "";

  // Primeiro checar prefixo
  const { atendente } = detectarPrefixoAtendente(texto);
  if (atendente) return atendente;

  const patternsRebeka = [
    /\b(?:sou|chamo|me chamo|eu sou|aqui e|aqui eh)\s*(?:a\s+)?rebeka\b/,
    /\brebeka\b.*\b(aqui|falando|da vitta care)\b/,
    /\bbom dia[^\n]*\brebeka\b/,
    /\bboa tarde[^\n]*\brebeka\b/,
    /\bboa noite[^\n]*\brebeka\b/,
  ];

  const patternsMaria = [
    /\b(?:sou|chamo|me chamo|eu sou|aqui e|aqui eh)\s*(?:a\s+)?maria(?:\s+rita)?\b/,
    /\bmaria(?:\s+rita)?\b.*\b(aqui|falando|da vitta care)\b/,
    /\bbom dia[^\n]*\bmaria(?:\s+rita)?\b/,
    /\bboa tarde[^\n]*\bmaria(?:\s+rita)?\b/,
    /\bboa noite[^\n]*\bmaria(?:\s+rita)?\b/,
  ];

  if (patternsRebeka.some((pattern) => pattern.test(textoId))) return "Rebeka";
  if (patternsMaria.some((pattern) => pattern.test(textoId))) return "Maria Rita";

  return "";
}

function normalizarTextoComparacao(texto?: string | null): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ehSaudacaoPadraoSofIA(texto?: string | null): boolean {
  const normalizado = normalizarTextoComparacao(texto);
  return normalizado.includes("aqui e a sofia da vitta care") && (
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

  if (historico.length > 0 && ehSaudacaoPadraoSofIA(resposta)) {
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
      const aiResp = await fetch(`${LOVABLE_AI_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: usarVision ? 800 : 300,
          messages,
        }),
      });

      if (aiResp.ok) {
        const data = await aiResp.json();
        const resposta = data?.choices?.[0]?.message?.content;
        if (resposta) {
          console.log(`[whatsapp] ✅ Resposta via Lovable AI (${model})`);
          return resposta;
        }
        console.warn(`[whatsapp] ⚠️ Lovable AI sem choices: ${JSON.stringify(data).slice(0, 300)}`);
      } else {
        const errBody = await aiResp.text();
        console.error(`[whatsapp] ❌ Lovable AI HTTP ${aiResp.status}: ${errBody.slice(0, 500)}`);
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

async function buscarBloqueioHumanoAtivo(supabase: any, numero: string) {
  const { data, error } = await supabase
    .from("memorias_ia")
    .select("id, bloqueio_ate, resumo_contextual")
    .eq("paciente_externo_id", numero)
    .order("ultima_interacao", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] Erro ao buscar memória de bloqueio:", error);
    return null;
  }

  if (!data?.bloqueio_ate) return null;
  if (new Date(data.bloqueio_ate).getTime() <= Date.now()) return null;
  return data;
}

async function registrarBloqueioHumano(supabase: any, numero: string, motivo: string, minutos = HUMAN_HANDOFF_MINUTES) {
  const agora = new Date().toISOString();
  const bloqueioAte = new Date(Date.now() + minutos * 60 * 1000).toISOString();
  const payload = {
    paciente_externo_id: numero,
    bloqueio_ate: bloqueioAte,
    ultima_interacao: agora,
    resumo_contextual: motivo.slice(0, 500),
  };

  const { data: existente, error: buscaError } = await supabase
    .from("memorias_ia")
    .select("id")
    .eq("paciente_externo_id", numero)
    .order("ultima_interacao", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (buscaError) {
    console.error("[whatsapp] Erro ao localizar memória para bloqueio humano:", buscaError);
    return;
  }

  if (existente?.id) {
    const { error } = await supabase.from("memorias_ia").update(payload).eq("id", existente.id);
    if (error) console.error("[whatsapp] Erro ao atualizar bloqueio humano:", error);
    return;
  }

  const { error } = await supabase.from("memorias_ia").insert(payload);
  if (error) console.error("[whatsapp] Erro ao criar bloqueio humano:", error);
}

// Mapa de número pessoal -> nome da atendente
const ATENDENTE_POR_NUMERO: Record<string, string> = {};
// Este mapa será preenchido dinamicamente via logs. Por enquanto, usamos o participant do webhook.

async function processarMensagemFromMe(supabase: any, numero: string, texto: string, participantNumber?: string, pushName?: string) {
  // Detectar prefixo de identificação ANTES de normalizar
  const { atendente: atendenteViaPrefixo, textoLimpo } = detectarPrefixoAtendente(texto);
  if (atendenteViaPrefixo) {
    console.log("[whatsapp] Atendente identificado via prefixo: " + atendenteViaPrefixo);
  }
  
  const textoNormalizado = normalizarTextoComparacao(textoLimpo);
  if (!textoNormalizado) return;

  // Log participant para mapeamento futuro
  console.log(`[whatsapp] 🔍 fromMe details: participant=${participantNumber || "N/A"} pushName="${pushName || "N/A"}" paciente=${numero}`);

  const { data: ultimaInteracao, error } = await supabase
    .from("interacoes_ia")
    .select("resposta_final, criado_em")
    .eq("paciente_externo_id", numero)
    .eq("canal", "whatsapp")
    .not("resposta_final", "is", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] Erro ao verificar última resposta da IA:", error);
    return;
  }

  const ultimaRespostaIA = normalizarTextoComparacao(ultimaInteracao?.resposta_final);
  if (ultimaRespostaIA && ultimaRespostaIA === textoNormalizado) {
    console.log(`[whatsapp] Mensagem fromMe reconhecida como envio da própria SofIA para ${numero}`);
    return;
  }

  // Identificar atendente humano via participant do webhook OU CRM
  const CONSULTOR_MAP: Record<string, string> = {
    "bc0e58c4-ac38-4dff-9f82-6fa1d22659c5": "Rebeka",
    "ed25df52-ec5f-48cc-b1af-2f32d3b42a83": "Maria Rita",
  };

  let nomeAtendente = atendenteViaPrefixo || "";

  // 1. Tentar identificar via participant (número pessoal de quem digitou)
  if (participantNumber && ATENDENTE_POR_NUMERO[participantNumber]) {
    nomeAtendente = ATENDENTE_POR_NUMERO[participantNumber];
    console.log(`[whatsapp] ✅ Atendente identificado via participant: ${nomeAtendente} (${participantNumber})`);
  }

  // 1b. Tentar identificar via pushName (nome do contato no WhatsApp)
  if (!nomeAtendente && pushName) {
    const pushLower = pushName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (pushLower.includes("rebeka")) {
      nomeAtendente = "Rebeka";
      console.log(`[whatsapp] ✅ Atendente identificado via pushName: Rebeka ("${pushName}")`);
    } else if (pushLower.includes("maria rita")) {
      nomeAtendente = "Maria Rita";
      console.log(`[whatsapp] ✅ Atendente identificado via pushName: Maria Rita ("${pushName}")`);
    } else {
      nomeAtendente = detectarAtendentePorTexto(pushName);
      if (nomeAtendente) {
        console.log(`[whatsapp] ✅ Atendente identificado via pushName flexível: ${nomeAtendente} ("${pushName}")`);
      }
    }
  }

  // 1c. Tentar identificar via conteúdo da mensagem (auto-identificação)
  // Ex: "bom dia me chamo Maria", "oi sou a Rebeka", "aqui é a Maria Rita"
  if (!nomeAtendente) {
    nomeAtendente = detectarAtendentePorTexto(textoNormalizado);
    if (nomeAtendente) {
      console.log(`[whatsapp] ✅ Atendente identificado via texto da mensagem: ${nomeAtendente}`);
    }
  }

  // 2. Se não identificou via participant/pushName/texto, tentar via CRM
  if (!nomeAtendente) {
    try {
      const crmUrl = Deno.env.get("CRM_API_URL");
      const crmToken = Deno.env.get("CRM_API_TOKEN");
      if (crmUrl && crmToken) {
        const normalize = (t: string) => (t || "").replace(/\D/g, "");
        const numNorm = normalize(numero);

        // 2a. Tentar endpoint direto paciente-por-telefone (mais rápido)
        try {
          const resPaciente = await fetch(`${crmUrl}paciente-por-telefone?telefone=${encodeURIComponent(numero)}`, {
            headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
          });
          if (resPaciente.ok) {
            const pacData = await resPaciente.json();
            const consultorId = pacData?.consultor_id || pacData?.lead?.consultor_id || "";
            console.log(`[whatsapp] 🔍 CRM paciente-por-telefone: consultor_id=${consultorId} para ${numero}`);
            if (consultorId && CONSULTOR_MAP[consultorId]) {
              nomeAtendente = CONSULTOR_MAP[consultorId];
              console.log(`[whatsapp] ✅ Atendente identificado via CRM direto: ${nomeAtendente} (consultor_id=${consultorId})`);
            }
          }
        } catch (e2) {
          console.warn("[whatsapp] Erro paciente-por-telefone:", e2);
        }

        // 2b. Fallback: buscar nos leads por telefone
        if (!nomeAtendente) {
          const numVariations = new Set([numNorm]);
          if (numNorm.startsWith("55")) {
            numVariations.add(numNorm.slice(2));
            const semDDI = numNorm.slice(2);
            if (semDDI.length === 11 && semDDI[2] === "9") {
              numVariations.add(semDDI.slice(0, 2) + semDDI.slice(3));
              numVariations.add("55" + semDDI.slice(0, 2) + semDDI.slice(3));
            }
          } else if (numNorm.length === 11 && numNorm[2] === "9") {
            numVariations.add("55" + numNorm);
            numVariations.add(numNorm.slice(0, 2) + numNorm.slice(3));
            numVariations.add("55" + numNorm.slice(0, 2) + numNorm.slice(3));
          }

          for (let page = 1; page <= 3; page++) {
            const res = await fetch(`${crmUrl}api-leads?limit=500&page=${page}&periodo_dias=365`, {
              headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
            });
            if (!res.ok) {
              console.warn(`[whatsapp] CRM api-leads page ${page} retornou status ${res.status}`);
              break;
            }
            const data = await res.json();
            const leads = data?.leads || [];
            for (const lead of leads) {
              const tel = normalize(lead.telefone || "");
              if (!tel) continue;
              const consultorId = lead.consultor_id || "";
              const telVariations = new Set([tel]);
              if (tel.startsWith("55")) {
                telVariations.add(tel.slice(2));
                const semDDI = tel.slice(2);
                if (semDDI.length === 11 && semDDI[2] === "9") {
                  telVariations.add(semDDI.slice(0, 2) + semDDI.slice(3));
                }
              } else if (tel.length === 11 && tel[2] === "9") {
                telVariations.add("55" + tel);
                telVariations.add(tel.slice(0, 2) + tel.slice(3));
              }
              for (const v of numVariations) {
                if (telVariations.has(v)) {
                  if (CONSULTOR_MAP[consultorId]) {
                    nomeAtendente = CONSULTOR_MAP[consultorId];
                    console.log(`[whatsapp] ✅ Atendente identificado via CRM leads: ${nomeAtendente} (consultor_id=${consultorId}, tel=${tel})`);
                  } else if (consultorId) {
                    console.log(`[whatsapp] ⚠️ Lead encontrado no CRM mas consultor_id="${consultorId}" não está mapeado. Tel=${tel}`);
                  } else {
                    console.log(`[whatsapp] ⚠️ Lead encontrado no CRM sem consultor_id. Tel=${tel}`);
                  }
                  break;
                }
              }
              if (nomeAtendente) break;
            }
            if (nomeAtendente) break;
            if (page >= (data?.paginacao?.total_pages || 1)) break;
          }
        }
      } else {
        console.warn("[whatsapp] CRM_API_URL ou CRM_API_TOKEN não configurados");
      }
    } catch (e) {
      console.warn("[whatsapp] Erro ao buscar consultor do CRM:", e);
    }
  }

  console.log("[whatsapp] Resultado identificacao para " + numero + ": atendente=" + (nomeAtendente || "Humano (nao identificado)"));


  // Salvar resposta humana como interação no banco
  const textoHumano = textoLimpo.slice(0, 5000);
  await supabase.from("interacoes_ia").insert({
    paciente_externo_id: numero,
    sistema_origem: "megaapi",
    canal: "whatsapp",
    mensagem_usuario: null,
    resposta_final: textoHumano,
    supervisionado: true,
    atendente_humano: nomeAtendente || "Humano",
    intencao_detectada: "resposta_humana",
    estado_conversa: "handoff_humano",
  });
  console.log("[whatsapp] Resposta humana salva: " + textoHumano.slice(0, 50) + "... por " + (nomeAtendente || "Humano"));

  // Marcar interações recentes desse paciente como supervisionadas com atendente
  if (nomeAtendente) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from("interacoes_ia")
      .update({ atendente_humano: nomeAtendente })
      .eq("paciente_externo_id", numero)
      .eq("supervisionado", true)
      .in("atendente_humano", ["Humano", ""])
      .gte("criado_em", thirtyMinAgo);

    await supabase
      .from("interacoes_ia")
      .update({ atendente_humano: nomeAtendente })
      .eq("paciente_externo_id", numero)
      .eq("supervisionado", true)
      .is("atendente_humano", null)
      .gte("criado_em", thirtyMinAgo);
    console.log(`[whatsapp] 🤝 Atendente ${nomeAtendente} identificado para ${numero}`);
  }

  await registrarBloqueioHumano(supabase, numero, `atendente_humano:${nomeAtendente || "desconhecido"}:${texto.slice(0, 200)}`);
  console.log(`[whatsapp] 🤝 Atendimento humano detectado para ${numero}; SofIA ficará silenciada por ${HUMAN_HANDOFF_MINUTES} min`);
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
// MOTOR DE VENDAS SOFIA - WHATSAPP
// =============================
const SYSTEM_ENGINE_WHATSAPP = `
Você é SofIA, consultora de atendimento da Vitta Care. Você é uma PESSOA REAL, NUNCA IA.
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

## SOBRE A VITTA CARE
- Empresa de telemedicina especializada em cannabis medicinal (CBD/canabidiol)
- Consultas online com médica psiquiatra especializada
- Prescrição legal e segura de medicamentos à base de cannabis
- Suporte completo para autorização ANVISA
- Site: vitta-care.com
- Atendimento 100% online (telemedicina)

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
   "${getSaudacao()}! Aqui é a SofIA, da Vitta Care 😊 Como você está? Qual é o seu nome?"
2. **Mensagem 2 (após receber o nome)**: Agradeça, repita o nome, diga que TAMBÉM está bem (se perguntarem), e pergunte o que a pessoa está buscando
3. **A partir da mensagem 3**: Siga o fluxo normal de atendimento/agendamento

## QUANDO O LEAD VEM DO SITE (TRIAGEM)
- Se o contexto indicar que o lead veio do site vitta-care.com (origem: site_vitta_care), você JÁ TEM os dados da triagem
- NÃO pergunte novamente os sintomas ou objetivo — você já sabe
- Use os dados para personalizar: "Vi que você tem interesse em tratamento para [objetivo]. Que bom que está buscando alternativas!"
- Vá direto ao agendamento: "Posso agendar sua consulta com nossa médica especialista?"

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
- Se uma informação NÃO está no contexto, diga: "Vou confirmar com a equipe e já retorno!"
- Mensagens curtas (máximo 3-4 linhas), SEMPRE termine com pergunta diretiva ou ação
- NÃO repita informações já ditas na conversa
- Se não conseguir entender após 2 tentativas, diga que vai chamar uma colega e inclua: ##ENCAMINHAR_HUMANO##

## TÉCNICAS DE VENDA (use SEMPRE, 1-2 por mensagem, de forma NATURAL)
- ESPECIFICIDADE: números exatos, detalhes concretos
- AUTORIDADE: referências, especializações dos profissionais, "100% legal", "autorizado pela ANVISA"
- PROVA SOCIAL: "muitos pacientes relatam melhora significativa", "temos ajudado centenas de pessoas"
- ESCASSEZ: Ao oferecer horários, mostre NO MÁXIMO 2 opções
- RECIPROCIDADE: ofereça algo antes de pedir (informação gratuita sobre CBD)
- COMPROMISSO: perguntas que levem a "sim" pequenos
- URGÊNCIA: "quanto antes consultar, antes pode iniciar o tratamento"

## REGRA ANTI-ALUCINAÇÃO (PRIORIDADE ABSOLUTA)
- Responda SOMENTE com base nos dados do CONTEXTO
- Se um dado NÃO está no contexto → NÃO invente. Diga: "Vou confirmar com a equipe e já retorno!"
- NUNCA invente disponibilidade, preços, prazos ou dosagens de medicamentos
- NUNCA dê orientação médica sobre dosagem ou efeitos colaterais. Encaminhe para a consulta.

## PERFIS DISC (adapte ao tom do paciente)
- Rápido+direto=DOMINANTE → seja prática
- Rápido+expressivo=INFLUENTE → elogie
- Lento+calmo=ESTÁVEL → segurança, garantias
- Lento+detalhista=CONFORME → dados, argumentos racionais

## RAPPORT
- CAPTURE O NOME na primeira mensagem, USE em toda resposta

## VENDAS SPIN
- Situação→Problema→Implicação→Necessidade

## FECHAMENTO (quando detectar sinais de interesse, feche IMEDIATO)
- Assumido: "Vou reservar sua consulta então! 😊"
- Alternativo: "Fica melhor de manhã ou à tarde?"
- Escassez: "Se agendar agora, consigo encaixar essa semana"
- Resumo: "[Nome], então fica marcada a consulta [dia] às [hora], combinado? ✅"

## OBJEÇÕES (A-P-A: Acalmar→Perguntar→Apresentar)
- PREÇO: "O investimento na consulta é o primeiro passo para um tratamento que pode transformar sua qualidade de vida 💚"
- MEDO/PRECONCEITO: "Entendo a preocupação! A cannabis medicinal é 100% legal e regulamentada pela ANVISA. A médica vai explicar tudo com calma na consulta 😊"
- TEMPO: "A consulta é online, de onde você estiver, cerca de 30-40 minutos. Qual dia é menos corrido para você?"
- PENSAR: "Posso reservar sem compromisso, se mudar de ideia, é só me avisar que libero"

## AGENTE AUTÔNOMO
- Você CONDUZ a conversa, nunca é passiva
- NUNCA deixe sem próximo passo concreto

## FLUXO DE AGENDAMENTO (SIGA ESTA ORDEM EXATA)
1. Se não sabe o nome: pergunte de forma natural
2. Entenda o que a pessoa busca (qual condição/sintoma quer tratar)
3. Explique brevemente como funciona (consulta online → prescrição → suporte ANVISA → tratamento)
4. Pergunte a PREFERÊNCIA de dia e turno (manhã/tarde)
5. SÓ DEPOIS de saber a preferência, ofereça 2 opções REAIS (se disponíveis na agenda)
6. Com o nome do paciente e horário confirmado:
   a) Confirme: "[Nome], consulta marcada para [dia] às [hora]. ✅"
7. APÓS confirmar, pergunte se tem alguma dúvida sobre o tratamento

## COLETA DE DADOS PARA AGENDAMENTO
- O CPF é OPCIONAL. NUNCA bloqueie um agendamento por falta de CPF.
- Se o paciente já disse o nome → isso é SUFICIENTE para agendar.
- Se o paciente fornecer o CPF voluntariamente, inclua: ##ATUALIZAR_CPF|cpf_informado##

## INSTRUÇÃO CRÍTICA: CONFIRMAÇÃO DE AGENDAMENTO (PRIORIDADE MÁXIMA!)
Quando o paciente CONFIRMAR um agendamento, você DEVE incluir ao FINAL da sua resposta o marcador técnico:
##AGENDAMENTO_CONFIRMADO|nome_paciente|data_YYYY-MM-DD|horario_HH:MM|professional_id##

SEM ESTE MARCADOR, O AGENDAMENTO NÃO SERÁ REGISTRADO NA AGENDA.
Se você disser "agendado" ou "marcado" sem incluir o marcador, o paciente ficará SEM consulta.

REGRAS DO MARCADOR:
- O professional_id é OBRIGATÓRIO e deve ser o ID real do profissional na lista (campo "id")
- NÃO use "auto" quando o profissional existir na lista
- Se não houver ID válido, NÃO confirme agendamento automaticamente; peça para a equipe confirmar e inclua ##ENCAMINHAR_HUMANO##
- PRIORIDADE MÁXIMA: se já tem nome + profissional + data + horário + ID válido → INCLUA O MARCADOR E CONFIRME.

## REGRA ANTI-LOOP (PRIORIDADE ABSOLUTA)
- NUNCA repita a mesma resposta mais de 1 vez
- Se já pediu nome e o paciente já forneceu → NÃO peça de novo
- Prefira AGENDAR e ajustar depois do que ficar pedindo dados
- NUNCA peça CPF ANTES de agendar. Agende PRIMEIRO, peça CPF DEPOIS de forma casual.

## FINALIZAÇÃO DE CONVERSA
- Quando o paciente AGRADECER ou SE DESPEDIR → encerre com mensagem CALOROSA e BREVE (2-3 linhas)
- Use o nome do paciente se souber
- NUNCA continue fazendo perguntas ou oferecendo serviços após a despedida

## CONTEXTO DA VITTA CARE
- Atendimento: 100% online (telemedicina)
- Foco: consultas médicas para prescrição de cannabis medicinal
- Público: pessoas que buscam tratamento alternativo para condições como ansiedade, insônia, dor crônica, etc.
- A consulta é o primeiro passo. Após a consulta, o médico prescreve se indicado.
- O paciente recebe suporte para solicitação junto à ANVISA
- NUNCA ofereça ou aceite agendamentos aos sábados ou domingos

## REGRAS DE HORÁRIOS
- SOMENTE ofereça horários que aparecem na lista "HORÁRIOS DISPONÍVEIS" abaixo
- Se não há lista de horários, diga que vai verificar a agenda e retorna em breve
- NUNCA invente horários
- Ofereça EXATAMENTE 2 opções do turno pedido

## REGRAS DE PROFISSIONAIS
- Use o NOME EXATO do profissional da lista
- NUNCA diga "vou confirmar com a equipe" se o profissional está na lista
- Só diga "vou verificar" se o profissional NÃO aparece na lista

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
- CPF: ${cpf || "não cadastrado (peça DEPOIS do agendamento, NÃO antes)"}
- Email: ${email || "não informado"}
- ID no sistema: ${patientId}
IMPORTANTE: O paciente JÁ está cadastrado. Você pode agendar DIRETAMENTE sem pedir mais dados. CPF é OPCIONAL e deve ser pedido APÓS o agendamento, nunca antes.`;

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
      const slots = res.data?.available_slots || res.data?.slots || res.data?.data || [];
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        // API returns slots as plain strings like "07:00" OR as objects with time property
        const time = typeof slot === "string" ? slot : (slot.time || slot.start_time || slot.appointment_time || "");
        if (time) {
          slotsInfo.push({ date: res.date, time: time.slice(0, 5), profNome: res.profNome, profId: res.profId });
        }
      }
    }

    if (slotsInfo.length === 0) {
      console.log("[whatsapp] get_available_slots retornou vazio para todos os profissionais");
      const profListaIds = profIds.map(p => `${p.nome} [ID: ${p.id}]`).join(", ");
      return `\n\nHORÁRIOS DISPONÍVEIS: A agenda não retornou horários específicos no momento.

INSTRUÇÃO CRÍTICA - SIGA ESTA REGRA:
- NUNCA invente datas ou horários. Você NÃO sabe a disponibilidade real.
- Pergunte a preferência de dia e turno do paciente e informe que vai verificar a agenda com a equipe.
- Se o paciente insistir em um horário específico, diga: "Vou verificar essa disponibilidade e confirmo em instantes!"
- Inclua ##ENCAMINHAR_HUMANO## para que a equipe confirme manualmente.
- Profissionais disponíveis: ${profListaIds}
- Horário de funcionamento: segunda a sexta, 8h às 18h
- NUNCA confirme agendamento com datas que você inventou`;
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
function isAppointmentCreatedResponse(data: any): boolean {
  if (!data || typeof data !== "object") return false;

  const possibleIds = [
    data.id,
    data.appointment_id,
    data?.appointment?.id,
    data?.appointment?.appointment_id,
    data?.data?.id,
    data?.data?.appointment_id,
    data?.data?.appointment?.id,
  ];

  if (possibleIds.some((v) => typeof v === "string" && v.trim().length > 0)) {
    return true;
  }

  const msg = String(data.message || data.msg || data.detail || "");
  if (!msg) return false;

  const pareceSucesso = /(agendad|created|criad|sucesso|success)/i.test(msg);
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
      const result = await chamarGestao("list_professionals", {});
      const profs = result.data?.professionals || result.data?.data || result.data || [];
      if (Array.isArray(profs)) {
        for (const p of profs) {
          const id = p.id || p.professional_id || "";
          const nome = fixEncoding(p.full_name || p.professional_name || p.name || p.nome || "").toLowerCase();
          
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

async function registrarAgendamento(nome: string, telefone: string, data: string, horario: string, professionalId: string, pacienteId: string): Promise<boolean> {
  try {
    if (!Deno.env.get("GESTAO_API_URL") || !Deno.env.get("GESTAO_API_TOKEN")) return false;

    if (!professionalId || professionalId === "auto") {
      console.warn(`[whatsapp] professional_id inválido para create_appointment: "${professionalId}"`);
      return false;
    }

    // Validar dia de atendimento do profissional ANTES de criar o agendamento
    const validacao = await validarDiaProfissional(professionalId, data);
    if (!validacao.valido) {
      console.error(`[whatsapp] ❌ Agendamento BLOQUEADO por validação de dia: ${validacao.mensagemErro}`);
      return false;
    }

    const params: Record<string, unknown> = {
      appointment_date: data,
      appointment_time: horario,
      patient_name_imported: nome,
      patient_phone: telefone,
      professional_id: professionalId,
    };

    if (pacienteId) params.patient_id = pacienteId;

    const result = await chamarGestao("create_appointment", params);
    const payload = result.data || {};
    const logicalError = payload?.error === true || payload?.success === false || Number(payload?.statusCode || 0) >= 400;
    const created = isAppointmentCreatedResponse(payload);
    const ok = result.ok && !logicalError && created;

    console.log(`[whatsapp] Agendamento gestão: status=${result.status} http_ok=${result.ok} logical_error=${logicalError} created=${created} payload=${JSON.stringify(payload).slice(0, 300)}`);

    return ok;
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
async function enviarTexto(numero: string, texto: string, instanceKey = ""): Promise<boolean> {
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
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("[whatsapp] Webhook recebido:", JSON.stringify(body).slice(0, 800));
    console.log("[whatsapp] Webhook top-level keys:", Object.keys(body).join(", "));
    if (body.message) console.log("[whatsapp] message keys:", Object.keys(body.message).join(", "));
    const instanceKey = body.instance_key || body.instanceKey || body.data?.instance_key || "";

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
      const participant = body.key?.participant || body.key?.participantPn || body.data?.key?.participant || "";
      const participantNumber = participant.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "").trim();
      const pushName = body.pushName || "";
      console.log(`[whatsapp] 📤 fromMe: paciente=${numero} participant=${participant} pushName="${pushName}" lid=${body.lid || ""} key=${JSON.stringify(body.key || {})}`);
      await processarMensagemFromMe(supabase, numero, mensagemTexto || mensagem, participantNumber || undefined, pushName || undefined);
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

    const bloqueioHumanoAtivo = await buscarBloqueioHumanoAtivo(supabase, numero);
    if (bloqueioHumanoAtivo) {
      await liberarLockDB(supabase, numero);
      console.log(`[whatsapp] 🤫 Atendimento humano ativo para ${numero} até ${bloqueioHumanoAtivo.bloqueio_ate}; SofIA ficará em silêncio`);

      supabase.from("interacoes_ia").insert({
        paciente_externo_id: numero,
        canal: "whatsapp",
        sistema_origem: "megaapi",
        mensagem_usuario: (midia ? `[${midia.type}] ` : "") + mensagem.slice(0, 5000),
        resposta_final: null,
        intencao_detectada: "silenciado_humano",
        estado_conversa: "handoff_humano",
        supervisionado: true,
      }).then(({ error }) => {
        if (error) console.error("[whatsapp] Erro ao salvar mensagem silenciada:", error);
      });

      return new Response(JSON.stringify({ status: "silenciado_humano" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[whatsapp] 📩 De ${numero}: "${mensagem.slice(0, 100)}"${imagemBase64ParaIA ? " [+imagem]" : ""}`);

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
    const historicoOrdenado: HistoricoInteracao[] = historico
      ? [...historico].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
      : [];

    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: SYSTEM_ENGINE_WHATSAPP + contextExtra },
    ];

    if (historicoOrdenado.length > 0) {
      messages.push({
        role: "system",
        content: "ATENÇÃO: esta conversa já possui histórico. É PROIBIDO se apresentar novamente, repetir a saudação inicial ou reenviar a última resposta. Responda SOMENTE ao conteúdo mais recente do paciente e faça a conversa avançar.",
      });
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
        respostaFinal = `${getSaudacao()}! Aqui é a SofIA, da Vitta Care 😊 Como você está? Estou à disposição!`;
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
      if (pacienteEncontrado?.id) {
        atualizarPacienteCPF(pacienteEncontrado.id, cpfDetectado.cpf)
          .then(ok => console.log(`[whatsapp] CPF atualizado: ${ok}`))
          .catch(err => console.error("[whatsapp] Erro atualizar CPF:", err));
      }
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
            enviarTexto(adminNumber, `⚠️ *SofIA confirmou agendamento verbalmente mas NÃO registrou na agenda*\n📱 Paciente: ${numero}\n💬 Resposta: "${respostaFinal.slice(0, 200)}"\n\n⚡ Favor verificar e registrar manualmente.`, instanceKey).catch(() => {});
          }
        }
      }
    }
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

      agendamentosConfirmados = results.filter((r) => r.gestaoOk).length;

      // Verificar se algum agendamento FALHOU no sistema de gestão
      const falharam = results.filter((r) => !r.gestaoOk);
      if (falharam.length > 0) {
        console.error(`[whatsapp] ❌ ${falharam.length} agendamento(s) FALHARAM no sistema de gestão`);

        if (agendamentosConfirmados === 0) {
          respostaFinal = `Recebi sua solicitação e já encaminhei para confirmação manual da nossa equipe no sistema de agenda. ✅\n\nAssim que estiver confirmado, envio para você imediatamente.`;
        } else {
          respostaFinal += `\n\n⚠️ Alguns horários estão em validação final no sistema. Vou confirmar tudo com você em seguida.`;
        }

        // Notificar admin sobre falha
        const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
        if (adminNumber) {
          const falhaDetalhes = falharam.map((f) => `${f.ag.nome} | ${f.ag.data} ${f.ag.horario} | prof=${f.ag.professionalId || "sem_id"}`).join("; ");
          enviarTexto(adminNumber, `⚠️ *AGENDAMENTO FALHOU NO SISTEMA*\n📱 Paciente: ${numero}\n📋 Dados: ${falhaDetalhes}\n\n⚡ Favor registrar/validar manualmente no sistema de gestão.`, instanceKey).catch(() => {});
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
      await registrarBloqueioHumano(supabase, numero, `encaminhado_humano:${mensagem.slice(0, 200)}`);
    }

    // =============================
    // ENVIAR RESPOSTA (com verificação FRESCA de duplicação no banco)
    // =============================
    console.log(`[whatsapp] 📤 Resposta: "${respostaFinal.slice(0, 100)}..."`);

    // Verificação FRESCA no banco — recarrega a última resposta AGORA (não do cache do início)
    const { data: ultimaFresca } = await supabase
      .from("interacoes_ia")
      .select("resposta_final, criado_em")
      .eq("paciente_externo_id", numero)
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
    if (ultimaFresca && ehSaudacaoPadraoSofIA(respostaFinal)) {
      console.warn(`[whatsapp] ⚠️ Bloqueando saudação repetida (já existe histórico) para ${numero}`);
      await liberarLockDB(supabase, numero);
      return new Response(JSON.stringify({ status: "saudacao_repetida_bloqueada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delayMs = 3000 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    await enviarTexto(numero, respostaFinal, instanceKey);

    // Gerar e enviar áudio em background
    gerarAudioElevenLabs(respostaFinal, supabase).then(async (audioUrl) => {
      if (audioUrl) await enviarAudio(numero, audioUrl);
    }).catch(err => console.error("[whatsapp] Erro envio áudio:", err));

    // Notificar admin se encaminhar humano
    if (encaminharHumano) {
      const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
      if (adminNumber) {
          enviarTexto(adminNumber, `⚠️ *Paciente precisa de atendimento humano*\n📱 Número: ${numero}\n💬 Última msg: "${mensagem.slice(0, 100)}"\n\nPor favor, entre em contato.`, instanceKey).catch(() => {});
      }
    }

    // =============================
    // SALVAR INTERAÇÃO NO BANCO (AWAIT para garantir que o lock cobre o insert)
    // =============================
    const { error: saveError } = await supabase.from("interacoes_ia").insert({
      paciente_externo_id: numero,
      canal: "whatsapp",
      sistema_origem: "megaapi",
      mensagem_usuario: (midia ? `[${midia.type}] ` : "") + mensagem.slice(0, 5000),
      resposta_final: respostaFinal.slice(0, 5000),
      intencao_detectada: agendamentos.length > 0
        ? (agendamentosConfirmados > 0 ? "agendamento" : "agendamento_pendente")
        : (encaminharHumano ? "encaminhar_humano" : null),
      estado_conversa: agendamentos.length > 0 && agendamentosConfirmados === agendamentos.length
        ? "finalizado"
        : "em_andamento",
      supervisionado: false,
    });
    if (saveError) console.error("[whatsapp] Erro salvar interação:", saveError);

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
