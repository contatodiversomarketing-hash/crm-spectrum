import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const formData = await req.formData();
  const speechResult = formData.get("SpeechResult")?.toString().trim();

  let responseXml = "";

  if (!speechResult) {
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
      Olá. Aqui é da Clínica LA VITTA.
      Gostaria de falar com você.
      Pode me ouvir?
    </Say>

  </Gather>

  <Say voice="Polly.Vitoria" language="pt-BR">
    Não consegui ouvir sua resposta.
    Vou encerrar por enquanto.
  </Say>
</Response>`;
  } else {
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
      Você disse: ${speechResult}.
      Pode me explicar melhor?
    </Say>

  </Gather>
</Response>`;
  }

  return new Response(responseXml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
});
