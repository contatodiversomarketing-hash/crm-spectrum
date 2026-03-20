import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mapa de profissionais/especialidades para classificação
const ESPECIALIDADES: Record<string, string[]> = {
  "Odontologia Geral": ["dalila", "isadora", "erika", "dentista", "limpeza", "restaura", "canal", "extra"],
  "Ortodontia": ["ortodont", "aparelho", "alinhador"],
  "Psiquiatria": ["mylena", "psiquiatr"],
  "Dermatologia/Estética": ["amelia", "amélia", "dermat", "botox", "peel", "estetic", "preenchimento"],
  "Exames Laboratoriais": ["exame", "laborat", "coleta", "sangue", "hemograma"],
  "Nutrição": ["nutri", "dieta", "alimenta"],
  "Psicologia": ["psicolog", "terapia"],
};

function classificarEspecialidade(texto: string): string {
  const lower = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

    const inicio = `${dataInicio}T00:00:00.000Z`;
    const fim = `${dataFim}T23:59:59.999Z`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Buscar todas interações do período
    const { data: interacoes, error: errInt } = await sb
      .from("interacoes_ia")
      .select("id, paciente_externo_id, mensagem_usuario, resposta_final, intencao_detectada, supervisionado, criado_em")
      .gte("criado_em", inicio)
      .lte("criado_em", fim)
      .order("criado_em", { ascending: false });

    if (errInt) throw errInt;

    const items = interacoes || [];

    // === ATENDIMENTOS POR ATENDENTE ===
    let mariaIA = 0;
    let humanos = 0;
    let semResposta = 0;

    for (const i of items) {
      if (i.resposta_final && !i.supervisionado) {
        mariaIA++;
      } else if (i.supervisionado) {
        humanos++;
      } else {
        semResposta++;
      }
    }

    // === CONVERSAS ÚNICAS ===
    const pacientesUnicos = new Set(items.map((i: any) => i.paciente_externo_id));
    const conversasTotal = pacientesUnicos.size;

    // Pacientes que já tinham interação antes do período
    const pacientesArray = [...pacientesUnicos];
    let leadsNovos = 0;
    let leadsExistentes = 0;

    if (pacientesArray.length > 0) {
      // Verificar quais pacientes já tinham interações antes do período
      const { data: anteriores } = await sb
        .from("interacoes_ia")
        .select("paciente_externo_id")
        .lt("criado_em", inicio)
        .in("paciente_externo_id", pacientesArray.slice(0, 500));

      const jaExistiam = new Set((anteriores || []).map((a: any) => a.paciente_externo_id));

      for (const p of pacientesArray) {
        if (jaExistiam.has(p)) {
          leadsExistentes++;
        } else {
          leadsNovos++;
        }
      }
    }

    // === CLASSIFICAÇÃO POR ESPECIALIDADE ===
    const espContagem: Record<string, number> = {};

    for (const i of items) {
      const texto = [i.mensagem_usuario || "", i.resposta_final || ""].join(" ");
      if (texto.trim().length < 5) continue;
      const esp = classificarEspecialidade(texto);
      espContagem[esp] = (espContagem[esp] || 0) + 1;
    }

    // Ordenar por quantidade
    const especialidades = Object.entries(espContagem)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    // === CONVERSAS POR DIA (para gráfico) ===
    const porDia: Record<string, { maria_ia: number; humano: number; total: number }> = {};
    for (const i of items) {
      const dia = i.criado_em.split("T")[0];
      if (!porDia[dia]) porDia[dia] = { maria_ia: 0, humano: 0, total: 0 };
      porDia[dia].total++;
      if (i.resposta_final && !i.supervisionado) {
        porDia[dia].maria_ia++;
      } else if (i.supervisionado) {
        porDia[dia].humano++;
      }
    }

    const porDiaArray = Object.entries(porDia)
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return new Response(
      JSON.stringify({
        periodo: { inicio: dataInicio, fim: dataFim },
        atendimentos: {
          maria_ia: mariaIA,
          humanos,
          sem_resposta: semResposta,
          total: items.length,
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
