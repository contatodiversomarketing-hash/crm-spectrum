import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VOICE = "Polly.Camila";
const LANGUAGE = "pt-BR";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo");
    const nome = url.searchParams.get("nome") || "paciente";
    const data = url.searchParams.get("data") || "";
    const horario = url.searchParams.get("horario") || "";

    const coreApiUrl = Deno.env.get("CORE_API_URL")!;
    const gatherAction = `${coreApiUrl}/functions/v1/twilio-voice-webhook?tipo=${tipo || ""}&nome=${encodeURIComponent(nome)}`;

    // Parse body if POST (Twilio sends form-encoded data)
    let speechResult: string | null = null;
    let digits: string | null = null;
    let callSid = "";
    let from = "";

    if (req.method === "POST") {
      const bodyText = await req.text();
      const params = new URLSearchParams(bodyText);
      speechResult = params.get("SpeechResult");
      digits = params.get("Digits");
      callSid = params.get("CallSid") || "";
      from = params.get("From") || "";
    }

    // If we have speech input, process with AI
    if (speechResult) {
      console.log(`[twilio-voice-webhook] Speech: "${speechResult}" CallSid=${callSid} From=${from}`);

      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // Log the speech input
      await supabase.from("logs_decisao").insert({
        evento: "voice_speech_received",
        decisao: speechResult,
        regra_aplicada: `tipo_${tipo || "geral"}`,
        confianca: 1.0,
        dados_entrada: { call_sid: callSid, from, tipo, nome, speech: speechResult },
      });

      // Generate AI response
      const respostaIA = await gerarRespostaIA(speechResult, tipo, nome);

      // Log AI response
      await supabase.from("logs_decisao").insert({
        evento: "voice_ai_response",
        decisao: respostaIA,
        regra_aplicada: "lovable_ai_gemini",
        confianca: 0.9,
        dados_entrada: { call_sid: callSid, speech: speechResult, resposta: respostaIA },
      });

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="auto" action="${escapeXml(gatherAction)}" method="POST">
    <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(respostaIA)}</Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Tudo bem, nos falamos depois. Tenha um bom dia.</Say>
</Response>`);
    }

    // If we have DTMF digits, redirect to gather handler
    if (digits) {
      const gatherHandlerUrl = `${coreApiUrl}/functions/v1/twilio-gather-handler`;
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(gatherHandlerUrl)}</Redirect>
</Response>`);
    }

    // FIRST INTERACTION — no speech/digits yet
    let twiml: string;

    if (tipo === "confirmacao") {
      const dataInfo = data ? ` para ${escapeXml(data)}` : "";
      const horarioInfo = horario ? ` às ${escapeXml(horario)}` : "";
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="auto" action="${escapeXml(gatherAction)}" method="POST">
    <Say voice="${VOICE}" language="${LANGUAGE}">
      Olá ${escapeXml(nome)}! Aqui é da Clínica LA VITTA.
      Estou ligando para confirmar seu agendamento${dataInfo}${horarioInfo}.
      Você pode me responder normalmente ou pressionar 1 para confirmar e 2 para remarcar.
    </Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Não consegui ouvir sua resposta. Vou encerrar por agora.</Say>
</Response>`;
    } else if (tipo === "reativacao") {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="auto" action="${escapeXml(gatherAction)}" method="POST">
    <Say voice="${VOICE}" language="${LANGUAGE}">
      Olá ${escapeXml(nome)}! Aqui é da Clínica LA VITTA.
      Notamos que faz um tempinho que você não nos visita.
      Gostaria de agendar uma consulta? Pode me responder normalmente.
    </Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Não consegui ouvir sua resposta. Vou encerrar por agora.</Say>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="auto" action="${escapeXml(gatherAction)}" method="POST">
    <Say voice="${VOICE}" language="${LANGUAGE}">
      Olá! Aqui é da Clínica LA VITTA.
      Estou ligando para confirmar seu agendamento.
      Você pode me responder normalmente.
    </Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Não consegui ouvir sua resposta. Vou encerrar por agora.</Say>
</Response>`;
    }

    return xmlResponse(twiml);
  } catch (error) {
    console.error("Erro no twilio-voice-webhook:", (error as Error).message);
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">Desculpe, ocorreu um erro. Encerrando a chamada.</Say>
</Response>`);
  }
});

function xmlResponse(twiml: string): Response {
  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function gerarRespostaIA(speechText: string, tipo: string | null, nomePaciente: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("[twilio-voice-webhook] LOVABLE_API_KEY não configurada");
    return "Entendi. Vou anotar suas informações e nossa equipe entrará em contato em breve.";
  }

  const contexto = tipo === "confirmacao"
    ? `Você está ligando para confirmar um agendamento do paciente ${nomePaciente}. Se o paciente confirmar, diga que está tudo certo. Se quiser remarcar, diga que vai enviar opções de horário pelo WhatsApp.`
    : tipo === "reativacao"
    ? `Você está ligando para reativar o paciente ${nomePaciente} que não visita a clínica há algum tempo. Seja acolhedor e incentive o agendamento.`
    : `Você está em contato com ${nomePaciente} da Clínica LA VITTA.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é a assistente virtual da Clínica LA VITTA. Responda de forma acolhedora, profissional e breve (máximo 3 frases curtas).
${contexto}
REGRAS:
- Nunca dê orientação médica ou clínica
- Use o primeiro nome do paciente quando possível
- Seja objetiva e natural, como uma conversa telefônica real
- Responda em português brasileiro`,
          },
          { role: "user", content: speechText },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[twilio-voice-webhook] AI error:", response.status);
      return "Entendi. Vou anotar e nossa equipe entra em contato pelo WhatsApp.";
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    return content || "Entendi. Nossa equipe vai entrar em contato em breve.";
  } catch (err) {
    console.error("[twilio-voice-webhook] AI fetch error:", (err as Error).message);
    return "Entendi. Vou anotar e nossa equipe entra em contato pelo WhatsApp.";
  }
}
