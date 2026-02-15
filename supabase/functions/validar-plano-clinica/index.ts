import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ValidacaoResult {
  valido: boolean;
  clinica_id: string;
  plano: string;
  limite_whatsapp: number;
  limite_ligacoes: number;
  uso_whatsapp: number;
  uso_ligacoes: number;
  whatsapp_disponivel: number;
  ligacoes_disponivel: number;
  erro?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clinica_id, tipo_uso } = await req.json();

    if (!clinica_id || typeof clinica_id !== "string") {
      return new Response(
        JSON.stringify({ valido: false, erro: "clinica_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar clínica
    const { data: clinica, error: clinicaErr } = await supabase
      .from("clinicas")
      .select("id, nome, plano, limite_whatsapp, limite_ligacoes, ativo")
      .eq("id", clinica_id)
      .single();

    if (clinicaErr || !clinica) {
      return new Response(
        JSON.stringify({ valido: false, erro: "Clínica não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clinica.ativo) {
      return new Response(
        JSON.stringify({ valido: false, erro: "Clínica desativada" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar uso do mês atual
    const agora = new Date();
    const mesReferencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

    const { data: uso } = await supabase
      .from("uso_mensal_clinica")
      .select("mensagens_whatsapp_usadas, ligacoes_realizadas")
      .eq("clinica_id", clinica_id)
      .eq("mes_referencia", mesReferencia)
      .maybeSingle();

    const usoWhatsapp = uso?.mensagens_whatsapp_usadas || 0;
    const usoLigacoes = uso?.ligacoes_realizadas || 0;

    const whatsappDisponivel = clinica.limite_whatsapp - usoWhatsapp;
    const ligacoesDisponivel = clinica.limite_ligacoes - usoLigacoes;

    // 3. Validar limites por tipo de uso
    let valido = true;
    let erro: string | undefined;

    if (tipo_uso === "whatsapp" && whatsappDisponivel <= 0) {
      valido = false;
      erro = `Limite de WhatsApp atingido (${clinica.limite_whatsapp}/${mesReferencia})`;
    } else if (tipo_uso === "ligacao" && ligacoesDisponivel <= 0) {
      valido = false;
      erro = `Limite de ligações atingido (${clinica.limite_ligacoes}/${mesReferencia})`;
    }

    const resultado: ValidacaoResult = {
      valido,
      clinica_id: clinica.id,
      plano: clinica.plano,
      limite_whatsapp: clinica.limite_whatsapp,
      limite_ligacoes: clinica.limite_ligacoes,
      uso_whatsapp: usoWhatsapp,
      uso_ligacoes: usoLigacoes,
      whatsapp_disponivel: Math.max(0, whatsappDisponivel),
      ligacoes_disponivel: Math.max(0, ligacoesDisponivel),
      ...(erro && { erro }),
    };

    console.log(`[validar-plano] ${clinica.nome}: plano=${clinica.plano}, whatsapp=${usoWhatsapp}/${clinica.limite_whatsapp}, ligacoes=${usoLigacoes}/${clinica.limite_ligacoes}, valido=${valido}`);

    return new Response(JSON.stringify(resultado), {
      status: valido ? 200 : 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[validar-plano] Erro:", error);
    return new Response(
      JSON.stringify({ valido: false, erro: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
