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

    const inicio = `${dataInicio}T00:00:00.000Z`;
    const fim = `${dataFim}T23:59:59.999Z`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const crmApiUrl = Deno.env.get("CRM_API_URL")!;
    const crmApiToken = Deno.env.get("CRM_API_TOKEN")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Buscar interações do período
    const { data: interacoes, error: errInt } = await sb
      .from("interacoes_ia")
      .select("id, paciente_externo_id, mensagem_usuario, resposta_final, intencao_detectada, supervisionado, criado_em, atendente_humano")
      .gte("criado_em", inicio)
      .lte("criado_em", fim)
      .order("criado_em", { ascending: false });

    if (errInt) throw errInt;
    const items = interacoes || [];

    // Para interações supervisionadas sem atendente_humano, tentar buscar do CRM
    const semAtendente = items.filter((i: any) => i.supervisionado && !i.atendente_humano);
    const telefonesParaBuscar = [...new Set(semAtendente.map((i: any) => i.paciente_externo_id))];

    // Buscar consultor_id do CRM para pacientes sem atendente mapeado
    const consultorPorPaciente: Record<string, string> = {};

    if (telefonesParaBuscar.length > 0) {
      try {
        // Tentar api-leads primeiro, depois api-conversoes
        let leadsList: any[] = [];
        
        for (const endpoint of ["api-leads", "api-conversoes"]) {
          try {
            const res = await fetch(`${crmApiUrl}${endpoint}`, {
              headers: {
                "Authorization": `Bearer ${crmApiToken}`,
                "apikey": crmApiToken,
              },
            });
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data) ? data : data?.data || [];
              console.log(`[metricas-painel] ${endpoint} retornou ${list.length} registros`);
              if (list.length > 0) {
                leadsList = [...leadsList, ...list];
              }
            } else {
              console.warn(`[metricas-painel] ${endpoint} status ${res.status}`);
            }
          } catch (e) {
            console.warn(`[metricas-painel] Erro ${endpoint}:`, e);
          }
        }
        
        // Também buscar individualmente via paciente-por-telefone para os que faltam
        const normalize = (t: string) => (t || "").replace(/\D/g, "");
        
        for (const lead of leadsList) {
          const telRaw = lead.telefone || lead.phone || lead.celular || "";
          const consultorId = lead.consultor_id || lead.responsavel_id || "";
          const tel = normalize(telRaw);
          if (tel && consultorId && CONSULTOR_MAP[consultorId]) {
            consultorPorPaciente[tel] = CONSULTOR_MAP[consultorId];
            if (tel.startsWith("55")) {
              consultorPorPaciente[tel.slice(2)] = CONSULTOR_MAP[consultorId];
            } else {
              consultorPorPaciente["55" + tel] = CONSULTOR_MAP[consultorId];
            }
          }
        }
        
        console.log(`[metricas-painel] Mapeados ${Object.keys(consultorPorPaciente).length} telefones`);

        // Se ainda faltam muitos, buscar por telefone individualmente (max 15)
        const stillMissing = telefonesParaBuscar.filter(t => !consultorPorPaciente[t]).slice(0, 15);
        if (stillMissing.length > 0) {
          console.log(`[metricas-painel] Buscando ${stillMissing.length} pacientes individualmente`);
          for (const tel of stillMissing) {
            try {
              const res = await fetch(`${crmApiUrl}paciente-por-telefone`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${crmApiToken}`,
                  "apikey": crmApiToken,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ telefone: tel }),
              });
              if (res.ok) {
                const data = await res.json();
                const consultorId = data?.consultor_id || data?.responsavel_id || "";
                if (consultorId && CONSULTOR_MAP[consultorId]) {
                  consultorPorPaciente[tel] = CONSULTOR_MAP[consultorId];
                  console.log(`[metricas-painel] ${tel} -> ${CONSULTOR_MAP[consultorId]}`);
                } else if (consultorId) {
                  console.log(`[metricas-painel] ${tel} consultor_id=${consultorId} (não mapeado)`);
                }
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        console.warn("[metricas-painel] Erro ao buscar CRM leads:", e);
      }

      // Atualizar interações sem atendente no banco (fire-and-forget)
      for (const i of semAtendente) {
        const nome = consultorPorPaciente[i.paciente_externo_id];
        if (nome) {
          sb.from("interacoes_ia").update({ atendente_humano: nome }).eq("id", i.id).then(() => {});
          (i as any).atendente_humano = nome;
        }
      }
    }

    // === ATENDIMENTOS POR ATENDENTE ===
    let mariaIA = 0;
    let rebekaCount = 0;
    let mariaRitaCount = 0;
    let outrosHumanos = 0;
    let semResposta = 0;

    for (const i of items) {
      if (i.resposta_final && !i.supervisionado) {
        mariaIA++;
      } else if (i.supervisionado) {
        const atendente = (i as any).atendente_humano || consultorPorPaciente[i.paciente_externo_id] || "";
        if (atendente.toLowerCase().includes("rebeka")) {
          rebekaCount++;
        } else if (atendente.toLowerCase().includes("maria")) {
          mariaRitaCount++;
        } else {
          outrosHumanos++;
        }
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
      const { data: anteriores } = await sb
        .from("interacoes_ia")
        .select("paciente_externo_id")
        .lt("criado_em", inicio)
        .in("paciente_externo_id", pacientesArray.slice(0, 500));

      const jaExistiam = new Set((anteriores || []).map((a: any) => a.paciente_externo_id));
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
    const porDia: Record<string, { maria_ia: number; rebeka: number; maria_rita: number; outros_humanos: number; total: number }> = {};
    for (const i of items) {
      const dia = i.criado_em.split("T")[0];
      if (!porDia[dia]) porDia[dia] = { maria_ia: 0, rebeka: 0, maria_rita: 0, outros_humanos: 0, total: 0 };
      porDia[dia].total++;
      if (i.resposta_final && !i.supervisionado) {
        porDia[dia].maria_ia++;
      } else if (i.supervisionado) {
        const atendente = (i as any).atendente_humano || consultorPorPaciente[i.paciente_externo_id] || "";
        if (atendente.toLowerCase().includes("rebeka")) porDia[dia].rebeka++;
        else if (atendente.toLowerCase().includes("maria")) porDia[dia].maria_rita++;
        else porDia[dia].outros_humanos++;
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
          rebeka: rebekaCount,
          maria_rita: mariaRitaCount,
          outros_humanos: outrosHumanos,
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
