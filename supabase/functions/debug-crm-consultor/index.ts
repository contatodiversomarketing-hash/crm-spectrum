const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const crmUrl = Deno.env.get("CRM_API_URL")!;
  const crmToken = Deno.env.get("CRM_API_TOKEN")!;

  const results: Record<string, unknown> = {};

  // Test api-leads with different params
  for (const params of ["", "?periodo_dias=30", "?periodo_dias=90", "?limit=100"]) {
    try {
      const r = await fetch(`${crmUrl}api-leads${params}`, {
        headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
      });
      const data = await r.json().catch(() => null);
      const leads = data?.leads || [];
      results[`api-leads${params || "(no params)"}`] = {
        status: r.status,
        resumo: data?.resumo,
        paginacao: data?.paginacao,
        leads_count: leads.length,
        sample: leads.slice(0, 1),
        keys: data ? Object.keys(data) : [],
      };
    } catch (e) { results[`api-leads${params}`] = { error: String(e) }; }
  }

  // Test api-conversoes with params
  try {
    const r = await fetch(`${crmUrl}api-conversoes?periodo_dias=30`, {
      headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
    });
    const data = await r.json().catch(() => null);
    const opps = data?.oportunidades || [];
    results["api-conversoes?periodo_dias=30"] = {
      status: r.status,
      funil: data?.funil,
      oportunidades_count: opps.length,
      sample: opps.slice(0, 1),
      conversoes_por_servico: data?.conversoes_por_servico,
    };
  } catch (e) { results["api-conversoes"] = { error: String(e) }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
