import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SYSTEM_PROMPT_BASE = `
Você é a assistente virtual oficial da Clínica La Vitta.

PERSONALIDADE:
- Extremamente humana
- Acolhedora
- Natural
- Nunca robótica
- Nunca repita literalmente o que o paciente disse
- Nunca diga "você disse"
- Só cumprimente uma vez por ligação

POSICIONAMENTO:
- Clínica intermediária com excelência
- Foco principal em odontologia
- Plano próprio acessível
- Atendimento humanizado

TÉCNICAS OBRIGATÓRIAS:
- Rapport
- Perguntas abertas
- Validação emocional
- Condução para próximo passo
- Sempre levar para ação (agendamento ou continuidade)

Regras de resposta:
- Responda em NO MÁXIMO 3 frases curtas
- NÃO use emojis
- NÃO use markdown

OBJETIVO:
Converter, reativar, confirmar ou fechar tratamento.
`;

function getSaudacao(): string {
  const h = (new Date().getUTCHours() - 3 + 24) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function sanitizeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  const formData = await req.formData();

  const speechResult = formData.get("SpeechResult")?.toString().trim();
  const from = formData.get("From")?.toString() || "";
  const callSid = formData.get("CallSid")?.toString() || "";

  const CORE_API_URL = Deno.env.get("CORE_API_URL") || "https://chilmuwijkkdefqizleh.supabase.co";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || CORE_API_URL;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const actionUrl = `${CORE_API_URL}/functions/v1/twilio-voice-webhook`;

  // PRIMEIRA INTERAÇÃO
  if (!speechResult) {
    const saudacao = getSaudacao();
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="${actionUrl}" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${saudacao}... aqui é da Clínica La Vitta.
      Tudo bem com você?
    </Say>
  </Gather>
  <Say voice="Polly.Vitoria" language="pt-BR">
    Não consegui ouvir sua resposta. Vou encerrar por enquanto, tá bom?
  </Say>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(`[twilio-voice] CallSid=${callSid} From=${from} Speech="${speechResult}"`);

  // SALVAR MEMÓRIA DO PACIENTE
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/voice_memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        phone_number: from,
        role: "user",
        message: speechResult,
        call_sid: callSid,
      }),
    });
  } catch (e) {
    console.error("[twilio-voice] Erro ao salvar memória user:", e);
  }

  // BUSCAR HISTÓRICO
  let mensagensHistorico: { role: string; content: string }[] = [];
  try {
    const historicoResp = await fetch(
      `${SUPABASE_URL}/rest/v1/voice_memory?phone_number=eq.${encodeURIComponent(from)}&call_sid=eq.${encodeURIComponent(callSid)}&order=created_at.desc&limit=10`,
      {
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    const historico = await historicoResp.json();
    if (Array.isArray(historico)) {
      mensagensHistorico = historico.reverse().map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.message,
      }));
    }
  } catch (e) {
    console.error("[twilio-voice] Erro ao buscar histórico:", e);
  }

  // BUSCAR PACIENTE NO CRM
  let contextoPaciente = "";
  try {
    const CRM_API_URL = Deno.env.get("CRM_API_URL");
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN");
    if (CRM_API_URL && CRM_API_TOKEN && from) {
      const pacienteResp = await fetch(
        `${CRM_API_URL}paciente-por-telefone?telefone=${encodeURIComponent(from)}`,
        {
          headers: {
            "Authorization": `Bearer ${CRM_API_TOKEN}`,
            "apikey": CRM_API_TOKEN,
          },
        }
      );
      if (pacienteResp.ok) {
        const paciente = await pacienteResp.json();
        contextoPaciente = `
Contexto do paciente:
- Nome: ${paciente.nome || "Não identificado"}
- Plano próprio: ${paciente.plano || "Não informado"}
- Última consulta: ${paciente.ultima_consulta || "Não consta"}
- Orçamento pendente: ${paciente.orcamento || "Nenhum"}
- Status: ${paciente.status || "Não definido"}
`;
      }
    }
  } catch (e) {
    console.error("[twilio-voice] Erro ao buscar paciente CRM:", e);
    contextoPaciente = "Paciente não encontrado no CRM.";
  }

  // CHAMAR OPENAI
  let respostaFinal = "Entendi! Como posso te ajudar hoje?";
  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_BASE + contextoPaciente },
          ...mensagensHistorico,
        ],
      }),
    });

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      const texto = data.choices?.[0]?.message?.content?.trim();
      if (texto) respostaFinal = texto;
    } else {
      console.error(`[twilio-voice] OpenAI erro ${aiResponse.status}`);
    }
  } catch (e) {
    console.error("[twilio-voice] Erro OpenAI:", e);
  }

  respostaFinal = sanitizeXml(respostaFinal);
  console.log(`[twilio-voice] Resposta: "${respostaFinal}"`);

  // SALVAR RESPOSTA DA IA
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/voice_memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        phone_number: from,
        role: "assistant",
        message: respostaFinal,
        call_sid: callSid,
      }),
    });
  } catch (e) {
    console.error("[twilio-voice] Erro ao salvar memória assistant:", e);
  }

  // RESPONDER VIA TWILIO
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" language="pt-BR"
    action="${actionUrl}" method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
});
