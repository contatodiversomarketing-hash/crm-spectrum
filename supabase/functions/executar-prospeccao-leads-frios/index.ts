import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOP_N = 30;
const DIAS_BLOQUEIO = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CRM_API_URL = Deno.env.get("CRM_API_URL");
    const CRM_API_TOKEN = Deno.env.get("CRM_API_TOKEN");
    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");

    if (!CRM_API_URL || !CRM_API_TOKEN) {
      throw new Error("CRM_API não configurada");
    }
    if (!MEGA_API_URL || !MEGA_API_TOKEN) {
      throw new Error("MEGA_API não configurada");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar leads frios via CRM
    console.log("[prospeccao] Buscando leads frios...");
    const crmRes = await fetch(`${CRM_API_URL}/list_leads_frios`, {
      headers: { Authorization: `Bearer ${CRM_API_TOKEN}` },
    });

    if (!crmRes.ok) {
      throw new Error(`CRM API erro ${crmRes.status}`);
    }

    const leads = await crmRes.json();
    console.log(`[prospeccao] ${leads.length} leads frios encontrados`);

    // 2. Calcular score
    const leadsComScore = leads.map((l: any) => {
      let score = 0;
      if (l.origem === "indicacao") score += 30;
      else if (l.origem === "google") score += 20;
      if (l.falou_com_atendente === true) score += 15;
      return { ...l, score };
    });

    // 3. Ordenar e limitar
    leadsComScore.sort((a: any, b: any) => b.score - a.score);
    const selecionados = leadsComScore.slice(0, TOP_N);

    // 4. Deduplicação — buscar envios recentes (7 dias)
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO);

    const { data: recentes } = await supabase
      .from("automacoes")
      .select("paciente_externo_id")
      .eq("tipo", "prospeccao_lead")
      .gte("criado_em", dataLimite.toISOString());

    const jaEnviados = new Set((recentes || []).map((r: any) => r.paciente_externo_id));

    // 5. Filtrar bloqueados por opt-out
    const leadIds = selecionados.map((l: any) => {
      const tel = (l.phone || l.telefone || "").replace(/[^\d+]/g, "");
      return `tel:${tel}`;
    });

    const { data: bloqueados } = await supabase
      .from("memorias_ia")
      .select("paciente_externo_id")
      .in("paciente_externo_id", leadIds)
      .gt("bloqueio_ate", new Date().toISOString());

    const bloqueadosSet = new Set((bloqueados || []).map((b: any) => b.paciente_externo_id));

    let enviados = 0;
    let ignorados = 0;

    for (const lead of selecionados) {
      const telefone = (lead.phone || lead.telefone || "").replace(/[^\d+]/g, "");
      if (!telefone || telefone.length < 10) {
        ignorados++;
        continue;
      }

      const pacienteExternoId = `tel:${telefone}`;

      if (jaEnviados.has(pacienteExternoId)) {
        ignorados++;
        continue;
      }

      if (bloqueadosSet.has(pacienteExternoId)) {
        ignorados++;
        continue;
      }

      const nomePrimeiro = lead.nome ? lead.nome.split(" ")[0] : "";
      const mensagem = `Olá ${nomePrimeiro} 😊\nPercebi que você demonstrou interesse recentemente em nossos serviços.\nPosso te ajudar a agendar?`;

      try {
        const megaRes = await fetch(`${MEGA_API_URL}/api/v1/sendText`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MEGA_API_TOKEN}`,
          },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        const envioOk = megaRes.ok;

        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId,
          tipo: "prospeccao_lead",
          sistema_alvo: "megaapi",
          status: envioOk ? "enviado" : "erro_envio",
          data_execucao: new Date().toISOString(),
          payload: {
            nome: lead.nome,
            telefone,
            score: lead.score,
            origem: lead.origem,
            falou_com_atendente: lead.falou_com_atendente,
            mensagem_enviada: mensagem,
            mega_status: megaRes.status,
          },
        });

        await supabase.from("logs_decisao").insert({
          evento: "prospeccao_lead_frio",
          decisao: envioOk ? "enviado" : "erro_envio",
          confianca: lead.score,
          regra_aplicada: `score=${lead.score}, top=${TOP_N}, bloqueio=${DIAS_BLOQUEIO}d`,
          dados_entrada: {
            paciente_externo_id: pacienteExternoId,
            nome: lead.nome,
            score: lead.score,
            origem: lead.origem,
          },
        });

        if (envioOk) {
          enviados++;
          console.log(`[prospeccao] ✓ ${pacienteExternoId} (score ${lead.score})`);
        } else {
          console.error(`[prospeccao] ✗ ${pacienteExternoId} MegaAPI ${megaRes.status}`);
          ignorados++;
        }
      } catch (err) {
        console.error(`[prospeccao] Erro ${pacienteExternoId}:`, err);
        ignorados++;
      }
    }

    const resultado = {
      total_encontrados: leads.length,
      enviados,
      ignorados,
    };

    console.log(`[prospeccao] Concluído:`, resultado);

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[prospeccao] Erro:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
