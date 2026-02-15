import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const dias30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dias60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel data fetching
    const [
      interacoesAtual,
      interacoesAnterior,
      automacoesAtual,
      automacoesAnterior,
      agendamentos,
      agendamentosAnterior,
    ] = await Promise.all([
      supabase.from("interacoes_ia").select("id, criado_em, intencao_detectada, resposta_final, supervisionado").gte("criado_em", dias30),
      supabase.from("interacoes_ia").select("id").gte("criado_em", dias60).lt("criado_em", dias30),
      supabase.from("automacoes").select("id, tipo, status, criado_em, data_execucao").gte("criado_em", dias30),
      supabase.from("automacoes").select("id").gte("criado_em", dias60).lt("criado_em", dias30),
      supabase.from("automacoes").select("id").eq("tipo", "agendamento").eq("status", "enviado").gte("criado_em", dias30),
      supabase.from("automacoes").select("id").eq("tipo", "agendamento").eq("status", "enviado").gte("criado_em", dias60).lt("criado_em", dias30),
    ]);

    const totalInteracoes = interacoesAtual.data?.length ?? 0;
    const totalInteracoesAnterior = interacoesAnterior.data?.length ?? 0;
    const totalAutomacoes = automacoesAtual.data?.length ?? 0;
    const totalAutomacoesAnterior = automacoesAnterior.data?.length ?? 0;
    const totalAgendamentos = agendamentos.data?.length ?? 0;
    const totalAgendamentosAnterior = agendamentosAnterior.data?.length ?? 0;

    // Tempo médio de resposta (automações com data_execucao)
    const automacoesComExecucao = (automacoesAtual.data ?? []).filter(
      (a) => a.data_execucao && a.criado_em
    );
    let tempoMedioMs = 0;
    if (automacoesComExecucao.length > 0) {
      const soma = automacoesComExecucao.reduce((acc, a) => {
        return acc + (new Date(a.data_execucao!).getTime() - new Date(a.criado_em).getTime());
      }, 0);
      tempoMedioMs = soma / automacoesComExecucao.length;
    }
    const tempoMedioMinutos = Math.round(tempoMedioMs / 60000);

    // Intenções mais frequentes
    const intencoes: Record<string, number> = {};
    for (const i of interacoesAtual.data ?? []) {
      const key = i.intencao_detectada || "nao_identificada";
      intencoes[key] = (intencoes[key] || 0) + 1;
    }
    const topIntencoes = Object.entries(intencoes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intencao, count]) => ({ intencao, count }));

    // Taxa de supervisão
    const supervisionados = (interacoesAtual.data ?? []).filter((i) => i.supervisionado).length;
    const taxaSupervisao = totalInteracoes > 0 ? Math.round((supervisionados / totalInteracoes) * 100) : 0;

    // Automações por status
    const statusCount: Record<string, number> = {};
    for (const a of automacoesAtual.data ?? []) {
      statusCount[a.status] = (statusCount[a.status] || 0) + 1;
    }

    // Variações percentuais
    const variacaoInteracoes = totalInteracoesAnterior > 0
      ? Math.round(((totalInteracoes - totalInteracoesAnterior) / totalInteracoesAnterior) * 100)
      : null;
    const variacaoAutomacoes = totalAutomacoesAnterior > 0
      ? Math.round(((totalAutomacoes - totalAutomacoesAnterior) / totalAutomacoesAnterior) * 100)
      : null;
    const variacaoAgendamentos = totalAgendamentosAnterior > 0
      ? Math.round(((totalAgendamentos - totalAgendamentosAnterior) / totalAgendamentosAnterior) * 100)
      : null;

    // Fetch financial data from Gestão API (best-effort)
    let receitaTotal: number | null = null;
    let receitaAnterior: number | null = null;
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (gestaoUrl && gestaoToken) {
      try {
        const finRes = await fetch(`${gestaoUrl}/internal-api`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${gestaoToken}` },
          body: JSON.stringify({ action: "get_revenue", params: { days: 30 } }),
        });
        if (finRes.ok) {
          const finData = await finRes.json();
          receitaTotal = finData.total ?? null;
          receitaAnterior = finData.previous_period ?? null;
        }
      } catch (e) {
        console.warn("[relatorio] Erro ao buscar receita:", e);
      }
    }

    const variacaoReceita = receitaTotal !== null && receitaAnterior !== null && receitaAnterior > 0
      ? Math.round(((receitaTotal - receitaAnterior) / receitaAnterior) * 100)
      : null;

    const metricas = {
      periodo: { inicio: dias30, fim: now.toISOString() },
      total_interacoes: totalInteracoes,
      total_automacoes: totalAutomacoes,
      total_agendamentos: totalAgendamentos,
      tempo_medio_resposta_min: tempoMedioMinutos,
      taxa_supervisao_pct: taxaSupervisao,
      top_intencoes: topIntencoes,
      automacoes_por_status: statusCount,
      receita_total: receitaTotal,
      variacoes: {
        interacoes_pct: variacaoInteracoes,
        automacoes_pct: variacaoAutomacoes,
        agendamentos_pct: variacaoAgendamentos,
        receita_pct: variacaoReceita,
      },
    };

    // Use Lovable AI for strategic analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let analiseIA = { gargalos: [] as string[], oportunidades: [] as string[], alertas: [] as string[], sugestoes_ia: [] as string[] };

    if (LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `Você é um analista estratégico de clínica médica/odontológica. Analise as métricas e retorne APENAS um JSON válido (sem markdown) com:
{"gargalos":["..."],"oportunidades":["..."],"alertas":["..."],"sugestoes_ia":["..."]}
Cada array deve ter 2-4 itens curtos e acionáveis. Baseie-se nos dados reais fornecidos.`,
              },
              { role: "user", content: `Métricas dos últimos 30 dias:\n${JSON.stringify(metricas, null, 2)}` },
            ],
            temperature: 0.4,
            max_tokens: 600,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content?.trim();
          if (raw) {
            try {
              analiseIA = JSON.parse(raw);
            } catch {
              // Try extracting JSON from markdown code block
              const match = raw.match(/\{[\s\S]*\}/);
              if (match) analiseIA = JSON.parse(match[0]);
            }
          }
        } else if (aiRes.status === 429) {
          analiseIA.alertas.push("Rate limit da IA atingido. Tente novamente em alguns minutos.");
        } else if (aiRes.status === 402) {
          analiseIA.alertas.push("Créditos de IA insuficientes.");
        }
      } catch (e) {
        console.error("[relatorio] Erro IA:", e);
        analiseIA.alertas.push("Análise de IA temporariamente indisponível.");
      }
    } else {
      analiseIA.alertas.push("LOVABLE_API_KEY não configurada. Análise estratégica indisponível.");
    }

    const relatorio = { metricas, ...analiseIA };

    console.log(`[relatorio-estrategico] Gerado: ${totalInteracoes} interações, ${totalAutomacoes} automações`);

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[relatorio-estrategico] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno ao gerar relatório" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
