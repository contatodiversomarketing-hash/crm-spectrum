import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buscarLead, telCanonico } from "../_shared/dedup.ts";
import { extractedStage } from "../_shared/crm-stages.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ETIQUETAS_VALIDAS = [
  "para_ele",
  "para_filho",
  "para_ambos",
  "tea",
  "tdah",
  "outro",
  "cannabis",
  "neuroacesso",
];

const ETAPAS_VALIDAS = [
  "novo",
  "em_contato",
  "triagem_recebida",
  "agendado",
  "consultou",
  "ganho",
  "perdido",
];

function so(n: string | null | undefined) {
  return (n || "").replace(/\D/g, "");
}

function variacoesTelefone(numero: string): string[] {
  const d = so(numero);
  const set = new Set<string>([d, `+${d}`, numero]);
  if (d.startsWith("55")) {
    const semDdi = d.slice(2);
    set.add(semDdi);
    if (semDdi.length === 11) set.add("55" + semDdi.slice(0, 2) + semDdi.slice(3));
    if (semDdi.length === 10) set.add("55" + semDdi.slice(0, 2) + "9" + semDdi.slice(2));
  }
  return [...set].filter(Boolean);
}

async function extrairComIA(historico: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;

  const prompt = `Você é o motor de CRM da Ana, consultora da Dra. Amélia Carvalho (neurodesenvolvimento: autismo, TDAH, cannabis medicinal).
Leia a conversa de WhatsApp abaixo e extraia SOMENTE o que estiver explícito. Nunca invente.

Responda APENAS com JSON válido no formato:
{
  "nome": string|null,
  "email": string|null,
  "cpf": string|null,
  "data_nascimento": "YYYY-MM-DD"|null,
  "nome_filho": string|null,
  "cidade": string|null,
  "objetivo": string|null,
  "publico": "adulto"|"infantil"|null,
  "queixas": string[],
  "status_pipeline": "novo"|"em_contato"|"triagem_recebida"|"agendado"|"consultou"|"ganho"|"perdido",
  "temperatura": "frio"|"morno"|"quente",
  "etiquetas": string[],
  "resumo": string,
  "proximo_passo": string|null,
  "criar_alerta": boolean,
  "alerta_titulo": string|null,
  "alerta_em_horas": number|null
}

Regras de etiquetas (use SOMENTE estas chaves, quantas se aplicarem, [] se nada estiver claro):
- "para_ele": o tratamento é para a própria pessoa que fala
- "para_filho": é para o filho(a)/criança
- "para_ambos": é para ela E para o filho(a)
- "tea": suspeita ou diagnóstico de autismo
- "tdah": suspeita ou diagnóstico de TDAH
- "outro": outro quadro de neurodesenvolvimento/saúde mental
- "cannabis": interesse em cannabis medicinal
- "neuroacesso": é médico/clínica interessado na mentoria NeuroAcesso

Regras de etapa:
- "agendado" só se houver confirmação de data/horário de consulta.
- "triagem_recebida" se a pessoa já contou queixas/objetivo mas ainda não agendou.
- "em_contato" se houve troca de mensagens sem informações clínicas.
- "perdido" só se a pessoa recusar explicitamente.
Resumo: no máximo 400 caracteres, objetivo, em português.

CONVERSA:
${historico}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 900,
    }),
  });

  if (!resp.ok) {
    console.error("[ana-crm] IA erro", resp.status, (await resp.text()).slice(0, 400));
    return null;
  }

  const data = await resp.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "";
  const match = txt.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
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

  try {
    const { numero } = await req.json();
    if (!numero || typeof numero !== "string") {
      return new Response(JSON.stringify({ error: "numero é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: interacoes } = await supabase
      .from("interacoes_ia")
      .select("mensagem_usuario, resposta_final, criado_em")
      .eq("paciente_externo_id", numero)
      .order("criado_em", { ascending: false })
      .limit(24);

    if (!interacoes || interacoes.length === 0) {
      return new Response(JSON.stringify({ status: "sem_historico" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const historico = interacoes
      .slice()
      .reverse()
      .map((i) =>
        [i.mensagem_usuario ? `Paciente: ${i.mensagem_usuario}` : null,
         i.resposta_final ? `Ana: ${i.resposta_final}` : null]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n")
      .slice(-12000);

    const extraido = await extrairComIA(historico);
    if (!extraido) {
      return new Response(JSON.stringify({ status: "sem_extracao" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Localizar lead existente por telefone
    const lead = await buscarLead(supabase, numero, null,
      "id, nome, email, cpf, data_nascimento, nome_filho, cidade, status_pipeline, observacoes, dados_triagem, pipeline_id, followup_etapa, etiquetas");
    let pipelineId: string | null = lead?.pipeline_id ?? null;
    if (!pipelineId) {
      const { data: pipeline } = await supabase.from("pipelines").select("id")
        .order("criado_em", { ascending: true }).limit(1).maybeSingle();
      pipelineId = pipeline?.id ?? null;
    }
    const { data: columns, error: columnsError } = pipelineId
      ? await supabase.from("pipeline_colunas").select("chave, nome, ordem")
        .eq("pipeline_id", pipelineId).order("ordem")
      : { data: null, error: null };
    if (columnsError || !columns?.length) throw new Error("Pipeline sem colunas válidas; card preservado");

    const novaEtapa = ETAPAS_VALIDAS.includes(String(extraido.status_pipeline))
      ? String(extraido.status_pipeline)
      : "em_contato";

    const etapaAtual = lead?.status_pipeline || "novo";
    const etapaFinal = extractedStage(etapaAtual, novaEtapa, columns);

    const triagem = {
      ...(lead?.dados_triagem as Record<string, unknown> | null ?? {}),
      objetivo: extraido.objetivo ?? (lead?.dados_triagem as any)?.objetivo ?? null,
      publico: extraido.publico ?? (lead?.dados_triagem as any)?.publico ?? null,
      queixas: Array.isArray(extraido.queixas) && extraido.queixas.length
        ? extraido.queixas
        : (lead?.dados_triagem as any)?.queixas ?? [],
      temperatura: extraido.temperatura ?? null,
      proximo_passo: extraido.proximo_passo ?? null,
      atualizado_por_ana_em: new Date().toISOString(),
    };

    const etiquetasNovas = Array.isArray(extraido.etiquetas)
      ? (extraido.etiquetas as unknown[])
          .map((e) => String(e).trim().toLowerCase())
          .filter((e) => ETIQUETAS_VALIDAS.includes(e))
      : [];
    const etiquetasFinais = [...new Set([...(((lead as any)?.etiquetas as string[] | null) ?? []), ...etiquetasNovas])];

    const cpfLimpo = so(extraido.cpf as string | null);
    const payload: Record<string, unknown> = {
      nome: (extraido.nome as string) || lead?.nome || null,
      email: (extraido.email as string) || lead?.email || null,
      cpf: cpfLimpo.length === 11 ? cpfLimpo : lead?.cpf || null,
      data_nascimento: (extraido.data_nascimento as string) || lead?.data_nascimento || null,
      nome_filho: (extraido.nome_filho as string) || lead?.nome_filho || null,
      cidade: (extraido.cidade as string) || lead?.cidade || null,
      status_pipeline: etapaFinal,
      pipeline_id: pipelineId,
      etiquetas: etiquetasFinais,
      dados_triagem: triagem,
      observacoes: extraido.resumo
        ? `[Ana ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}] ${extraido.resumo}`
        : lead?.observacoes ?? null,
      ultima_interacao: new Date().toISOString(),
      // Cliente respondeu → cadência de follow-up reinicia
      followup_finalizado: false,
      followup_etapa: 0,
      followup_ultimo_envio: null,
    };

    let leadId = lead?.id ?? null;

    if (lead) {
      const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (error) throw error;
    } else {
      const { data: novo, error } = await supabase
        .from("leads")
        .insert({
          ...payload,
          telefone: telCanonico(numero),
          origem: "whatsapp_ana",
          status: "ativo",
          pipeline_id: pipelineId,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      leadId = novo?.id ?? null;
    }

    // Alerta de tarefa para a equipe
    if (leadId && extraido.criar_alerta && extraido.alerta_titulo) {
      const horas = Number(extraido.alerta_em_horas) > 0 ? Number(extraido.alerta_em_horas) : 24;
      await supabase.from("lead_alertas").insert({
        lead_id: leadId,
        titulo: String(extraido.alerta_titulo).slice(0, 200),
        descricao: (extraido.proximo_passo as string) ?? null,
        lembrar_em: new Date(Date.now() + horas * 3600000).toISOString(),
      });
    }

    await supabase.from("logs_decisao").insert({
      evento: "crm_atualizado_ana",
      decisao: etapaFinal,
      regra_aplicada: `temperatura=${extraido.temperatura ?? "n/d"}`,
      dados_entrada: { numero, lead_id: leadId, extraido },
    });

    return new Response(JSON.stringify({ status: "ok", lead_id: leadId, etapa: etapaFinal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ana-crm] erro:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
