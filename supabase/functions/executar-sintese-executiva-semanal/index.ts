import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const dias7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Buscar insights dos últimos 7 dias
    const { data: insights, error: insErr } = await supabase
      .from("insights_ia")
      .select("*")
      .gte("criado_em", dias7)
      .order("criado_em", { ascending: false });

    if (insErr) throw new Error(`Erro ao buscar insights: ${insErr.message}`);

    const lista = insights || [];

    // 2. Ordenar por impacto (alto > medio > baixo)
    const pesoImpacto: Record<string, number> = { alto: 3, medio: 2, baixo: 1 };
    lista.sort((a, b) => (pesoImpacto[b.impacto_estimado || "baixo"] || 0) - (pesoImpacto[a.impacto_estimado || "baixo"] || 0));

    const top5 = lista.slice(0, 5);

    console.log(`[sintese-executiva] ${lista.length} insights encontrados, top 5 selecionados`);

    if (top5.length === 0) {
      return new Response(JSON.stringify({
        status: "concluido",
        mensagem: "Nenhum insight nos últimos 7 dias",
        total_insights: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Gerar síntese via IA
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "gerar_sintese_executiva",
            description: "Gera síntese executiva semanal com risco, oportunidade e ação.",
            parameters: {
              type: "object",
              properties: {
                resumo: { type: "string", description: "Resumo executivo de 2-3 parágrafos" },
                principal_risco: { type: "string" },
                principal_oportunidade: { type: "string" },
                acao_recomendada: { type: "string" },
                prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
              },
              required: ["resumo", "principal_risco", "principal_oportunidade", "acao_recomendada", "prioridade"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "gerar_sintese_executiva" } },
        messages: [
          {
            role: "system",
            content: "Você é um diretor de operações de clínica médica. Gere uma síntese executiva semanal concisa e acionável. Português brasileiro.",
          },
          {
            role: "user",
            content: `Com base nos top 5 insights da semana, gere síntese executiva:\n\n${top5.map((i, idx) => `${idx + 1}. [${i.tipo}] ${i.descricao} (impacto: ${i.impacto_estimado})`).join("\n")}`,
          },
        ],
      }),
    });

    let relatorio: any = null;

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          const resumoCompleto = `${parsed.resumo}\n\n🔴 Risco: ${parsed.principal_risco}\n🟢 Oportunidade: ${parsed.principal_oportunidade}\n⚡ Ação: ${parsed.acao_recomendada}`;

          const { data: inserted, error: insertErr } = await supabase
            .from("relatorio_executivo_ia")
            .insert({
              resumo: resumoCompleto,
              prioridade_principal: parsed.prioridade,
              impacto_estimado: parsed.prioridade,
            })
            .select()
            .single();

          if (insertErr) {
            console.error("[sintese-executiva] Erro ao salvar:", insertErr.message);
          } else {
            relatorio = inserted;
            console.log("[sintese-executiva] Relatório salvo com sucesso");
          }
        } catch {
          console.error("[sintese-executiva] Erro ao parsear IA");
        }
      }
    } else {
      const errText = await aiRes.text();
      console.error(`[sintese-executiva] AI erro ${aiRes.status}:`, errText.slice(0, 200));
    }

    return new Response(JSON.stringify({
      status: "concluido",
      total_insights_semana: lista.length,
      top_5_utilizados: top5.map(i => ({ tipo: i.tipo, descricao: i.descricao, impacto: i.impacto_estimado })),
      relatorio,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sintese-executiva] Erro:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
