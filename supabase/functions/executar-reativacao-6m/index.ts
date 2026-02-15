import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ENVIOS = 20;
const DIAS_BLOQUEIO_REENVIO = 30;
const SUPABASE_URL = "https://chilmuwijkkdefqizleh.supabase.co";

interface PacienteInativo {
  id: string;
  name: string;
  phone: string;
  last_appointment_date: string;
  status?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const relatorio = { total_encontrados: 0, enviados: 0, ignorados: 0, erros: [] as string[] };

  try {
    const body = await req.json().catch(() => ({}));
    const clinica_id = body.clinica_id;

    // Validar plano
    if (clinica_id) {
      const validacao = await fetch(`${SUPABASE_URL}/functions/v1/validar-plano-clinica`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        body: JSON.stringify({ clinica_id, tipo_uso: "whatsapp" }),
      });
      if (!validacao.ok) {
        const vData = await validacao.json();
        return new Response(JSON.stringify({ error: vData.erro || "Limite atingido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    if (!gestaoUrl || !gestaoToken) {
      return new Response(JSON.stringify({ error: "GESTAO_API não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const megaUrl = Deno.env.get("MEGA_API_URL");
    const megaToken = Deno.env.get("MEGA_API_TOKEN");
    if (!megaUrl || !megaToken) {
      return new Response(JSON.stringify({ error: "MEGA_API não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gestaoRes = await fetch(gestaoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gestaoToken}` },
      body: JSON.stringify({ action: "list_inactive_patients", params: { months: 6, limit: 1000, offset: 0 } }),
    });

    if (!gestaoRes.ok) {
      return new Response(JSON.stringify({ error: "Falha API Gestão", status: gestaoRes.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gestaoData = await gestaoRes.json();
    const pacientes: PacienteInativo[] = Array.isArray(gestaoData) ? gestaoData : gestaoData.data || gestaoData.patients || [];
    relatorio.total_encontrados = pacientes.length;

    if (pacientes.length === 0) {
      return new Response(JSON.stringify(relatorio), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO_REENVIO);

    let reativQuery = supabase.from("automacoes").select("paciente_externo_id").eq("tipo", "reativacao_6m").gte("criado_em", dataLimite.toISOString());
    if (clinica_id) reativQuery = reativQuery.eq("clinica_id", clinica_id);
    const { data: reativacoesRecentes } = await reativQuery;

    const jaEnviados = new Set((reativacoesRecentes || []).map((r) => r.paciente_externo_id));
    let enviadosCount = 0;

    for (const paciente of pacientes) {
      if (enviadosCount >= MAX_ENVIOS) break;
      const telefone = paciente.phone?.replace(/[^\d+]/g, "");
      if (!telefone) { relatorio.ignorados++; continue; }
      const pacienteExternoId = `tel:${telefone}`;
      if (jaEnviados.has(pacienteExternoId)) { relatorio.ignorados++; continue; }
      if (paciente.status?.toLowerCase() === "bloqueado") { relatorio.ignorados++; continue; }

      try {
        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId,
          tipo: "reativacao_6m",
          sistema_alvo: "megaapi",
          status: "processando",
          payload: { nome: paciente.name, telefone, ultima_consulta: paciente.last_appointment_date },
          ...(clinica_id && { clinica_id }),
        });

        const respostaRes = await fetch(`${SUPABASE_URL}/functions/v1/gerar-resposta-humanizada`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({
            paciente_externo_id: pacienteExternoId, intencao: "reativacao", estado: "inativo_6m",
            acao: "encaminhar_retorno_inativo", dados: { nome_paciente: paciente.name, ultima_consulta: paciente.last_appointment_date },
          }),
        });

        let mensagem: string;
        if (respostaRes.ok) { mensagem = (await respostaRes.json()).resposta; }
        else { mensagem = `Olá${paciente.name ? `, ${paciente.name.split(" ")[0]}` : ""}! Faz tempo que não nos vemos. Que tal agendar uma consulta? 😊`; }

        const megaRes = await fetch(megaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${megaToken}` },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        const novoStatus = megaRes.ok ? "enviado" : "erro_envio";
        await supabase.from("automacoes").update({
          status: novoStatus, data_execucao: new Date().toISOString(),
          payload: { nome: paciente.name, telefone, ultima_consulta: paciente.last_appointment_date, mensagem_enviada: mensagem, mega_status: megaRes.status },
        }).eq("paciente_externo_id", pacienteExternoId).eq("tipo", "reativacao_6m").eq("status", "processando");

        await supabase.from("logs_decisao").insert({
          evento: "reativacao_6m", decisao: megaRes.ok ? "enviado" : "erro_envio",
          regra_aplicada: `inativo_180d, limite=${MAX_ENVIOS}, bloqueio=${DIAS_BLOQUEIO_REENVIO}d`,
          dados_entrada: { paciente_externo_id: pacienteExternoId, nome: paciente.name, ultima_consulta: paciente.last_appointment_date, mega_status: megaRes.status },
          ...(clinica_id && { clinica_id }),
        });

        if (megaRes.ok) { enviadosCount++; relatorio.enviados++; } else { relatorio.ignorados++; }
      } catch (pacErr) {
        relatorio.ignorados++;
        relatorio.erros.push(`${pacienteExternoId}: ${String(pacErr).slice(0, 100)}`);
      }
    }

    // Incrementar uso mensal
    if (clinica_id && relatorio.enviados > 0) {
      const agora = new Date();
      const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
      const { data: existing } = await supabase.from("uso_mensal_clinica").select("id, mensagens_whatsapp_usadas").eq("clinica_id", clinica_id).eq("mes_referencia", mesRef).maybeSingle();
      if (existing) {
        await supabase.from("uso_mensal_clinica").update({ mensagens_whatsapp_usadas: (existing.mensagens_whatsapp_usadas || 0) + relatorio.enviados }).eq("id", existing.id);
      } else {
        await supabase.from("uso_mensal_clinica").insert({ clinica_id, mes_referencia: mesRef, mensagens_whatsapp_usadas: relatorio.enviados });
      }
    }

    return new Response(JSON.stringify(relatorio), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[reativacao-6m] Erro:", error);
    return new Response(JSON.stringify({ error: "Erro interno", relatorio }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
