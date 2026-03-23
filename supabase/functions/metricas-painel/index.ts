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
    const crmApiUrl = Deno.env.get("CRM_API_URL") || "";
    const crmApiToken = Deno.env.get("CRM_API_TOKEN") || "";
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

    // Helper: extrair apenas dígitos de paciente_externo_id
    const extractDigits = (pid: string) => (pid || "").replace(/\D/g, "");

    // Para interações supervisionadas sem atendente identificado (null ou genérico "Humano"), tentar buscar do CRM
    const semAtendente = items.filter((i: any) => i.supervisionado && (!i.atendente_humano || i.atendente_humano === "Humano"));
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
          if (!res.ok) break;
          const data = await res.json();
          const leads = data?.leads || [];
          if (leads.length === 0) break;
          allLeads = [...allLeads, ...leads];
          if (page >= (data?.paginacao?.total_pages || 1)) break;
          page++;
        }
        
        for (const lead of allLeads) {
          const tel = normalize(lead.telefone || "");
          const consultorId = lead.consultor_id || "";
          if (tel && consultorId && CONSULTOR_MAP[consultorId]) {
            // Armazenar todas variações possíveis do telefone
            consultorPorTelefone[tel] = CONSULTOR_MAP[consultorId];
            consultorPorTelefone["55" + tel] = CONSULTOR_MAP[consultorId];
            if (tel.startsWith("55")) {
              consultorPorTelefone[tel.slice(2)] = CONSULTOR_MAP[consultorId];
            }
            // Variação com/sem 9o dígito
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

        // Atualizar interações sem atendente no banco
        for (const i of semAtendente) {
          const digits = extractDigits(i.paciente_externo_id);
          const nome = consultorPorTelefone[digits];
          if (nome) {
            sb.from("interacoes_ia").update({ atendente_humano: nome }).eq("id", i.id).then(() => {});
            (i as any).atendente_humano = nome;
          }
        }
      } catch (e) {
        console.warn("[metricas-painel] Erro CRM:", e);
      }
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
        const atendente = (i as any).atendente_humano || consultorPorTelefone[digits] || "";
        if (atendente && atendente !== "Humano") {
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
          const nome = conv.humano.toLowerCase();
          if (nome.includes("rebeka")) rebekaCount++;
          else if (nome.includes("maria")) mariaRitaCount++;
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

    // === POR DIA (por conversa única por dia) ===
    const porDia: Record<string, { maria_ia: number; rebeka: number; maria_rita: number; outros_humanos: number; total: number }> = {};
    // Agrupar por dia + paciente para contar conversas, não mensagens
    const convPorDia: Record<string, Record<string, { ia: boolean; respostaHumana: boolean; humano: string | null }>> = {};
    for (const i of items) {
      const dia = i.criado_em.split("T")[0];
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
        const atendente = (i as any).atendente_humano || consultorPorTelefone[digits] || "";
        if (atendente && atendente !== "Humano") convPorDia[dia][pid].humano = atendente;
      }
    }
    for (const [dia, convs] of Object.entries(convPorDia)) {
      const d = { maria_ia: 0, rebeka: 0, maria_rita: 0, outros_humanos: 0, total: 0 };
      for (const conv of Object.values(convs)) {
        if (conv.respostaHumana) {
          d.total++;
          if (conv.humano) {
            const nome = conv.humano.toLowerCase();
            if (nome.includes("rebeka")) d.rebeka++;
            else if (nome.includes("maria")) d.maria_rita++;
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
