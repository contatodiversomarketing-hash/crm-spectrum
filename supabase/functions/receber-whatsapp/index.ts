import { serve } from "https://deno.land/std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("[receber-whatsapp] Body recebido:", JSON.stringify(body));

    const mensagem = body.message?.text || "";
    const numero = body.sender?.phone || "";

    if (!mensagem || !numero) {
      console.log("[receber-whatsapp] Mensagem ou número vazio, ignorando");
      return new Response("ok");
    }

    console.log(`[receber-whatsapp] Mensagem de ${numero}: ${mensagem}`);

    const respostaIA = `Olá! Recebi sua mensagem: "${mensagem}". Como posso te ajudar hoje?`;

    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");

    if (!MEGA_API_URL || !MEGA_API_TOKEN) {
      console.error("[receber-whatsapp] MEGA_API_URL ou MEGA_API_TOKEN não configurados");
      return new Response("erro config", { status: 500 });
    }

    // MEGA_API_URL já contém o path completo (ex: .../api/v1/sendText)
    const megaEndpoint = MEGA_API_URL;
    console.log(`[receber-whatsapp] Enviando para: ${megaEndpoint}`);

    const megaRes = await fetch(megaEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MEGA_API_TOKEN}`,
      },
      body: JSON.stringify({
        number: numero,
        text: respostaIA,
      }),
    });

    const megaBody = await megaRes.text();
    console.log(`[receber-whatsapp] MegaAPI status: ${megaRes.status}, body: ${megaBody}`);

    return new Response("ok");
  } catch (err) {
    console.error("[receber-whatsapp] Erro:", err);
    return new Response("erro", { status: 500 });
  }
});
