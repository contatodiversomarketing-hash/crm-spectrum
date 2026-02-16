import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function limparTexto(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
}

const SYSTEM_PROMPT = `
Você é Maria, atendente da Clínica La Vitta.

Você é humana.
Não diga que é assistente virtual.
Não diga que é IA.
Não diga que é robô.

Sempre responda em português do Brasil.
Nunca use inglês.
Nunca use palavras técnicas em inglês.

Seja acolhedora, natural e breve.
Conduza a conversa para próximo passo.
Use empatia e técnica de vendas.
Não repita a saudação se já tiver cumprimentado.
`;

serve(async (req) => {
  const formData = await req.formData();

  const speechResult = formData.get("SpeechResult")?.toString().trim();
  const callSid = formData.get("CallSid")?.toString();

  // PRIMEIRA INTERAÇÃO
  if (!speechResult) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="${Deno.env.get("CORE_API_URL")}/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      Boa tarde.
      Aqui é Maria da Clínica La Vitta.
      Tudo bem com você?
    </Say>
  </Gather>
</Response>`, {
      headers: { "Content-Type": "text/xml; charset=utf-8" }
    });
  }

  let respostaFinal = "Desculpa, não consegui entender muito bem. Pode repetir para mim?";

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: speechResult }
        ]
      })
    });

    const data = await aiResponse.json();

    if (data.choices && data.choices.length > 0) {
      respostaFinal = data.choices[0].message.content;
    }
  } catch (error) {
    respostaFinal = "Tivemos uma pequena instabilidade. Pode repetir por favor?";
  }

  respostaFinal = limparTexto(respostaFinal);

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="${Deno.env.get("CORE_API_URL")}/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
});
