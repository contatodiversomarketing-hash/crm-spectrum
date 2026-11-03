import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buscarLead, telCanonico } from "../_shared/dedup.ts";
import { BLACK_FRIDAY_PIPELINE, campaignPlacement } from "../_shared/black-friday-neuroacesso.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "Não autenticado" }, 401);
    const { data: auth, error } = await client.auth.getUser(token);
    if (error || !auth.user) return json({ error: "Sessão inválida" }, 401);
    const { data: roles } = await client.from("user_roles").select("role").eq("user_id", auth.user.id);
    if (!roles?.some((r) => r.role === "admin")) return json({ error: "Acesso não autorizado" }, 403);
    const body = await req.json();
    if (!Array.isArray(body.rows) || body.rows.length > 30 || body.consent !== true) return json({ error: "Lote inválido ou autorização ausente" }, 400);
    const { data: pipeline, error: pipelineError } = await client.from("pipelines").select("id").eq("nome", BLACK_FRIDAY_PIPELINE).single();
    if (pipelineError || !pipeline) return json({ error: "Pipeline PLANO NEUROACESSO não encontrado" }, 400);
    const results = [];
    for (const row of body.rows) {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index > 10000 || typeof row.nome !== "string") return json({ error: "Contato inválido" }, 400);
      const source = `black_friday_ctc_2026:row:${row.index}`;
      const phone = telCanonico(typeof row.telefone_e164 === "string" ? row.telefone_e164 : "");
      let existing = phone ? await buscarLead(client, phone, null, "id,nome,pipeline_id,status_pipeline,observacoes,telefone") : null;
      if (!existing) {
        const { data, error: lookupError } = await client.from("leads").select("id,nome,pipeline_id,status_pipeline,observacoes,telefone").eq("origem_externa_id", source).maybeSingle();
        if (lookupError) throw lookupError;
        existing = data;
      }
      const note = "[Black Friday NeuroAcesso 2026 — grupo CTC; autorização confirmada pela equipe]";
      const notes = [existing?.observacoes || "", note, !phone ? "Telefone não informado na planilha; não enviar até completar." : ""].filter(Boolean).join("\n");
      const payload = { ...campaignPlacement(existing, pipeline.id),
        ...(existing?.observacoes?.includes(note) ? {} : { observacoes: notes }),
        ...(!existing ? { nome: row.nome.trim() || null, telefone: phone || null, origem: "black_friday_ctc_2026", origem_externa_id: source, followup_finalizado: true } : {}),
      };
      const mutation = existing ? client.from("leads").update(payload).eq("id", existing.id) : client.from("leads").insert(payload);
      const { data: saved, error: saveError } = await mutation.select("id").single();
      if (saveError) throw saveError;
      results.push({ id: saved.id, created: !existing, hasPhone: !!phone });
    }
    return json({ results });
  } catch (e) { console.error("[importar-black-friday]", e); return json({ error: "Não foi possível concluir este lote" }, 500); }
});