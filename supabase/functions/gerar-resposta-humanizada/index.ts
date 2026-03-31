const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACKS: Record<string, string> = {
  solicitar_servico: "Olá! Para agendar sua consulta, poderia me informar qual serviço você precisa?",
  solicitar_data: "Certo! Qual data seria melhor para você?",
  solicitar_horario: "Ótimo! Qual horário você prefere?",
  solicitar_confirmacao_agendamento: "Perfeito! Posso confirmar esse agendamento para você?",
  confirmar_agendamento: "Agendamento confirmado! Qualquer dúvida, estamos à disposição.",
  solicitar_motivo_cancelamento: "Entendido. Poderia nos informar o motivo do cancelamento?",
  solicitar_confirmacao_cancelamento: "Certo. Deseja realmente confirmar o cancelamento?",
  confirmar_cancelamento: "Cancelamento realizado. Esperamos atendê-lo novamente em breve.",
  solicitar_nova_data: "Sem problemas! Qual nova data você gostaria?",
  solicitar_confirmacao_reagendamento: "Posso confirmar o reagendamento para essa nova data?",
  confirmar_reagendamento: "Reagendamento confirmado! Qualquer dúvida, estamos aqui.",
  confirmar_presenca: "Presença confirmada! Aguardamos você.",
  confirmar_acao_pendente: "Ação confirmada com sucesso!",
  encaminhar_duvida_servico: "Vou encaminhar sua dúvida sobre nossos serviços para a equipe. Em breve retornaremos.",
  encaminhar_duvida_valor: "Vou consultar os valores e retorno em breve.",
  encaminhar_duvida_preparo: "Vou buscar as orientações de preparo para você. Aguarde um momento.",
  encaminhar_emergencia: "Entendo que é urgente. Estou encaminhando para atendimento prioritário agora mesmo.",
  encaminhar_reclamacao: "Lamento pela experiência. Sua reclamação foi registrada e será analisada pela equipe.",
  encaminhar_retorno_inativo: "Que bom ter você de volta! Como podemos ajudá-lo hoje?",
  encaminhar_financeiro: "Vou encaminhar sua solicitação financeira para o setor responsável.",
  encaminhar_humano: "Vou transferir você para um atendente. Aguarde um momento, por favor.",
};

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
    const { paciente_externo_id, intencao, estado, acao, dados } = body;

    if (!acao || typeof acao !== "string") {
      return new Response(JSON.stringify({ error: "acao é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nomePaciente = dados?.nome_paciente
      ? String(dados.nome_paciente).split(" ")[0].slice(0, 50)
      : null;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("[gerar-resposta] LOVABLE_API_KEY ausente, usando fallback");
      return new Response(
        JSON.stringify({ resposta: FALLBACKS[acao] || FALLBACKS["encaminhar_humano"] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é a assistente virtual da Clínica La Vitta, localizada na Rua Capitão José Justino, 68 - Muriaé, MG. Gere UMA mensagem curta (máximo 5 linhas) para enviar ao paciente via WhatsApp.

Regras obrigatórias:
- Seja acolhedora, simpática e profissional
- ${nomePaciente ? `Chame o paciente de "${nomePaciente}"` : "Não use nome, apenas cumprimente cordialmente"}
- NÃO invente informações como datas, horários, valores, disponibilidade ou regras
- NÃO invente endereços fictícios. O endereço REAL é: Rua Capitão José Justino, 68 - Muriaé, MG
- NÃO dê orientação médica ou clínica
- NÃO use emojis em excesso (máximo 1-2)
- NUNCA diga que serviços "acabaram", "encerraram" ou "não estão disponíveis" — avaliações odontológicas estão SEMPRE disponíveis
- Se não souber uma informação, diga que vai confirmar com a equipe
- Responda APENAS com o texto da mensagem, sem aspas, sem prefixos`;

    const userPrompt = `Contexto:
- Intenção do paciente: ${intencao || "não identificada"}
- Estado da conversa: ${estado || "neutro"}
- Ação necessária: ${acao}
- Dados adicionais: ${JSON.stringify(dados || {})}

Gere a mensagem para o paciente.`;

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
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 300,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      console.error(`[gerar-resposta] AI gateway erro ${status}`);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), {
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

      // Fallback seguro
      return new Response(
        JSON.stringify({ resposta: FALLBACKS[acao] || FALLBACKS["encaminhar_humano"] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const textoGerado = aiData.choices?.[0]?.message?.content?.trim();

    if (!textoGerado) {
      console.warn("[gerar-resposta] Resposta vazia da IA, usando fallback");
      return new Response(
        JSON.stringify({ resposta: FALLBACKS[acao] || FALLBACKS["encaminhar_humano"] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limitar a 5 linhas
    const linhas = textoGerado.split("\n").filter((l: string) => l.trim()).slice(0, 5);
    const respostaFinal = linhas.join("\n");

    console.log(`[gerar-resposta] ${acao} → "${respostaFinal.slice(0, 60)}..."`);

    return new Response(JSON.stringify({ resposta: respostaFinal }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[gerar-resposta] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
