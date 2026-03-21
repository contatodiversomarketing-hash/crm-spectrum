const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const crmUrl = Deno.env.get("CRM_API_URL")!;
  const crmToken = Deno.env.get("CRM_API_TOKEN")!;

  const body = await req.json().catch(() => ({}));
  const telefone = body.telefone || "553588633398";

  const results: Record<string, unknown> = {};

  // Test 1: paciente-por-telefone
  try {
    const r = await fetch(`${crmUrl}paciente-por-telefone`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken, "Content-Type": "application/json" },
      body: JSON.stringify({ telefone }),
    });
    results["paciente-por-telefone"] = { status: r.status, data: await r.json().catch(() => r.text()) };
  } catch (e) { results["paciente-por-telefone"] = { error: String(e) }; }

  // Test 2: api-leads (check what comes back)
  try {
    const r = await fetch(`${crmUrl}api-leads`, {
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
    });
    const data = await r.json().catch(() => null);
    const list = Array.isArray(data) ? data : data?.data || [];
    results["api-leads"] = { status: r.status, count: list.length, sample: list.slice(0, 2), raw_keys: data ? Object.keys(data) : [] };
  } catch (e) { results["api-leads"] = { error: String(e) }; }

  // Test 3: api-conversoes
  try {
    const r = await fetch(`${crmUrl}api-conversoes`, {
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
    });
    const data = await r.json().catch(() => null);
    const list = Array.isArray(data) ? data : data?.data || [];
    results["api-conversoes"] = { status: r.status, count: list.length, sample: list.slice(0, 2), raw_keys: data ? Object.keys(data) : [] };
  } catch (e) { results["api-conversoes"] = { error: String(e) }; }

  // Test 4: api-pipeline
  try {
    const r = await fetch(`${crmUrl}api-pipeline`, {
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
    });
    const data = await r.json().catch(() => null);
    const list = Array.isArray(data) ? data : data?.data || [];
    results["api-pipeline"] = { status: r.status, count: list.length, sample: list.slice(0, 2), raw_keys: data ? Object.keys(data) : [] };
  } catch (e) { results["api-pipeline"] = { error: String(e) }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
