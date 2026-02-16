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
- Responda em NO MÁXIMO 3 frases curtas
- NÃO use emojis
- NÃO use markdown

Objetivo:
Converter, confirmar, reativar e gerar relacionamento.
`;

function getSaudacao(): string {
  const h = (new Date().getUTCHours() - 3 + 24) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function sanitizeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  const formData = await req.formData();
  const speechResult = formData.get("SpeechResult")?.toString().trim();

  if (!speechResult) {
    const saudacao = getSaudacao();
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${saudacao}... aqui é da Clínica La Vitta.
      Tudo bem com você?
    </Say>
  </Gather>
  <Say voice="Polly.Vitoria" language="pt-BR">
    Não consegui ouvir sua resposta. Vou encerrar por enquanto, tá bom?
  </Say>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(`[twilio-voice] SpeechResult: "${speechResult}"`);

  let respostaFinal = "Entendi! Como posso te ajudar hoje?";

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: speechResult },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      const texto = data.choices?.[0]?.message?.content?.trim();
      if (texto) respostaFinal = texto;
    } else {
      console.error(`[twilio-voice] OpenAI erro ${aiResponse.status}`);
    }
  } catch (e) {
    console.error("[twilio-voice] Erro OpenAI:", e);
  }

  respostaFinal = sanitizeXml(respostaFinal);
  console.log(`[twilio-voice] Resposta: "${respostaFinal}"`);

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
});
