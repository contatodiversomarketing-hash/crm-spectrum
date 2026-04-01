import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mapa consultor_id -> nome
const CONSULTOR_MAP: Record<string, string> = {
  "bc0e58c4-ac38-4dff-9f82-6fa1d22659c5": "Rebeka",
  "ed25df52-ec5f-48cc-b1af-2f32d3b42a83": "Maria Rita",
};

const ESPECIALIDADES: Record<string, string[]> = {
  "Odontologia Geral": ["dalila", "isadora", "erika", "dentista", "limpeza", "restaura", "canal", "extra"],
  "Ortodontia": ["ortodont", "aparelho", "alinhador"],
  "Psiquiatria": ["mylena", "psiquiatr"],
  "Dermatologia/Estética": ["amelia", "amélia", "dermat", "botox", "peel", "estetic", "preenchimento"],
  "Exames Laboratoriais": ["exame", "laborat", "coleta", "sangue", "hemograma"],
  "Nutrição": ["nutri", "dieta", "alimenta"],
  "Psicologia": ["psicolog", "terapia"],
};

const TIMEZONE = "America/Sao_Paulo";
const PAGE_SIZE = 1000;

function toUtcInicioSaoPaulo(dataISO: string): string {
  return new Date(`${dataISO}T00:00:00.000-03:00`).toISOString();
}

function toUtcFimSaoPaulo(dataISO: string): string {
  return new Date(`${dataISO}T23:59:59.999-03:00`).toISOString();
}

function diaSaoPaulo(dataIso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(dataIso));
}

