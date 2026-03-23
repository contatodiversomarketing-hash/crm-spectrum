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
    const CRM_API_URL = Deno.env.get("CRM_API_URL") || "";
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN") || "";

    if (!CRM_API_URL || !CRM_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "CRM_API_URL ou CRM_API_TOKEN não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const telefonesAlvo = body.telefones_teste || ["553284297781", "553284318169", "553284560212"];

    // Buscar leads do CRM
    const results: any = { crm_url: CRM_API_URL, pages_fetched: 0, total_leads: 0, leads_com_consultor: 0, consultores_unicos: {} as Record<string, number>, matches: [] as any[] };

    let allLeads: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const url = `${CRM_API_URL}api-leads?limit=500&page=${page}&periodo_dias=30`;
      console.log(`[test] Fetching ${url}`);
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${CRM_API_TOKEN}`, "apikey": CRM_API_TOKEN },
      });
      if (!res.ok) {
        results[`page_${page}_error`] = { status: res.status, body: await res.text().catch(() => "") };
        break;
      }
      const data = await res.json();
      const leads = data?.leads || [];
      results.pages_fetched = page;
      results[`page_${page}_count`] = leads.length;
      results[`page_${page}_paginacao`] = data?.paginacao;
      allLeads = [...allLeads, ...leads];
      if (leads.length === 0 || page >= (data?.paginacao?.total_pages || 1)) break;
    }

    results.total_leads = allLeads.length;

    // Analisar consultor_id nos leads
    const normalize = (t: string) => (t || "").replace(/\D/g, "");
    for (const lead of allLeads) {
      if (lead.consultor_id) {
        results.leads_com_consultor++;
        const cid = lead.consultor_id;
        results.consultores_unicos[cid] = (results.consultores_unicos[cid] || 0) + 1;
      }
    }

    // Amostra dos primeiros 5 leads com todos os campos
    results.amostra_leads = allLeads.slice(0, 5).map((l: any) => ({
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      consultor_id: l.consultor_id,
      consultor_nome: l.consultor_nome || l.consultor?.nome || null,
      status: l.status,
      all_keys: Object.keys(l),
    }));

    // Tentar encontrar os telefones de teste
    for (const tel of telefonesAlvo) {
      const telNorm = normalize(tel);
      let found = false;
      for (const lead of allLeads) {
        const leadTel = normalize(lead.telefone || "");
        // Comparar últimos 8 dígitos
        if (leadTel.length >= 8 && telNorm.length >= 8 && leadTel.slice(-8) === telNorm.slice(-8)) {
          results.matches.push({
            telefone_busca: tel,
            lead_telefone: lead.telefone,
            consultor_id: lead.consultor_id,
            lead_nome: lead.nome,
            lead_id: lead.id,
          });
          found = true;
          break;
        }
      }
      if (!found) {
        results.matches.push({ telefone_busca: tel, match: "NÃO ENCONTRADO" });
      }
    }

    // Também testar endpoint paciente-por-telefone se existir
    for (const tel of telefonesAlvo.slice(0, 2)) {
      try {
        const url2 = `${CRM_API_URL}paciente-por-telefone?telefone=${tel}`;
        const res2 = await fetch(url2, {
          headers: { "Authorization": `Bearer ${CRM_API_TOKEN}`, "apikey": CRM_API_TOKEN },
        });
        const d2 = await res2.json().catch(() => null);
        results[`paciente_por_tel_${tel.slice(-4)}`] = { status: res2.status, data: d2 };
      } catch (e) {
        results[`paciente_por_tel_${tel.slice(-4)}_error`] = String(e);
      }
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[testar-metrics-crm] Erro:", error);
    return new Response(
      JSON.stringify({ error: true, message: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
