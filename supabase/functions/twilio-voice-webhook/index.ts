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
Você é Maria da Clínica La Vitta.

Você é humana.
Nunca diga que é IA.
Nunca diga que é assistente virtual.
Sempre responda em português do Brasil.
Seja natural, acolhedora e objetiva.
Conduza a conversa como uma atendente real.
`;

serve(async (req) => {

  let speech = "";

  try {
    const formData = await req.formData();
    speech = formData.get("SpeechResult")?.toString().trim() || "";
  } catch {}

  // PRIMEIRA INTERAÇÃO
  if (!speech) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      Boa tarde.
      Aqui é Maria da Clínica La Vitta.
      Como posso te ajudar?
    </Say>
  </Gather>
</Response>`, {
      headers: { "Content-Type": "text/xml; charset=utf-8" }
    });
  }

  let respostaFinal = "Pode repetir para mim, por favor?";

  try {

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: speech }
        ]
      })
    });

    const data = await aiResp.json();

    if (data?.choices?.[0]?.message?.content) {
      respostaFinal = data.choices[0].message.content;
    }

  } catch {}

  respostaFinal = limparTexto(respostaFinal);

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather 
    input="speech"
    timeout="8"
    speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });

});
