import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let autoQ = supabase.from("automacoes").select("tipo, status, respondeu, payload").gte("criado_em", seteDiasAtras);
    let interQ = supabase.from("interacoes_ia").select("intencao_detectada, supervisionado, resposta_final, canal").gte("criado_em", seteDiasAtras);
    let logsQ = supabase.from("logs_decisao").select("evento, decisao, confianca").gte("criado_em", seteDiasAtras).limit(200);

    if (clinica_id) { autoQ = autoQ.eq("clinica_id", clinica_id); interQ = interQ.eq("clinica_id", clinica_id); logsQ = logsQ.eq("clinica_id", clinica_id); }

    const [automacoes, interacoes, logs] = await Promise.all([autoQ, interQ, logsQ]);

    const autoData = automacoes.data || [];
    const interData = interacoes.data || [];
    const logData = logs.data || [];

    const totalMensagens = autoData.filter(a => a.tipo === "reativacao_score" || a.tipo === "prospeccao_lead").length;
    const totalLigacoes = autoData.filter(a => a.tipo === "reativacao_voz" || a.tipo === "confirmacao_voz").length;
    const confirmados = logData.filter(l => l.decisao === "confirmado").length;
    const totalConfirmacoes = logData.filter(l => l.evento === "confirmacao_voz").length;
    const responderam = autoData.filter(a => a.respondeu === true).length;

    const porTipo: Record<string, { total: number; respondidos: number }> = {};
    for (const a of autoData) {
      if (!porTipo[a.tipo]) porTipo[a.tipo] = { total: 0, respondidos: 0 };
      porTipo[a.tipo].total++;
      if (a.respondeu) porTipo[a.tipo].respondidos++;
    }

    const resumoDados = {
      periodo: "últimos 7 dias", total_mensagens: totalMensagens, total_ligacoes: totalLigacoes,
      confirmados, total_confirmacoes: totalConfirmacoes,
      taxa_confirmacao: totalConfirmacoes > 0 ? ((confirmados / totalConfirmacoes) * 100).toFixed(1) + "%" : "N/A",
      responderam, total_interacoes_ia: interData.length,
      supervisionadas: interData.filter(i => i.supervisionado).length,
      automaticas: interData.filter(i => !i.supervisionado).length,
      por_tipo: porTipo, opt_outs: logData.filter(l => l.evento === "opt_out_90_dias").length,
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.4-mini",
        messages: [
          { role: "system", content: "Analista de dados clínica. Resumo executivo conciso (máx 5 bullets) em português. Foque: tendências, melhorias, riscos, ações. Use emojis." },
          { role: "user", content: `Dados últimos 7 dias:\n${JSON.stringify(resumoDados, null, 2)}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit excedido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const insight = aiData.choices?.[0]?.message?.content || "Sem insights disponíveis.";

    return new Response(JSON.stringify({ resumo: resumoDados, insight }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[gerar-insights-ia] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
