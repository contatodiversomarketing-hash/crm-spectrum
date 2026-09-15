import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarTextoMega, enviarTemplateMega, enviarMidiaMega, dentroDaJanela24h } from "../_shared/mega.ts";
import { telCanonico } from "../_shared/dedup.ts";

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

    const canonico = telCanonico(numero) || numero;

    // Janela de 24h do Meta: sem mensagem recente do paciente, texto livre é
    // aceito pela API mas nunca entregue. Nesse caso enviamos o template aprovado.
    let janelaAberta = true;
    if (tipo === "text") {
      const { data: ultima } = await supabase
        .from("interacoes_ia")
        .select("criado_em")
        .eq("paciente_externo_id", canonico)
        .not("mensagem_usuario", "is", null)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      janelaAberta = dentroDaJanela24h(ultima?.criado_em ?? null);
    }

    let avisoTemplate: string | null = null;
    let whatsappMessageId: string | undefined;
    let urlMidia: string | null = null;

    if (tipo !== "text" && body.base64) {
      try {
        const limpo = String(body.base64).replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
        const bin = atob(limpo);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const mime = (body.mimeType || "application/octet-stream").split(";")[0].trim();
        const extBruta = (body.fileName?.split(".").pop() || mime.split("/")[1] || "bin").toLowerCase();
        const ext = extBruta.replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
        const nome = `enviados/${tipo}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("audio").upload(nome, bytes, { contentType: mime, upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("audio").getPublicUrl(nome);
        urlMidia = pub?.publicUrl || null;
      } catch (e) {
        console.error("[crm-enviar-whatsapp] erro upload storage", e);
        return json({ error: "Não foi possível preparar o arquivo para envio" }, 500);
      }
    }

    // Texto: sempre pela camada única (API oficial Meta/Datafy com fallback MegaAPI)
    if (tipo === "text") {
      if (!janelaAberta) {
        const { data: lead } = await supabase
          .from("leads")
          .select("nome")
          .eq("telefone", canonico)
          .maybeSingle();
        const nomeLimpo = /\d/.test(lead?.nome || "") ? "" : (lead?.nome || "").trim();
        const primeiro = nomeLimpo.split(/\s+/)[0] || "tudo bem";
        const t = await enviarTemplateMega(numero, [primeiro]);
        if (!t.ok) {
          console.error("[crm-enviar-whatsapp] template falhou", t.status, t.body.slice(0, 400));
          return json({
            error:
              "Este contato não fala com a gente há mais de 24 horas. O WhatsApp só permite reabrir a conversa com a mensagem aprovada, e o envio dela falhou.",
            status: t.status,
            details: t.body.slice(0, 400),
          }, 502);
        }
        whatsappMessageId = t.messageId;
        avisoTemplate =
          "Como o contato não responde há mais de 24 horas, o WhatsApp só permite tentar a mensagem de reabordagem aprovada. Aguarde a confirmação de entrega exibida na conversa.";
      } else {
        const r = await enviarTextoMega(numero, body.texto!);
        if (!r.ok) {
          console.error("[crm-enviar-whatsapp] falha", r.status, r.body.slice(0, 400));
          return json({ error: "Falha ao enviar pelo WhatsApp", status: r.status, details: r.body.slice(0, 400) }, 502);
        }
        whatsappMessageId = r.messageId;
      }
    } else {
      const r = await enviarMidiaMega(
        numero,
        tipo,
        urlMidia || "",
        String(body.base64).replace(/^data:[^;]+;base64,/, ""),
        body.fileName || (tipo === "audio" ? "audio.webm" : "arquivo"),
        body.mimeType || "application/octet-stream",
        body.texto || "",
      );
      if (!r.ok) {
        console.error("[crm-enviar-whatsapp] mídia falhou", r.status, r.body.slice(0, 400));
        return json({ error: "Falha ao enviar arquivo pelo WhatsApp", status: r.status, details: r.body.slice(0, 400) }, 502);
      }
      whatsappMessageId = r.messageId;
    }

    const registroBase = tipo === "text"
      ? (avisoTemplate
        ? `[Mensagem de reabordagem aprovada enviada — a mensagem digitada não pôde ser enviada fora da janela de 24h]\n${body.texto!.slice(0, 2000)}`
        : body.texto!.slice(0, 5000))
      : `[${tipo === "audio" ? "áudio" : tipo === "image" ? "imagem" : "arquivo"}: ${body.fileName || ""}] ${body.texto || ""}`.trim();

    const registro = urlMidia ? `${registroBase}\n[midia:${tipo}:${urlMidia}]` : registroBase;

    const { error: insertErr } = await supabase.from("interacoes_ia").insert({
      paciente_externo_id: canonico,
      canal: "whatsapp",
      sistema_origem: "crm_manual",
      mensagem_usuario: null,
      resposta_final: registro,
      intencao_detectada: "mensagem_manual",
      estado_conversa: "atendimento_humano",
      supervisionado: true,
      atendente_humano: userData.user.email ?? userData.user.id,
      whatsapp_message_id: whatsappMessageId ?? null,
      whatsapp_status: whatsappMessageId ? "accepted" : "sent",
      whatsapp_erro: null,
    });
    if (insertErr) console.error("[crm-enviar-whatsapp] erro ao salvar histórico", insertErr);

    return json({ ok: true, aviso: avisoTemplate, messageId: whatsappMessageId ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
