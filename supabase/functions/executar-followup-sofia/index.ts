import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { METODO_MESTRE_DAS_VENDAS } from "../_shared/metodo-vendas.ts";
import { interpretarTriagem, TRIAGENS_CONTEXTO } from "../_shared/triagens.ts";
import { enviarTextoMega, instanciaConectada } from "../_shared/mega.ts";
import { telCanonico } from "../_shared/dedup.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cadência "infinita": intervalo (em dias) desde o último toque para cada etapa.
// Após a etapa 6, mantém um toque a cada 45 dias, para sempre, até o lead responder.
const INTERVALOS: number[] = [1, 2, 4, 8, 15, 30];
const INTERVALO_RECORRENTE = 45;

function intervaloDaEtapa(etapa: number): number {
  return INTERVALOS[etapa] ?? INTERVALO_RECORRENTE;
}

const ETAPAS_PARADAS = ["agendado", "consultou", "ganho", "perdido"];

function mensagemFallback(nome: string | null, etapa: number): string {
  const primeiro = nome ? nome.split(" ")[0] : "";
  const saud = primeiro ? `Oi, ${primeiro}! ` : "Oi! ";
  if (etapa <= 1) {
    return `${saud}Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho 💚\n\nVi que conversamos por aqui e ainda não conseguimos concluir seu agendamento. Posso te ajudar a reservar um horário?`;
  }
  if (etapa <= 3) {
    return `${saud}É a Ana, da Dra. Amélia Carvalho 💚\n\nPassando para saber se você ainda deseja avaliar o quadro que me contou. Consigo verificar a agenda desta semana para você.`;
  }
  return `${saud}Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho 🌿\n\nContinuo à disposição para organizar sua avaliação quando fizer sentido para você. Quer que eu veja os próximos horários?`;
}

