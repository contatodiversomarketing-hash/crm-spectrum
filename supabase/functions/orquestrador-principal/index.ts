import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = "https://chilmuwijkkdefqizleh.supabase.co";

async function chamarFuncao(nome: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${SUPABASE_URL}/functions/v1/${nome}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function estaEmHorarioComercial(horarioInicio: string, horarioFim: string, diasSemana: string): boolean {
  const agora = new Date();
  // Converter para horário de Brasília (UTC-3)
  const brasilOffset = -3 * 60;
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilDate = new Date(utcMs + brasilOffset * 60000);

  const diasMap: Record<string, number> = {
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  };
  const diasAtivos = diasSemana.split(",").map((d) => diasMap[d.trim()]).filter((d) => d !== undefined);
  const diaAtual = brasilDate.getDay();

  if (!diasAtivos.includes(diaAtual)) {
    return false;
  }

  const [hInicio, mInicio] = horarioInicio.split(":").map(Number);
  const [hFim, mFim] = horarioFim.split(":").map(Number);
  const minutosAgora = brasilDate.getHours() * 60 + brasilDate.getMinutes();
  const minutosInicio = hInicio * 60 + (mInicio || 0);
  const minutosFim = hFim * 60 + (mFim || 0);

  return minutosAgora >= minutosInicio && minutosAgora <= minutosFim;
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
    // 1. Validar payload
    const body = await req.json();
    const { numero_remetente, mensagem, timestamp } = body;

    if (!numero_remetente || typeof numero_remetente !== "string") {
      return new Response(JSON.stringify({ error: "numero_remetente é obrigatório" }), {
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

    const sanitizedNumero = numero_remetente.replace(/[^\d+]/g, "").slice(0, 20);
    const sanitizedMensagem = mensagem.slice(0, 5000);
    const pacienteExternoId = `tel:${sanitizedNumero}`;
    const criadoEm = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    console.log(`[orquestrador] Iniciando processamento para ${pacienteExternoId}`);

    // 2. Classificar intenção
    const classificacao = await chamarFuncao("classificar-intencao", { mensagem: sanitizedMensagem });

    if (!classificacao.ok) {
      console.error(`[orquestrador] Erro ao classificar intenção (${classificacao.status}):`, classificacao.data);
      return new Response(JSON.stringify({ error: "Erro ao classificar intenção" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { intencao, confianca } = classificacao.data as { intencao: string; confianca: number };
    console.log(`[orquestrador] Intenção: ${intencao} (${confianca})`);

    // 3. Processar fluxo de conversa
    const fluxo = await chamarFuncao("processar-fluxo-conversa", {
      paciente_externo_id: pacienteExternoId,
      mensagem: sanitizedMensagem,
      intencao,
    });

    if (!fluxo.ok) {
      console.error(`[orquestrador] Erro ao processar fluxo (${fluxo.status}):`, fluxo.data);
      return new Response(JSON.stringify({ error: "Erro ao processar fluxo" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { novo_estado, acao, dados } = fluxo.data as {
      novo_estado: string;
      acao: string;
      dados: Record<string, unknown>;
    };
    console.log(`[orquestrador] Fluxo: ${novo_estado} / ${acao}`);

    // 4. Consultar configurações do sistema
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: config, error: configError } = await supabase
      .from("configuracoes_sistema")
      .select("modo_supervisao_ativo, horario_inicio, horario_fim, dias_semana")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error("[orquestrador] Erro ao buscar configurações:", configError);
      return new Response(JSON.stringify({ error: "Erro ao buscar configurações" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modoSupervisao = config?.modo_supervisao_ativo ?? true;
    const horarioInicio = config?.horario_inicio ?? "08:00";
    const horarioFim = config?.horario_fim ?? "18:00";
    const diasSemana = config?.dias_semana ?? "seg,ter,qua,qui,sex";
    const emHorarioComercial = estaEmHorarioComercial(horarioInicio, horarioFim, diasSemana);

    console.log(`[orquestrador] Horário comercial: ${emHorarioComercial}, Supervisão: ${modoSupervisao}`);

    // 5. Decidir ação baseado no contexto
    let supervisionado = false;
    let respostaSugerida: string | null = null;
    let respostaFinal: string | null = null;
    let decisao: string;
    let modo: string;

    const respostaPlaceholder = `[AUTO] Ação: ${acao} | Estado: ${novo_estado}`;

    if (emHorarioComercial && modoSupervisao) {
      // Dentro do horário + supervisão ativa → aguardar aprovação humana
      supervisionado = true;
      respostaSugerida = respostaPlaceholder;
      respostaFinal = null;
      decisao = "aguardar_supervisao";
      modo = "supervisionado";
      console.log("[orquestrador] Modo: supervisão ativa — aguardando aprovação humana");
    } else {
      // Fora do horário ou supervisão desativada → resposta automática
      supervisionado = false;
      respostaSugerida = null;
      respostaFinal = respostaPlaceholder;
      decisao = "resposta_automatica";
      modo = "automatico";
      console.log("[orquestrador] Modo: automático — resposta registrada");
    }

    // 6. Registrar interação na tabela interacoes_ia
    const { error: insertError } = await supabase.from("interacoes_ia").insert({
      paciente_externo_id: pacienteExternoId,
      sistema_origem: "megaapi",
      canal: "whatsapp",
      mensagem_usuario: sanitizedMensagem,
      intencao_detectada: intencao,
      estado_conversa: novo_estado,
      resposta_sugerida: respostaSugerida,
      resposta_final: respostaFinal,
      supervisionado,
      criado_em: criadoEm,
    });

    if (insertError) {
      console.error("[orquestrador] Erro ao registrar interação:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao registrar interação" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Registrar decisão em logs_decisao
    const { error: logError } = await supabase.from("logs_decisao").insert({
      evento: "orquestracao_mensagem",
      decisao,
      confianca,
      regra_aplicada: `modo=${modo}, horario_comercial=${emHorarioComercial}, supervisao=${modoSupervisao}`,
      dados_entrada: {
        paciente_externo_id: pacienteExternoId,
        intencao,
        acao,
        novo_estado,
        dados,
      },
    });

    if (logError) {
      console.warn("[orquestrador] Erro ao registrar log de decisão:", logError);
      // Não falha a requisição por causa de log
    }

    console.log(`[orquestrador] Pipeline concluído para ${pacienteExternoId}`);

    // 8. Retornar resultado
    return new Response(
      JSON.stringify({
        status: "processado",
        modo,
        intencao,
        confianca,
        novo_estado,
        acao,
        supervisionado,
        resposta_enviada: modo === "automatico",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[orquestrador] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
