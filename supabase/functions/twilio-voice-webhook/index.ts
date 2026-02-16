import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function limparTexto(texto: string): string {
  return texto
    .replace(/&/g, "e")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function getSaudacao(): string {
  const now = new Date();
  const brasilHour = (now.getUTCHours() - 3 + 24) % 24;
  if (brasilHour < 12) return "Bom dia";
  if (brasilHour < 18) return "Boa tarde";
  return "Boa noite";
}

const SYSTEM_ENGINE = `
Você é Maria, atendente humana da Clínica La Vitta.
REGRAS ABSOLUTAS:
- Você é humana. NUNCA mencione que é IA, assistente virtual ou robô.
- Fale português brasileiro natural, com expressões coloquiais.
- Seja acolhedora, empática e estratégica.
- Use frases curtas e diretas (máximo 2-3 frases por resposta).
- NUNCA use frases passivas como "como posso ajudar?" ou "em que posso ser útil?".
- Sempre conduza a conversa para o próximo passo (agendar, confirmar interesse, pegar contato).
- Cumprimente apenas UMA vez por ligação.

ESTRATÉGIA DE CONVERSÃO:
1. Classifique a intenção: preço, interesse, dúvida, objeção, urgência
2. Defina a temperatura do lead: frio, morno, quente
3. Aplique a estratégia certa:
   - Preço → Ancoragem de valor antes do número
   - Interesse → Fechamento assumido ("Vou reservar seu horário")
   - Dúvida → Responda rápido e redirecione para agendamento
   - Objeção → Técnica APA (Aceitar, Perguntar, Avançar)
   - Urgência → Escassez real ("Temos poucos horários essa semana")
4. Sempre termine direcionando para ação concreta

EXEMPLOS DE TOM:
- "Que bom que ligou! A gente tem um tratamento incrível pra isso."
- "Olha, essa semana ainda tenho dois horários disponíveis. Qual fica melhor pra você?"
- "Entendo sua preocupação. Muitas pacientes tinham essa mesma dúvida e ficaram super satisfeitas."
`;

async function gerarAudioElevenLabs(texto: string): Promise<string | null> {
  try {
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!voiceId || !apiKey || !supabaseUrl || !serviceKey) {
      console.error("Missing env vars:", { voiceId: !!voiceId, apiKey: !!apiKey, supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey });
      return null;
    }

    console.log("Chamando ElevenLabs TTS...");
    const elevenResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: texto,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.85,
            style: 0.4,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      console.error("ElevenLabs erro:", elevenResp.status, errText);
      return null;
    }

    const audioBuffer = await elevenResp.arrayBuffer();
    console.log("Áudio gerado, tamanho:", audioBuffer.byteLength, "bytes");

    if (audioBuffer.byteLength < 100) {
      console.error("Áudio muito pequeno, provavelmente inválido");
      return null;
    }

    const fileName = `maria-${Date.now()}.mp3`;

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    
    console.log("Fazendo upload para storage com anon key...");
    const uploadResp = await fetch(
      `${supabaseUrl}/storage/v1/object/audio/${fileName}`,
      {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "audio/mpeg",
          "x-upsert": "true",
        },
        body: new Uint8Array(audioBuffer),
      }
    );

    if (!uploadResp.ok) {
      const uploadErr = await uploadResp.text();
      console.error("Upload erro:", uploadResp.status, uploadErr);
      return null;
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/audio/${fileName}`;
    console.log("Áudio disponível em:", audioUrl);
    return audioUrl;

  } catch (err) {
    console.error("Erro geral TTS:", err);
    return null;
  }
}

function twimlResponse(content: string, isGather: boolean = true): Response {
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-voice-webhook`;

  let twiml: string;
  if (isGather) {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="6" speechTimeout="auto"
    language="pt-BR"
    action="${webhookUrl}"
    method="POST">
    ${content}
  </Gather>
  <Say voice="Polly.Vitoria" language="pt-BR">Desculpa, nao consegui te ouvir. Pode repetir?</Say>
  <Redirect method="POST">${webhookUrl}</Redirect>
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${content}
</Response>`;
  }

  return new Response(twiml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

serve(async (req) => {
  let speech = "";
  let callSid = "";

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    speech = params.get("SpeechResult")?.trim() || "";
    callSid = params.get("CallSid") || "";
    console.log("CallSid:", callSid, "| Speech:", speech);
  } catch (err) {
    console.error("Erro ao ler body:", err);
  }

  // === PRIMEIRA INTERAÇÃO ===
  if (!speech) {
    const saudacao = getSaudacao();
    const textoInicial = `${saudacao}! Aqui é a Maria, da Clínica La Vitta. Me conta, o que você tá buscando?`;

    const audioUrl = await gerarAudioElevenLabs(textoInicial);

    if (audioUrl) {
      return twimlResponse(`<Play>${audioUrl}</Play>`);
    }

    // Fallback
    return twimlResponse(
      `<Say voice="Polly.Vitoria" language="pt-BR">${limparTexto(textoInicial)}</Say>`
    );
  }

  // === RESPOSTA DA IA ===
  let respostaFinal = "Pode repetir pra mim, por favor?";

  try {
    console.log("Chamando OpenAI...");
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 150,
        messages: [
          { role: "system", content: SYSTEM_ENGINE },
          { role: "user", content: speech },
        ],
      }),
    });

    const data = await aiResp.json();
    console.log("OpenAI resposta:", JSON.stringify(data?.choices?.[0]?.message?.content || "vazio"));

    if (data?.choices?.[0]?.message?.content) {
      respostaFinal = data.choices[0].message.content;
    }
  } catch (err) {
    console.error("Erro OpenAI:", err);
  }

  respostaFinal = limparTexto(respostaFinal);

  // === GERAR ÁUDIO ELEVENLABS ===
  const audioUrl = await gerarAudioElevenLabs(respostaFinal);

  if (audioUrl) {
    return twimlResponse(`<Play>${audioUrl}</Play>`);
  }

  // Fallback Polly
  return twimlResponse(
    `<Say voice="Polly.Vitoria" language="pt-BR">${respostaFinal}</Say>`
  );
});
