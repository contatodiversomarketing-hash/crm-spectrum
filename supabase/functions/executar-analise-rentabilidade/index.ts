import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");
    if (!GESTAO_API_URL || !GESTAO_API_TOKEN) throw new Error("GESTAO_API não configurada");

    const agora = new Date();
    const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Buscar agendamentos e receita em paralelo
    const [agendaRes, receitaRes] = await Promise.all([
      fetch(`${GESTAO_API_URL}/internal-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GESTAO_API_TOKEN}` },
        body: JSON.stringify({ action: "get_scheduling_metrics", date_from: dias30, date_to: agora.toISOString() }),
      }),
      fetch(`${GESTAO_API_URL}/internal-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GESTAO_API_TOKEN}` },
        body: JSON.stringify({ action: "get_revenue", date_from: dias30, date_to: agora.toISOString() }),
      }),
    ]);

    let agendamentos: any[] = [];
    if (agendaRes.ok) {
      const d = await agendaRes.json();
      agendamentos = Array.isArray(d) ? d : d.appointments || d.agendamentos || [];
    } else { await agendaRes.text(); }

    let receitaPorEsp: Record<string, number> = {};
    if (receitaRes.ok) {
      const f = await receitaRes.json();
      receitaPorEsp = f.revenue_by_specialty || f.receita_por_especialidade || {};
    } else { await receitaRes.text(); }

    // 2. Calcular métricas por especialidade
    const espMap: Record<string, { total: number; confirmados: number; horas: number }> = {};
    for (const a of agendamentos) {
      const esp = a.specialty || a.especialidade || "geral";
      const status = (a.status || "").toLowerCase();
      const duracao = a.duration || a.duracao || 30; // minutos, default 30

      if (!espMap[esp]) espMap[esp] = { total: 0, confirmados: 0, horas: 0 };
      espMap[esp].total++;
      if (["confirmado", "confirmed", "realizado", "completed"].includes(status)) {
        espMap[esp].confirmados++;
        espMap[esp].horas += duracao / 60;
      }
    }

    // 3. Calcular índice de eficiência
    const analises: {
      especialidade: string;
      receita_total: number;
      atendimentos: number;
      horas_ocupadas: number;
      taxa_confirmacao: number;
      receita_por_hora: number;
      indice_eficiencia: number;
    }[] = [];

    for (const [esp, dados] of Object.entries(espMap)) {
      const receita = receitaPorEsp[esp] || 0;
      const txConfirm = dados.total > 0 ? (dados.confirmados / dados.total) * 100 : 0;
      const receitaPorHora = dados.horas > 0 ? receita / dados.horas : 0;
      const indiceEficiencia = receitaPorHora * (txConfirm / 100);

      analises.push({
        especialidade: esp,
        receita_total: receita,
        atendimentos: dados.total,
        horas_ocupadas: parseFloat(dados.horas.toFixed(1)),
        taxa_confirmacao: parseFloat(txConfirm.toFixed(1)),
        receita_por_hora: parseFloat(receitaPorHora.toFixed(2)),
        indice_eficiencia: parseFloat(indiceEficiencia.toFixed(2)),
      });
    }

    // Ordenar por eficiência DESC
    analises.sort((a, b) => b.indice_eficiencia - a.indice_eficiencia);

    const top3 = analises.slice(0, 3);
    const bottom3 = analises.length > 3 ? analises.slice(-3).reverse() : [];

    console.log(`[analise-rentabilidade] ${analises.length} especialidades analisadas`);

    // 4. Gerar insights via IA
    if (analises.length > 0) {
      await supabase.from("logs_decisao").insert({
        evento: "analise_rentabilidade",
        decisao: `top3: ${top3.map(t => t.especialidade).join(",")}`,
        regra_aplicada: "indice_eficiencia_receita_hora_x_confirmacao",
        confianca: 0.85,
        dados_entrada: { top3, bottom3, total_especialidades: analises.length },
      });

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          tools: [{
            type: "function",
            function: {
              name: "gerar_insights_rentabilidade",
              description: "Retorna insights sobre rentabilidade por especialidade.",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        especialidade: { type: "string" },
                        descricao: { type: "string" },
                        impacto_estimado: { type: "string", enum: ["alto", "medio", "baixo"] },
                      },
                      required: ["especialidade", "descricao", "impacto_estimado"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "gerar_insights_rentabilidade" } },
          messages: [
            {
              role: "system",
              content: "Você é um consultor financeiro de clínica médica. Analise rentabilidade por especialidade e sugira ações estratégicas. Máximo 4 insights concisos. Português brasileiro.",
            },
            {
              role: "user",
              content: `Analise esses dados e sugira ações estratégicas:\n\nTop 3 mais eficientes: ${JSON.stringify(top3)}\nBottom 3 menos eficientes: ${JSON.stringify(bottom3)}\nTotal especialidades: ${analises.length}`,
            },
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
              const inserts = insights.map((ins: any) => {
                const analise = analises.find(a => a.especialidade === ins.especialidade);
                return {
                  tipo: "rentabilidade",
                  descricao: `[${ins.especialidade}] eficiência=${analise?.indice_eficiencia || 0}: ${ins.descricao}`,
                  impacto_estimado: ins.impacto_estimado,
                };
              });
              await supabase.from("insights_ia").insert(inserts);
              console.log(`[analise-rentabilidade] ${inserts.length} insights salvos`);
            }
          } catch {
            console.error("[analise-rentabilidade] Erro ao parsear IA");
          }
        }
      } else {
        const errText = await aiRes.text();
        console.error(`[analise-rentabilidade] AI erro ${aiRes.status}:`, errText.slice(0, 200));
      }
    }

    return new Response(JSON.stringify({
      status: "concluido",
      total_especialidades: analises.length,
      top_3_eficientes: top3,
      bottom_3_eficientes: bottom3,
      analises,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analise-rentabilidade] Erro:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
