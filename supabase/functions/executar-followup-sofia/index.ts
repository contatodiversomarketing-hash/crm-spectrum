import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Etapas em dias após o primeiro contato (criado_em do lead)
const ETAPAS = [
  { dias: 1, proxima: 1 },
  { dias: 3, proxima: 3 },
  { dias: 7, proxima: 7, desconto: 10 },
  { dias: 15, proxima: 15, desconto: 15, final: true },
];

function escolherProximaEtapa(etapaAtual: number, diasDesdePrimeiroContato: number) {
  for (const e of ETAPAS) {
    if (e.proxima > etapaAtual && diasDesdePrimeiroContato >= e.dias) {
      return e;
    }
  }
  return null;
}

function montarMensagem(nome: string | null, etapa: typeof ETAPAS[number]): string {
  const primeiroNome = nome ? nome.split(" ")[0] : "";
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}! ` : "Oi! ";

  if (etapa.proxima === 1) {
    return `${saudacao}Aqui é a Ana, da Dra. Amélia Carvalho 💚\n\nVi que você começou seu cadastro com a gente, mas ainda não finalizamos seu agendamento. Tá tudo bem? \n\nLembre-se: cuidar da sua saúde hoje evita problemas amanhã. *Não deixe sua saúde para depois.* 🌿\n\nQuer que eu te ajude a marcar sua consulta agora?`;
  }
  if (etapa.proxima === 3) {
    return `${saudacao}Sou a Ana da Dra. Amélia Carvalho 💚\n\nPassando pra te lembrar com carinho: *prevenir é sempre melhor do que remediar.* \n\nSeu bem-estar merece atenção. Posso reservar um horário pra você esta semana?`;
  }
  if (etapa.proxima === 7 && etapa.desconto) {
    return `${saudacao}Aqui é a Ana novamente 💚\n\nNão quero que você adie mais o cuidado com a sua saúde. Por isso, separei algo especial pra você:\n\n🎁 *R$ ${etapa.desconto},00 de desconto* na sua primeira consulta na Dra. Amélia Carvalho.\n\nEsse benefício é exclusivo e por tempo limitado. Posso confirmar seu agendamento?`;
  }
  if (etapa.proxima === 15 && etapa.desconto) {
    return `${saudacao}É a Ana, da Dra. Amélia Carvalho 💚\n\nEsta é minha última mensagem por aqui — e quero que ela faça a diferença na sua vida. \n\nSua saúde é o bem mais valioso que você tem, e quero te ajudar a cuidar dela com um benefício ainda maior:\n\n🎁 *R$ ${etapa.desconto},00 de desconto* na sua primeira consulta.\n\nResponde aqui e eu garanto seu horário hoje mesmo. Conta comigo. 🌿`;
  }
  return `${saudacao}Aqui é a Ana da Dra. Amélia Carvalho. Como posso te ajudar hoje?`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let MEGA_API_URL = Deno.env.get("MEGA_API_URL");
  const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
  if (MEGA_API_URL && !/^https?:\/\//i.test(MEGA_API_URL)) {
    MEGA_API_URL = `https://${MEGA_API_URL}`;
  }
  MEGA_API_URL = MEGA_API_URL?.replace(/\/+$/, "");
  if (!MEGA_API_URL || !MEGA_API_TOKEN) {
    return new Response(JSON.stringify({ error: "MEGA_API não configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const relatorio = { avaliados: 0, enviados: 0, finalizados_responderam: 0, erros: [] as string[] };

  try {
    // Buscar leads não finalizados, com pelo menos 1 dia desde criação
    const limiteSuperior = new Date(Date.now() - 1 * 86400000).toISOString();
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, nome, telefone, criado_em, ultima_interacao, followup_etapa, followup_ultimo_envio, followup_finalizado")
      .eq("followup_finalizado", false)
      .not("telefone", "is", null)
      .lt("criado_em", limiteSuperior)
      .limit(500);

    if (error) throw error;
    relatorio.avaliados = leads?.length || 0;

    const agora = Date.now();

    for (const lead of leads || []) {
      try {
        const criadoMs = new Date(lead.criado_em).getTime();
        const diasDesde = Math.floor((agora - criadoMs) / 86400000);

        // Se respondeu após o último envio, finalizar
        if (lead.ultima_interacao) {
          const ultInter = new Date(lead.ultima_interacao).getTime();
          const ultEnvio = lead.followup_ultimo_envio
            ? new Date(lead.followup_ultimo_envio).getTime()
            : criadoMs;
          if (ultInter > ultEnvio) {
            await supabase.from("leads").update({ followup_finalizado: true }).eq("id", lead.id);
            relatorio.finalizados_responderam++;
            continue;
          }
        }

        const etapa = escolherProximaEtapa(lead.followup_etapa || 0, diasDesde);
        if (!etapa) continue;

        const telefone = lead.telefone!.replace(/[^\d+]/g, "");
        const mensagem = montarMensagem(lead.nome, etapa);

        const megaRes = await fetch(`${MEGA_API_URL}/api/v1/sendText`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEGA_API_TOKEN}` },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        const ok = megaRes.ok;
        await supabase
          .from("leads")
          .update({
            followup_etapa: etapa.proxima,
            followup_ultimo_envio: new Date().toISOString(),
            followup_finalizado: etapa.final ? true : false,
          })
          .eq("id", lead.id);

        await supabase.from("logs_decisao").insert({
          evento: "followup_ana",
          decisao: ok ? "enviado" : "erro_envio",
          regra_aplicada: `etapa_${etapa.proxima}d${etapa.desconto ? `_desconto_${etapa.desconto}` : ""}`,
          dados_entrada: {
            lead_id: lead.id,
            telefone,
            dias_desde_primeiro_contato: diasDesde,
            mensagem_enviada: mensagem,
            mega_status: megaRes.status,
          },
        });

        if (ok) relatorio.enviados++;
        else relatorio.erros.push(`lead ${lead.id}: status ${megaRes.status}`);
      } catch (err) {
        relatorio.erros.push(`lead ${lead.id}: ${String(err).slice(0, 120)}`);
      }
    }

    return new Response(JSON.stringify(relatorio), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[followup-ana] erro:", e);
    return new Response(JSON.stringify({ error: String(e), relatorio }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
