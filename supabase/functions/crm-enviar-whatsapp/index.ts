import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarTextoMega, enviarTemplateMega, enviarMidiaMega } from "../_shared/mega.ts";
import { telCanonico } from "../_shared/dedup.ts";

type Body = {
  numero?: string;
  tipo?: "text" | "image" | "document" | "audio";
  texto?: string;
  base64?: string;
  fileName?: string;
  mimeType?: string;
  leadId?: string;
  confirmarTemplate?: boolean;
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
    if (tipo === "audio" && !/audio\/(mpeg|ogg|aac|amr)/i.test(body.mimeType || "")) {
      return json({ error: "Versão antiga da plataforma: atualize a página (F5) e grave o áudio novamente para ele chegar no WhatsApp." }, 400);
    }

    const canonico = telCanonico(numero) || numero;

    // Envio manual: tenta sempre o texto digitado. Para contatos novos ou fora
    // da janela livre, abre automaticamente a conversa com o template aprovado.


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

    const enviarTemplateAprovado = async () => {
      const { data: lead } = await supabase
        .from("leads")
        .select("nome")
        .eq("telefone", canonico)
        .maybeSingle();
      const nomeLimpo = /\d/.test(lead?.nome || "") ? "" : (lead?.nome || "").trim();
      const primeiro = nomeLimpo.split(/\s+/)[0] || "tudo bem";
      return await enviarTemplateMega(numero, [primeiro]);
    };

    // Texto: sempre pela camada única (API oficial Meta/Datafy com fallback MegaAPI)
    if (tipo === "text") {
      if (body.confirmarTemplate) {
        const t = await enviarTemplateAprovado();
        if (!t.ok) {
          console.error("[crm-enviar-whatsapp] template falhou", t.status, t.body.slice(0, 400));
          return json({
            error: "O WhatsApp recusou a mensagem de reabordagem aprovada para este contato.",
            status: t.status,
            details: t.body.slice(0, 400),
          }, 502);
        }
        whatsappMessageId = t.messageId;
        avisoTemplate = "Mensagem de reabordagem aprovada enviada.";
      } else {
      // O WhatsApp recusa textos com mais de 4096 caracteres: quebramos em partes.
      const partes: string[] = [];
      const textoCompleto = body.texto!;
      const LIMITE = 3900;
      if (textoCompleto.length <= LIMITE) {
        partes.push(textoCompleto);
      } else {
        let restante = textoCompleto;
        while (restante.length > 0) {
          if (restante.length <= LIMITE) { partes.push(restante); break; }
          let corte = restante.lastIndexOf("\n", LIMITE);
          if (corte < LIMITE * 0.5) corte = restante.lastIndexOf(" ", LIMITE);
          if (corte < LIMITE * 0.5) corte = LIMITE;
          partes.push(restante.slice(0, corte).trim());
          restante = restante.slice(corte).trim();
        }
      }

      // Erro 131000 ("Something went wrong") e 5xx da Meta são temporários: tenta de novo.
      const enviarComRetry = async (destino: string, texto: string) => {
        let r = await enviarTextoMega(destino, texto);
        for (let t = 1; t <= 4 && !r.ok && (r.status >= 500 || /131000|something went wrong/i.test(r.body)); t++) {
          await new Promise((res) => setTimeout(res, 2000 * t));
          r = await enviarTextoMega(destino, texto);
        }
        return r;
      };

      const enviarPartes = async (destino: string) => {
        let ultimo = await enviarComRetry(destino, partes[0]);
        if (!ultimo.ok) return ultimo;
        for (let i = 1; i < partes.length; i++) {
          const parcial = await enviarComRetry(destino, partes[i]);
          if (!parcial.ok) return parcial;
          ultimo = parcial;
        }
        return ultimo;
      };

      let r = await enviarPartes(numero);
      // A Meta identifica muitos números brasileiros SEM o nono dígito (ex.: 554299927826).
      // Se falhar, tenta a outra variante (com/sem o 9) antes de desistir.
      if (!r.ok && !/131047|24 hour|re-?engagement/i.test(r.body)) {
        const local = numero.startsWith("55") ? numero.slice(2) : numero;
        let alternativo: string | null = null;
        if (local.length === 10) alternativo = `55${local.slice(0, 2)}9${local.slice(2)}`;
        else if (local.length === 11 && local[2] === "9") alternativo = `55${local.slice(0, 2)}${local.slice(3)}`;
        if (alternativo) {
          const r2 = await enviarPartes(alternativo);
          if (r2.ok) r = r2;
        }
      }

      if (r.ok) {
        whatsappMessageId = r.messageId;
      } else {
        console.error("[crm-enviar-whatsapp] texto recusado", r.status, r.body.slice(0, 400));
        const foraJanela = /131047|24 hour|re-?engagement/i.test(r.body);
        if (!foraJanela) {
          const instavel = /131000|something went wrong/i.test(r.body) || r.status >= 500;
          return json({
            error: instavel
              ? "O WhatsApp está instável neste momento e não aceitou a mensagem. Seu texto foi mantido — aguarde alguns segundos e clique em enviar de novo."
              : "Falha ao enviar pelo WhatsApp",
            status: r.status,
            details: r.body.slice(0, 400),
          }, 502);
        }
        // Contatos novos também começam fora da janela livre. Nesse caso o
        // WhatsApp exige um template aprovado para iniciar a conversa.
        const t = await enviarTemplateAprovado();
        if (!t.ok) {
          console.error("[crm-enviar-whatsapp] template falhou", t.status, t.body.slice(0, 400));
          return json({
            error: "O WhatsApp recusou a mensagem de reabordagem aprovada para este contato.",
            status: t.status,
            details: t.body.slice(0, 400),
          }, 502);
        }
        whatsappMessageId = t.messageId;
        avisoTemplate = "Mensagem inicial aprovada enviada. O texto digitado foi mantido como rascunho para você enviar quando o cliente responder.";
      }
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
        ? "Olá! Aqui é a Ana, consultora comercial. Trabalho com a Dra. Amélia Carvalho, especialista em neurodesenvolvimento (TEA, TDAH e cannabis medicinal). Vi que você buscou informações com a gente e queria entender como posso te ajudar hoje. Podemos conversar?"
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
