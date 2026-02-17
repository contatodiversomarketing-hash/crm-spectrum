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

  // Test 1: list_appointments with params (current approach)
  try {
    const r1 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", params: { start_date: "2026-02-17", end_date: "2026-02-24" } }) });
    const d1 = await r1.json();
    const appointments = d1?.appointments || d1?.data || [];
    const dates = Array.isArray(appointments) ? appointments.slice(0, 5).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) : [];
    results["test1_params_nested"] = { status: r1.status, count: Array.isArray(appointments) ? appointments.length : "not_array", sample_dates: dates, keys: Object.keys(d1 || {}) };
  } catch (e) { results["test1"] = { error: String(e) }; }

  // Test 2: list_appointments with dates at top level
  try {
    const r2 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", start_date: "2026-02-17", end_date: "2026-02-24" }) });
    const d2 = await r2.json();
    const appointments = d2?.appointments || d2?.data || [];
    const dates = Array.isArray(appointments) ? appointments.slice(0, 5).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) : [];
    results["test2_top_level"] = { status: r2.status, count: Array.isArray(appointments) ? appointments.length : "not_array", sample_dates: dates };
  } catch (e) { results["test2"] = { error: String(e) }; }

  // Test 3: list_appointments with date_from/date_to
  try {
    const r3 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", params: { date_from: "2026-02-17", date_to: "2026-02-24" } }) });
    const d3 = await r3.json();
    const appointments = d3?.appointments || d3?.data || [];
    const dates = Array.isArray(appointments) ? appointments.slice(0, 5).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) : [];
    results["test3_date_from_to"] = { status: r3.status, count: Array.isArray(appointments) ? appointments.length : "not_array", sample_dates: dates };
  } catch (e) { results["test3"] = { error: String(e) }; }

  // Test 4: list_appointments no params
  try {
    const r4 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments" }) });
    const d4 = await r4.json();
    const appointments = d4?.appointments || d4?.data || [];
    const dates = Array.isArray(appointments) ? appointments.slice(0, 5).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) : [];
    results["test4_no_params"] = { status: r4.status, count: Array.isArray(appointments) ? appointments.length : "not_array", sample_dates: dates };
  } catch (e) { results["test4"] = { error: String(e) }; }

  // Test 5: list_appointments with limit and offset
  try {
    const r5 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", params: { start_date: "2026-02-17", end_date: "2026-02-24", limit: 500 } }) });
    const d5 = await r5.json();
    const appointments = d5?.appointments || d5?.data || [];
    // Find any future appointments
    const futureAppts = Array.isArray(appointments) ? appointments.filter((a: any) => (a.appointment_date || "") >= "2026-02-17") : [];
    results["test5_with_limit"] = { status: r5.status, total_count: Array.isArray(appointments) ? appointments.length : "not_array", future_count: futureAppts.length, future_sample: futureAppts.slice(0, 3).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) };
  } catch (e) { results["test5"] = { error: String(e) }; }

  // Test 6: list_professionals
  try {
    const r6 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_professionals", params: {} }) });
    const d6 = await r6.json();
    const profs = d6?.professionals || d6?.data || [];
    const withSpecialty = Array.isArray(profs) ? profs.filter((p: any) => (p.specialty || "").trim().length > 1) : [];
    results["test6_professionals"] = {
      status: r6.status,
      total: Array.isArray(profs) ? profs.length : "not_array",
      with_specialty: withSpecialty.length,
      specialty_list: withSpecialty.map((p: any) => ({ name: p.full_name || p.professional_name || p.name, specialty: p.specialty, active: p.is_active })),
    };
  } catch (e) { results["test6"] = { error: String(e) }; }

  // Test 7: list_available_slots (original action that was failing)
  try {
    const r7 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_available_slots", params: { dias: 7 } }) });
    const d7text = await r7.text();
    results["test7_available_slots"] = { status: r7.status, body: d7text.slice(0, 500) };
  } catch (e) { results["test7"] = { error: String(e) }; }

  // Test 8: Try getting appointments with status filter
  try {
    const r8 = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify({ action: "list_appointments", params: { status: "agendado", start_date: "2026-02-17" } }) });
    const d8 = await r8.json();
    const appointments = d8?.appointments || d8?.data || [];
    results["test8_status_filter"] = { status: r8.status, count: Array.isArray(appointments) ? appointments.length : "not_array", sample: Array.isArray(appointments) ? appointments.slice(0, 3).map((a: any) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })) : [] };
  } catch (e) { results["test8"] = { error: String(e) }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
