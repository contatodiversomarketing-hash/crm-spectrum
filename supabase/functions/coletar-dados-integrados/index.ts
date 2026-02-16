import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 15000;

interface SystemResult {
  data: unknown;
  ok: boolean;
  status: number;
  error?: string;
  duration_ms: number;
}

async function fetchWithTimeout(
  url: string,
  token: string,
  timeoutMs: number,
  options?: { method?: string; body?: unknown }
): Promise<SystemResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const method = options?.method || "GET";

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };
    if (options?.body && method !== "GET") {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, fetchOptions);

    clearTimeout(timer);
    const duration_ms = Date.now() - start;

    const contentType = res.headers.get("content-type") || "";
    let body: unknown;
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return { data: body, ok: res.ok, status: res.status, duration_ms };
  } catch (err) {
    clearTimeout(timer);
    const duration_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort");

    return {
      data: null,
      ok: false,
      status: 0,
      error: isTimeout ? `Timeout após ${timeoutMs}ms` : message,
      duration_ms,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CRM_API_URL = Deno.env.get("CRM_API_URL");
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN");
    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");
    const FINANCEIRO_API_URL = Deno.env.get("FINANCEIRO_API_URL");
    const FINANCEIRO_API_TOKEN = Deno.env.get("FINANCEIRO_API_TOKEN");

    const missing: string[] = [];
    if (!CRM_API_URL || !CRM_API_TOKEN) missing.push("CRM");
    if (!GESTAO_API_URL || !GESTAO_API_TOKEN) missing.push("GESTAO");
    if (!FINANCEIRO_API_URL || !FINANCEIRO_API_TOKEN) missing.push("FINANCEIRO");

    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Secrets não configurados: ${missing.join(", ")}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[coletar-dados-integrados] URLs:", {
      crm_leads: `${CRM_API_URL}api-leads`,
      crm_conversoes: `${CRM_API_URL}api-conversoes`,
      gestao: `${GESTAO_API_URL}/functions/v1/internal-api`,
      financeiro: FINANCEIRO_API_URL,
    });
    console.log("[coletar-dados-integrados] Tokens (primeiros 20 chars):", {
      crm: CRM_API_TOKEN?.substring(0, 20),
      gestao: GESTAO_API_TOKEN?.substring(0, 20),
      financeiro: FINANCEIRO_API_TOKEN?.substring(0, 20),
    });
    console.log("[coletar-dados-integrados] Iniciando coleta paralela...");

    const [crmLeads, crmConversoes, gestao, financeiro] = await Promise.all([
      fetchWithTimeout(`${CRM_API_URL}api-leads`, CRM_API_TOKEN!, TIMEOUT_MS),
      fetchWithTimeout(`${CRM_API_URL}api-conversoes`, CRM_API_TOKEN!, TIMEOUT_MS),
      fetchWithTimeout(`${GESTAO_API_URL}/functions/v1/internal-api`, GESTAO_API_TOKEN!, TIMEOUT_MS, {
        method: "POST",
        body: { action: "list_inactive_patients", dias: 180 },
      }),
      fetchWithTimeout(`${FINANCEIRO_API_URL}/sync-caixa`, FINANCEIRO_API_TOKEN!, TIMEOUT_MS, {
        method: "POST",
        body: {},
      }),
    ]);

    console.log(`[coletar-dados-integrados] CRM Leads: ${crmLeads.status} (${crmLeads.duration_ms}ms) | CRM Conversões: ${crmConversoes.status} (${crmConversoes.duration_ms}ms) | Gestão: ${gestao.status} (${gestao.duration_ms}ms) | Financeiro: ${financeiro.status} (${financeiro.duration_ms}ms)`);

    return new Response(
      JSON.stringify({
        crm: { leads: crmLeads, conversoes: crmConversoes },
        gestao,
        financeiro,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[coletar-dados-integrados] Erro:", error);
    return new Response(
      JSON.stringify({ error: true, message: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
