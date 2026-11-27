import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { chaveCaptacao, mensagemCaptacao, nomeCaptacaoValido, telefoneCaptacaoValido, consentimentoCaptacaoValido } from "../_shared/captacao.ts";
import { buscarLead, telVariacoes, telCanonico } from "../_shared/dedup.ts";

const captacaoSchema = z.object({
  action: z.literal("submit"),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nome: z.string().trim().min(3).max(120).refine(nomeCaptacaoValido, "Informe nome e sobrenome"),
  telefone: z.string().max(30).transform(telCanonico).refine(telefoneCaptacaoValido, "Informe seu WhatsApp com DDD"),
  consentimento: z.boolean().refine(consentimentoCaptacaoValido, "Autorize o contato para continuar"),
  request_id: z.string().uuid(),
  origem: z.object({ utm_source: z.string().max(200).optional(), utm_medium: z.string().max(200).optional(), utm_campaign: z.string().max(200).optional(), utm_content: z.string().max(200).optional(), utm_term: z.string().max(200).optional(), fbclid: z.string().max(500).optional() }).default({}),
});

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Método não permitido" }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 12000) return respond({ error: "Dados muito grandes" }, 413);
    const text = await req.text();
    if (text.length > 12000) return respond({ error: "Dados muito grandes" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return respond({ error: "Dados inválidos" }, 400); }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return respond({ error: "Serviço indisponível" }, 503);
    const db = createClient(url, key);
    if (body?.action === "offer") {
      if (typeof body.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 100) return respond({ error: "Link inválido" }, 400);
      const { data, error } = await db.from("captacao_ofertas").select("titulo,descricao,slug").eq("slug", body.slug).eq("ativo", true).maybeSingle();
      if (error) throw error;
      return data ? respond({ oferta: data }) : respond({ error: "Este cadastro não está disponível no momento." }, 404);
    }
    const parsed = captacaoSchema.safeParse(body);
    if (!parsed.success) return respond({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, 400);
    const input = parsed.data;
    const { data: oferta, error } = await db.from("captacao_ofertas").select("id,titulo,whatsapp").eq("slug", input.slug).eq("ativo", true).maybeSingle();
    if (error) throw error;
    if (!oferta) return respond({ error: "Este cadastro não está disponível no momento." }, 404);
    const existing = await buscarLead(db, input.telefone);
    const { error: saveError } = await db.rpc("captacao_registrar", {
      p_oferta: oferta.id, p_nome: input.nome, p_telefone: input.telefone,
      p_variacoes: telVariacoes(input.telefone), p_chave: chaveCaptacao(input.telefone),
      p_request: input.request_id, p_origem: input.origem, p_existente: existing?.id || null,
    });
    if (saveError) throw saveError;
    const mensagem = mensagemCaptacao(oferta.titulo, input.nome, input.telefone);
    return respond({ whatsapp_url: `https://wa.me/${oferta.whatsapp}?text=${encodeURIComponent(mensagem)}` });
  } catch (err) {
    console.error("captacao-publica:", err instanceof Error ? err.message : "Falha ao salvar");
    return respond({ error: "Não conseguimos salvar seu cadastro agora. Tente novamente." }, 500);
  }
});