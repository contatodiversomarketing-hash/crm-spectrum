const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Base de conhecimento embutida
const FILOSOFIA_BASE = `Vender é ajudar o cliente a tomar a melhor decisão. Nunca pressionar, sempre guiar com empatia e autoridade.`;

const PRINCIPIOS_IA = [
  "Escuta ativa: entenda antes de responder",
  "Espelhamento: adapte tom e linguagem ao perfil",
  "Valor antes do preço: destaque benefícios tangíveis",
  "Urgência genuína: use escassez real, nunca fictícia",
  "Fechamento natural: conduza sem forçar",
];

const MOTOR_OBJECOES: Record<string, { tecnica: string; abordagem: string }> = {
  preco: {
    tecnica: "A-P-A (Acolher-Perguntar-Apresentar)",
    abordagem: "Acolha a preocupação, pergunte o que seria justo, apresente o valor real do investimento",
  },
  tempo: {
    tecnica: "A-P-A",
    abordagem: "Valide a agenda apertada, pergunte qual horário funciona, ofereça flexibilidade",
  },
  confianca: {
    tecnica: "A-P-A",
    abordagem: "Reconheça a cautela, pergunte experiências anteriores, apresente provas sociais",
  },
  concorrencia: {
    tecnica: "A-P-A",
    abordagem: "Respeite a comparação, pergunte critérios de decisão, destaque diferenciais únicos",
  },
  necessidade: {
    tecnica: "A-P-A",
    abordagem: "Valide a dúvida, pergunte sobre dores atuais, conecte solução ao problema real",
  },
  decisor: {
    tecnica: "A-P-A",
    abordagem: "Entenda quem decide, pergunte como ajudar a apresentar, ofereça material de apoio",
  },
};

const TECNICAS_FECHAMENTO: Record<string, string> = {
  alternativa: "Ofereça duas opções positivas: 'Prefere começar na segunda ou na quarta?'",
  resumo: "Resuma todos os benefícios acordados e pergunte se pode prosseguir",
  urgencia: "Destaque prazo ou vaga limitada de forma genuína",
  assumptivo: "Assuma a decisão positiva naturalmente: 'Vou preparar tudo para você'",
  pergunta: "Faça a pergunta de fechamento direta: 'Podemos seguir com o agendamento?'",
};

const GATILHOS_MENTAIS = [
  { nome: "prova_social", descricao: "Mencione resultados de outros pacientes similares" },
  { nome: "autoridade", descricao: "Destaque credenciais e experiência da clínica" },
  { nome: "escassez", descricao: "Vagas ou condições limitadas reais" },
  { nome: "reciprocidade", descricao: "Ofereça algo de valor antes de pedir compromisso" },
  { nome: "compromisso", descricao: "Resgate compromissos anteriores do cliente" },
  { nome: "afinidade", descricao: "Crie conexão pessoal genuína" },
];

interface RequestBody {
  mensagem_cliente: string;
  perfil_cliente?: string;
  canal?: string;
  estagio_funil?: string;
  objecao_detectada?: string;
  historico_interacoes?: string[];
}

function detectarEstrategia(body: RequestBody) {
  const { objecao_detectada, mensagem_cliente, perfil_cliente, estagio_funil } = body;
  const msg = (mensagem_cliente || "").toLowerCase();

  // Sinais de compra
  const sinaisCompra = ["como funciona", "quanto custa", "tem vaga", "posso agendar", "quero", "me interessei", "como faço"];
  const temSinalCompra = sinaisCompra.some((s) => msg.includes(s));

  // Determinar técnica
  let tecnicaUsada = "rapport";
  let gatilhosRecomendados: string[] = [];
  let instrucaoEstrategica = "";

  if (objecao_detectada && MOTOR_OBJECOES[objecao_detectada]) {
    const obj = MOTOR_OBJECOES[objecao_detectada];
    tecnicaUsada = obj.tecnica;
    instrucaoEstrategica = `OBJEÇÃO DETECTADA (${objecao_detectada}): ${obj.abordagem}`;
    gatilhosRecomendados = ["prova_social", "autoridade"];
  } else if (temSinalCompra || estagio_funil === "fechamento") {
    const fechamento = estagio_funil === "fechamento" ? "assumptivo" : "pergunta";
    tecnicaUsada = `fechamento_${fechamento}`;
    instrucaoEstrategica = `SINAL DE COMPRA: ${TECNICAS_FECHAMENTO[fechamento]}`;
    gatilhosRecomendados = ["escassez", "compromisso"];
  } else if (estagio_funil === "qualificacao") {
    tecnicaUsada = "qualificacao_spin";
    instrucaoEstrategica = "Faça perguntas SPIN: Situação, Problema, Implicação, Necessidade de solução";
    gatilhosRecomendados = ["reciprocidade", "afinidade"];
  } else {
    instrucaoEstrategica = "Construa rapport, demonstre interesse genuíno e identifique necessidades";
    gatilhosRecomendados = ["afinidade", "reciprocidade"];
  }

  // Ajuste por perfil
  let ajustePerfil = "";
  switch (perfil_cliente) {
    case "dominante":
      ajustePerfil = "Seja direto, objetivo e focado em resultados. Sem rodeios.";
      break;
    case "influente":
      ajustePerfil = "Seja entusiasmado, use histórias e destaque experiências positivas.";
      break;
    case "estavel":
      ajustePerfil = "Reforce segurança, estabilidade e confiança. Sem pressão.";
      break;
    case "conforme":
      ajustePerfil = "Apresente dados, evidências e detalhes técnicos. Seja preciso.";
      break;
    default:
      ajustePerfil = "Adapte o tom de forma equilibrada e empática.";
  }

  return { tecnicaUsada, gatilhosRecomendados, instrucaoEstrategica, ajustePerfil };
}

