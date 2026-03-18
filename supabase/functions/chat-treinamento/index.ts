import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSaudacao(): string {
  const now = new Date();
  const brHour = (now.getUTCHours() - 3 + 24) % 24;
  if (brHour < 12) return "Bom dia";
  if (brHour < 18) return "Boa tarde";
  return "Boa noite";
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";

        const record = part as Record<string, unknown>;
        return [record.text, record.output_text, record.content]
          .filter((value): value is string => typeof value === "string")
          .join(" ");
      })
      .join(" ")
      .trim();
  }

  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    return [record.text, record.output_text, record.content]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .trim();
  }

  return "";
}

function extractAssistantReply(payload: any): string {
  const choice = payload?.choices?.[0];
  const directMessage = extractTextContent(choice?.message?.content);
  if (directMessage) return directMessage;

  const directText = extractTextContent(choice?.text);
  if (directText) return directText;

  const outputText = extractTextContent(payload?.output_text);
  if (outputText) return outputText;

  if (Array.isArray(payload?.output)) {
    const nested = payload.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [item?.content])
      .map((part: any) => extractTextContent(part))
      .filter(Boolean)
      .join(" ")
      .trim();

    if (nested) return nested;
  }

  return "";
}

const SYSTEM_BASE = `
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL e nunca deve se apresentar como IA.
Você está em uma sessão de TREINAMENTO com seu supervisor/administrador.

## OBJETIVO DESTA ABA
- O administrador usa esta conversa para TESTAR, CORRIGIR e ENSINAR você.
- Você deve responder corretamente, explicar seu raciocínio quando for útil e aceitar ajustes sem discutir.
- Se o administrador ensinar uma nova regra, passe a seguir essa regra imediatamente NESTA conversa.
- Se o administrador corrigir algo, reconheça a correção e mostre como responderá dali em diante.
- Se o administrador pedir simulação de atendimento, responda exatamente como responderia ao paciente.
- Se o administrador estiver falando sobre estratégia, treinamento ou correção, responda como Maria em modo interno de treinamento.

## IDENTIDADE E TOM
- Consultora de atendimento acolhedora, segura, carismática e muito competente em vendas
- Tom: português brasileiro FORMAL, simpático, humano e objetivo
- Nunca use gírias, contrações ou sotaques regionais
- Não use: "tá", "né", "pra", "tô", "vamo", "cê", "vc", "tbm"

## CONTEXTO DA CLÍNICA LA VITTA
- Endereço: Rua Capitão José Justino, 68 - Muriaé, MG
- Horário: segunda a sexta, 8h às 18h
- Foco: atendimento humanizado e personalizado
- A La Vitta é MULTIDISCIPLINAR, não apenas odontológica

## REGRAS IMPORTANTES
- Não invente preços, horários, profissionais ou informações ausentes
- Avaliação odontológica: sem compromisso e sem custo
- Outros valores: consulte as instruções cadastradas; se não houver informação, diga que irá confirmar com a equipe
- Ao responder ao administrador, seja clara e útil
- Ao simular resposta para paciente, escreva a mensagem final pronta para envio

## FORMATO DE RESPOSTA
- Padrão: mensagens curtas e diretas, com no máximo 4 linhas
- Pode usar *negrito* para destacar pontos importantes
- Use no máximo 1 ou 2 emojis por mensagem
- Nunca responda vazio
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages: chatMessages } = await req.json();

    if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      return new Response(JSON.stringify({ error: "messages é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: treinamentos, error: treinamentoError } = await supabase
      .from("treinamento_ia")
      .select("categoria, titulo, instrucao, canal")
      .eq("ativo", true)
      .in("canal", ["ambos", "whatsapp", "voz"])
      .order("categoria");

    if (treinamentoError) {
      console.error("[chat-treinamento] Erro ao buscar instruções:", treinamentoError);
    }

    let instrucoesExtra = "";
    if (treinamentos && treinamentos.length > 0) {
      instrucoesExtra = "\n\n## INSTRUÇÕES CADASTRADAS PELO ADMINISTRADOR (aplique sempre):\n";
      for (const t of treinamentos) {
        instrucoesExtra += `- [${t.categoria} | canal: ${t.canal}] ${t.titulo}: ${t.instrucao}\n`;
      }
    }

    const systemPrompt = SYSTEM_BASE + instrucoesExtra + `\n\nSaudação atual: "${getSaudacao()}"`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API de IA não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages,
        max_completion_tokens: 900,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text();
      console.error(`[chat-treinamento] ❌ Lovable AI HTTP ${aiResp.status}: ${errBody.slice(0, 1000)}`);

      const status = aiResp.status;
      const errorMessage = status === 429
        ? "Limite de uso da IA atingido no momento. Tente novamente em instantes."
        : status === 402
          ? "Os créditos da IA acabaram. Adicione saldo e tente novamente."
          : "Erro ao gerar resposta da IA";

      return new Response(JSON.stringify({ error: errorMessage }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const resposta = extractAssistantReply(data);

    if (!resposta) {
      console.error("[chat-treinamento] Resposta vazia da IA:", JSON.stringify(data).slice(0, 1200));
      return new Response(JSON.stringify({
        reply: "Desculpe, tive uma falha técnica ao montar a resposta. Pode me enviar novamente a instrução ou teste?"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: resposta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[chat-treinamento] Erro:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
