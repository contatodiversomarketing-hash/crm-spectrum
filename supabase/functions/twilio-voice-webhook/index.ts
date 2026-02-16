import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const formData = await req.formData();
  const speechResultRaw = formData.get("SpeechResult");

  const speechResult = speechResultRaw
    ? speechResultRaw.toString().trim()
    : "";

  // PRIMEIRA INTERAÇÃO
  if (!speechResult) {
    return new Response(`
      <Response>
        <Gather 
          input="speech"
          timeout="8"
          speechTimeout="auto"
          language="pt-BR"
          action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
          method="POST"
        >
          <Say voice="Polly.Vitoria" language="pt-BR">
            Olá... <Break time="400ms"/>
            aqui é da Clínica LA VITTA. <Break time="400ms"/>
            Estou ligando para falar com você.
            Pode me ouvir?
          </Say>
        </Gather>

        <Say voice="Polly.Vitoria" language="pt-BR">
          Não consegui ouvir sua resposta.
          Vou encerrar por enquanto.
        </Say>
      </Response>
    `, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // RESPOSTA HUMANIZADA
  return new Response(`
    <Response>
      <Gather 
        input="speech"
        timeout="8"
        speechTimeout="auto"
        language="pt-BR"
        action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
        method="POST"
      >
        <Say voice="Polly.Vitoria" language="pt-BR">
          Entendi... <Break time="300ms"/>
          você disse: ${speechResult}. <Break time="400ms"/>
          Pode me explicar um pouco melhor?
        </Say>
      </Gather>
    </Response>
  `, {
    headers: { "Content-Type": "text/xml" },
  });
});
