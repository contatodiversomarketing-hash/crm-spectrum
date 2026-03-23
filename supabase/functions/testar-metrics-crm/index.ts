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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (!CRM_API_URL || !CRM_API_TOKEN) {
      return new Response(JSON.stringify({ error: "CRM não configurado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Buscar TODOS os telefones que tiveram resposta humana hoje
    const { data: humanas } = await sb
      .from("interacoes_ia")
      .select("paciente_externo_id")
      .gte("criado_em", "2026-03-23T00:00:00Z")
      .eq("supervisionado", true)
      .eq("intencao_detectada", "resposta_humana")
      .eq("atendente_humano", "Humano");

    const telefonesHumanos = [...new Set((humanas || []).map((h: any) => h.paciente_externo_id))];

    // 2. Buscar TODOS os leads do CRM (todas as páginas, periodo_dias=365)
    const normalize = (t: string) => (t || "").replace(/\D/g, "");
    let allLeads: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const url = `${CRM_API_URL}api-leads?limit=500&page=${page}&periodo_dias=365`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${CRM_API_TOKEN}`, "apikey": CRM_API_TOKEN },
      });
      if (!res.ok) break;
      const data = await res.json();
      const leads = data?.leads || [];
      allLeads = [...allLeads, ...leads];
      if (leads.length === 0 || page >= (data?.paginacao?.total_pages || 1)) break;
    }

    // 3. Criar mapa de telefone -> consultor (com variações)
    const telToConsultor: Record<string, { consultor_id: string; consultor_nome: string }> = {};
    for (const lead of allLeads) {
      const tel = normalize(lead.telefone || "");
      const cid = lead.consultor_id || "";
      const cnome = lead.consultor_nome || "";
      if (!tel || !cid) continue;
      
      // Últimos 8 dígitos como chave
      if (tel.length >= 8) {
        telToConsultor[tel.slice(-8)] = { consultor_id: cid, consultor_nome: cnome };
      }
      telToConsultor[tel] = { consultor_id: cid, consultor_nome: cnome };
    }

    // 4. Tentar match para cada telefone humano
    const matches: any[] = [];
    let found = 0;
    let notFound = 0;
    for (const tel of telefonesHumanos) {
      const telNorm = normalize(tel);
      const last8 = telNorm.slice(-8);
      const match = telToConsultor[telNorm] || telToConsultor[last8];
      if (match) {
        found++;
        matches.push({ telefone: tel, ...match });
      } else {
        notFound++;
        matches.push({ telefone: tel, match: "NÃO ENCONTRADO" });
      }
    }

    // 5. Listar todos os telefones do CRM para comparar
    const crmPhones = allLeads.map((l: any) => normalize(l.telefone || "")).filter(Boolean).slice(0, 20);

    return new Response(JSON.stringify({
      total_telefones_humanos: telefonesHumanos.length,
      total_leads_crm: allLeads.length,
      found,
      notFound,
      amostra_telefones_humanos: telefonesHumanos.slice(0, 10),
      amostra_telefones_crm: crmPhones,
      matches: matches.slice(0, 20),
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
