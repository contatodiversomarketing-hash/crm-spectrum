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

async function enviarMegaAPI(numeroDestino: string, mensagem: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const megaUrl = Deno.env.get("MEGA_API_URL");
  const megaToken = Deno.env.get("MEGA_API_TOKEN");

  if (!megaUrl || !megaToken) {
    console.error("[orquestrador] MEGA_API_URL ou MEGA_API_TOKEN não configurados");
    return { ok: false, status: 0, data: { error: "MegaAPI não configurada" } };
  }

  try {
    const res = await fetch(megaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${megaToken}`,
      },
      body: JSON.stringify({
        number: numeroDestino,
        text: mensagem,
      }),
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text() };
    }
    console.log(`[orquestrador] MegaAPI resposta (${res.status}):`, JSON.stringify(data).slice(0, 200));
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    console.error("[orquestrador] Erro ao chamar MegaAPI:", error);
    return { ok: false, status: 0, data: { error: String(error) } };
  }
}

function estaEmHorarioComercial(horarioInicio: string, horarioFim: string, diasSemana: string): boolean {
  const agora = new Date();
  const brasilOffset = -3 * 60;
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilDate = new Date(utcMs + brasilOffset * 60000);

  const diasMap: Record<string, number> = {
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  };
  const diasAtivos = diasSemana.split(",").map((d) => diasMap[d.trim()]).filter((d) => d !== undefined);
  const diaAtual = brasilDate.getDay();

  if (!diasAtivos.includes(diaAtual)) return false;

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
    const body = await req.json();
    const { numero_remetente, mensagem, timestamp, clinica_id } = body;

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

    console.log(`[orquestrador] Iniciando processamento para ${pacienteExternoId}${clinica_id ? ` (clinica: ${clinica_id})` : ""}`);

    // Validar plano se clinica_id fornecido
    if (clinica_id) {
      const validacao = await chamarFuncao("validar-plano-clinica", { clinica_id, tipo_uso: "whatsapp" });
      if (!validacao.ok) {
        const vData = validacao.data as { erro?: string };
        console.warn(`[orquestrador] Plano bloqueado: ${vData?.erro}`);
        return new Response(JSON.stringify({ error: vData?.erro || "Limite de uso atingido" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
      clinica_id,
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

    // 4. Gerar resposta humanizada
    const respostaHumanizada = await chamarFuncao("gerar-resposta-humanizada", {
      paciente_externo_id: pacienteExternoId,
      intencao,
      estado: novo_estado,
      acao,
      dados,
    });

    let textoResposta: string;
    if (respostaHumanizada.ok) {
      textoResposta = (respostaHumanizada.data as { resposta: string }).resposta;
      console.log(`[orquestrador] Resposta humanizada gerada: "${textoResposta.slice(0, 60)}..."`);
    } else {
      textoResposta = `Recebemos sua mensagem e estamos processando. Em breve retornaremos.`;
      console.warn("[orquestrador] Falha ao gerar resposta humanizada, usando fallback");
    }

    // 5. Consultar configurações do sistema
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

    // 6. Decidir ação baseado no contexto
    let supervisionado = false;
    let respostaSugerida: string | null = null;
    let respostaFinal: string | null = null;
    let decisao: string;
    let modo: string;
    let megaEnvio: { ok: boolean; status: number; data: unknown } | null = null;

    if (emHorarioComercial && modoSupervisao) {
      supervisionado = true;
      respostaSugerida = textoResposta;
      respostaFinal = null;
      decisao = "aguardar_supervisao";
      modo = "supervisionado";
      console.log("[orquestrador] Modo: supervisão — resposta sugerida salva, aguardando aprovação");
    } else {
      supervisionado = false;
      respostaSugerida = null;
      respostaFinal = textoResposta;
      modo = "automatico";

      megaEnvio = await enviarMegaAPI(sanitizedNumero, textoResposta);

      if (megaEnvio.ok) {
        decisao = "resposta_automatica_enviada";
        console.log("[orquestrador] Modo: automático — mensagem enviada via MegaAPI");
      } else {
        decisao = "resposta_automatica_falha_envio";
        console.error(`[orquestrador] Falha ao enviar via MegaAPI (${megaEnvio.status}):`, megaEnvio.data);
      }
    }

    // 7. Registrar interação na tabela interacoes_ia
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
      ...(clinica_id && { clinica_id }),
    });

    if (insertError) {
      console.error("[orquestrador] Erro ao registrar interação:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao registrar interação" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Registrar decisão em logs_decisao
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
        mega_envio: megaEnvio ? { ok: megaEnvio.ok, status: megaEnvio.status } : null,
      },
      ...(clinica_id && { clinica_id }),
    });

    if (logError) {
      console.warn("[orquestrador] Erro ao registrar log de decisão:", logError);
    }

    // Incrementar uso mensal se clinica_id e envio automático ok
    if (clinica_id && megaEnvio?.ok) {
      await incrementarUso(supabase, clinica_id, "whatsapp");
    }

    console.log(`[orquestrador] Pipeline concluído para ${pacienteExternoId}`);

    return new Response(
      JSON.stringify({
        status: "processado",
        modo,
        intencao,
        confianca,
        novo_estado,
        acao,
        supervisionado,
        resposta_enviada: megaEnvio?.ok ?? false,
        resposta: textoResposta,
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

async function incrementarUso(supabase: any, clinicaId: string, tipo: "whatsapp" | "ligacao") {
  const agora = new Date();
  const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const campo = tipo === "whatsapp" ? "mensagens_whatsapp_usadas" : "ligacoes_realizadas";

  const { data: existing } = await supabase
    .from("uso_mensal_clinica")
    .select("id, " + campo)
    .eq("clinica_id", clinicaId)
    .eq("mes_referencia", mesRef)
    .maybeSingle();

  if (existing) {
    await supabase.from("uso_mensal_clinica")
      .update({ [campo]: (existing[campo] || 0) + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("uso_mensal_clinica").insert({
      clinica_id: clinicaId,
      mes_referencia: mesRef,
      [campo]: 1,
    });
  }
}
