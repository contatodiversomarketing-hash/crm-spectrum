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
    const dias60 = new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dias7 = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Buscar dados de agendamento via API Gestão
    const gestaoRes = await fetch(`${GESTAO_API_URL}/internal-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GESTAO_API_TOKEN}`,
      },
      body: JSON.stringify({
        action: "get_scheduling_metrics",
        date_from: dias60,
        date_to: agora.toISOString(),
      }),
    });

    let agendamentos: any[] = [];
    if (gestaoRes.ok) {
      const gestaoData = await gestaoRes.json();
      agendamentos = Array.isArray(gestaoData) ? gestaoData : gestaoData.appointments || gestaoData.agendamentos || [];
    } else {
      const errText = await gestaoRes.text();
      console.error(`[previsao-demanda] API Gestão erro ${gestaoRes.status}:`, errText.slice(0, 200));
    }

    // 2. Classificar por período
    const todos = agendamentos.map((a: any) => ({
      data: a.date || a.data || a.created_at,
      status: (a.status || "").toLowerCase(),
      especialidade: a.specialty || a.especialidade || "geral",
      profissional: a.professional || a.profissional || "não informado",
    }));

    const ultimos30 = todos.filter(a => a.data >= dias30);
    const ultimos7 = todos.filter(a => a.data >= dias7);

    // 3. Calcular métricas globais
    const calcMetricas = (lista: any[]) => {
      const total = lista.length;
      const cancelados = lista.filter(a => ["cancelado", "cancelled", "canceled"].includes(a.status)).length;
      const faltas = lista.filter(a => ["falta", "no_show", "no-show"].includes(a.status)).length;
      const confirmados = lista.filter(a => ["confirmado", "confirmed", "realizado", "completed"].includes(a.status)).length;
      return { total, cancelados, faltas, confirmados };
    };

    const metricas60d = calcMetricas(todos);
    const metricas30d = calcMetricas(ultimos30);
    const metricas7d = calcMetricas(ultimos7);

    // 4. Ocupação por especialidade e profissional
    const agrupar = (lista: any[], campo: string): Record<string, { total: number; confirmados: number; ocupacao: number }> => {
      const mapa: Record<string, { total: number; confirmados: number }> = {};
      for (const a of lista) {
        const chave = a[campo] || "outros";
        if (!mapa[chave]) mapa[chave] = { total: 0, confirmados: 0 };
        mapa[chave].total++;
        if (["confirmado", "confirmed", "realizado", "completed"].includes(a.status)) {
          mapa[chave].confirmados++;
        }
      }
      const result: Record<string, { total: number; confirmados: number; ocupacao: number }> = {};
      for (const [k, v] of Object.entries(mapa)) {
        result[k] = { ...v, ocupacao: v.total > 0 ? (v.confirmados / v.total) * 100 : 0 };
      }
      return result;
    };

    const ocupacaoEspecialidade = agrupar(ultimos30, "especialidade");
    const ocupacaoProfissional = agrupar(ultimos30, "profissional");

    // 5. Taxa de crescimento e projeção
    const media30d = metricas30d.total / 30;
    const media7d = metricas7d.total / 7;
    const taxaCrescimento = media30d > 0 ? ((media7d - media30d) / media30d) * 100 : 0;
    const projecao30d = Math.round(media7d * 30 * (1 + taxaCrescimento / 100));

    // 6. Detectar riscos
    const riscos: { tipo: string; entidade: string; ocupacao: number; categoria: string }[] = [];

    for (const [esp, dados] of Object.entries(ocupacaoEspecialidade)) {
      if (dados.ocupacao > 90) {
        riscos.push({ tipo: "sobrecarga", entidade: esp, ocupacao: dados.ocupacao, categoria: "especialidade" });
      } else if (dados.ocupacao < 50 && dados.total >= 3) {
        riscos.push({ tipo: "ociosidade", entidade: esp, ocupacao: dados.ocupacao, categoria: "especialidade" });
      }
    }

    for (const [prof, dados] of Object.entries(ocupacaoProfissional)) {
      if (dados.ocupacao > 90) {
        riscos.push({ tipo: "sobrecarga", entidade: prof, ocupacao: dados.ocupacao, categoria: "profissional" });
      } else if (dados.ocupacao < 50 && dados.total >= 3) {
        riscos.push({ tipo: "ociosidade", entidade: prof, ocupacao: dados.ocupacao, categoria: "profissional" });
      }
    }

    console.log(`[previsao-demanda] ${todos.length} agendamentos, ${riscos.length} riscos, projeção 30d: ${projecao30d}`);

    // 7. Registrar logs e gerar insights para riscos
    if (riscos.length > 0) {
      await supabase.from("logs_decisao").insert({
        evento: "risco_demanda_detectado",
        decisao: `${riscos.length}_riscos`,
        regra_aplicada: "ocupacao_threshold_50_90",
        confianca: 0.85,
        dados_entrada: {
          riscos,
          metricas_7d: metricas7d,
          metricas_30d: metricas30d,
          taxa_crescimento: parseFloat(taxaCrescimento.toFixed(1)),
          projecao_30d: projecao30d,
        },
      });

      // Gerar insights via IA
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          tools: [
            {
              type: "function",
              function: {
                name: "gerar_insights_demanda",
                description: "Retorna insights sobre previsão de demanda da clínica.",
                parameters: {
                  type: "object",
                  properties: {
                    insights: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          descricao: { type: "string" },
                          especialidade: { type: "string" },
                          impacto_estimado: { type: "string", enum: ["alto", "medio", "baixo"] },
                        },
                        required: ["descricao", "especialidade", "impacto_estimado"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["insights"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "gerar_insights_demanda" } },
          messages: [
            {
              role: "system",
              content: "Você é um analista de operações de clínica médica. Gere insights concisos e acionáveis sobre previsão de demanda. Máximo 3 insights. Português brasileiro.",
            },
            {
              role: "user",
              content: `Com base nesses dados, sugira ação estratégica:\n\nRiscos detectados: ${JSON.stringify(riscos)}\nMédia 7d: ${media7d.toFixed(1)} agendamentos/dia\nMédia 30d: ${media30d.toFixed(1)} agendamentos/dia\nCrescimento: ${taxaCrescimento.toFixed(1)}%\nProjeção 30d: ${projecao30d} agendamentos\nOcupação por especialidade: ${JSON.stringify(ocupacaoEspecialidade)}`,
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
              await supabase.from("insights_ia").insert(
                insights.map((i: any) => ({
                  tipo: "previsao_demanda",
                  descricao: `[${i.especialidade}] ${i.descricao}`,
                  impacto_estimado: i.impacto_estimado,
                }))
              );
              console.log(`[previsao-demanda] ${insights.length} insights salvos`);
            }
          } catch {
            console.error("[previsao-demanda] Erro ao parsear resposta IA");
          }
        }
      } else {
        const errText = await aiRes.text();
        console.error(`[previsao-demanda] AI erro ${aiRes.status}:`, errText.slice(0, 200));
      }
    }

    const relatorio = {
      status: "concluido",
      periodo: "60 dias",
      metricas: { ultimos_60d: metricas60d, ultimos_30d: metricas30d, ultimos_7d: metricas7d },
      media_diaria: { ultimos_30d: parseFloat(media30d.toFixed(1)), ultimos_7d: parseFloat(media7d.toFixed(1)) },
      taxa_crescimento: parseFloat(taxaCrescimento.toFixed(1)),
      projecao_30d: projecao30d,
      ocupacao_por_especialidade: ocupacaoEspecialidade,
      ocupacao_por_profissional: ocupacaoProfissional,
      riscos,
      total_riscos: riscos.length,
    };

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[previsao-demanda] Erro:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
