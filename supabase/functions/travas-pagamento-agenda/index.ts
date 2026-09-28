import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enviarTextoMega, PIX_QRCODE_PDF_URL } from "../_shared/mega.ts";

const CHAVE_PIX = "consultasdraameliacarvalho@gmail.com";

function primeiroNome(nome?: string | null) {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

function horaBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const agora = new Date();
  const em30 = new Date(agora.getTime() + 30 * 60 * 1000);
  const em10 = new Date(agora.getTime() + 10 * 60 * 1000);

  const resultado = { lembretes_sinal: 0, lembretes_restante: 0, bloqueados: 0 };

  try {
    // ================================
    // 1) SINAL NÃO PAGO — cobrar a cada agendamento novo sem sinal (janela: até 24h após criação)
    // ================================
    const { data: semSinal } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, data_hora, sinal_pago, lembrete_sinal_em, criado_em, status, pacientes(telefone, nome)")
      .eq("sinal_pago", false)
      .is("lembrete_sinal_em", null)
      .gt("data_hora", agora.toISOString())
      .neq("status", "cancelado")
      .lt("criado_em", new Date(agora.getTime() - 60 * 60 * 1000).toISOString())
      .limit(50);

    for (const ag of semSinal || []) {
      const tel = (ag as any).pacientes?.telefone;
      if (!tel) continue;
      const nome = primeiroNome(ag.paciente_nome || (ag as any).pacientes?.nome);
      const texto =
        `${nome ? nome + ", " : ""}passando aqui rapidinho 💚\n\n` +
        `Sua consulta com a Dra. Amélia está reservada para ${horaBR(ag.data_hora)}, mas ainda não recebi o sinal de *R$ 180,00* (30%) que reserva o horário exclusivamente para o seu atendimento.\n\n` +
        `Chave Pix: ${CHAVE_PIX}\n\n` +
        `Assim que puder fazer, me manda o comprovante aqui que eu deixo tudo confirmadinho pra você 🌿`;
      const env = await enviarTextoMega(tel, texto);
      if (env.ok) {
        await supabase.from("agendamentos").update({ lembrete_sinal_em: agora.toISOString() }).eq("id", ag.id);
        resultado.lembretes_sinal++;
      }
    }

    // ================================
    // 2) RESTANTE NÃO PAGO a 30 min da consulta — pedir comprovante
    // ================================
    const { data: semRestante } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, data_hora, lembrete_restante_em, status, pacientes(telefone, nome)")
      .eq("restante_pago", false)
      .is("lembrete_restante_em", null)
      .gt("data_hora", agora.toISOString())
      .lte("data_hora", em30.toISOString())
      .neq("status", "cancelado")
      .limit(50);

    for (const ag of semRestante || []) {
      const tel = (ag as any).pacientes?.telefone;
      if (!tel) continue;
      const nome = primeiroNome(ag.paciente_nome || (ag as any).pacientes?.nome);
      const texto =
        `${nome ? nome + ", " : ""}sua consulta com a Dra. Amélia é às ${horaBR(ag.data_hora)} ⏰\n\n` +
        `Para o sistema conseguir liberar o atendimento, preciso do pagamento do restante (*R$ 420,00*) até 30 minutos antes.\n\n` +
        `Chave Pix: ${CHAVE_PIX}\n\n` +
        `Se você já pagou, me envia o comprovante aqui que eu libero na hora ✅`;
      const env = await enviarTextoMega(tel, texto);
      if (env.ok) {
        await supabase.from("agendamentos").update({ lembrete_restante_em: agora.toISOString() }).eq("id", ag.id);
        resultado.lembretes_restante++;
      }
    }

    // ================================
    // 3) A 10 min da consulta e ainda sem pagamento → bloquear no sistema
    // ================================
    const { data: bloquear } = await supabase
      .from("agendamentos")
      .select("id, paciente_nome, data_hora, aviso_bloqueio_em, observacoes, status, pacientes(telefone, nome)")
      .eq("restante_pago", false)
      .is("aviso_bloqueio_em", null)
      .gt("data_hora", agora.toISOString())
      .lte("data_hora", em10.toISOString())
      .neq("status", "cancelado")
      .limit(50);

    for (const ag of bloquear || []) {
      const tel = (ag as any).pacientes?.telefone;
      const nome = primeiroNome(ag.paciente_nome || (ag as any).pacientes?.nome);
      if (tel) {
        const texto =
          `${nome ? nome + ", " : ""}não identifiquei o pagamento da sua consulta de ${horaBR(ag.data_hora)} 😔\n\n` +
          `Infelizmente o sistema não libera o atendimento sem o pagamento concluído, então sua vaga está *bloqueada* por enquanto e volta para a fila de espera.\n\n` +
          `Se você já pagou, me manda o comprovante AGORA (Pix ${CHAVE_PIX}) que eu tento segurar sua vaga com a Dra. 💚`;
        await enviarTextoMega(tel, texto);
      }
      await supabase
        .from("agendamentos")
        .update({
          aviso_bloqueio_em: agora.toISOString(),
          bloqueado_por_pagamento: true,
          observacoes: `${ag.observacoes || ""}\n[SISTEMA] Consulta bloqueada por falta de pagamento em ${agora.toISOString()}`.trim(),
        })
        .eq("id", ag.id);
      resultado.bloqueados++;
    }

    await supabase.from("logs_decisao").insert({
      evento: "travas_pagamento_agenda",
      decisao: JSON.stringify(resultado),
      regra_aplicada: "trava_pagamento_30min",
      confianca: 1.0,
    });

    return new Response(JSON.stringify({ ok: true, ...resultado, qrcode: PIX_QRCODE_PDF_URL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[travas-pagamento] erro:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
