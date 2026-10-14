import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dias = Number(body.dias) || 30;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [leadsRes, agendaRes, finRes, interRes] = await Promise.all([
      sb.from("leads").select("id, nome, origem, status_pipeline, dados_triagem, observacoes, criado_em, followup_etapa, followup_finalizado, telefone").gte("criado_em", desde).limit(2000),
      sb.from("agendamentos").select("id, status, tipo, procedimento, data_hora, paciente_nome").gte("data_hora", desde).limit(2000),
      sb.from("financeiro_lancamentos").select("id, descricao, valor, pago, criado_em").gte("criado_em", desde).limit(2000),
      sb.from("interacoes_ia").select("paciente_externo_id, mensagem_usuario, resposta_final, criado_em").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(1200),
    ]);

    const leads = leadsRes.data || [];
    const agendamentos = agendaRes.data || [];
    const financeiro = finRes.data || [];
    const interacoes = interRes.data || [];

    const contar = <T,>(arr: T[], key: (x: T) => string) => {
      const m: Record<string, number> = {};
      for (const x of arr) {
        const k = key(x) || "não informado";
        m[k] = (m[k] || 0) + 1;
      }
      return m;
    };

    const porEtapa = contar(leads, (l: any) => l.status_pipeline);
    const porOrigem = contar(leads, (l: any) => l.origem);
    const agendamentosPorStatus = contar(agendamentos, (a: any) => a.status);

    const agendados = agendamentos.length;
    const compareceram = agendamentos.filter((a: any) => ["realizado", "compareceu", "atendido", "concluido"].includes((a.status || "").toLowerCase())).length;
    const faltaram = agendamentos.filter((a: any) => ["faltou", "no_show", "nao_compareceu"].includes((a.status || "").toLowerCase())).length;
    const cancelados = agendamentos.filter((a: any) => (a.status || "").toLowerCase().includes("cancel")).length;

    const pacotes = financeiro.filter((f: any) => /pacote|spectra|acompanhamento|plano/i.test(f.descricao || ""));
    const pacotesFechados = pacotes.length;
    const receitaPacotes = pacotes.reduce((s: number, f: any) => s + Number(f.valor || 0), 0);

    const naoFecharam = leads.filter((l: any) => !["fechado", "ganho", "consultou", "cliente"].includes((l.status_pipeline || "").toLowerCase()));
    const perfilNaoFechou = {
      total: naoFecharam.length,
      por_etapa_parada: contar(naoFecharam, (l: any) => l.status_pipeline),
      por_origem: contar(naoFecharam, (l: any) => l.origem),
      sem_nenhuma_resposta: naoFecharam.filter((l: any) => !interacoes.some((i: any) => (i.paciente_externo_id || "").includes((l.telefone || "___").replace(/\D/g, "").slice(-8)) && i.mensagem_usuario)).length,
      followup_esgotado: naoFecharam.filter((l: any) => l.followup_finalizado).length,
      media_etapa_followup: naoFecharam.length
        ? Number((naoFecharam.reduce((s: number, l: any) => s + (l.followup_etapa || 0), 0) / naoFecharam.length).toFixed(1))
        : 0,
    };

    const resumo = {
      periodo_dias: dias,
      leads_total: leads.length,
      leads_por_etapa: porEtapa,
      leads_por_origem: porOrigem,
      agendados,
      compareceram,
      faltaram,
      cancelados,
      agendamentos_por_status: agendamentosPorStatus,
      taxa_agendamento: leads.length ? Number(((agendados / leads.length) * 100).toFixed(1)) : 0,
      taxa_comparecimento: agendados ? Number(((compareceram / agendados) * 100).toFixed(1)) : 0,
      pacotes_fechados: pacotesFechados,
      receita_pacotes: receitaPacotes,
      taxa_fechamento_pacote: compareceram ? Number(((pacotesFechados / compareceram) * 100).toFixed(1)) : 0,
      perfil_quem_nao_fechou: perfilNaoFechou,
    };

    // Amostra de objeções reais (últimas mensagens de pacientes)
    const objecoes = interacoes
      .filter((i: any) => i.mensagem_usuario && i.mensagem_usuario.length > 15)
      .slice(0, 60)
      .map((i: any) => `- ${i.mensagem_usuario.slice(0, 240)}`)
      .join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é analista de conversão de uma clínica de psiquiatria/neurodesenvolvimento (Dra. Amélia Carvalho). Responda em markdown, português, com esta estrutura:\n" +
              "## Funil do período (números)\n" +
              "## Por que os pacientes NÃO estão fechando (causas ranqueadas com evidência)\n" +
              "## O que os que não fecham têm em comum (perfil, origem, etapa em que travam, objeções)\n" +
              "## Agendamento x comparecimento x fechamento de pacote\n" +
              "## Ações práticas para aumentar conversão (5 itens priorizados)\n" +
              "Use apenas os dados fornecidos; se algo estiver ausente, diga explicitamente que o dado ainda não é registrado.",
          },
          { role: "user", content: `DADOS AGREGADOS:\n${JSON.stringify(resumo, null, 2)}\n\nMENSAGENS REAIS DE PACIENTES (possíveis objeções):\n${objecoes || "sem mensagens no período"}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error(`[relatorio-conversao] AI ${aiRes.status}: ${txt}`);
      const msg = aiRes.status === 429
        ? "Limite de requisições atingido. Tente novamente em instantes."
        : aiRes.status === 402
        ? "Créditos de IA esgotados. Adicione créditos no workspace."
        : `Erro no gateway de IA (${aiRes.status})`;
      return new Response(JSON.stringify({ error: msg, resumo }), {
        status: aiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const relatorio = aiData.choices?.[0]?.message?.content || "Sem relatório disponível.";

    return new Response(JSON.stringify({ resumo, relatorio }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[relatorio-conversao] Erro:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
