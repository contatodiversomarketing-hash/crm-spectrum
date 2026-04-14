import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");
    if (!GESTAO_API_URL || !GESTAO_API_TOKEN) throw new Error("GESTAO_API não configurada");

    // Buscar agendamentos via nova API
    const gestaoRes = await fetch(GESTAO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": GESTAO_API_TOKEN },
      body: JSON.stringify({ action: "listar_agendamentos" }),
    });

    let agendamentos: any[] = [];
    if (gestaoRes.ok) {
      const d = await gestaoRes.json();
      agendamentos = d?.data || (Array.isArray(d) ? d : []);
    } else { await gestaoRes.text(); }

    const agora = new Date();
    const dias60 = new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dias7 = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const todos = agendamentos.map((a: any) => ({
      data: a.data || a.date || a.created_at,
      status: (a.status || "").toLowerCase(),
      especialidade: a.especialidade || a.specialty || "geral",
      profissional: a.medico_nome || a.professional || "não informado",
    }));

    const ultimos30 = todos.filter(a => a.data >= dias30);
    const ultimos7 = todos.filter(a => a.data >= dias7);

    const calcMetricas = (lista: any[]) => {
      const total = lista.length;
      const cancelados = lista.filter(a => ["cancelado", "cancelled", "canceled"].includes(a.status)).length;
      const faltas = lista.filter(a => ["falta", "no_show", "no-show"].includes(a.status)).length;
      const confirmados = lista.filter(a => ["confirmado", "confirmed", "realizado", "completed"].includes(a.status)).length;
      return { total, cancelados, faltas, confirmados };
    };

    const metricas60d = calcMetricas(todos);
    const metricas30d = calcMetricas(ultimos30);
    const metricas7d = calcMetricas(ultimos7);

    const media30d = metricas30d.total / 30;
    const media7d = metricas7d.total / 7;
    const taxaCrescimento = media30d > 0 ? ((media7d - media30d) / media30d) * 100 : 0;
    const projecao30d = Math.round(media7d * 30 * (1 + taxaCrescimento / 100));

    return new Response(JSON.stringify({
      status: "concluido",
      metricas: { ultimos_60d: metricas60d, ultimos_30d: metricas30d, ultimos_7d: metricas7d },
      media_diaria: { ultimos_30d: parseFloat(media30d.toFixed(1)), ultimos_7d: parseFloat(media7d.toFixed(1)) },
      taxa_crescimento: parseFloat(taxaCrescimento.toFixed(1)), projecao_30d: projecao30d,
      total_agendamentos: agendamentos.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[previsao-demanda] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
