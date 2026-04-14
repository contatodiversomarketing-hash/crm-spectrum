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
    const GESTAO_API_URL = Deno.env.get("GESTAO_API_URL");
    const GESTAO_API_TOKEN = Deno.env.get("GESTAO_API_TOKEN");
    if (!GESTAO_API_URL || !GESTAO_API_TOKEN) throw new Error("GESTAO_API não configurada");

    const agendaRes = await fetch(GESTAO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": GESTAO_API_TOKEN },
      body: JSON.stringify({ action: "listar_agendamentos" }),
    });

    let agendamentos: any[] = [];
    if (agendaRes.ok) { const d = await agendaRes.json(); agendamentos = d?.data || []; } else { await agendaRes.text(); }

    return new Response(JSON.stringify({
      status: "concluido",
      total_agendamentos: agendamentos.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[analise-rentabilidade] Erro:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
