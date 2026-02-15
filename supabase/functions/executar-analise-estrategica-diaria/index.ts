import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Metricas {
  total_enviados: number;
  total_confirmados: number;
  total_agendados: number;
  total_opt_out: number;
  taxa_conversao: number;
}

function calcularMetricas(automacoes: any[], logs: any[]): Metricas {
  const total_enviados = automacoes.filter(a =>
    a.status === "enviado" || a.status === "ligado"
  ).length;
  const total_confirmados = logs.filter(l =>
    l.evento === "confirmacao_voz" && l.decisao === "confirmado"
  ).length;
  const total_agendados = automacoes.filter(a => a.respondeu === true).length;
  const total_opt_out = automacoes.filter(a =>
    a.status === "nao_interessado_temporario"
  ).length;
  const taxa_conversao = total_enviados > 0
    ? (total_agendados / total_enviados) * 100
    : 0;

  return { total_enviados, total_confirmados, total_agendados, total_opt_out, taxa_conversao };
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

    // Buscar dados em paralelo
    const [auto7d, auto30d, logs7d, logs30d] = await Promise.all([
      supabase.from("automacoes").select("tipo, status, respondeu").gte("criado_em", seteDiasAtras),
      supabase.from("automacoes").select("tipo, status, respondeu").gte("criado_em", trintaDiasAtras),
      supabase.from("logs_decisao").select("evento, decisao").gte("criado_em", seteDiasAtras).limit(500),
      supabase.from("logs_decisao").select("evento, decisao").gte("criado_em", trintaDiasAtras).limit(500),
    ]);

    const metricas7d = calcularMetricas(auto7d.data || [], logs7d.data || []);
    const metricas30d = calcularMetricas(auto30d.data || [], logs30d.data || []);

    // Calcular variação percentual
    const variacao_percentual = metricas30d.taxa_conversao > 0
      ? ((metricas7d.taxa_conversao - metricas30d.taxa_conversao) / metricas30d.taxa_conversao) * 100
      : 0;

    const alerta_gerado = Math.abs(variacao_percentual) > 15;

    console.log(`[analise-estrategica] 7d: ${metricas7d.taxa_conversao.toFixed(1)}%, 30d: ${metricas30d.taxa_conversao.toFixed(1)}%, Variação: ${variacao_percentual.toFixed(1)}%`);

    // Registrar alerta se variação crítica
    if (alerta_gerado) {
      await supabase.from("logs_decisao").insert({
        evento: "variacao_critica_performance",
        decisao: `variacao_${variacao_percentual > 0 ? "positiva" : "negativa"}_${Math.abs(variacao_percentual).toFixed(0)}pct`,
        regra_aplicada: "comparacao_7d_vs_30d_threshold_15pct",
        confianca: Math.min(Math.abs(variacao_percentual) / 100, 1),
        dados_entrada: {
          metricas_7d: metricas7d,
          metricas_30d: metricas30d,
          variacao_percentual: parseFloat(variacao_percentual.toFixed(1)),
        },
      });

      // Gerar insight via Lovable AI
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "Você é um analista estratégico de clínica médica. Gere um insight conciso e acionável (máximo 3 frases) em português brasileiro. Seja direto e prático.",
            },
            {
              role: "user",
              content: `Analise a seguinte variação de performance:\n\n- Taxa de conversão últimos 7 dias: ${metricas7d.taxa_conversao.toFixed(1)}%\n- Taxa de conversão últimos 30 dias: ${metricas30d.taxa_conversao.toFixed(1)}%\n- Variação: ${variacao_percentual.toFixed(1)}%\n- Enviados 7d: ${metricas7d.total_enviados}, Agendados 7d: ${metricas7d.total_agendados}, Opt-outs 7d: ${metricas7d.total_opt_out}\n- Enviados 30d: ${metricas30d.total_enviados}, Agendados 30d: ${metricas30d.total_agendados}\n\nSugira ações práticas para ${variacao_percentual < 0 ? "reverter a queda" : "manter o crescimento"}.`,
            },
          ],
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const descricao = aiData.choices?.[0]?.message?.content || "Insight indisponível.";

        await supabase.from("insights_ia").insert({
          tipo: "performance",
          descricao,
          impacto_estimado: `${Math.abs(variacao_percentual).toFixed(1)}%`,
        });

        console.log("[analise-estrategica] Insight salvo");
      } else {
        const errText = await aiRes.text();
        console.error(`[analise-estrategica] AI erro ${aiRes.status}:`, errText.slice(0, 200));
      }
    }

    const relatorio = {
      taxa_7_dias: parseFloat(metricas7d.taxa_conversao.toFixed(1)),
      taxa_30_dias: parseFloat(metricas30d.taxa_conversao.toFixed(1)),
      variacao_percentual: parseFloat(variacao_percentual.toFixed(1)),
      alerta_gerado,
      metricas_7d: metricas7d,
      metricas_30d: metricas30d,
    };

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
