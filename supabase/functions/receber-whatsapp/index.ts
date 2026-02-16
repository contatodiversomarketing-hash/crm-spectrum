import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const body = await req.json();

  const mensagem = body.message?.text || "";
  const numero = body.sender?.phone || "";

  if (!mensagem || !numero) {
    return new Response("ok");
  }

  // Aqui você pode conectar com sua IA real depois
  const respostaIA = `Olá! Recebi sua mensagem: "${mensagem}". Como posso te ajudar hoje?`;

  // Enviar resposta de volta para MegaAPI
  await fetch("https://apinocode01.megaapi.com.br/api/v1/sendText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("MEGAAPI_TOKEN")}`
    },
    body: JSON.stringify({
      number: numero,
      text: respostaIA
    })
  });

  return new Response("ok");
});
