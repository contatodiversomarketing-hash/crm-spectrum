import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { megaConfig } from "../_shared/mega.ts";

type Body = {
  numero?: string;
  tipo?: "text" | "image" | "document" | "audio";
  texto?: string;
  base64?: string;
  fileName?: string;
  mimeType?: string;
  leadId?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const body = (await req.json()) as Body;
    const numero = (body.numero || "").replace(/\D/g, "");
    const tipo = body.tipo || "text";

    if (numero.length < 10) return json({ error: "Número de WhatsApp inválido" }, 400);
    if (tipo === "text" && !body.texto?.trim()) return json({ error: "Mensagem vazia" }, 400);
    if (tipo !== "text" && !body.base64) return json({ error: "Arquivo não enviado" }, 400);

    // Texto: sempre pela camada única (API oficial Meta/Datafy com fallback MegaAPI)
    if (tipo === "text") {
      const r = await enviarTextoMega(numero, body.texto!);
      if (!r.ok) {
        console.error("[crm-enviar-whatsapp] falha", r.status, r.body.slice(0, 400));
        return json({ error: "Falha ao enviar pelo WhatsApp", status: r.status, details: r.body.slice(0, 400) }, 502);
      }
    } else {
      const { origin, token, instanceKey, configurado } = megaConfig();
      if (!configurado) return json({ error: "Envio de mídia não configurado" }, 400);

      const to = `${numero}@s.whatsapp.net`;
      const messageData = {
        to,
        base64: String(body.base64).replace(/^data:[^;]+;base64,/, ""),
        fileName: body.fileName || (tipo === "audio" ? "audio.ogg" : "arquivo"),
        type: tipo,
        mimeType: body.mimeType || "application/octet-stream",
        caption: body.texto || "",
      };

      const resp = await fetch(`${origin}/rest/sendMessage/${instanceKey}/mediaBase64`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: token,
        },
        body: JSON.stringify({ messageData }),
      });

      const respBody = await resp.text();
      if (!resp.ok) {
        console.error("[crm-enviar-whatsapp] falha", resp.status, respBody.slice(0, 400));
        return json({ error: "Falha ao enviar pelo WhatsApp", status: resp.status, details: respBody.slice(0, 400) }, 502);
      }
    }

    const registro = tipo === "text"
      ? body.texto!.slice(0, 5000)
      : `[${tipo === "audio" ? "áudio" : tipo === "image" ? "imagem" : "arquivo"}: ${body.fileName || ""}] ${body.texto || ""}`.trim();

    const { error: insertErr } = await supabase.from("interacoes_ia").insert({
      paciente_externo_id: numero,
      canal: "whatsapp",
      sistema_origem: "crm_manual",
      mensagem_usuario: null,
      resposta_final: registro,
      intencao_detectada: "mensagem_manual",
      estado_conversa: "atendimento_humano",
      supervisionado: true,
      atendente_humano: userData.user.email ?? userData.user.id,
    });
    if (insertErr) console.error("[crm-enviar-whatsapp] erro ao salvar histórico", insertErr);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
