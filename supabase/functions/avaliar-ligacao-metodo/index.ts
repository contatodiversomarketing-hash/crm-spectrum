import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIAS = [
  "abertura",
  "rapport",
  "escuta_ativa",
  "identificacao_dor",
  "uso_gatilhos",
  "tratamento_objecao_apa",
  "fechamento",
  "seguranca_emocional",
] as const;

interface AvaliacaoIA {
  nota_abertura: number;
  nota_rapport: number;
  nota_escuta_ativa: number;
  nota_identificacao_dor: number;
  nota_gatilhos: number;
  nota_objecao_apa: number;
  nota_fechamento: number;
  nota_seguranca_emocional: number;
  nota_geral: number;
  pontos_fortes: string[];
  erros_detectados: string[];
  tecnica_recomendada: string;
  sugestao_pratica: string;
}

function buildSystemPrompt(): string {
  return `Você é um avaliador especialista em vendas consultivas para clínicas de saúde.

METODOLOGIA DE AVALIAÇÃO:
Avalie a transcrição da ligação nas 8 categorias abaixo, atribuindo nota de 0 a 10 para cada:

1. ABERTURA (nota_abertura): Apresentação profissional, tom acolhedor, identificação clara.
2. RAPPORT (nota_rapport): Conexão genuína, espelhamento, empatia demonstrada.
3. ESCUTA ATIVA (nota_escuta_ativa): Pausas para ouvir, paráfrases, validação do que o cliente disse.
4. IDENTIFICAÇÃO DE DOR (nota_identificacao_dor): Perguntas SPIN, descoberta de necessidades reais, aprofundamento.
5. USO DE GATILHOS (nota_gatilhos): Prova social, autoridade, escassez genuína, reciprocidade, compromisso.
6. TRATAMENTO DE OBJEÇÃO A-P-A (nota_objecao_apa): Acolher a objeção, Perguntar para entender, Apresentar solução. Se não houve objeção, avalie a preparação demonstrada.
7. FECHAMENTO (nota_fechamento): Técnica de fechamento usada (alternativa, resumo, assumptivo), naturalidade, timing.
8. SEGURANÇA EMOCIONAL (nota_seguranca_emocional): Confiança na fala, sem hesitação excessiva, controle da conversa.

REGRAS:
- nota_geral = média ponderada (fechamento e identificação de dor valem 1.5x)
- pontos_fortes: liste 2-4 pontos positivos concretos
- erros_detectados: liste 2-4 erros específicos com momento da ligação
- tecnica_recomendada: indique a técnica mais importante para melhorar
- sugestao_pratica: dê um conselho prático e acionável em 1-2 frases`;
}

function buildUserPrompt(transcricao: string, resultadoVenda: boolean): string {
  return `TRANSCRIÇÃO DA LIGAÇÃO:
"${transcricao}"

RESULTADO: ${resultadoVenda ? "VENDA REALIZADA" : "VENDA NÃO REALIZADA"}

Avalie usando as 8 categorias da metodologia.`;
}

