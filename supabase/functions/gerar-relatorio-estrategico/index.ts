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
    // 1. Auth + role check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Verify admin role
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Call coletar-dados-integrados internally
    console.log("[relatorio-estrategico] Coletando dados integrados...");

    const coletaRes = await fetch(`${supabaseUrl}/functions/v1/coletar-dados-integrados`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!coletaRes.ok) {
      const errText = await coletaRes.text();
      console.error("[relatorio-estrategico] Erro na coleta:", coletaRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Falha ao coletar dados integrados", status: coletaRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dadosIntegrados = await coletaRes.json();
    console.log("[relatorio-estrategico] Dados coletados, enviando para IA...");

    // 3. Send to Lovable AI with tool calling for structured output
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
            content: `Você é um analista estratégico executivo de clínicas médicas e odontológicas. 
Analise os dados consolidados de CRM, Gestão e Financeiro e forneça uma análise estratégica completa.
Seja direto, acionável e baseie-se exclusivamente nos dados fornecidos.
Se algum sistema retornou erro, mencione isso nos alertas.`,
          },
          {
            role: "user",
            content: `Dados integrados coletados em ${dadosIntegrados.timestamp}:\n\nCRM: ${JSON.stringify(dadosIntegrados.crm)}\n\nGestão: ${JSON.stringify(dadosIntegrados.gestao)}\n\nFinanceiro: ${JSON.stringify(dadosIntegrados.financeiro)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "gerar_relatorio_estrategico",
              description: "Gera relatório estratégico executivo com análise completa dos dados integrados.",
              parameters: {
                type: "object",
                properties: {
                  resumo_geral: {
                    type: "string",
                    description: "Resumo executivo em 2-3 frases sobre o estado geral da clínica.",
                  },
                  metricas_principais: {
                    type: "object",
                    description: "Métricas-chave extraídas dos dados.",
                    properties: {
                      crm_status: { type: "string" },
                      gestao_status: { type: "string" },
                      financeiro_status: { type: "string" },
                      saude_geral: { type: "string", enum: ["critico", "atencao", "estavel", "positivo"] },
                    },
                    required: ["crm_status", "gestao_status", "financeiro_status", "saude_geral"],
                    additionalProperties: true,
                  },
                  gargalos: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 gargalos operacionais detectados.",
                  },
                  oportunidades: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 oportunidades de crescimento identificadas.",
                  },
                  alertas: {
                    type: "array",
                    items: { type: "string" },
                    description: "Alertas importantes que requerem atenção imediata.",
                  },
                  sugestoes: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 sugestões estratégicas acionáveis.",
                  },
                },
                required: ["resumo_geral", "metricas_principais", "gargalos", "oportunidades", "alertas", "sugestoes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "gerar_relatorio_estrategico" } },
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const errBody = await aiRes.text();
      console.error(`[relatorio-estrategico] IA erro ${status}:`, errBody);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit da IA atingido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro na análise de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("[relatorio-estrategico] IA não retornou tool call");
      return new Response(JSON.stringify({ error: "Resposta da IA inesperada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const relatorio = JSON.parse(toolCall.function.arguments);

    console.log("[relatorio-estrategico] Relatório gerado com sucesso");

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[relatorio-estrategico] Erro:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao gerar relatório", message: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
