import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOP_N = 50;
const DIAS_BLOQUEIO = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
    if (!MEGA_API_URL || !MEGA_API_TOKEN) return new Response(JSON.stringify({ error: "MEGA_API não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Buscar leads inativos do CRM interno (em vez da API de gestão antiga)
    const dataLimite180d = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: leadsInativos } = await supabase
      .from("leads")
      .select("*")
      .lt("ultima_interacao", dataLimite180d)
      .not("telefone", "is", null)
      .limit(200);

    const pacientes = leadsInativos || [];

    const pacientesComScore = pacientes.map((p: any) => {
      let score = 50; // base score
      if (p.status_pipeline === "agendado") score += 20;
      if (p.origem === "indicacao") score += 15;
      return { ...p, score };
    });

    pacientesComScore.sort((a: any, b: any) => b.score - a.score);
    const selecionados = pacientesComScore.slice(0, TOP_N);

    const dataLimiteBloqueio = new Date();
    dataLimiteBloqueio.setDate(dataLimiteBloqueio.getDate() - DIAS_BLOQUEIO);

    let recentesQuery = supabase.from("automacoes").select("paciente_externo_id").eq("tipo", "reativacao_score").gte("criado_em", dataLimiteBloqueio.toISOString());
    if (clinica_id) recentesQuery = recentesQuery.eq("clinica_id", clinica_id);
    const { data: recentes } = await recentesQuery;
    const jaEnviados = new Set((recentes || []).map((r: any) => r.paciente_externo_id));

    let enviados = 0;

    for (const paciente of selecionados) {
      if (!paciente.telefone) continue;
      const telefone = paciente.telefone.replace(/[^\d+]/g, "");
      const pacienteExternoId = `tel:${telefone}`;
      if (jaEnviados.has(pacienteExternoId)) continue;

      const nomePrimeiro = paciente.nome ? paciente.nome.split(" ")[0] : "";
      const mensagem = `Olá ${nomePrimeiro} 😊\nNotamos que já faz um tempo desde sua última consulta na Vitta Care.\nQue tal agendarmos um retorno para cuidar da sua saúde?`;

      try {
        const megaRes = await fetch(`${MEGA_API_URL}/api/v1/sendText`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEGA_API_TOKEN}` },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId, tipo: "reativacao_score", sistema_alvo: "megaapi",
          status: megaRes.ok ? "enviado" : "erro_envio", data_execucao: new Date().toISOString(),
          payload: { nome: paciente.nome, telefone, score: paciente.score, mensagem_enviada: mensagem, mega_status: megaRes.status },
          ...(clinica_id && { clinica_id }),
        });

        if (megaRes.ok) enviados++;
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
