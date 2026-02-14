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
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const relatorio = { total_encontrados: 0, enviados: 0, ignorados: 0, erros: [] as string[] };

  try {
    // 1. Buscar pacientes inativos via API de Gestão
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");

    if (!gestaoUrl || !gestaoToken) {
      return new Response(JSON.stringify({ error: "GESTAO_API_URL ou GESTAO_API_TOKEN não configurados" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const megaUrl = Deno.env.get("MEGA_API_URL");
    const megaToken = Deno.env.get("MEGA_API_TOKEN");

    if (!megaUrl || !megaToken) {
      return new Response(JSON.stringify({ error: "MEGA_API_URL ou MEGA_API_TOKEN não configurados" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[reativacao-6m] Buscando pacientes inativos na API de Gestão...");

    const gestaoRes = await fetch(gestaoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gestaoToken}`,
      },
      body: JSON.stringify({
        action: "list_inactive_patients",
        params: { months: 6, limit: 1000, offset: 0 },
      }),
    });

    if (!gestaoRes.ok) {
      const errBody = await gestaoRes.text();
      console.error(`[reativacao-6m] API Gestão erro ${gestaoRes.status}: ${errBody.slice(0, 300)}`);
      return new Response(JSON.stringify({ error: "Falha ao consultar API de Gestão", status: gestaoRes.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gestaoData = await gestaoRes.json();
    const pacientes: PacienteInativo[] = Array.isArray(gestaoData) ? gestaoData : gestaoData.data || gestaoData.patients || [];

    relatorio.total_encontrados = pacientes.length;
    console.log(`[reativacao-6m] ${pacientes.length} pacientes inativos encontrados`);

    if (pacientes.length === 0) {
      return new Response(JSON.stringify(relatorio), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Buscar reativações recentes (últimos 30 dias) para deduplicação
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO_REENVIO);

    const { data: reativacoesRecentes, error: reativError } = await supabase
      .from("automacoes")
      .select("paciente_externo_id")
      .eq("tipo", "reativacao_6m")
      .gte("criado_em", dataLimite.toISOString());

    if (reativError) {
      console.error("[reativacao-6m] Erro ao buscar reativações recentes:", reativError);
      return new Response(JSON.stringify({ error: "Erro ao verificar reativações recentes" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jaEnviados = new Set((reativacoesRecentes || []).map((r) => r.paciente_externo_id));
    console.log(`[reativacao-6m] ${jaEnviados.size} pacientes já receberam reativação nos últimos ${DIAS_BLOQUEIO_REENVIO} dias`);

    // 3. Filtrar e processar
    let enviadosCount = 0;

    for (const paciente of pacientes) {
      if (enviadosCount >= MAX_ENVIOS) {
        console.log(`[reativacao-6m] Limite de ${MAX_ENVIOS} envios atingido`);
        break;
      }

      const telefone = paciente.phone?.replace(/[^\d+]/g, "");
      if (!telefone) {
        relatorio.ignorados++;
        relatorio.erros.push(`Paciente ${paciente.id}: sem telefone`);
        continue;
      }

      const pacienteExternoId = `tel:${telefone}`;

      // Verificar duplicação
      if (jaEnviados.has(pacienteExternoId)) {
        relatorio.ignorados++;
        continue;
      }

      // Verificar status bloqueado
      if (paciente.status && paciente.status.toLowerCase() === "bloqueado") {
        relatorio.ignorados++;
        continue;
      }

      try {
        // 3a. Criar registro na tabela automacoes
        const { error: autoError } = await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId,
          tipo: "reativacao_6m",
          sistema_alvo: "megaapi",
          status: "processando",
          payload: {
            nome: paciente.name,
            telefone,
            ultima_consulta: paciente.last_appointment_date,
          },
        });

        if (autoError) {
          console.error(`[reativacao-6m] Erro ao inserir automação para ${pacienteExternoId}:`, autoError);
          relatorio.ignorados++;
          relatorio.erros.push(`${pacienteExternoId}: erro ao criar automação`);
          continue;
        }

        // 3b. Gerar mensagem personalizada
        const respostaRes = await fetch(`${SUPABASE_URL}/functions/v1/gerar-resposta-humanizada`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            paciente_externo_id: pacienteExternoId,
            intencao: "reativacao",
            estado: "inativo_6m",
            acao: "encaminhar_retorno_inativo",
            dados: { nome_paciente: paciente.name, ultima_consulta: paciente.last_appointment_date },
          }),
        });

        let mensagem: string;
        if (respostaRes.ok) {
          const respostaData = await respostaRes.json();
          mensagem = respostaData.resposta;
        } else {
          mensagem = `Olá${paciente.name ? `, ${paciente.name.split(" ")[0]}` : ""}! Faz tempo que não nos vemos. Que tal agendar uma consulta? Estamos à disposição! 😊`;
          console.warn(`[reativacao-6m] Fallback de mensagem para ${pacienteExternoId}`);
        }

        // 3c. Enviar via MegaAPI
        const megaRes = await fetch(megaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${megaToken}`,
          },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        let megaData: unknown;
        try {
          megaData = await megaRes.json();
        } catch {
          megaData = { raw: await megaRes.text() };
        }

        // 3d. Atualizar status da automação
        const novoStatus = megaRes.ok ? "enviado" : "erro_envio";
        await supabase
          .from("automacoes")
          .update({
            status: novoStatus,
            data_execucao: new Date().toISOString(),
            payload: {
              nome: paciente.name,
              telefone,
              ultima_consulta: paciente.last_appointment_date,
              mensagem_enviada: mensagem,
              mega_status: megaRes.status,
            },
          })
          .eq("paciente_externo_id", pacienteExternoId)
          .eq("tipo", "reativacao_6m")
          .eq("status", "processando");

        // 3e. Registrar log de decisão
        await supabase.from("logs_decisao").insert({
          evento: "reativacao_6m",
          decisao: megaRes.ok ? "enviado" : "erro_envio",
          regra_aplicada: `inativo_180d, limite=${MAX_ENVIOS}, bloqueio=${DIAS_BLOQUEIO_REENVIO}d`,
          dados_entrada: {
            paciente_externo_id: pacienteExternoId,
            nome: paciente.name,
            ultima_consulta: paciente.last_appointment_date,
            mega_status: megaRes.status,
          },
        });

        if (megaRes.ok) {
          enviadosCount++;
          relatorio.enviados++;
          console.log(`[reativacao-6m] ✓ Enviado para ${pacienteExternoId}`);
        } else {
          relatorio.ignorados++;
          relatorio.erros.push(`${pacienteExternoId}: MegaAPI erro ${megaRes.status}`);
          console.error(`[reativacao-6m] ✗ Falha MegaAPI para ${pacienteExternoId}: ${megaRes.status}`);
        }
      } catch (pacErr) {
        relatorio.ignorados++;
        relatorio.erros.push(`${pacienteExternoId}: ${String(pacErr).slice(0, 100)}`);
        console.error(`[reativacao-6m] Erro ao processar ${pacienteExternoId}:`, pacErr);
      }
    }

    // Pacientes restantes que não foram processados (acima do limite)
    const naoProcessados = pacientes.length - relatorio.enviados - relatorio.ignorados;
    if (naoProcessados > 0) {
      relatorio.ignorados += naoProcessados;
    }

    console.log(`[reativacao-6m] Concluído: ${JSON.stringify(relatorio)}`);

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[reativacao-6m] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor", relatorio }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
