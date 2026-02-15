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
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (userRoles || []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("supervisao")) {
      return new Response(JSON.stringify({ error: "Permissão insuficiente" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { interacao_id, resposta_final, acao, clinica_id } = await req.json();

    if (!interacao_id || typeof interacao_id !== "string") {
      return new Response(JSON.stringify({ error: "interacao_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!acao || !["aprovar", "editar", "manual"].includes(acao)) {
      return new Response(JSON.stringify({ error: "acao deve ser 'aprovar', 'editar' ou 'manual'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar interação (com filtro clinica_id se fornecido)
    let fetchQuery = supabase.from("interacoes_ia").select("*").eq("id", interacao_id);
    if (clinica_id) fetchQuery = fetchQuery.eq("clinica_id", clinica_id);

    const { data: interacao, error: fetchError } = await fetchQuery.single();
    if (fetchError || !interacao) {
      return new Response(JSON.stringify({ error: "Interação não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let textoFinal = "";
    let megaEnvio: { ok: boolean; status: number; data: unknown } | null = null;

    if (acao === "manual") {
      textoFinal = "[Atendimento manual]";
    } else {
      textoFinal = acao === "editar" && resposta_final ? resposta_final : interacao.resposta_sugerida || "";
      if (!textoFinal) {
        return new Response(JSON.stringify({ error: "Nenhuma resposta disponível para enviar" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const megaUrl = Deno.env.get("MEGA_API_URL");
      const megaToken = Deno.env.get("MEGA_API_TOKEN");
      if (!megaUrl || !megaToken) {
        return new Response(JSON.stringify({ error: "MegaAPI não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const numero = interacao.paciente_externo_id.replace("tel:", "");
      const res = await fetch(megaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${megaToken}` },
        body: JSON.stringify({ number: numero, text: textoFinal }),
      });

      let data: unknown;
      try { data = await res.json(); } catch (_e) { data = { raw: await res.text() }; }
      megaEnvio = { ok: res.ok, status: res.status, data };

      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Falha ao enviar via MegaAPI", details: data }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    await supabase.from("interacoes_ia").update({ resposta_final: textoFinal, supervisionado: false }).eq("id", interacao_id);

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
      ...(clinica_id && { clinica_id }),
    });

    return new Response(JSON.stringify({ status: "ok", acao, mensagem_enviada: acao !== "manual", resposta: textoFinal }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[aprovar-mensagem] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
