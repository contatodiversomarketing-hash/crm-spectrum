import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SYSTEM_PROMPT_BASE = `
Você é Maria, assistente virtual oficial da Clínica La Vitta.

PERSONALIDADE:
- Extremamente humana
- Carinhosa
- Natural
- Nunca robótica
- Nunca fale em inglês
- Nunca diga "você disse"
- Só cumprimente uma vez por ligação

REGRAS:
- Sempre responda em português do Brasil.
- Seja acolhedora.
- Conduza a conversa para ação.
- Use técnicas de vendas com empatia.
- Nunca finalize abruptamente.

OBJETIVO:
Converter, reativar, confirmar ou fechar tratamento.
`;

function sanitizeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  const formData = await req.formData();

  const speechResult = formData.get("SpeechResult")?.toString().trim();
  const from = formData.get("From")?.toString() || "";
  const callSid = formData.get("CallSid")?.toString() || "";

  const CORE_API_URL = Deno.env.get("CORE_API_URL") || "https://chilmuwijkkdefqizleh.supabase.co";
  const actionUrl = `${CORE_API_URL}/functions/v1/twilio-voice-webhook`;

  // PRIMEIRA INTERAÇÃO
  if (!speechResult) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="${actionUrl}" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      Boa tarde.
      Meu nome é Maria.
      Eu sou a assistente virtual da Clínica La Vitta.
      Tudo bem com você?
    </Say>
  </Gather>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(`[twilio-voice] CallSid=${callSid} From=${from} Speech="${speechResult}"`);

  let respostaFinal = "Desculpe, não consegui entender muito bem. Pode repetir por favor?";

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_BASE },
          { role: "user", content: speechResult },
        ],
      }),
    });

    const data = await aiResponse.json();

    if (data.choices && data.choices.length > 0) {
      respostaFinal = data.choices[0].message.content;
    }
  } catch (error) {
    console.error("[twilio-voice] Erro OpenAI:", error);
    respostaFinal = "Tive uma pequena instabilidade agora. Pode repetir por favor?";
  }

  respostaFinal = sanitizeXml(respostaFinal);
  console.log(`[twilio-voice] Resposta: "${respostaFinal}"`);

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="${actionUrl}" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
});
