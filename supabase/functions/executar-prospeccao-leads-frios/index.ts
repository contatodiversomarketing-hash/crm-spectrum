import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarTextoMega } from "../_shared/mega.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOP_N = 30;
const DIAS_BLOQUEIO = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const CRM_API_URL = Deno.env.get("CRM_API_URL");
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN");
    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");

    if (!CRM_API_URL || !CRM_API_TOKEN) throw new Error("CRM_API não configurada");
    if (!MEGA_API_URL || !MEGA_API_TOKEN) throw new Error("MEGA_API não configurada");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const crmRes = await fetch(`${CRM_API_URL}/list_leads_frios`, { headers: { Authorization: `Bearer ${CRM_API_TOKEN}` } });
    if (!crmRes.ok) throw new Error(`CRM API erro ${crmRes.status}`);
    const leads = await crmRes.json();

    const leadsComScore = leads.map((l: any) => {
      let score = 0;
      if (l.origem === "indicacao") score += 30; else if (l.origem === "google") score += 20;
      if (l.falou_com_atendente === true) score += 15;
      return { ...l, score };
    });
    leadsComScore.sort((a: any, b: any) => b.score - a.score);
    const selecionados = leadsComScore.slice(0, TOP_N);

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO);

    let recentesQuery = supabase.from("automacoes").select("paciente_externo_id").eq("tipo", "prospeccao_lead").gte("criado_em", dataLimite.toISOString());
    if (clinica_id) recentesQuery = recentesQuery.eq("clinica_id", clinica_id);
    const { data: recentes } = await recentesQuery;
    const jaEnviados = new Set((recentes || []).map((r: any) => r.paciente_externo_id));

    const leadIds = selecionados.map((l: any) => `tel:${(l.phone || l.telefone || "").replace(/[^\d+]/g, "")}`);
    let bloqQuery = supabase.from("memorias_ia").select("paciente_externo_id").in("paciente_externo_id", leadIds).gt("bloqueio_ate", new Date().toISOString());
    if (clinica_id) bloqQuery = bloqQuery.eq("clinica_id", clinica_id);
    const { data: bloqueados } = await bloqQuery;
    const bloqueadosSet = new Set((bloqueados || []).map((b: any) => b.paciente_externo_id));

    let enviados = 0, ignorados = 0;

    for (const lead of selecionados) {
      const telefone = (lead.phone || lead.telefone || "").replace(/[^\d+]/g, "");
      if (!telefone || telefone.length < 10) { ignorados++; continue; }
      const pacienteExternoId = `tel:${telefone}`;
      if (jaEnviados.has(pacienteExternoId) || bloqueadosSet.has(pacienteExternoId)) { ignorados++; continue; }

      const nomePrimeiro = lead.nome ? lead.nome.split(" ")[0] : "";
      const mensagem = `Olá ${nomePrimeiro} 😊\nPercebi que você demonstrou interesse recentemente em nossos serviços.\nPosso te ajudar a agendar?`;

      try {
        const megaRes = await enviarTextoMega(telefone, mensagem);

        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId, tipo: "prospeccao_lead", sistema_alvo: "megaapi",
          status: megaRes.ok ? "enviado" : "erro_envio", data_execucao: new Date().toISOString(),
          payload: { nome: lead.nome, telefone, score: lead.score, origem: lead.origem, falou_com_atendente: lead.falou_com_atendente, mensagem_enviada: mensagem, mega_status: megaRes.status },
          ...(clinica_id && { clinica_id }),
        });

        await supabase.from("logs_decisao").insert({
          evento: "prospeccao_lead_frio", decisao: megaRes.ok ? "enviado" : "erro_envio", confianca: lead.score,
          regra_aplicada: `score=${lead.score}, top=${TOP_N}, bloqueio=${DIAS_BLOQUEIO}d`,
          dados_entrada: { paciente_externo_id: pacienteExternoId, nome: lead.nome, score: lead.score, origem: lead.origem },
          ...(clinica_id && { clinica_id }),
        });

        if (megaRes.ok) { enviados++; } else { ignorados++; }
      } catch (err) { ignorados++; }
    }

    return new Response(JSON.stringify({ total_encontrados: leads.length, enviados, ignorados }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[prospeccao] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
