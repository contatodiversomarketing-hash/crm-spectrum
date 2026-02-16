import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo");
    const nome = url.searchParams.get("nome") || "paciente";
    const data = url.searchParams.get("data") || "";
    const horario = url.searchParams.get("horario") || "";

    let twiml: string;

    const gatherAction = `${Deno.env.get("CORE_API_URL")}/functions/v1/twilio-gather-handler`;

    if (tipo === "confirmacao") {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${gatherAction}" method="POST">
    <Say voice="alice" language="pt-BR">
      Olá ${escapeXml(nome)}. Você tem uma consulta marcada para ${escapeXml(data)} às ${escapeXml(horario)}.
      Para confirmar, pressione 1.
      Para remarcar, pressione 2.
    </Say>
  </Gather>
  <Say voice="alice" language="pt-BR">
    Não detectamos nenhuma resposta. Encerrando a chamada.
  </Say>
</Response>`;
    } else if (tipo === "reativacao") {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${gatherAction}" method="POST">
    <Say voice="alice" language="pt-BR">
      Olá ${escapeXml(nome)}. Aqui é da Clínica Vite.
      Notamos que não tivemos retorno da nossa última mensagem.
      Gostaria que enviássemos horários disponíveis pelo WhatsApp?
      Para sim, pressione 1.
      Para não, pressione 2.
    </Say>
  </Gather>
  <Say voice="alice" language="pt-BR">
    Não detectamos nenhuma resposta. Encerrando a chamada.
  </Say>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
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
</Response>`;
    }

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Erro no twilio-voice-webhook:", error.message);
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="pt-BR">Ocorreu um erro. Encerrando chamada.</Say>
</Response>`;
    return new Response(errorResponse, {
      headers: { "Content-Type": "text/xml" },
    });
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
