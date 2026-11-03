import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { datafyConfig, enviarTemplateMega } from "../_shared/mega.ts";
import { TEMPLATES_CADENCIA } from "../_shared/followup-cadencia.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { BLACK_FRIDAY_NAME, BLACK_FRIDAY_TEMPLATE, findBlackFridayTemplate } from "../_shared/black-friday-neuroacesso.ts";

// Gerencia templates de WhatsApp (API oficial Meta via proxy Datafy).
// GET  -> lista templates da WABA
// POST -> cria o template de reabordagem da Ana
const WABA_ID = Deno.env.get("DATAFY_WABA_ID") || "1135674689542545";

const TEMPLATE = {
  name: "reabordagem_ana",
  language: "pt_BR",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text:
        "Olá, {{1}}! Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho, especialista em neurodesenvolvimento (TEA, TDAH e cannabis medicinal).\n\nVi que você buscou informações com a gente e queria entender como posso te ajudar hoje. Podemos conversar?",
      example: { body_text: [["Maria"]] },
    },
    { type: "FOOTER", text: "Responda PARAR para não receber mais mensagens." },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { base, token } = datafyConfig();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!token) return json({ error: "DATAFY_API_TOKEN ausente" }, 400);

  const url = `${base}/${WABA_ID}/message_templates`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  try {
    const client = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!bearer) return json({ error: "Não autenticado" }, 401);
    const { data: auth, error: authError } = await client.auth.getUser(bearer);
    if (authError || !auth.user) return json({ error: "Sessão inválida" }, 401);
    const { data: roles } = await client.from("user_roles").select("role").eq("user_id", auth.user.id);
    if (!roles?.some((r) => r.role === "admin" || r.role === "auxiliar")) return json({ error: "Acesso não autorizado" }, 403);
    if (req.method === "POST") {
      let payload: Record<string, unknown> = {};
      try { payload = await req.json(); } catch { /* sem corpo */ }

      if (payload.acao === "consultar_black_friday" || payload.acao === "criar_black_friday") {
        const creating = payload.acao === "criar_black_friday";
        const resp = await fetch(creating ? url : `${url}?name=${BLACK_FRIDAY_NAME}&limit=100`, {
          method: creating ? "POST" : "GET", headers,
          ...(creating ? { body: JSON.stringify(BLACK_FRIDAY_TEMPLATE) } : {}),
        });
        const details = await resp.text();
        if (!resp.ok) return json({ error: "A Meta não aceitou a solicitação.", status: resp.status, details }, resp.status);
        const result = JSON.parse(details);
        return json({ status: creating ? (result.status || "PENDING") : findBlackFridayTemplate(result) });
      }

      // Envio de teste usando o template aprovado
      if (payload?.acao === "enviar" && payload?.numero) {
        const r = await enviarTemplateMega(String(payload.numero), [String(payload.nome || "tudo bem")]);
        return json({ acao: "enviar", status: r.status, ok: r.ok, body: r.body.slice(0, 600) }, 200);
      }

      // Cria os 4 templates da cadência de follow-up (17h)
      if (payload?.acao === "criar_cadencia") {
        const resultados = [];
        for (const tpl of TEMPLATES_CADENCIA) {
          const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(tpl) });
          resultados.push({ nome: tpl.name, status: r.status, body: (await r.text()).slice(0, 400) });
        }
        return json({ acao: "criar_cadencia", resultados }, 200);
      }



      const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(TEMPLATE) });
      const body = await resp.text();
      return json({ acao: "criar", status: resp.status, body }, 200);
    }
    const resp = await fetch(`${url}?limit=50`, { headers });
    const body = await resp.text();
    return json({ acao: "listar", status: resp.status, body }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
