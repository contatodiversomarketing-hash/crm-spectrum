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
    const authHeader = req.headers.get("x-mega-token") || req.headers.get("authorization");
    const expectedToken = Deno.env.get("MEGA_API_TOKEN");

    if (!expectedToken) {
      console.error("[receber-mensagem-whatsapp] MEGA_API_TOKEN não configurado");
      return new Response(JSON.stringify({ error: "Configuração interna ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader?.replace("Bearer ", "");
    if (token !== expectedToken) {
      console.warn("[receber-mensagem-whatsapp] Token inválido recebido");
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { numero_remetente, mensagem, timestamp, clinica_id } = body;

    if (!numero_remetente || typeof numero_remetente !== "string") {
      return new Response(JSON.stringify({ error: "numero_remetente é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mensagem || typeof mensagem !== "string") {
      return new Response(JSON.stringify({ error: "mensagem é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedNumero = numero_remetente.replace(/[^\d+]/g, "").slice(0, 20);
    const sanitizedMensagem = mensagem.slice(0, 5000);

    console.log(`[receber-mensagem-whatsapp] Mensagem recebida de ${sanitizedNumero}${clinica_id ? ` (clinica: ${clinica_id})` : ""}`);

    let pacienteExternoId = `tel:${sanitizedNumero}`;

    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");

    if (gestaoUrl && gestaoToken) {
      try {
        const gestaoResponse = await fetch(
          `${gestaoUrl}/pacientes/buscar-por-telefone?telefone=${encodeURIComponent(sanitizedNumero)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${gestaoToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (gestaoResponse.ok) {
          const pacienteData = await gestaoResponse.json();
          if (pacienteData?.id) {
            pacienteExternoId = String(pacienteData.id).slice(0, 255);
            console.log(`[receber-mensagem-whatsapp] Paciente identificado: ${pacienteExternoId}`);
          }
        } else {
          const errorText = await gestaoResponse.text();
          console.warn(`[receber-mensagem-whatsapp] Gestão API retornou ${gestaoResponse.status}: ${errorText}`);
        }
      } catch (gestaoError) {
        console.error("[receber-mensagem-whatsapp] Erro ao consultar Gestão API:", gestaoError);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: insertError } = await supabase.from("interacoes_ia").insert({
      paciente_externo_id: pacienteExternoId,
      sistema_origem: "megaapi",
      canal: "whatsapp",
      mensagem_usuario: sanitizedMensagem,
      estado_conversa: "neutro",
      criado_em: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      ...(clinica_id && { clinica_id }),
    });

    if (insertError) {
      console.error("[receber-mensagem-whatsapp] Erro ao inserir interação:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao registrar mensagem" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[receber-mensagem-whatsapp] Interação registrada para ${pacienteExternoId}`);

    return new Response(JSON.stringify({ status: "mensagem_recebida" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[receber-mensagem-whatsapp] Erro inesperado:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
