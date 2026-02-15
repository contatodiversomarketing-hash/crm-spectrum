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

  try {
    const CRM_API_URL = Deno.env.get("CRM_API_URL");
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN");

    if (!CRM_API_URL || !CRM_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "CRM_API_URL ou CRM_API_TOKEN não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `${CRM_API_URL}/functions/v1/metrics-crm-overview`;
    console.log(`[testar-metrics-crm] GET ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRM_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    let body: unknown;

    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    console.log(`[testar-metrics-crm] Status: ${response.status}`);

    return new Response(
      JSON.stringify({
        status: response.status,
        ok: response.ok,
        data: body,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[testar-metrics-crm] Erro:", error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : "Erro interno",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
