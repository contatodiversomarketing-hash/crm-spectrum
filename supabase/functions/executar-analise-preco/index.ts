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
    const dias7 = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Buscar dados de agendamento e financeiros em paralelo
    const [gestaoRes, finRes, autoRes] = await Promise.all([
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
      supabase.from("automacoes").select("tipo, status, respondeu").gte("criado_em", dias7),
    ]);

    // Parse agendamentos
    let agendamentos: any[] = [];
    if (gestaoRes.ok) {
      const d = await gestaoRes.json();
      agendamentos = Array.isArray(d) ? d : d.appointments || d.agendamentos || [];
    } else { await gestaoRes.text(); }

    // Parse receita
    let ticketMedio = 0;
    if (finRes.ok) {
      const f = await finRes.json();
      ticketMedio = f.ticket_medio || f.average_ticket || 0;
    } else { await finRes.text(); }

    // 2. Calcular métricas por especialidade
    const espMap: Record<string, { total: number; confirmados: number; cancelados: number }> = {};
    for (const a of agendamentos) {
      const esp = a.specialty || a.especialidade || "geral";
      const status = (a.status || "").toLowerCase();
      if (!espMap[esp]) espMap[esp] = { total: 0, confirmados: 0, cancelados: 0 };
      espMap[esp].total++;
      if (["confirmado", "confirmed", "realizado", "completed"].includes(status)) espMap[esp].confirmados++;
      if (["cancelado", "cancelled", "canceled"].includes(status)) espMap[esp].cancelados++;
    }

    // Conversão geral dos últimos 7d
    const autos = autoRes.data || [];
    const enviados7d = autos.filter(a => a.status === "enviado" || a.status === "ligado").length;
    const respondidos7d = autos.filter(a => a.respondeu).length;
    const taxaConversao = enviados7d > 0 ? (respondidos7d / enviados7d) * 100 : 0;

    // 3. Aplicar regras de precificação por especialidade
    const analises: {
      especialidade: string;
      ocupacao: number;
      taxa_cancelamento: number;
      sugestao: string;
      percentual: number | null;
    }[] = [];

    for (const [esp, dados] of Object.entries(espMap)) {
      const ocupacao = dados.total > 0 ? (dados.confirmados / dados.total) * 100 : 0;
      const taxaCancelamento = dados.total > 0 ? (dados.cancelados / dados.total) * 100 : 0;

      let sugestao: string;
      let percentual: number | null = null;

      if (ocupacao > 90 && taxaCancelamento < 10) {
        sugestao = "aumentar_preco";
        // Percentual proporcional: quanto maior ocupação, maior ajuste (5-12%)
        percentual = Math.round(5 + ((ocupacao - 90) / 10) * 7);
        percentual = Math.min(percentual, 12);
      } else if (ocupacao < 60) {
        sugestao = "criar_promocao";
      } else {
        sugestao = "manter_preco";
      }

      analises.push({ especialidade: esp, ocupacao: parseFloat(ocupacao.toFixed(1)), taxa_cancelamento: parseFloat(taxaCancelamento.toFixed(1)), sugestao, percentual });
    }

    const comAcao = analises.filter(a => a.sugestao !== "manter_preco");

    console.log(`[analise-preco] ${analises.length} especialidades, ${comAcao.length} com sugestão de ação`);

    // 4. Gerar insights via IA se há ações recomendadas
    if (comAcao.length > 0) {
      await supabase.from("logs_decisao").insert({
        evento: "analise_precificacao",
        decisao: `${comAcao.length}_ajustes_sugeridos`,
        regra_aplicada: "ocupacao_90_cancelamento_10_ociosidade_60",
        confianca: 0.8,
        dados_entrada: { analises: comAcao, ticket_medio: ticketMedio, taxa_conversao: parseFloat(taxaConversao.toFixed(1)) },
      });

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          tools: [{
            type: "function",
            function: {
              name: "gerar_insights_preco",
              description: "Retorna justificativas para ajustes de preço por especialidade.",
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
          tool_choice: { type: "function", function: { name: "gerar_insights_preco" } },
          messages: [
            { role: "system", content: "Você é um consultor de precificação de clínica médica. Justifique cada sugestão de ajuste de preço de forma concisa e acionável. Português brasileiro. Máximo 1 frase por insight." },
            { role: "user", content: `Com base nesses dados, justifique a decisão:\n\nTicket médio: R$${ticketMedio}\nTaxa de conversão: ${taxaConversao.toFixed(1)}%\nAnálises: ${JSON.stringify(comAcao)}` },
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
              // Combinar com dados de análise
              const inserts = insights.map((ins: any) => {
                const analise = comAcao.find(a => a.especialidade === ins.especialidade);
                return {
                  tipo: "precificacao",
                  descricao: `[${ins.especialidade}] ${analise?.sugestao || "ajuste"}: ${ins.descricao}${analise?.percentual ? ` (${analise.percentual}%)` : ""}`,
                  impacto_estimado: ins.impacto_estimado,
                };
              });
              await supabase.from("insights_ia").insert(inserts);
              console.log(`[analise-preco] ${inserts.length} insights salvos`);
            }
          } catch { console.error("[analise-preco] Erro ao parsear IA"); }
        }
      } else {
        const errText = await aiRes.text();
        console.error(`[analise-preco] AI erro ${aiRes.status}:`, errText.slice(0, 200));
      }
    }

    return new Response(JSON.stringify({
      status: "concluido",
      ticket_medio: ticketMedio,
      taxa_conversao: parseFloat(taxaConversao.toFixed(1)),
      total_especialidades: analises.length,
      analises,
      acoes_sugeridas: comAcao.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analise-preco] Erro:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
