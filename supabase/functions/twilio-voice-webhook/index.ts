import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const twiml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice" language="pt-BR">
          Olá. Aqui é da Clínica Vite.
          Esta é uma chamada automática da nossa assistente inteligente.
        </Say>
        <Pause length="1"/>
        <Say voice="alice" language="pt-BR">
          Em breve enviaremos mais informações pelo WhatsApp.
          Obrigado.
        </Say>
      </Response>
    `;

    return new Response(twiml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    const errorResponse = `
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Ocorreu um erro. Encerrando chamada.</Say>
      </Response>
    `;

    return new Response(errorResponse, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
});