function clampNote(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function calcNotaGeral(av: Omit<AvaliacaoIA, "nota_geral" | "pontos_fortes" | "erros_detectados" | "tecnica_recomendada" | "sugestao_pratica">): number {
  const pesos = {
    nota_abertura: 1,
    nota_rapport: 1,
    nota_escuta_ativa: 1,
    nota_identificacao_dor: 1.5,
    nota_gatilhos: 1,
    nota_objecao_apa: 1,
    nota_fechamento: 1.5,
    nota_seguranca_emocional: 1,
  };
  let soma = 0, pesoTotal = 0;
  for (const [k, p] of Object.entries(pesos)) {
    soma += (av as any)[k] * p;
    pesoTotal += p;
  }
  return clampNote(soma / pesoTotal);
}

async function atualizarDesempenho(
  supabase: any,
  vendedora_id: string,
  clinica_id: string | null
) {
  const { data: avaliacoes } = await supabase
    .from("avaliacao_ligacoes")
    .select("nota_abertura, nota_rapport, nota_escuta_ativa, nota_identificacao_dor, nota_gatilhos, nota_objecao_apa, nota_fechamento, nota_seguranca_emocional, nota_geral, resultado_venda")
    .eq("vendedora_id", vendedora_id);

  if (!avaliacoes || avaliacoes.length === 0) return;

  const total = avaliacoes.length;
  const vendas = avaliacoes.filter((a: any) => a.resultado_venda).length;
  const avg = (field: string) =>
    Math.round((avaliacoes.reduce((s: number, a: any) => s + (a[field] || 0), 0) / total) * 10) / 10;

  const desempenho = {
    clinica_id,
    vendedora_id,
    total_ligacoes_avaliadas: total,
    media_abertura: avg("nota_abertura"),
    media_rapport: avg("nota_rapport"),
    media_escuta_ativa: avg("nota_escuta_ativa"),
    media_identificacao_dor: avg("nota_identificacao_dor"),
    media_gatilhos: avg("nota_gatilhos"),
    media_objecao_apa: avg("nota_objecao_apa"),
    media_fechamento: avg("nota_fechamento"),
    media_seguranca_emocional: avg("nota_seguranca_emocional"),
    media_geral: avg("nota_geral"),
    taxa_conversao: Math.round((vendas / total) * 100 * 10) / 10,
    atualizado_em: new Date().toISOString(),
  };

  await supabase
    .from("desempenho_vendedoras")
    .upsert(desempenho, { onConflict: "vendedora_id" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { transcricao, vendedora_id, resultado_venda, clinica_id, transcricao_ligacao_id } = await req.json();

    if (!transcricao || typeof transcricao !== "string") {
      return new Response(JSON.stringify({ error: "transcricao é obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!vendedora_id) {
      return new Response(JSON.stringify({ error: "vendedora_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Chamar IA para avaliação
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(transcricao, !!resultado_venda) },
        ],
        temperature: 0.3,
        tools: [{
          type: "function",
          function: {
            name: "registrar_avaliacao",
            description: "Registra a avaliação completa da ligação",
            parameters: {
              type: "object",
              properties: {
                nota_abertura: { type: "number", minimum: 0, maximum: 10 },
                nota_rapport: { type: "number", minimum: 0, maximum: 10 },
                nota_escuta_ativa: { type: "number", minimum: 0, maximum: 10 },
                nota_identificacao_dor: { type: "number", minimum: 0, maximum: 10 },
                nota_gatilhos: { type: "number", minimum: 0, maximum: 10 },
                nota_objecao_apa: { type: "number", minimum: 0, maximum: 10 },
                nota_fechamento: { type: "number", minimum: 0, maximum: 10 },
                nota_seguranca_emocional: { type: "number", minimum: 0, maximum: 10 },
                pontos_fortes: { type: "array", items: { type: "string" } },
                erros_detectados: { type: "array", items: { type: "string" } },
                tecnica_recomendada: { type: "string" },
                sugestao_pratica: { type: "string" },
              },
              required: [
                "nota_abertura", "nota_rapport", "nota_escuta_ativa",
                "nota_identificacao_dor", "nota_gatilhos", "nota_objecao_apa",
                "nota_fechamento", "nota_seguranca_emocional",
                "pontos_fortes", "erros_detectados",
                "tecnica_recomendada", "sugestao_pratica",
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "registrar_avaliacao" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      console.error(`[avaliar-ligacao-metodo] AI erro ${status}`);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro na avaliação IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("[avaliar-ligacao-metodo] Resposta IA sem tool_calls");
      return new Response(JSON.stringify({ error: "Resposta IA inválida" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed: AvaliacaoIA = JSON.parse(toolCall.function.arguments);

    // Clampar notas e calcular geral
    const avaliacao = {
      nota_abertura: clampNote(parsed.nota_abertura),
      nota_rapport: clampNote(parsed.nota_rapport),
      nota_escuta_ativa: clampNote(parsed.nota_escuta_ativa),
      nota_identificacao_dor: clampNote(parsed.nota_identificacao_dor),
      nota_gatilhos: clampNote(parsed.nota_gatilhos),
      nota_objecao_apa: clampNote(parsed.nota_objecao_apa),
      nota_fechamento: clampNote(parsed.nota_fechamento),
      nota_seguranca_emocional: clampNote(parsed.nota_seguranca_emocional),
      nota_geral: 0,
      pontos_fortes: parsed.pontos_fortes || [],
      erros_detectados: parsed.erros_detectados || [],
      tecnica_recomendada: parsed.tecnica_recomendada || "",
      sugestao_pratica: parsed.sugestao_pratica || "",
    };
    avaliacao.nota_geral = calcNotaGeral(avaliacao);

    // Salvar na tabela avaliacao_ligacoes
    const registro = {
      clinica_id: clinica_id || null,
      vendedora_id,
      transcricao_ligacao_id: transcricao_ligacao_id || null,
      transcricao_texto: transcricao,
      resultado_venda: !!resultado_venda,
      ...avaliacao,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("avaliacao_ligacoes")
      .insert(registro)
      .select()
      .single();

    if (insertErr) {
      console.error("[avaliar-ligacao-metodo] Insert erro:", insertErr);
      return new Response(JSON.stringify({ error: "Erro ao salvar avaliação" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atualizar desempenho agregado
    await atualizarDesempenho(supabase, vendedora_id, clinica_id || null);

    console.log(`[avaliar-ligacao-metodo] vendedora=${vendedora_id} nota=${avaliacao.nota_geral} venda=${resultado_venda}`);

    return new Response(JSON.stringify(inserted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[avaliar-ligacao-metodo] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
