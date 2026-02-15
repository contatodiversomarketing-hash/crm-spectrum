import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function calcVariacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function extrairMetrica(data: unknown, ...paths: string[]): number | null {
  if (!data || typeof data !== "object") return null;
  for (const path of paths) {
    let val: unknown = data;
    for (const key of path.split(".")) {
      if (val && typeof val === "object" && key in val) { val = (val as Record<string, unknown>)[key]; } else { val = undefined; break; }
    }
    if (typeof val === "number") return val;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
    const ADMIN_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    const coletaRes = await fetch(`${supabaseUrl}/functions/v1/coletar-dados-integrados`, {
      method: "GET", headers: { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    });

    if (!coletaRes.ok) return new Response(JSON.stringify({ error: "Falha ao coletar dados" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const dados = await coletaRes.json();
    const crmData = dados.crm?.ok ? dados.crm.data : null;
    const gestaoData = dados.gestao?.ok ? dados.gestao.data : null;
    const finData = dados.financeiro?.ok ? dados.financeiro.data : null;

    const receitaAtual = extrairMetrica(finData, "receita_atual", "receita_15d", "revenue_current");
    const receitaAnterior = extrairMetrica(finData, "receita_anterior", "receita_15d_anterior", "revenue_previous");
    const conversaoAtual = extrairMetrica(crmData, "taxa_conversao", "conversion_rate");
    const conversaoAnterior = extrairMetrica(crmData, "taxa_conversao_anterior", "conversion_rate_previous");
    const faltasAtual = extrairMetrica(gestaoData, "taxa_faltas", "no_show_rate");
    const faltasAnterior = extrairMetrica(gestaoData, "taxa_faltas_anterior", "no_show_rate_previous");
    const ocupacao = extrairMetrica(gestaoData, "ocupacao_media", "occupancy_rate");

    interface Alerta { tipo: string; descricao: string; valor_atual: number | null; valor_anterior: number | null; variacao_pct: number | null; }
    const alertas: Alerta[] = [];

    const varReceita = calcVariacao(receitaAtual, receitaAnterior);
    if (varReceita !== null && varReceita < -15) alertas.push({ tipo: "queda_receita", descricao: `Receita caiu ${Math.abs(varReceita)}%`, valor_atual: receitaAtual, valor_anterior: receitaAnterior, variacao_pct: varReceita });
    const varConversao = calcVariacao(conversaoAtual, conversaoAnterior);
    if (varConversao !== null && varConversao < -10) alertas.push({ tipo: "queda_conversao", descricao: `Conversão caiu ${Math.abs(varConversao)}%`, valor_atual: conversaoAtual, valor_anterior: conversaoAnterior, variacao_pct: varConversao });
    const varFaltas = calcVariacao(faltasAtual, faltasAnterior);
    if (varFaltas !== null && varFaltas > 10) alertas.push({ tipo: "aumento_faltas", descricao: `Faltas aumentaram ${varFaltas}%`, valor_atual: faltasAtual, valor_anterior: faltasAnterior, variacao_pct: varFaltas });
    if (ocupacao !== null && ocupacao < 60) alertas.push({ tipo: "baixa_ocupacao", descricao: `Ocupação em ${ocupacao}%`, valor_atual: ocupacao, valor_anterior: null, variacao_pct: null });

    let mensagemEnviada = false;

    if (alertas.length > 0) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      let logsHojeQ = supabase.from("logs_decisao").select("decisao").eq("evento", "monitoramento_anomalia").gte("criado_em", hoje.toISOString());
      if (clinica_id) logsHojeQ = logsHojeQ.eq("clinica_id", clinica_id);
      const { data: logsHoje } = await logsHojeQ;
      const jaAlertados = new Set((logsHoje || []).map((l) => l.decisao));
      const alertasNovos = alertas.filter((a) => !jaAlertados.has(a.tipo));

      if (alertasNovos.length > 0) {
        await supabase.from("logs_decisao").insert(alertasNovos.map((a) => ({
          evento: "monitoramento_anomalia", decisao: a.tipo, regra_aplicada: a.descricao,
          confianca: a.variacao_pct, dados_entrada: { valor_atual: a.valor_atual, valor_anterior: a.valor_anterior, variacao_pct: a.variacao_pct, timestamp: dados.timestamp },
          ...(clinica_id && { clinica_id }),
        })));

        if (LOVABLE_API_KEY && MEGA_API_URL && MEGA_API_TOKEN && ADMIN_NUMBER) {
          try {
            const resumoAlertas = alertasNovos.map((a) => `• ${a.descricao}`).join("\n");
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [
                { role: "system", content: "Assistente monitoramento clínica. Mensagem curta profissional WhatsApp. Máx 300 chars." },
                { role: "user", content: `Anomalias:\n${resumoAlertas}` },
              ], temperature: 0.5, max_tokens: 200 }),
            });

            let mensagem = `⚠️ Alerta Core-IA:\n${resumoAlertas}`;
            if (aiRes.ok) { const aiData = await aiRes.json(); const content = aiData.choices?.[0]?.message?.content?.trim(); if (content) mensagem = content; } else { await aiRes.text(); }

            const megaRes = await fetch(`${MEGA_API_URL}/api/v1/sendText`, {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEGA_API_TOKEN}` },
              body: JSON.stringify({ number: ADMIN_NUMBER, text: mensagem }),
            });
            mensagemEnviada = megaRes.ok;
            await megaRes.text();
          } catch (err) { console.error("[monitorar-anomalias] Erro envio:", err); }
        }
      }
    }

    return new Response(JSON.stringify({ alertas_detectados: alertas, mensagem_enviada: mensagemEnviada }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[monitorar-anomalias] Erro:", error);
    return new Response(JSON.stringify({ error: true, message: error instanceof Error ? error.message : "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
