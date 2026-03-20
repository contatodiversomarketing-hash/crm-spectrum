import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isSpreadsheet(type: string | null, name: string | null): boolean {
  if (!type && !name) return false;
  const spreadTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
  ];
  if (type && spreadTypes.includes(type)) return true;
  if (name) {
    const ext = name.split(".").pop()?.toLowerCase();
    return ["xlsx", "xls", "csv"].includes(ext || "");
  }
  return false;
}

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

    // --- IMAGES: use vision ---
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
                  text: `Analise esta imagem em detalhes. Extraia TODO o texto visível, descreva tabelas, gráficos, informações e dados relevantes. Retorne o conteúdo de forma estruturada e completa. Nome do arquivo: ${file_name || "imagem"}`,
                },
                { type: "image_url", image_url: { url: file_url, detail: "high" } },
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

    // --- Download the file ---
    const fileResp = await fetch(file_url);
    if (!fileResp.ok) {
      return new Response(JSON.stringify({ error: "Erro ao baixar arquivo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- SPREADSHEETS: parse locally with SheetJS, then summarize with AI ---
    if (isSpreadsheet(file_type, file_name)) {
      const buf = await fileResp.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

      let textContent = "";
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        textContent += `=== Aba: ${name} ===\n${csv}\n\n`;
      }

      // Trim to ~12k chars to stay within token limits
      const trimmed = textContent.slice(0, 12000);

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
              content: `Analise os dados desta planilha (${file_name || "arquivo"}) e retorne um resumo estruturado completo de todo o conteúdo. Organize as informações de forma clara para que possam ser usadas como instrução de treinamento para uma assistente de clínica.\n\nDados da planilha:\n${trimmed}`,
            },
          ],
          max_completion_tokens: 4096,
        }),
      });

      if (!aiResp.ok) {
        const err = await aiResp.text();
        console.error("Spreadsheet AI error:", err);
        // Fallback: return raw CSV content
        return new Response(JSON.stringify({ conteudo: trimmed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await aiResp.json();
      const content = data?.choices?.[0]?.message?.content || trimmed;
      return new Response(JSON.stringify({ conteudo: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- PDFs: send as base64 to vision model ---
    const fileBuffer = await fileResp.arrayBuffer();
    const uint8 = new Uint8Array(fileBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    const mimeType = file_type || "application/pdf";
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
                text: `Analise este documento PDF (${file_name || "arquivo"}) em detalhes. Extraia TODO o conteúdo: texto, tabelas, dados, listas, informações numéricas. Retorne de forma estruturada e completa.`,
              },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
        max_completion_tokens: 4096,
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text();
      console.error("PDF analysis error:", err);
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
    return new Response(JSON.stringify({ error: "Erro interno", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
