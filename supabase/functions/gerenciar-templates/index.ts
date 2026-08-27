import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { datafyConfig } from "../_shared/mega.ts";

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
    if (req.method === "POST") {
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