function calcularScoreEstrategico(body: RequestBody, temObjecao: boolean, temSinalCompra: boolean): number {
  let score = 50;
  if (body.perfil_cliente) score += 10;
  if (body.estagio_funil) score += 10;
  if (body.historico_interacoes?.length) score += Math.min(body.historico_interacoes.length * 5, 15);
  if (temObjecao) score += 10;
  if (temSinalCompra) score += 15;
  return Math.min(score, 100);
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
    const body: RequestBody = await req.json();
    const { mensagem_cliente, canal, historico_interacoes } = body;

    if (!mensagem_cliente || typeof mensagem_cliente !== "string") {
      return new Response(JSON.stringify({ error: "mensagem_cliente é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const estrategia = detectarEstrategia(body);
    const temObjecao = !!body.objecao_detectada && !!MOTOR_OBJECOES[body.objecao_detectada];
    const sinaisCompra = ["como funciona", "quanto custa", "tem vaga", "posso agendar", "quero", "me interessei"];
    const temSinalCompra = sinaisCompra.some((s) => mensagem_cliente.toLowerCase().includes(s));
    const scoreEstrategico = calcularScoreEstrategico(body, temObjecao, temSinalCompra);

    const gatilhosDetalhes = estrategia.gatilhosRecomendados
      .map((g) => GATILHOS_MENTAIS.find((gm) => gm.nome === g))
      .filter(Boolean)
      .map((g) => `- ${g!.nome}: ${g!.descricao}`)
      .join("\n");

    // Ajuste de canal
    let ajusteCanal = "";
    switch (canal) {
      case "whatsapp":
        ajusteCanal = "Mensagem curta (máx 4 linhas), informal mas profissional. Máx 1 emoji.";
        break;
      case "email":
        ajusteCanal = "Mensagem estruturada com saudação, corpo e CTA claro.";
        break;
      case "telefone":
        ajusteCanal = "Script conciso para leitura em voz alta, tom conversacional.";
        break;
      case "presencial":
        ajusteCanal = "Guia de pontos-chave para abordagem presencial.";
        break;
      default:
        ajusteCanal = "Mensagem curta e profissional.";
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("[gerar-resposta-com-metodo] LOVABLE_API_KEY ausente");
      return new Response(
        JSON.stringify({
          resposta_final: "Olá! Como posso ajudá-lo hoje?",
          tecnica_usada: estrategia.tecnicaUsada,
          gatilhos_usados: estrategia.gatilhosRecomendados,
          score_estrategico: scoreEstrategico,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um especialista em vendas consultivas para clínicas de saúde.

FILOSOFIA: ${FILOSOFIA_BASE}

PRINCÍPIOS:
${PRINCIPIOS_IA.map((p) => `- ${p}`).join("\n")}

ESTRATÉGIA ATUAL: ${estrategia.instrucaoEstrategica}
PERFIL DO CLIENTE: ${estrategia.ajustePerfil}
CANAL: ${ajusteCanal}

GATILHOS MENTAIS A APLICAR:
${gatilhosDetalhes}

REGRAS:
- Gere APENAS o texto da resposta ao cliente
- NÃO invente preços, datas ou informações
- NÃO dê orientação médica
- Aplique a técnica indicada de forma natural
- Máximo 5 linhas`;

    const historicoTexto = historico_interacoes?.length
      ? `\nHistórico recente:\n${historico_interacoes.slice(-3).join("\n")}`
      : "";

    const userPrompt = `Mensagem do cliente: "${mensagem_cliente}"
Estágio do funil: ${body.estagio_funil || "indefinido"}
Objeção: ${body.objecao_detectada || "nenhuma"}${historicoTexto}

Gere a resposta usando a técnica ${estrategia.tecnicaUsada}.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 400,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      console.error(`[gerar-resposta-com-metodo] AI erro ${status}`);
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
      return new Response(
        JSON.stringify({
          resposta_final: "Olá! Estou aqui para ajudar. Como posso auxiliá-lo?",
          tecnica_usada: estrategia.tecnicaUsada,
          gatilhos_usados: estrategia.gatilhosRecomendados,
          score_estrategico: scoreEstrategico,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const texto = aiData.choices?.[0]?.message?.content?.trim();

    const respostaFinal = texto
      ? texto.split("\n").filter((l: string) => l.trim()).slice(0, 5).join("\n")
      : "Olá! Como posso ajudá-lo hoje?";

    console.log(`[gerar-resposta-com-metodo] ${estrategia.tecnicaUsada} | score:${scoreEstrategico} | "${respostaFinal.slice(0, 50)}..."`);

    return new Response(
      JSON.stringify({
        resposta_final: respostaFinal,
        tecnica_usada: estrategia.tecnicaUsada,
        gatilhos_usados: estrategia.gatilhosRecomendados,
        score_estrategico: scoreEstrategico,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[gerar-resposta-com-metodo] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
