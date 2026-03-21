const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const crmUrl = Deno.env.get("CRM_API_URL")!;
  const crmToken = Deno.env.get("CRM_API_TOKEN")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Get distinct supervised patient phones from yesterday
  const { data: supervised } = await sb
    .from("interacoes_ia")
    .select("paciente_externo_id")
    .eq("supervisionado", true)
    .gte("criado_em", "2026-03-20T00:00:00Z")
    .lte("criado_em", "2026-03-20T23:59:59Z");

  const phones = [...new Set((supervised || []).map((s: any) => s.paciente_externo_id))];

  // Get CRM leads
  const res = await fetch(`${crmUrl}api-leads?limit=500`, {
    headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
  });
  const data = await res.json();
  const leads = data?.leads || [];

  const normalize = (t: string) => (t || "").replace(/\D/g, "");
  
  // Build CRM phone map
  const crmPhones: Record<string, { consultor_id: string; raw: string }> = {};
  for (const lead of leads) {
    const raw = lead.telefone || "";
    const tel = normalize(raw);
    crmPhones[tel] = { consultor_id: lead.consultor_id, raw };
    crmPhones["55" + tel] = { consultor_id: lead.consultor_id, raw };
  }

  // Try to match
  const matches: any[] = [];
  const noMatch: string[] = [];
  for (const phone of phones.slice(0, 20)) {
    if (crmPhones[phone]) {
      matches.push({ phone, ...crmPhones[phone] });
    } else {
      noMatch.push(phone);
    }
  }

  return new Response(JSON.stringify({
    supervised_phones_sample: phones.slice(0, 10),
    crm_phones_sample: Object.keys(crmPhones).slice(0, 10),
    total_supervised_unique: phones.length,
    total_crm_leads: leads.length,
    matches,
    no_match: noMatch,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