async function gerarMensagemIA(lead: any, etapa: number): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;

  const triagem = lead.dados_triagem || {};
  const interp = triagem.interpretacao || interpretarTriagem(triagem);
  const contexto = [
    `Nome: ${lead.nome || "desconhecido"}`,
    `Etapa do follow-up: ${etapa + 1} (quanto maior, mais tempo sem resposta)`,
    `Objetivo relatado: ${triagem.objetivo || "não informado"}`,
    `Público: ${triagem.publico || "não informado"}`,
    `Queixas: ${Array.isArray(triagem.queixas) ? triagem.queixas.join(", ") : "não informado"}`,
    interp ? `Triagem (quiz do site): ${interp.resumo}` : null,
    `Etapa no CRM: ${lead.status_pipeline}`,
    `Observações: ${(lead.observacoes || "").slice(0, 400)}`,
  ].filter(Boolean).join("\n");


  const prompt = `Você é Ana, consultora do consultório da Dra. Amélia Carvalho (neurodesenvolvimento: autismo, TDAH e cannabis medicinal). Escreva UMA mensagem de follow-up de WhatsApp para um lead que parou de responder.

Regras:
- Português brasileiro formal, acolhedor e humano. Sem gírias, sem contrações ("pra", "tá", "né").
- Máximo 4 linhas. No máximo 1 emoji.
- Nunca invente preços, descontos, horários ou promessas clínicas.
- Nunca diga que é IA. Varie a abordagem conforme a etapa (mais leve nas primeiras, mais respeitosa e espaçada nas últimas).
- Sempre termine com uma pergunta simples que facilite a resposta.
- Siga a cadência e as regras de follow-up do método abaixo (etapa 5 a 12 costuma converter; pare imediatamente diante de recusa clara).
- Responda apenas com o texto da mensagem.

${METODO_MESTRE_DAS_VENDAS}

${TRIAGENS_CONTEXTO}

Contexto do lead:
${contexto}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 400,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = data?.choices?.[0]?.message?.content?.trim();
    return txt && txt.length > 10 ? txt.replace(/\*/g, "") : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const provedor = provedorAtivo();
  if (provedor === "nenhum") {
    return new Response(JSON.stringify({ error: "WhatsApp não configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const oficial = provedor === "datafy";

  // Janela humana de envio: seg-sáb, 09h-19h (horário de Brasília)
  const agoraBR = new Date(Date.now() - 3 * 3600000);
  const horaBR = agoraBR.getUTCHours();
  const diaBR = agoraBR.getUTCDay();
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  if (!forcar && (diaBR === 0 || horaBR < 9 || horaBR >= 19)) {
    return new Response(JSON.stringify({ status: "fora_da_janela", hora_br: horaBR, dia_br: diaBR }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Trava anti-ban: nunca dispara com a instância fora do ar e limita o ritmo por rodada.
  const conexao = await instanciaConectada();
  if (!conexao.conectada) {
    await supabase.from("logs_decisao").insert({
      evento: "followup_ana",
      decisao: "abortado_desconectado",
      regra_aplicada: "instancia_whatsapp_offline",
      dados_entrada: { status_instancia: conexao.status },
    });
    return new Response(
      JSON.stringify({ status: "whatsapp_desconectado", status_instancia: conexao.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Limite diário rígido: no máximo 5 mensagens por dia (aquecimento pós-bloqueio)
  const MAX_POR_DIA = 5;
  const MAX_FALHAS_SEGUIDAS = 2;
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let falhasSeguidas = 0;

  // Quantas já foram enviadas hoje (dia de Brasília)?
  const inicioDiaBR = new Date(agoraBR);
  inicioDiaBR.setUTCHours(0, 0, 0, 0);
  const inicioDiaUTC = new Date(inicioDiaBR.getTime() + 3 * 3600000).toISOString();

  const { count: enviadosHoje } = await supabase
    .from("logs_decisao")
    .select("id", { count: "exact", head: true })
    .eq("evento", "followup_ana")
    .eq("decisao", "enviado")
    .gte("criado_em", inicioDiaUTC);

  const restanteHoje = MAX_POR_DIA - (enviadosHoje || 0);
  if (restanteHoje <= 0) {
    return new Response(
      JSON.stringify({ status: "limite_diario_atingido", enviados_hoje: enviadosHoje, max_por_dia: MAX_POR_DIA }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const MAX_POR_RODADA = restanteHoje;

  const relatorio = {
    avaliados: 0,
    enviados: 0,
    pausados_responderam: 0,
    pausados_etapa_crm: 0,
    limite_rodada: MAX_POR_RODADA,
    interrompido: null as string | null,
    erros: [] as string[],
  };

  try {
    const { data: leads, error } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone, criado_em, ultima_interacao, followup_etapa, followup_ultimo_envio, followup_finalizado, status_pipeline, observacoes, dados_triagem",
      )
      .eq("followup_finalizado", false)
      .not("telefone", "is", null)
      .limit(300);

    if (error) throw error;
    relatorio.avaliados = leads?.length || 0;

    const agora = Date.now();

    for (const lead of leads || []) {
      if (relatorio.enviados >= MAX_POR_RODADA) {
        relatorio.interrompido = "limite_por_rodada";
        break;
      }
      if (relatorio.interrompido) break;
      try {
        // Parar quando o lead já avançou no funil
        if (ETAPAS_PARADAS.includes(lead.status_pipeline)) {
          await supabase.from("leads").update({ followup_finalizado: true }).eq("id", lead.id);
          relatorio.pausados_etapa_crm++;
          continue;
        }

        const criadoMs = new Date(lead.criado_em).getTime();
        const ultEnvioMs = lead.followup_ultimo_envio
          ? new Date(lead.followup_ultimo_envio).getTime()
          : criadoMs;

        // Se respondeu depois do último toque, pausa a cadência (Ana assume a conversa)
        if (lead.ultima_interacao && new Date(lead.ultima_interacao).getTime() > ultEnvioMs) {
          await supabase
            .from("leads")
            .update({ followup_etapa: 0, followup_ultimo_envio: null })
            .eq("id", lead.id);
          relatorio.pausados_responderam++;
          continue;
        }

        const etapa = lead.followup_etapa || 0;
        const diasDesdeUltimoToque = (agora - ultEnvioMs) / 86400000;
        if (diasDesdeUltimoToque < intervaloDaEtapa(etapa)) continue;

        const telefone = lead.telefone!.replace(/[^\d+]/g, "");
        const mensagem = (await gerarMensagemIA(lead, etapa)) || mensagemFallback(lead.nome, etapa);

        const megaRes = await enviarTextoMega(telefone, mensagem);
        const ok = megaRes.ok;

        if (ok) {
          await supabase
            .from("leads")
            .update({
              followup_etapa: etapa + 1,
              followup_ultimo_envio: new Date().toISOString(),
              status_pipeline: lead.status_pipeline === "novo" ? "em_contato" : lead.status_pipeline,
            })
            .eq("id", lead.id);

          await supabase.from("interacoes_ia").insert({
            paciente_externo_id: telCanonico(telefone) || telefone,
            canal: "whatsapp",
            sistema_origem: "followup_ana",
            mensagem_usuario: null,
            resposta_final: mensagem.slice(0, 5000),
            intencao_detectada: "followup_automatico",
            estado_conversa: `followup_etapa_${etapa + 1}`,
            supervisionado: false,
          });

          relatorio.enviados++;
          falhasSeguidas = 0;
          // Ritmo humano: 25 a 55 segundos entre mensagens
          if (relatorio.enviados < MAX_POR_RODADA) {
            // Ritmo bem lento: 3 a 6 minutos entre mensagens
            await espera(180000 + Math.floor(Math.random() * 180000));
          }
        } else {
          relatorio.erros.push(`lead ${lead.id}: status ${megaRes.status}`);
          falhasSeguidas++;
          if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
            relatorio.interrompido = "falhas_consecutivas_whatsapp";
          }
        }

        await supabase.from("logs_decisao").insert({
          evento: "followup_ana",
          decisao: ok ? "enviado" : "erro_envio",
          regra_aplicada: `etapa_${etapa + 1}_intervalo_${intervaloDaEtapa(etapa)}d`,
          dados_entrada: {
            lead_id: lead.id,
            telefone,
            dias_desde_ultimo_toque: Math.round(diasDesdeUltimoToque),
            mensagem_enviada: mensagem,
            mega_status: megaRes.status,
          },
        });
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
