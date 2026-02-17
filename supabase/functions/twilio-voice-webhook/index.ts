import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function limparTexto(texto: string) {
  return texto
    .replace(/&/g, "e")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
}

const SYSTEM_ENGINE = `
Você é Maria da Clínica La Vitta.
Você é humana.
Nunca diga que é IA.
Sempre fale português do Brasil natural.
Seja acolhedora e estratégica.
Sempre conduza para próximo passo.
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
  <Gather input="speech" timeout="8" speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      Boa tarde. Aqui é Maria da Clínica La Vitta.
      Me conta, você está buscando qual atendimento?
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
          { role: "system", content: SYSTEM_ENGINE },
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

  // =============================
  // GERAR ÁUDIO ELEVENLABS
  // =============================

  let audioUrl = "";

  try {
    const elevenResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${Deno.env.get("ELEVENLABS_VOICE_ID")}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: respostaFinal,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8
          }
        })
      }
    );

    const audioBuffer = await elevenResp.arrayBuffer();

    const fileName = `audio-${Date.now()}.mp3`;

    // salvar no storage público
    const uploadResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/audio/${fileName}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "audio/mpeg"
        },
        body: audioBuffer
      }
    );

    audioUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/audio/${fileName}`;
  } catch {}

  if (!audioUrl) {
    // fallback se falhar
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Vitoria" language="pt-BR">
    ${respostaFinal}
  </Say>
</Response>`, {
      headers: { "Content-Type": "text/xml; charset=utf-8" }
    });
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    <Play>${audioUrl}</Play>
  </Gather>
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
});