function normalizarTexto(valor?: string | null): string {
  return (valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classificarAtendenteHumano(valor?: string | null): "Rebeka" | "Maria Rita" | null {
  const normalizado = normalizarTexto(valor);
  if (!normalizado) return null;

  if (normalizado.includes("maria rita") || normalizado.replace(/\s/g, "").includes("mariarita")) {
    return "Maria Rita";
  }

  if (normalizado.includes("rebeka") || normalizado.includes("rebeca")) {
    return "Rebeka";
  }

  return null;
}

function atendenteGenerico(valor?: string | null): boolean {
  const normalizado = normalizarTexto(valor);
  return !normalizado || normalizado === "humano";
}

async function carregarInteracoesPeriodo(sb: any, inicio: string, fim: string) {
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("interacoes_ia")
      .select("id, paciente_externo_id, mensagem_usuario, resposta_final, intencao_detectada, supervisionado, criado_em, atendente_humano")
      .gte("criado_em", inicio)
      .lte("criado_em", fim)
      .order("criado_em", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return all;
}

function classificarEspecialidade(texto: string): string {
  const lower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [esp, keywords] of Object.entries(ESPECIALIDADES)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return esp;
    }
  }
  return "Outros/Não identificado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let dataInicio: string;
    let dataFim: string;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      dataInicio = body.data_inicio || new Date().toISOString().split("T")[0];
      dataFim = body.data_fim || new Date().toISOString().split("T")[0];
    } else {
      const url = new URL(req.url);
      dataInicio = url.searchParams.get("data_inicio") || new Date().toISOString().split("T")[0];
      dataFim = url.searchParams.get("data_fim") || new Date().toISOString().split("T")[0];
    }

    const inicio = toUtcInicioSaoPaulo(dataInicio);
    const fim = toUtcFimSaoPaulo(dataFim);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const crmApiUrl = Deno.env.get("CRM_API_URL") || "";
    const crmApiToken = Deno.env.get("CRM_API_TOKEN") || "";
    const sb = createClient(supabaseUrl, serviceKey);

    // Buscar TODAS as interações do período (paginação acima de 1000 registros)
    const items = await carregarInteracoesPeriodo(sb, inicio, fim);
    console.log(`[metricas-painel] Interações carregadas: ${items.length}`);

    // Helper: extrair apenas dígitos de paciente_externo_id
    const extractDigits = (pid: string) => (pid || "").replace(/\D/g, "");

    // Para interações supervisionadas sem atendente identificado (null ou genérico "Humano"), tentar buscar do CRM
    const semAtendente = items.filter((i: any) => i.supervisionado && atendenteGenerico(i.atendente_humano));
    const telefonesParaBuscar = [...new Set(semAtendente.map((i: any) => extractDigits(i.paciente_externo_id)))];
    const consultorPorTelefone: Record<string, string> = {};

    if (telefonesParaBuscar.length > 0 && crmApiUrl && crmApiToken) {
      try {
        const normalize = (t: string) => (t || "").replace(/\D/g, "");
        let allLeads: any[] = [];
        let page = 1;
        
        while (page <= 10) {
          const res = await fetch(`${crmApiUrl}api-leads?limit=500&page=${page}&periodo_dias=365`, {
            headers: { "Authorization": `Bearer ${crmApiToken}`, "apikey": crmApiToken },
          });
          if (!res.ok) {
            console.warn(`[metricas-painel] CRM api-leads page ${page} retornou status ${res.status}`);
            break;
          }
          const data = await res.json();
          const leads = data?.leads || [];
          if (leads.length === 0) break;
          allLeads = [...allLeads, ...leads];
          if (page >= (data?.paginacao?.total_pages || 1)) break;
          page++;
        }

        console.log(`[metricas-painel] CRM: ${allLeads.length} leads carregados`);
        
        // Contar leads por consultor para debug
        const consultorCount: Record<string, number> = {};
        for (const lead of allLeads) {
          const cid = lead.consultor_id || "sem_consultor";
          consultorCount[cid] = (consultorCount[cid] || 0) + 1;
        }
        console.log(`[metricas-painel] CRM consultores: ${JSON.stringify(consultorCount)}`);
        
        for (const lead of allLeads) {
          const tel = normalize(lead.telefone || "");
          const consultorId = lead.consultor_id || "";
          if (tel && consultorId && CONSULTOR_MAP[consultorId]) {
            consultorPorTelefone[tel] = CONSULTOR_MAP[consultorId];
            // Guardar variações
            if (tel.startsWith("55")) {
              consultorPorTelefone[tel.slice(2)] = CONSULTOR_MAP[consultorId];
            } else {
              consultorPorTelefone["55" + tel] = CONSULTOR_MAP[consultorId];
            }
            const semDDI = tel.startsWith("55") ? tel.slice(2) : tel;
            if (semDDI.length >= 10) {
              const ddd = semDDI.slice(0, 2);
              const resto = semDDI.slice(2);
              if (resto.length === 9 && resto.startsWith("9")) {
                const sem9 = ddd + resto.slice(1);
                consultorPorTelefone[sem9] = CONSULTOR_MAP[consultorId];
                consultorPorTelefone["55" + sem9] = CONSULTOR_MAP[consultorId];
              } else if (resto.length === 8) {
                const com9 = ddd + "9" + resto;
                consultorPorTelefone[com9] = CONSULTOR_MAP[consultorId];
                consultorPorTelefone["55" + com9] = CONSULTOR_MAP[consultorId];
              }
            }
          }
        }

        console.log(`[metricas-painel] Mapa telefone->consultor: ${Object.keys(consultorPorTelefone).length} variações mapeadas`);

        // Atualizar interações sem atendente no banco
        // Gerar variações do telefone do paciente para buscar no mapa
        let matched = 0;
        let unmatched = 0;
        for (const i of semAtendente) {
          const digits = extractDigits(i.paciente_externo_id);
          // Tentar lookup direto e com variações
          let nome = consultorPorTelefone[digits];
          if (!nome) {
            // Gerar variações do telefone do paciente
            const variations: string[] = [];
            if (digits.startsWith("55")) {
              const semDDI = digits.slice(2);
              variations.push(semDDI);
              if (semDDI.length >= 10) {
                const ddd = semDDI.slice(0, 2);
                const resto = semDDI.slice(2);
                if (resto.length === 8) {
                  // Adicionar 9o dígito
                  variations.push(ddd + "9" + resto);
                  variations.push("55" + ddd + "9" + resto);
                } else if (resto.length === 9 && resto.startsWith("9")) {
                  // Remover 9o dígito
                  variations.push(ddd + resto.slice(1));
                  variations.push("55" + ddd + resto.slice(1));
                }
              }
            } else if (digits.length >= 10) {
              variations.push("55" + digits);
              const ddd = digits.slice(0, 2);
              const resto = digits.slice(2);
              if (resto.length === 8) {
                variations.push(ddd + "9" + resto);
                variations.push("55" + ddd + "9" + resto);
              } else if (resto.length === 9 && resto.startsWith("9")) {
                variations.push(ddd + resto.slice(1));
                variations.push("55" + ddd + resto.slice(1));
              }
            }
            for (const v of variations) {
              if (consultorPorTelefone[v]) {
                nome = consultorPorTelefone[v];
                break;
              }
            }
          }
          if (nome) {
            matched++;
            sb.from("interacoes_ia").update({ atendente_humano: nome }).eq("id", i.id).then(() => {});
            (i as any).atendente_humano = nome;
          } else {
            unmatched++;
          }
        }
        console.log(`[metricas-painel] CRM atribuição: ${matched} matched, ${unmatched} unmatched de ${semAtendente.length} total`);
      } catch (e) {
        console.warn("[metricas-painel] Erro CRM:", e);
      }
    } else {
      console.log(`[metricas-painel] CRM lookup skip: telefones=${telefonesParaBuscar.length} crmUrl=${!!crmApiUrl} crmToken=${!!crmApiToken}`);
    }

    // === ATENDIMENTOS POR CONVERSA ÚNICA (não por mensagem) ===
    // Conta atendimento humano apenas quando houve resposta humana real.
    const conversasPorPaciente: Record<string, {
      ia: boolean;
      respostaHumana: boolean;
      humano: string | null;
    }> = {};

    for (const i of items) {
      const pid = i.paciente_externo_id;
      if (!conversasPorPaciente[pid]) {
        conversasPorPaciente[pid] = { ia: false, respostaHumana: false, humano: null };
      }

      if (i.resposta_final && !i.supervisionado) {
        conversasPorPaciente[pid].ia = true;
      }

      const teveRespostaHumana = i.supervisionado && i.intencao_detectada === "resposta_humana" && !!i.resposta_final;
      if (teveRespostaHumana) {
        conversasPorPaciente[pid].respostaHumana = true;
        const digits = extractDigits(pid);
        const atendente = classificarAtendenteHumano((i as any).atendente_humano || consultorPorTelefone[digits] || "");
        if (atendente && !conversasPorPaciente[pid].humano) {
          conversasPorPaciente[pid].humano = atendente;
        }
      }
    }

    let mariaIA = 0;
    let rebekaCount = 0;
    let mariaRitaCount = 0;
    let outrosHumanos = 0;
    let semResposta = 0;

    for (const conv of Object.values(conversasPorPaciente)) {
      if (conv.respostaHumana) {
        if (conv.humano) {
          if (conv.humano === "Rebeka") rebekaCount++;
          else if (conv.humano === "Maria Rita") mariaRitaCount++;
          else outrosHumanos++;
        } else {
          outrosHumanos++;
        }
      } else if (conv.ia) {
        mariaIA++;
      } else {
        semResposta++;
      }
    }

    // === CONVERSAS ÚNICAS ===
    const pacientesUnicos = new Set(items.map((i: any) => i.paciente_externo_id));
    const conversasTotal = pacientesUnicos.size;
    const pacientesArray = [...pacientesUnicos];
    let leadsNovos = 0;
    let leadsExistentes = 0;

    if (pacientesArray.length > 0) {
      const jaExistiam = new Set<string>();
      for (let i = 0; i < pacientesArray.length; i += 500) {
        const chunk = pacientesArray.slice(i, i + 500);
        const { data: anterioresChunk, error: errAnteriores } = await sb
          .from("interacoes_ia")
          .select("paciente_externo_id")
          .lt("criado_em", inicio)
          .in("paciente_externo_id", chunk);

        if (errAnteriores) throw errAnteriores;
        for (const item of anterioresChunk || []) {
          if (item.paciente_externo_id) jaExistiam.add(item.paciente_externo_id);
        }
      }

      for (const p of pacientesArray) {
        if (jaExistiam.has(p)) leadsExistentes++;
        else leadsNovos++;
      }
    }

    // === ESPECIALIDADES ===
    const espContagem: Record<string, number> = {};
    for (const i of items) {
      const texto = [i.mensagem_usuario || "", i.resposta_final || ""].join(" ");
      if (texto.trim().length < 5) continue;
      const esp = classificarEspecialidade(texto);
      espContagem[esp] = (espContagem[esp] || 0) + 1;
    }
    const especialidades = Object.entries(espContagem)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    // === POR DIA (por conversa única por dia) ===
    const porDia: Record<string, { maria_ia: number; rebeka: number; maria_rita: number; outros_humanos: number; total: number }> = {};
    // Agrupar por dia + paciente para contar conversas, não mensagens
    const convPorDia: Record<string, Record<string, { ia: boolean; respostaHumana: boolean; humano: string | null }>> = {};
    for (const i of items) {
      const dia = diaSaoPaulo(i.criado_em);
      if (!convPorDia[dia]) convPorDia[dia] = {};
      const pid = i.paciente_externo_id;
      if (!convPorDia[dia][pid]) convPorDia[dia][pid] = { ia: false, respostaHumana: false, humano: null };

      if (i.resposta_final && !i.supervisionado) {
        convPorDia[dia][pid].ia = true;
      }

      const teveRespostaHumana = i.supervisionado && i.intencao_detectada === "resposta_humana" && !!i.resposta_final;
      if (teveRespostaHumana) {
        convPorDia[dia][pid].respostaHumana = true;
        const digits = extractDigits(pid);
        const atendente = classificarAtendenteHumano((i as any).atendente_humano || consultorPorTelefone[digits] || "");
        if (atendente && !convPorDia[dia][pid].humano) convPorDia[dia][pid].humano = atendente;
      }
    }
    for (const [dia, convs] of Object.entries(convPorDia)) {
      const d = { maria_ia: 0, rebeka: 0, maria_rita: 0, outros_humanos: 0, total: 0 };
      for (const conv of Object.values(convs)) {
        if (conv.respostaHumana) {
          d.total++;
          if (conv.humano) {
            if (conv.humano === "Rebeka") d.rebeka++;
            else if (conv.humano === "Maria Rita") d.maria_rita++;
            else d.outros_humanos++;
          } else {
            d.outros_humanos++;
          }
        } else if (conv.ia) {
          d.total++;
          d.maria_ia++;
        }
      }
      porDia[dia] = d;
    }
    const porDiaArray = Object.entries(porDia)
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return new Response(
      JSON.stringify({
        periodo: { inicio: dataInicio, fim: dataFim },
        atendimentos: {
          maria_ia: mariaIA,
          rebeka: rebekaCount,
          maria_rita: mariaRitaCount,
          outros_humanos: outrosHumanos,
          sem_resposta: semResposta,
          total: mariaIA + rebekaCount + mariaRitaCount + outrosHumanos,
        },
        conversas: {
          total: conversasTotal,
          leads_novos: leadsNovos,
          leads_existentes: leadsExistentes,
        },
        especialidades,
        por_dia: porDiaArray,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[metricas-painel] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
