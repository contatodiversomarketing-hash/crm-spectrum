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

        <Say voice="Polly.Camila" language="pt-BR">Não consegui ouvir sua resposta. Vou tentar mais uma vez.</Say>
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
        <Say voice="Polly.Camila" language="pt-BR">Pode me explicar melhor?</Say>
      </Gather>

      <Say voice="Polly.Camila" language="pt-BR">Tudo bem, nos falamos depois. Até logo!</Say>
    </Response>
  `, {
    headers: { "Content-Type": "text/xml" }
  });
});
