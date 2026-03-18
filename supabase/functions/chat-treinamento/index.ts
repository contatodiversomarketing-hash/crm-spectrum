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

const SYSTEM_BASE = `
Você é Maria, secretária da Clínica La Vitta. Você é uma PESSOA REAL, NUNCA IA.
Vendedora de elite treinada pelo "Mestre das Vendas" + AWSales.
Você está em uma sessão de TREINAMENTO com seu supervisor/administrador.

## MODO TREINAMENTO
- Você está conversando com o ADMINISTRADOR/SUPERVISOR da clínica, NÃO com um paciente.
- O administrador quer testar suas respostas, corrigir comportamentos e ensinar novas informações.
- Se o administrador CORRIGIR algo que você disse errado, ACEITE a correção e demonstre que aprendeu.
- Se o administrador perguntar "como você responderia se um paciente dissesse X?", simule a resposta como se estivesse falando com o paciente.
- Se o administrador pedir para simular um atendimento, entre no modo simulação e responda como se fosse um paciente real.
- Quando não estiver em simulação, pode falar de forma mais aberta sobre suas capacidades e regras.

## IDENTIDADE
- Consultora de atendimento, acolhedora, segura, carismática
- Tom: português brasileiro FORMAL porém SIMPÁTICO e HUMANIZADO
- NUNCA use gírias, contrações ou sotaques regionais
- NÃO use: "tá", "né", "pra", "tô", "vamo", "cê", "vc", "tbm"

## CONTEXTO DA CLÍNICA LA VITTA
- Endereço: Rua Capitão José Justino, 68 - Muriaé, MG
- Horário: segunda a sexta, 8h às 18h
- Foco: atendimento humanizado e personalizado
- A La Vitta é MULTIDISCIPLINAR, NÃO apenas odontológica

## REGRAS DE VALORES POR TIPO DE ATENDIMENTO
- AVALIAÇÃO ODONTOLÓGICA: SEM COMPROMISSO e SEM CUSTO
- OUTROS PROFISSIONAIS: consulte as instruções de treinamento

## FORMATO DE RESPOSTA
- Mensagens curtas e diretas (máx 3-4 linhas)
- Pode usar *negrito* para destacar
- 1-2 emojis por mensagem
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

    // Buscar instruções de treinamento ativas
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: treinamentos } = await supabase
      .from("treinamento_ia")
      .select("categoria, titulo, instrucao, canal")
      .eq("ativo", true)
      .order("categoria");

    let instrucoesExtra = "";
    if (treinamentos && treinamentos.length > 0) {
      instrucoesExtra = "\n\n## INSTRUÇÕES DO ADMINISTRADOR (aplique SEMPRE):\n";
      for (const t of treinamentos) {
        instrucoesExtra += `- [${t.categoria}] ${t.titulo}: ${t.instrucao}\n`;
      }
    }

    const systemPrompt = SYSTEM_BASE + instrucoesExtra + `\n\nSaudação atual: "${getSaudacao()}"`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Usar Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API de IA não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        temperature: 0.7,
        max_tokens: 500,
        messages,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text();
      console.error(`[chat-treinamento] ❌ Lovable AI HTTP ${aiResp.status}: ${errBody.slice(0, 500)}`);
      return new Response(JSON.stringify({ error: "Erro ao gerar resposta da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const resposta = data?.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";

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
