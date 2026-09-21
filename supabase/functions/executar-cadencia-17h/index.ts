import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  dentroDaJanela24h,
  enviarTemplateNomeado,
  enviarTextoMega,
  instanciaConectada,
  provedorAtivo,
} from "../_shared/mega.ts";
import { CADENCIA_FOLLOWUP } from "../_shared/followup-cadencia.ts";
import { telCanonico } from "../_shared/dedup.ts";

const ETAPAS_PARADAS = ["agendado", "consultou", "ganho", "perdido"];
const MAX_POR_RODADA = 60;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  const provedor = provedorAtivo();
  if (provedor === "nenhum") return json({ error: "WhatsApp não configurado" }, 500);

  const { data: cfg } = await supabase
    .from("configuracoes_sistema")
    .select("whatsapp_ativo")
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (cfg?.whatsapp_ativo !== true) return json({ status: "ia_desligada", enviados: 0 });

  // Só dispara na faixa das 17h (Brasília), salvo teste manual.
  const agoraBR = new Date(Date.now() - 3 * 3600000);
  const horaBR = agoraBR.getUTCHours();
  if (!forcar && horaBR !== 17) return json({ status: "fora_do_horario", hora_br: horaBR });

  const conexao = await instanciaConectada();
  if (!conexao.conectada) return json({ status: "whatsapp_desconectado" });

  // Trava de execução única por dia (evita disparo duplicado do agendador).
  const diaChave = `cadencia17h_${agoraBR.toISOString().slice(0, 10)}`;
  if (!forcar) {
    const { error: lockErr } = await supabase
      .from("locks_processamento")
      .insert({ numero: diaChave });
    if (lockErr) return json({ status: "ja_executado_hoje" });
  }

  const relatorio = {
    avaliados: 0,
    enviados: 0,
    encerrados: 0,
    pausados_responderam: 0,
    erros: [] as string[],
  };

  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const agora = Date.now();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone, criado_em, ultima_interacao, followup_etapa, followup_ultimo_envio, followup_finalizado, status_pipeline",
    )
    .eq("followup_finalizado", false)
    .not("telefone", "is", null)
    .order("ultima_interacao", { ascending: false, nullsFirst: false })
    .limit(300);

  if (error) return json({ error: error.message }, 500);
  relatorio.avaliados = leads?.length || 0;

  for (const lead of leads || []) {
    if (relatorio.enviados >= MAX_POR_RODADA) break;
    try {
      if (ETAPAS_PARADAS.includes(lead.status_pipeline)) {
        await supabase.from("leads").update({ followup_finalizado: true }).eq("id", lead.id);
        relatorio.encerrados++;
        continue;
      }

      const etapa = lead.followup_etapa || 0;
      const passo = CADENCIA_FOLLOWUP[etapa];
      if (!passo) {
        await supabase.from("leads").update({ followup_finalizado: true }).eq("id", lead.id);
        relatorio.encerrados++;
        continue;
      }

      const baseMs = lead.followup_ultimo_envio
        ? new Date(lead.followup_ultimo_envio).getTime()
        : new Date(lead.criado_em).getTime();

      // Respondeu depois do último toque? A cadência pausa e a conversa vira humana/IA.
      if (lead.ultima_interacao && new Date(lead.ultima_interacao).getTime() > baseMs) {
        await supabase
          .from("leads")
          .update({ followup_etapa: 0, followup_ultimo_envio: null })
          .eq("id", lead.id);
        relatorio.pausados_responderam++;
        continue;
      }

      const dias = (agora - baseMs) / 86400000;
      if (dias < passo.dias) continue;

      const telefone = lead.telefone!.replace(/[^\d+]/g, "");
      const nomeLimpo = /\d/.test(lead.nome || "") ? "" : (lead.nome || "").trim();
      const primeiro = nomeLimpo.split(" ")[0] || "tudo bem";
      const texto = passo.texto(primeiro);

      let res: { ok: boolean; status: number; body: string; messageId?: string };
      let viaTemplate = false;
      if (dentroDaJanela24h(lead.ultima_interacao)) {
        res = await enviarTextoMega(telefone, texto);
      } else {
        const tpl = await enviarTemplateNomeado(telefone, passo.template, [primeiro]);
        if (tpl.usouTemplate) {
          res = tpl;
          viaTemplate = true;
        } else {
          res = await enviarTextoMega(telefone, texto);
        }
      }

      if (res.ok) {
        const ultima = etapa + 1 >= CADENCIA_FOLLOWUP.length;
        await supabase
          .from("leads")
          .update({
            followup_etapa: etapa + 1,
            followup_ultimo_envio: new Date().toISOString(),
            followup_finalizado: ultima,
            status_pipeline: lead.status_pipeline === "novo" ? "em_contato" : lead.status_pipeline,
          })
          .eq("id", lead.id);

        await supabase.from("interacoes_ia").insert({
          paciente_externo_id: telCanonico(telefone) || telefone,
          canal: "whatsapp",
          sistema_origem: "followup_ana",
          mensagem_usuario: null,
          resposta_final: texto,
          intencao_detectada: viaTemplate ? "followup_template" : "followup_texto",
          estado_conversa: `cadencia_17h_etapa_${etapa + 1}`,
          supervisionado: false,
          whatsapp_message_id: res.messageId ?? null,
          whatsapp_status: res.messageId ? "accepted" : "sent",
        });

        relatorio.enviados++;
        await espera(15000 + Math.floor(Math.random() * 15000));
      } else {
        relatorio.erros.push(`lead ${lead.id}: ${res.status} ${res.body.slice(0, 120)}`);
      }

      await supabase.from("logs_decisao").insert({
        evento: "cadencia_17h",
        decisao: res.ok ? "enviado" : "erro_envio",
        regra_aplicada: `etapa_${etapa + 1}_${passo.dias}d_${passo.template}`,
        dados_entrada: { lead_id: lead.id, telefone, mensagem: texto, status: res.status },
      });
    } catch (e) {
      relatorio.erros.push(`lead ${lead.id}: ${String(e).slice(0, 120)}`);
    }
  }

  return json(relatorio);
});
