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

    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let auto7dQ = supabase.from("automacoes").select("tipo, status, respondeu").gte("criado_em", seteDiasAtras);
    let auto30dQ = supabase.from("automacoes").select("tipo, status, respondeu").gte("criado_em", trintaDiasAtras);
    let logs7dQ = supabase.from("logs_decisao").select("evento, decisao").gte("criado_em", seteDiasAtras).limit(500);
    let logs30dQ = supabase.from("logs_decisao").select("evento, decisao").gte("criado_em", trintaDiasAtras).limit(500);

    if (clinica_id) {
      auto7dQ = auto7dQ.eq("clinica_id", clinica_id);
      auto30dQ = auto30dQ.eq("clinica_id", clinica_id);
      logs7dQ = logs7dQ.eq("clinica_id", clinica_id);
      logs30dQ = logs30dQ.eq("clinica_id", clinica_id);
    }

    const [auto7d, auto30d, logs7d, logs30d] = await Promise.all([auto7dQ, auto30dQ, logs7dQ, logs30dQ]);

    const calcMetricas = (automacoes: any[], logs: any[]) => {
      const total_enviados = automacoes.filter(a => a.status === "enviado" || a.status === "ligado").length;
      const total_confirmados = logs.filter(l => l.evento === "confirmacao_voz" && l.decisao === "confirmado").length;
      const total_agendados = automacoes.filter(a => a.respondeu === true).length;
      const total_opt_out = automacoes.filter(a => a.status === "nao_interessado_temporario").length;
      const taxa_conversao = total_enviados > 0 ? (total_agendados / total_enviados) * 100 : 0;
      return { total_enviados, total_confirmados, total_agendados, total_opt_out, taxa_conversao };
    };

    const metricas7d = calcMetricas(auto7d.data || [], logs7d.data || []);
    const metricas30d = calcMetricas(auto30d.data || [], logs30d.data || []);
    const variacao_percentual = metricas30d.taxa_conversao > 0 ? ((metricas7d.taxa_conversao - metricas30d.taxa_conversao) / metricas30d.taxa_conversao) * 100 : 0;
    const alerta_gerado = Math.abs(variacao_percentual) > 15;

    if (alerta_gerado) {
      await supabase.from("logs_decisao").insert({
        evento: "variacao_critica_performance",
        decisao: `variacao_${variacao_percentual > 0 ? "positiva" : "negativa"}_${Math.abs(variacao_percentual).toFixed(0)}pct`,
        regra_aplicada: "comparacao_7d_vs_30d_threshold_15pct",
        confianca: Math.min(Math.abs(variacao_percentual) / 100, 1),
        dados_entrada: { metricas_7d: metricas7d, metricas_30d: metricas30d, variacao_percentual: parseFloat(variacao_percentual.toFixed(1)) },
        ...(clinica_id && { clinica_id }),
      });

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um analista estratégico de clínica médica. Gere um insight conciso e acionável (máximo 3 frases) em português brasileiro." },
            { role: "user", content: `Taxa 7d: ${metricas7d.taxa_conversao.toFixed(1)}%, Taxa 30d: ${metricas30d.taxa_conversao.toFixed(1)}%, Variação: ${variacao_percentual.toFixed(1)}%\nEnviados 7d: ${metricas7d.total_enviados}, Agendados 7d: ${metricas7d.total_agendados}, Opt-outs 7d: ${metricas7d.total_opt_out}\nSugira ações para ${variacao_percentual < 0 ? "reverter a queda" : "manter o crescimento"}.` },
          ],
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const descricao = aiData.choices?.[0]?.message?.content || "Insight indisponível.";
        await supabase.from("insights_ia").insert({
          tipo: "performance", descricao,
          impacto_estimado: `${Math.abs(variacao_percentual).toFixed(1)}%`,
          ...(clinica_id && { clinica_id }),
        });
      } else { await aiRes.text(); }
    }

    return new Response(JSON.stringify({
      taxa_7_dias: parseFloat(metricas7d.taxa_conversao.toFixed(1)),
      taxa_30_dias: parseFloat(metricas30d.taxa_conversao.toFixed(1)),
      variacao_percentual: parseFloat(variacao_percentual.toFixed(1)),
      alerta_gerado, metricas_7d: metricas7d, metricas_30d: metricas30d,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[analise-estrategica] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
