import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOP_N = 50;
const DIAS_BLOQUEIO = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_KEY = Deno.env.get("GESTAO_API_TOKEN");
    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");

    if (!GESTAO_API_URL || !GESTAO_API_KEY) return new Response(JSON.stringify({ error: "GESTAO_API não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!MEGA_API_URL || !MEGA_API_TOKEN) return new Response(JSON.stringify({ error: "MEGA_API não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const response = await fetch(`${GESTAO_API_URL}/list_inactive_patients`, { headers: { Authorization: `Bearer ${GESTAO_API_KEY}` } });
    if (!response.ok) return new Response(JSON.stringify({ error: "Falha na API de Gestão", status: response.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const pacientes = await response.json();

    const pacientesComScore = pacientes.map((p: any) => {
      let score = 0;
      if (p.ticket_medio >= 500) score += 40; else if (p.ticket_medio >= 300) score += 20;
      if (p.total_consultas >= 5) score += 30; else if (p.total_consultas >= 3) score += 20;
      if (p.total_faltas >= 2) score -= 20;
      if (p.total_faltas === 0) score += 10;
      return { ...p, score };
    });

    pacientesComScore.sort((a: any, b: any) => b.score - a.score);
    const selecionados = pacientesComScore.slice(0, TOP_N);

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO);

    let recentesQuery = supabase.from("automacoes").select("paciente_externo_id").eq("tipo", "reativacao_score").gte("criado_em", dataLimite.toISOString());
    if (clinica_id) recentesQuery = recentesQuery.eq("clinica_id", clinica_id);
    const { data: recentes } = await recentesQuery;
    const jaEnviados = new Set((recentes || []).map((r: any) => r.paciente_externo_id));

    const todosPacienteIds = selecionados.map((p: any) => `tel:${p.phone?.replace(/[^\d+]/g, "")}`);
    let bloqQuery = supabase.from("memorias_ia").select("paciente_externo_id, bloqueio_ate").in("paciente_externo_id", todosPacienteIds).gt("bloqueio_ate", new Date().toISOString());
    if (clinica_id) bloqQuery = bloqQuery.eq("clinica_id", clinica_id);
    const { data: bloqueados } = await bloqQuery;
    const bloqueadosSet = new Set((bloqueados || []).map((b: any) => b.paciente_externo_id));

    let enviados = 0;

    for (const paciente of selecionados) {
      if (!paciente.phone) continue;
      const telefone = paciente.phone.replace(/[^\d+]/g, "");
      const pacienteExternoId = `tel:${telefone}`;
      if (jaEnviados.has(pacienteExternoId)) continue;
      if (bloqueadosSet.has(pacienteExternoId)) continue;

      const nomePrimeiro = paciente.nome ? paciente.nome.split(" ")[0] : "";
      const mensagem = `Olá ${nomePrimeiro} 😊\nNotamos que já faz um tempo desde sua última consulta.\nQue tal agendarmos um retorno para cuidar da sua saúde?`;

      try {
        const megaRes = await fetch(`${MEGA_API_URL}/api/v1/sendText`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEGA_API_TOKEN}` },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId, tipo: "reativacao_score", sistema_alvo: "megaapi",
          status: megaRes.ok ? "enviado" : "erro_envio", data_execucao: new Date().toISOString(),
          payload: { nome: paciente.nome, telefone, score: paciente.score, ticket_medio: paciente.ticket_medio, total_consultas: paciente.total_consultas, total_faltas: paciente.total_faltas, mensagem_enviada: mensagem, mega_status: megaRes.status },
          ...(clinica_id && { clinica_id }),
        });

        await supabase.from("logs_decisao").insert({
          evento: "reativacao_score_v1", decisao: megaRes.ok ? "enviado" : "erro_envio", confianca: paciente.score,
          regra_aplicada: `score=${paciente.score}, top=${TOP_N}, bloqueio=${DIAS_BLOQUEIO}d`,
          dados_entrada: { paciente_externo_id: pacienteExternoId, nome: paciente.nome, score: paciente.score, ticket_medio: paciente.ticket_medio, total_consultas: paciente.total_consultas, total_faltas: paciente.total_faltas },
          ...(clinica_id && { clinica_id }),
        });

        if (megaRes.ok) { enviados++; }
      } catch (err) {
        console.error(`[reativacao-score] Erro ${pacienteExternoId}:`, err);
      }
    }

    return new Response(JSON.stringify({ total_inativos: pacientes.length, avaliados: pacientesComScore.length, enviados }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[reativacao-score] Erro:", error);
    return new Response(JSON.stringify({ error: true, message: error instanceof Error ? error.message : "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
