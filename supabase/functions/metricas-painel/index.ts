import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Única atendente humana cadastrada hoje
const ATENDENTE_NOME = "Lara Flores do Prado";
const ATENDENTE_ALIASES = ["lara", "lara flores", "lara flores do prado"];

// Especialidades reais da Dra. Amélia (psiquiatria / neurodesenvolvimento)
const ESPECIALIDADES: Record<string, string[]> = {
  "Autismo (TEA)": ["autism", "tea", "espectro", "spectra kids", "estereotip", "seletividade"],
  "TDAH": ["tdah", "deficit de atencao", "déficit de atenção", "hiperativ", "desatenc", "impulsiv"],
  "Cannabis Medicinal": ["cannabis", "cbd", "canabidiol", "oleo", "óleo", "thc"],
  "Psiquiatria Geral": ["ansiedade", "depress", "panico", "pânico", "burnout", "sono", "insonia", "insônia", "bipolar", "psiquiatr", "amelia", "amélia"],
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

function ehAtendenteLara(valor?: string | null): boolean {
  const n = normalizarTexto(valor);
  if (!n) return false;
  return ATENDENTE_ALIASES.some((a) => n.includes(a));
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
  // A clínica atende exclusivamente psiquiatria/neurodesenvolvimento
  return "Psiquiatria Geral";
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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const items = await carregarInteracoesPeriodo(sb, inicio, fim);
    console.log(`[metricas-painel] Interações carregadas: ${items.length}`);

    // === ATENDIMENTOS POR CONVERSA ÚNICA ===
    const conversasPorPaciente: Record<string, { ia: boolean; respostaHumana: boolean; lara: boolean }> = {};

    const registrar = (bucket: Record<string, { ia: boolean; respostaHumana: boolean; lara: boolean }>, i: any) => {
      const pid = i.paciente_externo_id;
      if (!bucket[pid]) bucket[pid] = { ia: false, respostaHumana: false, lara: false };
      if (i.resposta_final && !i.supervisionado) bucket[pid].ia = true;
      const teveRespostaHumana = i.supervisionado && i.intencao_detectada === "resposta_humana" && !!i.resposta_final;
      if (teveRespostaHumana) {
        bucket[pid].respostaHumana = true;
        if (ehAtendenteLara(i.atendente_humano)) bucket[pid].lara = true;
      }
    };

    for (const i of items) registrar(conversasPorPaciente, i);

    let anaIA = 0;
    let laraCount = 0;
    let outrosHumanos = 0;
    let semResposta = 0;

    for (const conv of Object.values(conversasPorPaciente)) {
      if (conv.respostaHumana) {
        if (conv.lara) laraCount++;
        else outrosHumanos++;
      } else if (conv.ia) {
        anaIA++;
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

    // === POR DIA ===
    const convPorDia: Record<string, Record<string, { ia: boolean; respostaHumana: boolean; lara: boolean }>> = {};
    for (const i of items) {
      const dia = diaSaoPaulo(i.criado_em);
      if (!convPorDia[dia]) convPorDia[dia] = {};
      registrar(convPorDia[dia], i);
    }

    const porDiaArray = Object.entries(convPorDia)
      .map(([dia, convs]) => {
        const d = { ana_ia: 0, lara: 0, outros_humanos: 0, total: 0 };
        for (const conv of Object.values(convs)) {
          if (conv.respostaHumana) {
            d.total++;
            if (conv.lara) d.lara++;
            else d.outros_humanos++;
          } else if (conv.ia) {
            d.total++;
            d.ana_ia++;
          }
        }
        return { dia, ...d };
      })
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return new Response(
      JSON.stringify({
        periodo: { inicio: dataInicio, fim: dataFim },
        atendente_nome: ATENDENTE_NOME,
        atendimentos: {
          ana_ia: anaIA,
          lara: laraCount,
          outros_humanos: outrosHumanos,
          sem_resposta: semResposta,
          total: anaIA + laraCount + outrosHumanos,
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
