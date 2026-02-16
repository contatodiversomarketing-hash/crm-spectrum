import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
      Pode falar comigo.
    </Say>
  </Gather>
</Response>`, {
      headers: { "Content-Type": "text/xml; charset=utf-8" }
    });
  }

  // SEGUNDA INTERAÇÃO (RESPONDE SEM IA)
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
      Entendi o que você falou.
      Vamos continuar nossa conversa.
    </Say>
  </Gather>
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });

});
