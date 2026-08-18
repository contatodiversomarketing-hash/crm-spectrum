import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Interacao {
  paciente_externo_id: string;
  mensagem_usuario: string | null;
  resposta_final: string | null;
  supervisionado: boolean;
  intencao_detectada: string | null;
  atendente_humano: string | null;
  criado_em: string;
}

function ehHumano(i: Interacao) {
  return i.supervisionado && (i.intencao_detectada === "resposta_humana" || !!i.atendente_humano);
}

// Tempo médio de resposta (min) entre mensagem do paciente e a resposta seguinte
function temposResposta(itens: Interacao[]): number[] {
  const porPaciente: Record<string, Interacao[]> = {};
  for (const i of itens) {
    (porPaciente[i.paciente_externo_id] ||= []).push(i);
  }
  const tempos: number[] = [];
  for (const lista of Object.values(porPaciente)) {
    const ord = lista.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    for (let k = 0; k < ord.length; k++) {
      const atual = ord[k];
      if (!atual.mensagem_usuario) continue;
      const resp = atual.resposta_final ? atual : ord.slice(k + 1).find((x) => x.resposta_final);
      if (!resp) continue;
      const diff = (new Date(resp.criado_em).getTime() - new Date(atual.criado_em).getTime()) / 60000;
      if (diff >= 0 && diff < 60 * 24) tempos.push(diff);
    }
  }
  return tempos;
}

function media(v: number[]) {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function amostraConversas(itens: Interacao[], maxConversas = 12, maxMsgs = 14) {
  const porPaciente: Record<string, Interacao[]> = {};
  for (const i of itens) (porPaciente[i.paciente_externo_id] ||= []).push(i);
  return Object.entries(porPaciente)
    .slice(0, maxConversas)
    .map(([tel, lista]) => {
      const ord = lista.sort((a, b) => a.criado_em.localeCompare(b.criado_em)).slice(-maxMsgs);
      const linhas = ord.flatMap((i) => [
        i.mensagem_usuario ? `PACIENTE: ${i.mensagem_usuario}` : null,
        i.resposta_final ? `ATENDIMENTO: ${i.resposta_final}` : null,
      ].filter(Boolean));
      return `--- Conversa ${tel.slice(-4)} ---\n${linhas.join("\n")}`;
    })
    .join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dias = Number(body.dias) || 7;
    const alvo: "ia" | "atendente" = body.alvo === "atendente" ? "atendente" : "ia";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb
      .from("interacoes_ia")
      .select("paciente_externo_id, mensagem_usuario, resposta_final, supervisionado, intencao_detectada, atendente_humano, criado_em")
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(1500);

    if (error) throw error;

    const todos = (data || []) as Interacao[];
    const itens = todos.filter((i) => (alvo === "atendente" ? ehHumano(i) : !i.supervisionado));

    if (itens.length === 0) {
      return new Response(
        JSON.stringify({
          alvo,
          periodo_dias: dias,
          metricas: { conversas: 0, mensagens: 0, tempo_medio_resposta_min: 0 },
          relatorio: alvo === "atendente"
            ? "Ainda não há atendimentos humanos registrados no período. Assim que a Lara responder pelo CRM, o relatório é gerado automaticamente."
            : "Ainda não há conversas automáticas da Ana no período selecionado.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempos = temposResposta(itens);
    const conversas = new Set(itens.map((i) => i.paciente_externo_id)).size;
    const metricas = {
      conversas,
      mensagens: itens.length,
      tempo_medio_resposta_min: Number(media(tempos).toFixed(1)),
      tempo_mediano_resposta_min: Number(
        (tempos.length ? [...tempos].sort((a, b) => a - b)[Math.floor(tempos.length / 2)] : 0).toFixed(1)
      ),
      conversas_sem_resposta: itens.filter((i) => i.mensagem_usuario && !i.resposta_final).length,
    };

    const quem = alvo === "atendente" ? "a atendente humana (Lara Flores do Prado)" : "a IA Ana";

    const prompt = `Avalie o desempenho de ${quem} no atendimento por WhatsApp da clínica da Dra. Amélia Carvalho (psiquiatria, TEA, TDAH e cannabis medicinal).

MÉTRICAS OBJETIVAS:
${JSON.stringify(metricas, null, 2)}

AMOSTRA DE CONVERSAS:
${amostraConversas(itens)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é supervisor de qualidade e vendas de uma clínica médica. Gere um relatório em markdown, em português, objetivo e acionável, com esta estrutura obrigatória:\n" +
              "## Nota geral (0-10)\n" +
              "## Notas por critério (tabela: critério | nota | comentário) — critérios: Abertura/Rapport, Escuta ativa e identificação da dor, Uso de gatilhos mentais, Tratamento de objeções (A-P-A), Fechamento/agendamento, Simpatia e empatia, Clareza e português, Tempo de resposta, Aderência ao protocolo clínico\n" +
              "## Pontos fortes (bullets)\n" +
              "## Erros e riscos (bullets, cite trechos reais)\n" +
              "## Oportunidades perdidas de venda\n" +
              "## Plano de ação para os próximos 7 dias (3 a 5 itens)\n" +
              "Nunca invente dados que não estejam nas conversas.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error(`[avaliar-atendimento] AI ${aiRes.status}: ${txt}`);
      const msg = aiRes.status === 429
        ? "Limite de requisições atingido. Tente novamente em instantes."
        : aiRes.status === 402
        ? "Créditos de IA esgotados. Adicione créditos no workspace."
        : `Erro no gateway de IA (${aiRes.status})`;
      return new Response(JSON.stringify({ error: msg }), {
        status: aiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const relatorio = aiData.choices?.[0]?.message?.content || "Sem relatório disponível.";

    return new Response(JSON.stringify({ alvo, periodo_dias: dias, metricas, relatorio }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[avaliar-atendimento] Erro:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
