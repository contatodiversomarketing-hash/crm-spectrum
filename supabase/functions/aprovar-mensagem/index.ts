import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { interacao_id, resposta_final, acao } = await req.json();

    if (!interacao_id || typeof interacao_id !== "string") {
      return new Response(JSON.stringify({ error: "interacao_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!acao || !["aprovar", "editar", "manual"].includes(acao)) {
      return new Response(JSON.stringify({ error: "acao deve ser 'aprovar', 'editar' ou 'manual'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar a interação
    const { data: interacao, error: fetchError } = await supabase
      .from("interacoes_ia")
      .select("*")
      .eq("id", interacao_id)
      .single();

    if (fetchError || !interacao) {
      return new Response(JSON.stringify({ error: "Interação não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let textoFinal = "";
    let megaEnvio: { ok: boolean; status: number; data: unknown } | null = null;

    if (acao === "manual") {
      // Marcar como atendimento manual, sem envio
      textoFinal = "[Atendimento manual]";
    } else {
      // aprovar usa resposta_sugerida, editar usa resposta_final do body
      textoFinal = acao === "editar" && resposta_final
        ? resposta_final
        : interacao.resposta_sugerida || "";

      if (!textoFinal) {
        return new Response(JSON.stringify({ error: "Nenhuma resposta disponível para enviar" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enviar via MegaAPI
      const megaUrl = Deno.env.get("MEGA_API_URL");
      const megaToken = Deno.env.get("MEGA_API_TOKEN");

      if (!megaUrl || !megaToken) {
        return new Response(JSON.stringify({ error: "MegaAPI não configurada" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const numero = interacao.paciente_externo_id.replace("tel:", "");

      const res = await fetch(megaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${megaToken}`,
        },
        body: JSON.stringify({ number: numero, text: textoFinal }),
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = { raw: await res.text() };
      }

      megaEnvio = { ok: res.ok, status: res.status, data };
      console.log(`[aprovar-mensagem] MegaAPI (${res.status}):`, JSON.stringify(data).slice(0, 200));

      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Falha ao enviar via MegaAPI", details: data }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Atualizar interação
    const { error: updateError } = await supabase
      .from("interacoes_ia")
      .update({
        resposta_final: textoFinal,
        supervisionado: false,
      })
      .eq("id", interacao_id);

    if (updateError) {
      console.error("[aprovar-mensagem] Erro ao atualizar interação:", updateError);
      return new Response(JSON.stringify({ error: "Erro ao atualizar interação" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Registrar log
    await supabase.from("logs_decisao").insert({
      evento: "supervisao_humana",
      decisao: acao,
      regra_aplicada: `acao=${acao}, interacao_id=${interacao_id}`,
      dados_entrada: {
        interacao_id,
        paciente_externo_id: interacao.paciente_externo_id,
        resposta_enviada: textoFinal,
        mega_envio: megaEnvio ? { ok: megaEnvio.ok, status: megaEnvio.status } : null,
      },
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        acao,
        mensagem_enviada: acao !== "manual",
        resposta: textoFinal,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[aprovar-mensagem] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
