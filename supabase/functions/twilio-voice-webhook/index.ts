import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const formData = await req.formData();
  const speechResult = formData.get("SpeechResult");

  if (!speechResult) {
    return new Response(`
      <Response>
        <Gather 
          input="speech dtmf"
          timeout="8"
          speechTimeout="auto"
          action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
          method="POST"
        >
          <Say voice="Polly.Camila" language="pt-BR">
            Olá, aqui é da Clínica LA VITTA.
            Gostaria de conversar com você.
            Pode falar comigo normalmente.
          </Say>
        </Gather>

        <Say>Não consegui ouvir sua resposta.</Say>
      </Response>
    `, {
      headers: { "Content-Type": "text/xml" }
    });
  }

  return new Response(`
    <Response>
      <Say voice="Polly.Camila" language="pt-BR">
        Entendi o que você disse: ${speechResult}.
        Vamos continuar conversando.
      </Say>

      <Gather 
        input="speech dtmf"
        timeout="8"
        speechTimeout="auto"
        action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
        method="POST"
      >
        <Say voice="Polly.Camila">Pode me explicar melhor?</Say>
      </Gather>
    </Response>
  `, {
    headers: { "Content-Type": "text/xml" }
  });
});
