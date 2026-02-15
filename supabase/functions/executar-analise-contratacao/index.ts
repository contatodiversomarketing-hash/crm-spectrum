import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");
    if (!GESTAO_API_URL || !GESTAO_API_TOKEN) throw new Error("GESTAO_API não configurada");

    const agora = new Date();
    const dias60 = new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dias7 = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const gestaoRes = await fetch(`${GESTAO_API_URL}/internal-api`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${GESTAO_API_TOKEN}` },
      body: JSON.stringify({ action: "get_scheduling_metrics", date_from: dias60, date_to: agora.toISOString() }),
    });

    let agendamentos: any[] = [];
    if (gestaoRes.ok) { const d = await gestaoRes.json(); agendamentos = Array.isArray(d) ? d : d.appointments || d.agendamentos || []; } else { await gestaoRes.text(); }

    const todos = agendamentos.map((a: any) => ({ data: a.date || a.data || a.created_at, status: (a.status || "").toLowerCase(), especialidade: a.specialty || a.especialidade || "geral" }));
    const ultimos30 = todos.filter(a => a.data >= dias30);
    const ultimos7 = todos.filter(a => a.data >= dias7);

    const calcMetricas = (lista: any[]) => {
      const total = lista.length;
      const cancelados = lista.filter(a => ["cancelado", "cancelled", "canceled"].includes(a.status)).length;
      const confirmados = lista.filter(a => ["confirmado", "confirmed", "realizado", "completed"].includes(a.status)).length;
      return { total, cancelados, confirmados, taxaCancelamento: total > 0 ? (cancelados / total) * 100 : 0, taxaConfirmacao: total > 0 ? (confirmados / total) * 100 : 0 };
    };

    const met30 = calcMetricas(ultimos30);
    const met7 = calcMetricas(ultimos7);
    const media30d = met30.total / 30;
    const media7d = met7.total / 7;
    const taxaCrescimento = media30d > 0 ? ((media7d - media30d) / media30d) * 100 : 0;
    const mediaGeralConfirmacao = met30.taxaConfirmacao;

    const espMap: Record<string, { total: number; confirmados: number; cancelados: number }> = {};
    for (const a of ultimos30) {
      const esp = a.especialidade;
      if (!espMap[esp]) espMap[esp] = { total: 0, confirmados: 0, cancelados: 0 };
      espMap[esp].total++;
      if (["confirmado", "confirmed", "realizado", "completed"].includes(a.status)) espMap[esp].confirmados++;
      if (["cancelado", "cancelled", "canceled"].includes(a.status)) espMap[esp].cancelados++;
    }

    const analises: any[] = [];
    for (const [esp, dados] of Object.entries(espMap)) {
      const ocupacao = dados.total > 0 ? (dados.confirmados / dados.total) * 100 : 0;
      const txCancel = dados.total > 0 ? (dados.cancelados / dados.total) * 100 : 0;
      const txConfirm = dados.total > 0 ? (dados.confirmados / dados.total) * 100 : 0;
      let condicoes = 0;
      if (ocupacao > 92) condicoes++;
      if (taxaCrescimento > 15) condicoes++;
      if (txCancel < 10) condicoes++;
      if (txConfirm > mediaGeralConfirmacao) condicoes++;
      analises.push({ especialidade: esp, ocupacao: parseFloat(ocupacao.toFixed(1)), taxa_cancelamento: parseFloat(txCancel.toFixed(1)), taxa_confirmacao: parseFloat(txConfirm.toFixed(1)), condicoes_positivas: condicoes, sugestao: condicoes >= 3 ? "ampliar_capacidade" : "manter_estrutura" });
    }

    const comAmpliacao = analises.filter(a => a.sugestao === "ampliar_capacidade");

    if (comAmpliacao.length > 0) {
      await supabase.from("logs_decisao").insert({
        evento: "analise_contratacao", decisao: `${comAmpliacao.length}_ampliacoes_sugeridas`,
        regra_aplicada: "condicoes_positivas_>=3", confianca: 0.85,
        dados_entrada: { analises: comAmpliacao, taxa_crescimento: parseFloat(taxaCrescimento.toFixed(1)), media_confirmacao_geral: parseFloat(mediaGeralConfirmacao.toFixed(1)) },
        ...(clinica_id && { clinica_id }),
      });

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          tools: [{ type: "function", function: { name: "gerar_insights_contratacao", description: "Insights sobre contratação.", parameters: { type: "object", properties: { insights: { type: "array", items: { type: "object", properties: { especialidade: { type: "string" }, descricao: { type: "string" }, impacto_estimado: { type: "string", enum: ["alto", "medio", "baixo"] } }, required: ["especialidade", "descricao", "impacto_estimado"], additionalProperties: false } } }, required: ["insights"], additionalProperties: false } } }],
          tool_choice: { type: "function", function: { name: "gerar_insights_contratacao" } },
          messages: [
            { role: "system", content: "Consultor RH clínica. Máximo 3 insights. Português brasileiro." },
            { role: "user", content: `Ampliações: ${JSON.stringify(comAmpliacao)}\nCrescimento: ${taxaCrescimento.toFixed(1)}%\nConfirmação geral: ${mediaGeralConfirmacao.toFixed(1)}%` },
          ],
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            const insights = parsed.insights || [];
            if (insights.length > 0) {
              await supabase.from("insights_ia").insert(insights.map((ins: any) => ({
                tipo: "contratacao", descricao: `[${ins.especialidade}] ${ins.descricao}`, impacto_estimado: ins.impacto_estimado,
                ...(clinica_id && { clinica_id }),
              })));
            }
          } catch { /* parse error */ }
        }
      } else { await aiRes.text(); }
    }

    return new Response(JSON.stringify({ status: "concluido", taxa_crescimento: parseFloat(taxaCrescimento.toFixed(1)), media_confirmacao_geral: parseFloat(mediaGeralConfirmacao.toFixed(1)), total_especialidades: analises.length, analises, ampliacoes_sugeridas: comAmpliacao.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analise-contratacao] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
