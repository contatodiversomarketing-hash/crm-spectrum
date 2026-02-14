import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Estados possíveis do fluxo conversacional
const ESTADOS = [
  "neutro",
  "aguardando_servico",
  "aguardando_data",
  "aguardando_horario",
  "aguardando_confirmacao",
  "aguardando_motivo_cancelamento",
  "aguardando_nova_data",
  "finalizado",
] as const;

type Estado = typeof ESTADOS[number];

interface TransicaoResult {
  novo_estado: Estado;
  acao: string;
  dados: Record<string, unknown>;
}

// Motor de transição de estados
function processarTransicao(
  estadoAtual: Estado,
  intencao: string,
  mensagem: string
): TransicaoResult {
  // === AGENDAMENTO ===
  if (intencao === "agendamento") {
    switch (estadoAtual) {
      case "neutro":
        return {
          novo_estado: "aguardando_servico",
          acao: "solicitar_servico",
          dados: { fluxo: "agendamento" },
        };
      case "aguardando_servico":
        return {
          novo_estado: "aguardando_data",
          acao: "solicitar_data",
          dados: { fluxo: "agendamento", servico_informado: true },
        };
      case "aguardando_data":
        return {
          novo_estado: "aguardando_horario",
          acao: "solicitar_horario",
          dados: { fluxo: "agendamento", data_informada: true },
        };
      case "aguardando_horario":
        return {
          novo_estado: "aguardando_confirmacao",
          acao: "solicitar_confirmacao_agendamento",
          dados: { fluxo: "agendamento", horario_informado: true },
        };
      case "aguardando_confirmacao":
        return {
          novo_estado: "finalizado",
          acao: "confirmar_agendamento",
          dados: { fluxo: "agendamento", confirmado: true },
        };
      default:
        return {
          novo_estado: "aguardando_servico",
          acao: "solicitar_servico",
          dados: { fluxo: "agendamento", estado_anterior: estadoAtual },
        };
    }
  }

  // === CANCELAMENTO ===
  if (intencao === "cancelamento") {
    switch (estadoAtual) {
      case "neutro":
        return {
          novo_estado: "aguardando_motivo_cancelamento",
          acao: "solicitar_motivo_cancelamento",
          dados: { fluxo: "cancelamento" },
        };
      case "aguardando_motivo_cancelamento":
        return {
          novo_estado: "aguardando_confirmacao",
          acao: "solicitar_confirmacao_cancelamento",
          dados: { fluxo: "cancelamento", motivo_informado: true },
        };
      case "aguardando_confirmacao":
        return {
          novo_estado: "finalizado",
          acao: "confirmar_cancelamento",
          dados: { fluxo: "cancelamento", confirmado: true },
        };
      default:
        return {
          novo_estado: "aguardando_motivo_cancelamento",
          acao: "solicitar_motivo_cancelamento",
          dados: { fluxo: "cancelamento", estado_anterior: estadoAtual },
        };
    }
  }

  // === REAGENDAMENTO ===
  if (intencao === "reagendamento") {
    switch (estadoAtual) {
      case "neutro":
        return {
          novo_estado: "aguardando_nova_data",
          acao: "solicitar_nova_data",
          dados: { fluxo: "reagendamento" },
        };
      case "aguardando_nova_data":
        return {
          novo_estado: "aguardando_horario",
          acao: "solicitar_horario",
          dados: { fluxo: "reagendamento", nova_data_informada: true },
        };
      case "aguardando_horario":
        return {
          novo_estado: "aguardando_confirmacao",
          acao: "solicitar_confirmacao_reagendamento",
          dados: { fluxo: "reagendamento", horario_informado: true },
        };
      case "aguardando_confirmacao":
        return {
          novo_estado: "finalizado",
          acao: "confirmar_reagendamento",
          dados: { fluxo: "reagendamento", confirmado: true },
        };
      default:
        return {
          novo_estado: "aguardando_nova_data",
          acao: "solicitar_nova_data",
          dados: { fluxo: "reagendamento", estado_anterior: estadoAtual },
        };
    }
  }

  // === CONFIRMAÇÃO ===
  if (intencao === "confirmacao") {
    if (estadoAtual === "aguardando_confirmacao") {
      return {
        novo_estado: "finalizado",
        acao: "confirmar_acao_pendente",
        dados: { confirmado: true },
      };
    }
    // Confirmação sem contexto = confirmar presença em consulta
    return {
      novo_estado: "finalizado",
      acao: "confirmar_presenca",
      dados: { fluxo: "confirmacao_presenca" },
    };
  }

  // === INTENÇÕES SEM FLUXO COMPLEXO (passthrough) ===
  const intencoesSimplesMap: Record<string, string> = {
    duvida_servico: "encaminhar_duvida_servico",
    duvida_valor: "encaminhar_duvida_valor",
    duvida_preparo_exame: "encaminhar_duvida_preparo",
    emergencia: "encaminhar_emergencia",
    reclamacao: "encaminhar_reclamacao",
    retorno_inativo: "encaminhar_retorno_inativo",
    financeiro: "encaminhar_financeiro",
  };

  if (intencoesSimplesMap[intencao]) {
    return {
      novo_estado: "neutro",
      acao: intencoesSimplesMap[intencao],
      dados: { fluxo: intencao, requer_atendimento_humano: intencao === "emergencia" },
    };
  }

  // === FALLBACK ===
  return {
    novo_estado: "neutro",
    acao: "encaminhar_humano",
    dados: { motivo: "intencao_nao_mapeada", intencao_recebida: intencao },
  };
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

  try {
    const body = await req.json();
    const { paciente_externo_id, mensagem, intencao } = body;

    // Validações
    if (!paciente_externo_id || typeof paciente_externo_id !== "string") {
      return new Response(JSON.stringify({ error: "paciente_externo_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mensagem || typeof mensagem !== "string") {
      return new Response(JSON.stringify({ error: "mensagem é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!intencao || typeof intencao !== "string") {
      return new Response(JSON.stringify({ error: "intencao é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedId = paciente_externo_id.slice(0, 255);
    const sanitizedMensagem = mensagem.slice(0, 5000);

    // Buscar último estado do paciente
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: ultimaInteracao, error: queryError } = await supabase
      .from("interacoes_ia")
      .select("estado_conversa")
      .eq("paciente_externo_id", sanitizedId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error("[processar-fluxo-conversa] Erro ao buscar estado:", queryError);
      return new Response(JSON.stringify({ error: "Erro ao consultar estado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const estadoAtual: Estado = (ultimaInteracao?.estado_conversa as Estado) || "neutro";

    // Processar transição
    const resultado = processarTransicao(estadoAtual, intencao, sanitizedMensagem);

    console.log(
      `[processar-fluxo-conversa] ${sanitizedId}: ${estadoAtual} + ${intencao} → ${resultado.novo_estado} (${resultado.acao})`
    );

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[processar-fluxo-conversa] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
