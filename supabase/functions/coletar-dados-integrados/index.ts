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
  url: string, headers: Record<string, string>, timeoutMs: number,
  options?: { method?: string; body?: unknown }
): Promise<SystemResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const method = options?.method || "GET";

  try {
    const fetchOptions: RequestInit = {
      method, headers: { ...headers, "Content-Type": "application/json" },
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
    return {
      data: null, ok: false, status: 0,
      error: message.includes("abort") ? `Timeout após ${timeoutMs}ms` : message,
      duration_ms,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const gestaoConfigurada = Boolean(GESTAO_API_URL && GESTAO_API_TOKEN);
    const semGestao: SystemResult = {
      data: null, ok: false, status: 0,
      error: "Integração Gestão não configurada", duration_ms: 0,
    };

    // Buscar dados do CRM interno + gestão em paralelo
    const gestaoHeaders = { "apikey": GESTAO_API_TOKEN ?? "" };

    const [gestaoMedicos, gestaoAgendamentos, leadsResult] = await Promise.all([
      gestaoConfigurada
        ? fetchWithTimeout(GESTAO_API_URL!, gestaoHeaders, TIMEOUT_MS, {
            method: "POST", body: { action: "listar_medicos" },
          })
        : Promise.resolve(semGestao),
      gestaoConfigurada
        ? fetchWithTimeout(GESTAO_API_URL!, gestaoHeaders, TIMEOUT_MS, {
            method: "POST", body: { action: "listar_agendamentos" },
          })
        : Promise.resolve(semGestao),
      supabase.from("leads").select("*").order("criado_em", { ascending: false }).limit(200),
    ]);

    console.log(`[coletar-dados-integrados] Gestão Médicos: ${gestaoMedicos.status} (${gestaoMedicos.duration_ms}ms) | Agendamentos: ${gestaoAgendamentos.status} (${gestaoAgendamentos.duration_ms}ms)`);

    return new Response(
      JSON.stringify({
        crm: { leads: { data: leadsResult.data, ok: !leadsResult.error, status: 200, duration_ms: 0 } },
        gestao: { medicos: gestaoMedicos, agendamentos: gestaoAgendamentos },
        gestao_configurada: gestaoConfigurada,
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
