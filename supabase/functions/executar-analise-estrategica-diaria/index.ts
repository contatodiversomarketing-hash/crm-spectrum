import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function calcularConversao(automacoes: any[]): { enviados: number; respondidos: number; taxa: number } {
  const enviados = automacoes.filter(a => a.status === "enviado" || a.status === "ligado").length;
  const respondidos = automacoes.filter(a => a.respondeu === true).length;
  const taxa = enviados > 0 ? (respondidos / enviados) * 100 : 0;
  return { enviados, respondidos, taxa };
}

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

    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Buscar automações dos dois períodos em paralelo
    const [auto7d, auto30d] = await Promise.all([
      supabase.from("automacoes").select("tipo, status, respondeu, payload, criado_em").gte("criado_em", seteDiasAtras),
      supabase.from("automacoes").select("tipo, status, respondeu, payload, criado_em").gte("criado_em", trintaDiasAtras),
    ]);

    const dados7d = auto7d.data || [];
    const dados30d = auto30d.data || [];

    // Conversão geral
    const conv7d = calcularConversao(dados7d);
    const conv30d = calcularConversao(dados30d);

    // Conversão por tipo (7d)
    const tipoMap7d: Record<string, any[]> = {};
    for (const a of dados7d) {
      if (!tipoMap7d[a.tipo]) tipoMap7d[a.tipo] = [];
      tipoMap7d[a.tipo].push(a);
    }
    const conversaoPorTipo7d = Object.entries(tipoMap7d).map(([tipo, arr]) => ({
      tipo,
      ...calcularConversao(arr),
    }));

    // Conversão por tipo (30d)
    const tipoMap30d: Record<string, any[]> = {};
    for (const a of dados30d) {
      if (!tipoMap30d[a.tipo]) tipoMap30d[a.tipo] = [];
      tipoMap30d[a.tipo].push(a);
    }
    const conversaoPorTipo30d = Object.entries(tipoMap30d).map(([tipo, arr]) => ({
      tipo,
      ...calcularConversao(arr),
    }));

    // Calcular variação percentual
    const variacao = conv30d.taxa > 0
      ? ((conv7d.taxa - conv30d.taxa) / conv30d.taxa) * 100
      : 0;

    const quedaDetectada = variacao < -15;

    console.log(`[analise-estrategica] Conv 7d: ${conv7d.taxa.toFixed(1)}%, Conv 30d: ${conv30d.taxa.toFixed(1)}%, Variação: ${variacao.toFixed(1)}%`);

    // Se queda > 15%, registrar alerta
    if (quedaDetectada) {
      await supabase.from("logs_decisao").insert({
        evento: "queda_performance",
        decisao: `queda_${Math.abs(variacao).toFixed(0)}pct`,
        regra_aplicada: "variacao_conversao_7d_vs_30d",
        confianca: Math.min(Math.abs(variacao) / 100, 1),
        dados_entrada: {
          conv_7d: conv7d,
          conv_30d: conv30d,
          variacao_pct: variacao,
        },
      });
      console.log("[analise-estrategica] Alerta de queda registrado");
    }

    // Gerar sugestão via IA
    const resumo = {
      conversao_7d: conv7d,
      conversao_30d: conv30d,
      variacao_pct: parseFloat(variacao.toFixed(1)),
      queda_detectada: quedaDetectada,
      por_tipo_7d: conversaoPorTipo7d,
      por_tipo_30d: conversaoPorTipo30d,
      total_automacoes_7d: dados7d.length,
      total_automacoes_30d: dados30d.length,
    };

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
              name: "gerar_insights_estrategicos",
              description: "Retorna insights estratégicos baseados nos dados de performance da clínica.",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tipo: { type: "string", enum: ["oportunidade", "risco", "acao_imediata", "tendencia"] },
                        descricao: { type: "string" },
                        impacto_estimado: { type: "string", enum: ["alto", "medio", "baixo"] },
                      },
                      required: ["tipo", "descricao", "impacto_estimado"],
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
        tool_choice: { type: "function", function: { name: "gerar_insights_estrategicos" } },
        messages: [
          {
            role: "system",
            content: `Você é um analista estratégico de clínica médica. Analise os dados de conversão e automação e gere 3 a 5 insights acionáveis. Foque em: quedas de performance, oportunidades de melhoria, riscos operacionais e ações imediatas recomendadas. Seja direto e específico.`,
          },
          {
            role: "user",
            content: `Dados de performance:\n${JSON.stringify(resumo, null, 2)}`,
          },
        ],
      }),
    });

    let insights: { tipo: string; descricao: string; impacto_estimado: string }[] = [];

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          insights = parsed.insights || [];
        } catch {
          console.error("[analise-estrategica] Erro ao parsear resposta IA");
        }
      }
    } else {
      console.error(`[analise-estrategica] AI gateway erro: ${aiRes.status}`);
    }

    // Salvar insights na tabela
    if (insights.length > 0) {
      const inserts = insights.map(i => ({
        tipo: i.tipo,
        descricao: i.descricao,
        impacto_estimado: i.impacto_estimado,
      }));

      const { error: insertError } = await supabase.from("insights_ia").insert(inserts);
      if (insertError) {
        console.error("[analise-estrategica] Erro ao salvar insights:", insertError);
      } else {
        console.log(`[analise-estrategica] ${insights.length} insights salvos`);
      }
    }

    const relatorio = {
      status: "concluido",
      periodo_comparacao: "7d vs 30d",
      conversao_7d: conv7d,
      conversao_30d: conv30d,
      variacao_pct: parseFloat(variacao.toFixed(1)),
      queda_detectada: quedaDetectada,
      por_tipo_7d: conversaoPorTipo7d,
      insights_gerados: insights.length,
      insights,
    };

    console.log("[analise-estrategica] Análise concluída:", JSON.stringify(relatorio).slice(0, 300));

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analise-estrategica] Erro:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
