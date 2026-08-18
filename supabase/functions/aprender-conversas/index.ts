import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Você é um analista de atendimento e vendas da Dra. Amélia Carvalho (telemedicina de cannabis medicinal).
Você recebe PRINTS (imagens) e/ou TEXTOS de conversas REAIS de WhatsApp entre um atendente humano da Dra. Amélia Carvalho e pacientes.

Sua tarefa:
1. TRANSCREVER a conversa fielmente, identificando quem fala (ATENDENTE / PACIENTE). Preserve a escrita do atendente.
2. EXTRAIR o estilo do atendente humano: tom, saudações, ritmo, forma de perguntar, como conduz para o agendamento, como responde objeções (preço, medo, desconfiança, "vou pensar").
3. Gerar REGRAS DE TREINAMENTO acionáveis para a IA Ana imitar esse atendente.

Responda SOMENTE com JSON válido, sem markdown, neste formato:
{
  "transcricao": "ATENDENTE: ...\\nPACIENTE: ...",
  "resumo": "resumo curto do que aconteceu na conversa",
  "regras": [
    {
      "categoria": "atendimento|vendas|objecoes|agendamento|servicos|especialidades|geral",
      "titulo": "título curto e específico",
      "instrucao": "instrução detalhada e acionável, em 2ª pessoa ('Sempre faça...'), citando frases reais do atendente quando útil"
    }
  ],
  "exemplos": [
    { "situacao": "descrição da situação (ex: paciente acha caro)", "paciente": "fala do paciente", "atendente": "resposta exata do atendente" }
  ]
}
Gere entre 3 e 8 regras e até 8 exemplos. Nunca invente informação que não esteja na conversa.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imagens, texto } = await req.json();
    const imgs: string[] = Array.isArray(imagens) ? imagens.slice(0, 10) : [];
    const txt: string = typeof texto === "string" ? texto.slice(0, 20000) : "";

    if (imgs.length === 0 && !txt.trim()) {
      return new Response(JSON.stringify({ error: "Envie prints ou texto da conversa" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "IA não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content: any[] = [
      {
        type: "text",
        text: txt.trim()
          ? `Analise a conversa abaixo (e os prints anexados, se houver).\n\n${txt}`
          : "Analise os prints de conversa anexados.",
      },
      ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text();
      console.error(`[aprender-conversas] HTTP ${aiResp.status}: ${errBody.slice(0, 800)}`);
      const msg =
        aiResp.status === 429
          ? "Limite de uso da IA atingido. Tente novamente em instantes."
          : aiResp.status === 402
            ? "Créditos de IA esgotados."
            : "Erro ao analisar a conversa.";
      return new Response(JSON.stringify({ error: msg }), {
        status: aiResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed || !Array.isArray(parsed.regras)) {
      console.error("[aprender-conversas] Resposta inválida:", String(raw).slice(0, 800));
      return new Response(JSON.stringify({ error: "Não consegui interpretar a conversa. Tente prints mais legíveis." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guardar a conversa bruta como referência (usada como exemplo pela IA)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const transcricao = String(parsed.transcricao || txt || "").slice(0, 20000);
    const exemplos = Array.isArray(parsed.exemplos) ? parsed.exemplos.slice(0, 8) : [];

    return new Response(
      JSON.stringify({
        resumo: String(parsed.resumo || "").slice(0, 1000),
        transcricao,
        exemplos,
        regras: parsed.regras.slice(0, 10).map((r: any) => ({
          categoria: String(r?.categoria || "geral"),
          titulo: String(r?.titulo || "Regra aprendida").slice(0, 200),
          instrucao: String(r?.instrucao || "").slice(0, 4000),
        })),
        _debug: { imagens: imgs.length, tem_texto: !!txt.trim(), supabase_ok: !!supabase },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[aprender-conversas] Erro:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
