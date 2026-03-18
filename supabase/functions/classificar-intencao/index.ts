const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INTENCOES_VALIDAS = [
  "agendamento",
  "reagendamento",
  "cancelamento",
  "confirmacao",
  "duvida_servico",
  "duvida_valor",
  "duvida_preparo_exame",
  "emergencia",
  "reclamacao",
  "retorno_inativo",
  "financeiro",
  "outro",
] as const;

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
    const body = await req.json();
    const { mensagem } = body;

    if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length === 0) {
      return new Response(JSON.stringify({ error: "mensagem é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitized = mensagem.slice(0, 2000).trim();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[classificar-intencao] LOVABLE_API_KEY não configurado");
      return new Response(JSON.stringify({ error: "Configuração interna ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um classificador de intenções para uma clínica odontológica/médica. Classifique a mensagem do paciente em UMA das seguintes intenções:
- agendamento: quer marcar consulta/exame
- reagendamento: quer mudar data/horário
- cancelamento: quer cancelar consulta
- confirmacao: confirma presença
- duvida_servico: pergunta sobre serviços/tratamentos
- duvida_valor: pergunta sobre preços/valores
- duvida_preparo_exame: pergunta sobre preparo para exames
- emergencia: relata dor/urgência
- reclamacao: insatisfação/reclamação
- retorno_inativo: paciente inativo voltando a fazer contato
- financeiro: assuntos de pagamento/boleto/parcela
- outro: não se encaixa em nenhuma das anteriores

Retorne APENAS a intenção classificada e o nível de confiança.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sanitized },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classificar_intencao",
              description: "Classifica a intenção da mensagem do paciente",
              parameters: {
                type: "object",
                properties: {
                  intencao: {
                    type: "string",
                    enum: [...INTENCOES_VALIDAS],
                    description: "A intenção detectada na mensagem",
                  },
                  confianca: {
                    type: "number",
                    description: "Nível de confiança entre 0 e 1",
                  },
                },
                required: ["intencao", "confianca"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classificar_intencao" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error(`[classificar-intencao] AI gateway erro ${status}: ${errorText}`);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente em instantes" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ intencao: "outro", confianca: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.warn("[classificar-intencao] Resposta sem tool_call, retornando 'outro'");
      return new Response(JSON.stringify({ intencao: "outro", confianca: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const intencao = INTENCOES_VALIDAS.includes(parsed.intencao) ? parsed.intencao : "outro";
    const confianca = typeof parsed.confianca === "number"
      ? Math.round(Math.min(1, Math.max(0, parsed.confianca)) * 100) / 100
      : 0;

    console.log(`[classificar-intencao] "${sanitized.slice(0, 50)}..." → ${intencao} (${confianca})`);

    return new Response(JSON.stringify({ intencao, confianca }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[classificar-intencao] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
