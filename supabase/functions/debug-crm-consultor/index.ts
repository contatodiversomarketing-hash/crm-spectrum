const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const crmUrl = Deno.env.get("CRM_API_URL")!;
  const crmToken = Deno.env.get("CRM_API_TOKEN")!;

  // Try with bigger periodo and all pages
  const normalize = (t: string) => (t || "").replace(/\D/g, "");
  const allPhones: Record<string, string> = {};
  let totalLeads = 0;
  
  for (const periodo of [365]) {
    let page = 1;
    while (page <= 20) {
      const res = await fetch(`${crmUrl}api-leads?limit=500&page=${page}&periodo_dias=${periodo}`, {
        headers: { "Authorization": `Bearer ${crmToken}`, "apikey": crmToken },
      });
      if (!res.ok) break;
      const data = await res.json();
      const leads = data?.leads || [];
      if (leads.length === 0) break;
      totalLeads += leads.length;
      for (const lead of leads) {
        const tel = normalize(lead.telefone || "");
        if (tel) {
          allPhones[tel] = lead.consultor_id || "";
          allPhones["55" + tel] = lead.consultor_id || "";
        }
      }
      if (page >= (data?.paginacao?.total_pages || 1)) break;
      page++;
    }
  }

  // Sample supervised phones
  const targetPhones = [
    "553288101295", "553299119976", "553285174138", 
    "553298100752", "553288566397", "553284568857"
  ];

  const results: Record<string, any> = {};
  for (const p of targetPhones) {
    results[p] = {
      direct: allPhones[p] || null,
      without55: allPhones[p.slice(2)] || null,
    };
  }

  return new Response(JSON.stringify({
    total_leads: totalLeads,
    total_phones_mapped: Object.keys(allPhones).length,
    phone_samples: Object.entries(allPhones).slice(0, 5),
    target_results: results,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
