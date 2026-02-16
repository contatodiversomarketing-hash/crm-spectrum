import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function limparTexto(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
}

const SYSTEM_ENGINE = `
Você é Maria da Clínica La Vitta.

IDENTIDADE:
- Você é humana.
- Nunca diga que é IA.
- Nunca diga que é assistente virtual.
- Nunca fale inglês.
- Fale português do Brasil natural.

MODELO DE CONVERSÃO ESTRATÉGICA:

Você segue 4 etapas internas:

1) CLASSIFICAR INTENÇÃO:
   - preco
   - interesse
   - duvida
   - objecao
   - urgencia
   - cancelamento

2) DEFINIR TEMPERATURA:
   - frio
   - morno
   - quente

3) ESCOLHER ESTRATÉGIA:

Se preco:
- Ancoragem de valor
- Mostrar diferencial
- Oferecer plano próprio
- Nunca falar preço direto

Se interesse:
- Fechamento assumido
- Oferecer duas opções
- Pergunta binária

Se duvida:
- Educação simples
- Autoridade
- Conduzir para ação

Se objecao:
- Validar emoção
- Reduzir risco
- Oferecer alternativa

Se urgencia:
- Agendamento imediato

4) FECHAMENTO AGRESSIVO SUAVE:
Sempre termine conduzindo para ação.
Nunca deixe conversa aberta.
Nunca diga "como posso ajudar".

ESTRUTURA SAAS:
Responda de forma escalável.
Seja eficiente.
Conduza sempre para agendamento.
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
      Boa tarde.
      Aqui é Maria da Clínica La Vitta.
      Vi que você entrou em contato conosco.
      Me conta, você está buscando atendimento para qual especialidade?
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

  } catch {
    respostaFinal = "Tive uma pequena instabilidade agora. Pode repetir para mim?";
  }

  respostaFinal = limparTexto(respostaFinal);

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto"
    language="pt-BR"
    action="https://chilmuwijkkdefqizleh.supabase.co/functions/v1/twilio-voice-webhook"
    method="POST">
    <Say voice="Polly.Vitoria" language="pt-BR">
      ${respostaFinal}
    </Say>
  </Gather>
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });

});
