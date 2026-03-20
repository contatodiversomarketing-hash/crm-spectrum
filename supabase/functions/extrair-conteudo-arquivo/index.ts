import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_url, file_type, file_name } = await req.json();

    if (!file_url) {
      return new Response(JSON.stringify({ error: "file_url é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API de IA não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For images, use vision model to describe
    if (file_type?.startsWith("image/")) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analise esta imagem em detalhes. Extraia TODO o texto visível, descreva tabelas, gráficos, informações e dados relevantes. Retorne o conteúdo de forma estruturada e completa para que possa ser usado como instrução de treinamento. Nome do arquivo: ${file_name || "imagem"}`,
                },
                {
                  type: "image_url",
                  image_url: { url: file_url, detail: "high" },
                },
              ],
            },
          ],
          max_completion_tokens: 4096,
        }),
      });

      if (!aiResp.ok) {
        const err = await aiResp.text();
        console.error("Vision error:", err);
        return new Response(JSON.stringify({ error: "Erro ao analisar imagem" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await aiResp.json();
      const content = data?.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ conteudo: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For PDFs and spreadsheets, download and send as base64 to vision
    const fileResp = await fetch(file_url);
    if (!fileResp.ok) {
      return new Response(JSON.stringify({ error: "Erro ao baixar arquivo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileBuffer = await fileResp.arrayBuffer();
    const uint8 = new Uint8Array(fileBuffer);
    
    // Convert to base64
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    const mimeType = file_type || "application/octet-stream";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este documento (${file_name || "arquivo"}) em detalhes. Extraia TODO o conteúdo: texto, tabelas, dados, listas, informações numéricas. Retorne o conteúdo de forma estruturada e completa para que possa ser usado como instrução de treinamento para uma assistente de clínica. Se for planilha, organize os dados em formato legível.`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
        max_completion_tokens: 4096,
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text();
      console.error("Doc analysis error:", err);
      return new Response(JSON.stringify({ error: "Erro ao analisar documento" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const content = data?.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ conteudo: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
