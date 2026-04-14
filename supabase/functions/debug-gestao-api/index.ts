const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gestaoUrl = Deno.env.get("GESTAO_API_URL");
  const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
  if (!gestaoUrl || !gestaoToken) {
    return new Response(JSON.stringify({ error: "GESTAO not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const headers = { "apikey": gestaoToken, "Content-Type": "application/json" };
  const results: Record<string, unknown> = {};

  // Test 1: listar_medicos
  try {
    const r1 = await fetch(gestaoUrl, { method: "POST", headers, body: JSON.stringify({ action: "listar_medicos" }) });
    const d1 = await r1.json();
    results["listar_medicos"] = { status: r1.status, data: d1 };
  } catch (e) { results["listar_medicos"] = { error: String(e) }; }

  // Test 2: horarios_disponiveis (with first doctor)
  const medicos = (results["listar_medicos"] as any)?.data?.data || [];
  if (Array.isArray(medicos) && medicos.length > 0) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    try {
      const r2 = await fetch(gestaoUrl, { method: "POST", headers, body: JSON.stringify({ action: "horarios_disponiveis", params: { medico_id: medicos[0].id, data: tomorrow } }) });
      const d2 = await r2.json();
      results["horarios_disponiveis"] = { status: r2.status, data: d2 };
    } catch (e) { results["horarios_disponiveis"] = { error: String(e) }; }
  }

  // Test 3: listar_agendamentos
  try {
    const r3 = await fetch(gestaoUrl, { method: "POST", headers, body: JSON.stringify({ action: "listar_agendamentos" }) });
    const d3 = await r3.json();
    results["listar_agendamentos"] = { status: r3.status, count: Array.isArray(d3?.data) ? d3.data.length : "unknown", sample: Array.isArray(d3?.data) ? d3.data.slice(0, 3) : d3 };
  } catch (e) { results["listar_agendamentos"] = { error: String(e) }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
