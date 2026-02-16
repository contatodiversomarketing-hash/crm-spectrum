import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SYSTEM_PROMPT = `
Você é a assistente virtual oficial da Clínica La Vitta.

Personalidade:
- Extremamente humana
- Carinhosa
- Acolhedora
- Nunca robótica
- Nunca repete literalmente o que o paciente disse
- Sempre começa com saudação adequada ao horário (bom dia, boa tarde ou boa noite)
- Pergunta se a pessoa está bem

Posicionamento da Clínica:
- Clínica intermediária com excelência
- Foco em odontologia de alta qualidade
- Plano próprio acessível
- Atendimento humanizado
- Excelência técnica

Especialidades principais:
- Odontologia completa
- Plano próprio da clínica
- Multidisciplinar
- Exames laboratoriais
- Ultrassom, MAPA, Holter, Eletro
- Estética facial

Técnicas obrigatórias do Mestre das Vendas:
- Rapport no início
- Perguntas abertas
- Validação emocional
- Tratamento de objeções com empatia
- Condução suave para fechamento
- Sempre sugerir próximo passo

Regras importantes:
- Nunca diga "você disse"
- Nunca pareça script
- Fale como uma atendente humana experiente
- Seja natural, curta e objetiva
- Use pausas mentais simuladas
- Responda em NO MÁXIMO 3 frases curtas
- NÃO use emojis
- NÃO use markdown

Objetivo:
Converter, confirmar, reativar e gerar relacionamento.
`;

function getSaudacao(): string {
  const now = new Date();
  const brasilHour = (now.getUTCHours() - 3 + 24) % 24;
  if (brasilHour < 12) return "bom dia";
  if (brasilHour < 18) return "boa tarde";
  return "boa noite";
}

async function gerarRespostaIA(speechResult: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("[twilio-voice] LOVABLE_API_KEY ausente, usando fallback");
    return "Entendi! Como posso te ajudar hoje?";
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + `\nHorário atual: ${getSaudacao()}.` },
          { role: "user", content: speechResult },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      console.error(`[twilio-voice] AI erro ${res.status}`);
      return "Entendi! Me conta mais, como posso te ajudar?";
    }

    const data = await res.json();
    const texto = data.choices?.[0]?.message?.content?.trim();
    if (!texto) return "Entendi! Como posso te ajudar?";

    // Limitar a 3 frases e sanitizar para XML
    const frases = texto.split(/[.!?]+/).filter((f: string) => f.trim()).slice(0, 3);
    const resposta = frases.join(". ").trim() + ".";
    return resposta.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  } catch (e) {
    console.error("[twilio-voice] Erro IA:", e);
    return "Entendi! Me conta mais sobre o que você precisa.";
  }
}

serve(async (req) => {
  const formData = await req.formData();
  const speechResult = formData.get("SpeechResult")?.toString().trim();

  let responseXml = "";

  if (!speechResult) {
    const saudacao = getSaudacao();
    responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    
    <Say voice="Polly.Vitoria" language="pt-BR">
      Olá, ${saudacao}! Aqui é da Clínica La Vitta.
      Tudo bem com você?
      Gostaria de falar rapidinho com você.
    </Say>

  </Gather>

  <Say voice="Polly.Vitoria" language="pt-BR">
    Não consegui ouvir sua resposta.
    Vou encerrar por enquanto, tá bom?
  </Say>
</Response>`;
  } else {
    console.log(`[twilio-voice] SpeechResult: "${speechResult}"`);
    const respostaIA = await gerarRespostaIA(speechResult);
    console.log(`[twilio-voice] Resposta IA: "${respostaIA}"`);

    responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">

    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaIA}
    </Say>

  </Gather>
</Response>`;
  }

  return new Response(responseXml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
});
