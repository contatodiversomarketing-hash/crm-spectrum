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

  const baseUrl = `${gestaoUrl}/functions/v1/internal-api`;
  const headers = {
    "Authorization": `Bearer ${gestaoToken}`,
    "apikey": gestaoToken,
    "Content-Type": "application/json",
  };

  const results: Record<string, unknown> = {};

  // Test 1: Get professionals with IDs
  let profIds: Array<{id: string, name: string}> = [];
  try {
    const r1 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_professionals", params: {} }) });
    const d1 = await r1.json();
    const profs = d1?.professionals || d1?.data || [];
    profIds = Array.isArray(profs) ? profs.filter((p: any) => p.is_active !== false && (p.specialty || "").trim().length > 1).slice(0, 5).map((p: any) => ({ id: p.id || p.professional_id, name: p.full_name || p.name || "" })) : [];
    results["professionals_sample"] = profIds;
  } catch (e) { results["professionals"] = { error: String(e) }; }

  // Test 2: get_available_slots with first professional + today
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  
  for (let i = 0; i < Math.min(profIds.length, 3); i++) {
    const prof = profIds[i];
    try {
      // Try with date
      const r = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "get_available_slots", params: { professional_id: prof.id, date: tomorrow } }) });
      const d = await r.json();
      results[`slots_${prof.name.slice(0,20)}_${tomorrow}`] = { status: r.status, body: JSON.stringify(d).slice(0, 500) };
    } catch (e) { results[`slots_${i}`] = { error: String(e) }; }

    try {
      // Try without date
      const r2 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "get_available_slots", params: { professional_id: prof.id } }) });
      const d2 = await r2.json();
      results[`slots_nodate_${prof.name.slice(0,20)}`] = { status: r2.status, body: JSON.stringify(d2).slice(0, 500) };
    } catch (e) { results[`slots_nodate_${i}`] = { error: String(e) }; }
  }

  // Test 3: list_schedule_blocks
  try {
    const r3 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_schedule_blocks", params: {} }) });
    const d3 = await r3.json();
    const blocks = d3?.schedule_blocks || d3?.blocks || d3?.data || [];
    results["schedule_blocks"] = { status: r3.status, count: Array.isArray(blocks) ? blocks.length : "not_array", sample: Array.isArray(blocks) ? blocks.slice(0, 5) : d3 };
  } catch (e) { results["schedule_blocks"] = { error: String(e) }; }

  // Test 4: list_appointments for FUTURE dates with higher limit
  try {
    const r4 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", params: { start_date: today, end_date: "2026-03-31", limit: 200 } }) });
    const d4 = await r4.json();
    const appointments = d4?.appointments || d4?.data || [];
    results["future_appointments"] = { 
      status: r4.status, 
      count: Array.isArray(appointments) ? appointments.length : "not_array",
      sample: Array.isArray(appointments) ? appointments.slice(0, 5).map((a: any) => ({ 
        date: a.appointment_date, time: a.appointment_time, status: a.status, 
        prof: a.professional_name || a.professional_id, patient: a.patient_name 
      })) : []
    };
  } catch (e) { results["future_appointments"] = { error: String(e) }; }

  // Test 5: get_available_slots with date range params variations
  if (profIds.length > 0) {
    const profId = profIds[0].id;
    const variations = [
      { label: "date_only", params: { professional_id: profId, date: "2026-03-13" } },
      { label: "start_end", params: { professional_id: profId, start_date: "2026-03-13", end_date: "2026-03-14" } },
      { label: "dias_7", params: { professional_id: profId, dias: 7 } },
      { label: "no_prof", params: { date: "2026-03-13" } },
    ];
    for (const v of variations) {
      try {
        const r = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "get_available_slots", params: v.params }) });
        const d = await r.json();
        results[`slots_var_${v.label}`] = { status: r.status, body: JSON.stringify(d).slice(0, 500) };
      } catch (e) { results[`slots_var_${v.label}`] = { error: String(e) }; }
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
