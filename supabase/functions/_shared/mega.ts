// Camada única de envio de WhatsApp da Ana.
// Provedor padrão: DatafyAPI (API OFICIAL do Meta / Cloud API, proxy transparente).
// Fallback legado: MegaAPI (não oficial) — usado apenas se a Datafy não estiver configurada.

export function datafyConfig() {
  const DEFAULT_BASE = "https://cloud.datafyapi.com.br/v1";
  let url = (Deno.env.get("DATAFY_API_URL") || "").trim();
  const token = Deno.env.get("DATAFY_API_TOKEN") || "";
  const phoneNumberId = Deno.env.get("DATAFY_INSTANCE_ID") || "";

  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Ignora links de painel/onboarding colados por engano (ex.: /connect?t=...)
  if (!url || /\?|\/connect/i.test(url) || /app\.datafyapi/i.test(url)) url = DEFAULT_BASE;
  url = url.replace(/\/+$/, "");
  // Aceita host puro (sem /v1) ou URL já com versão.
  if (!/\/v\d+$/i.test(url)) url = `${url}/v1`;


  return { base: url, token, phoneNumberId, configurado: Boolean(url && token && phoneNumberId) };
}

export function megaConfig() {
  let url = Deno.env.get("MEGA_API_URL") || "";
  const token = Deno.env.get("MEGA_API_TOKEN") || "";
  let instanceKey = Deno.env.get("MEGA_INSTANCE_KEY") || "";

  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "");

  const match = url.match(/\/rest\/sendMessage\/([^/]+)/);
  if (match && !instanceKey) instanceKey = match[1];

  let origin = url;
  try {
    origin = new URL(url).origin;
  } catch {
    /* mantém url */
  }

  return { origin, token, instanceKey, configurado: Boolean(origin && token && instanceKey) };
}

export function provedorAtivo(): "datafy" | "mega" | "nenhum" {
  if (datafyConfig().configurado) return "datafy";
  if (megaConfig().configurado) return "mega";
  return "nenhum";
}

// Normaliza para o formato E.164 sem "+" (ex.: 5532998034423)
export function numeroE164(numero: string): string {
  let n = (numero || "").replace(/\D/g, "");
  if (!n.startsWith("55") && (n.length === 10 || n.length === 11)) n = `55${n}`;
  return n;
}

type Resultado = { ok: boolean; status: number; body: string; messageId?: string };

async function datafyPost(payload: Record<string, unknown>): Promise<Resultado> {
  const { base, token, phoneNumberId } = datafyConfig();
  const resp = await fetch(`${base}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
  });
  const body = await resp.text();
  let erroLogico = false;
  let messageId: string | undefined;
  try {
    const parsed = JSON.parse(body);
    erroLogico = Boolean(parsed?.error);
    messageId = parsed?.messages?.[0]?.id || parsed?.data?.messages?.[0]?.id || parsed?.message_id || parsed?.id;
  } catch { /* corpo não-JSON */ }
  const ok = resp.ok && !erroLogico;
  if (!ok) console.error(`[datafy] envio falhou [${resp.status}]: ${body.slice(0, 400)}`);
  return { ok, status: resp.status, body, messageId };
}

// Na API oficial não existe "sessão" que cai: se o token e o número estiverem
// configurados, a conexão está sempre disponível.
export async function instanciaConectada(): Promise<{ conectada: boolean; status: string }> {
  const datafy = datafyConfig();
  if (datafy.configurado) {
    try {
      const r = await fetch(`${datafy.base}/${datafy.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${datafy.token}` },
      });
      if (r.ok) return { conectada: true, status: "connected" };
      const txt = (await r.text()).slice(0, 120);
      // Alguns proxies não expõem GET do número; isso não impede o envio.
      if (r.status === 404 || r.status === 405) return { conectada: true, status: "connected" };
      return { conectada: false, status: `erro_${r.status}:${txt}` };
    } catch (e) {
      return { conectada: false, status: `erro:${String(e).slice(0, 60)}` };
    }
  }

  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { conectada: false, status: "nao_configurada" };
  try {
    const r = await fetch(`${origin}/rest/instance/${instanceKey}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    const body = await r.text();
    const status = JSON.parse(body)?.instance?.status ?? "desconhecido";
    return { conectada: status === "connected", status };
  } catch (e) {
    return { conectada: false, status: `erro:${String(e).slice(0, 60)}` };
  }
}

export async function instanciaMegaConectada(): Promise<{ conectada: boolean; status: string }> {
  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { conectada: false, status: "nao_configurada" };
  try {
    const r = await fetch(`${origin}/rest/instance/${instanceKey}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    const body = await r.text();
    if (!r.ok) return { conectada: false, status: `erro_${r.status}:${body.slice(0, 120)}` };
    const status = JSON.parse(body)?.instance?.status ?? "desconhecido";
    return { conectada: status === "connected", status };
  } catch (e) {
    return { conectada: false, status: `erro:${String(e).slice(0, 60)}` };
  }
}

export async function enviarTextoMega(numero: string, texto: string): Promise<Resultado> {
  const destino = numeroE164(numero);

  if (datafyConfig().configurado) {
    return await datafyPost({
      to: destino,
      type: "text",
      text: { preview_url: true, body: texto },
    });
  }

  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { ok: false, status: 0, body: "WhatsApp não configurado" };

  const resp = await fetch(`${origin}/rest/sendMessage/${instanceKey}/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
    body: JSON.stringify({ messageData: { to: `${destino}@s.whatsapp.net`, text: texto } }),
  });

  const body = await resp.text();
  let erroLogico = false;
  try {
    erroLogico = JSON.parse(body)?.error === true;
  } catch { /* corpo não-JSON */ }

  const ok = resp.ok && !erroLogico;
  if (!ok) console.error(`[mega] envio falhou [${resp.status}]: ${body.slice(0, 400)}`);
  return { ok, status: resp.status, body };
}

export async function enviarMidiaMega(
  numero: string,
  tipo: "image" | "document" | "audio",
  url: string,
  base64: string,
  fileName: string,
  mimeType: string,
  caption = "",
): Promise<Resultado> {
  const destino = numeroE164(numero);
  if (datafyConfig().configurado) {
    const conteudo = tipo === "image"
      ? { link: url, caption }
      : tipo === "document"
      ? { link: url, filename: fileName, caption }
      : { link: url };
    return await datafyPost({ to: destino, type: tipo, [tipo]: conteudo });
  }

  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { ok: false, status: 0, body: "WhatsApp não configurado" };
  const resp = await fetch(`${origin}/rest/sendMessage/${instanceKey}/mediaBase64`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: token },
    body: JSON.stringify({
      messageData: {
        to: `${destino}@s.whatsapp.net`,
        base64,
        fileName,
        type: tipo,
        mimeType,
        caption,
      },
    }),
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

// Envio de TEMPLATE aprovado (obrigatório na API oficial para reabordar quem
// não fala com a gente há mais de 24h). Se não houver template configurado ou
// o provedor for a MegaAPI (não oficial), cai para texto livre.
export async function enviarTemplateMega(
  numero: string,
  parametros: string[] = [],
): Promise<Resultado & { usouTemplate: boolean }> {
  const destino = numeroE164(numero);
  const nome = (Deno.env.get("WHATSAPP_TEMPLATE_NOME") || "").trim();
  const idioma = (Deno.env.get("WHATSAPP_TEMPLATE_IDIOMA") || "pt_BR").trim();

  if (!nome || !datafyConfig().configurado) {
    return { ok: false, status: 0, body: "template_nao_configurado", usouTemplate: false };
  }

  const components = parametros.length
    ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t })) }]
    : [];

  const r = await datafyPost({
    to: destino,
    type: "template",
    template: { name: nome, language: { code: idioma }, ...(components.length ? { components } : {}) },
  });
  return { ...r, usouTemplate: true };
}

// Envia um template aprovado específico (pelo nome), usado na cadência de follow-up.
export async function enviarTemplateNomeado(
  numero: string,
  nomeTemplate: string,
  parametros: string[] = [],
  idiomaPadrao = "pt_BR",
): Promise<Resultado & { usouTemplate: boolean }> {
  const destino = numeroE164(numero);
  if (!nomeTemplate || !datafyConfig().configurado) {
    return { ok: false, status: 0, body: "template_nao_configurado", usouTemplate: false };
  }
  const components = parametros.length
    ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t })) }]
    : [];
  const r = await datafyPost({
    to: destino,
    type: "template",
    template: {
      name: nomeTemplate,
      language: { code: idiomaPadrao },
      ...(components.length ? { components } : {}),
    },
  });
  return { ...r, usouTemplate: true };
}

// Verifica se o lead falou com a gente nas últimas 24h (janela livre do Meta).
export function dentroDaJanela24h(ultimaMensagemDoCliente?: string | null): boolean {
  if (!ultimaMensagemDoCliente) return false;
  return Date.now() - new Date(ultimaMensagemDoCliente).getTime() < 24 * 3600000;
}

export const NEUROACESSO_PDF_URL =
  "https://uftdsoqhyiqhxvckqxnp.supabase.co/storage/v1/object/public/treinamento-arquivos/materiais%2FMetodo_NeuroAcesso.pdf";

export const PIX_QRCODE_PDF_URL =
  "https://uftdsoqhyiqhxvckqxnp.supabase.co/storage/v1/object/public/treinamento-arquivos/materiais%2FQRCode_Pix_Consulta.pdf";

export const PIX_CHAVE = "consultasdraameliacarvalho@gmail.com";

export async function enviarDocumentoMega(
  numero: string,
  url: string,
  fileName: string,
  caption = "",
): Promise<Resultado> {
  const destino = numeroE164(numero);

  if (datafyConfig().configurado) {
    return await datafyPost({
      to: destino,
      type: "document",
      document: { link: url, filename: fileName, caption },
    });
  }

  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { ok: false, status: 0, body: "WhatsApp não configurado" };

  const resp = await fetch(`${origin}/rest/sendMessage/${instanceKey}/document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
    body: JSON.stringify({
      messageData: {
        to: `${destino}@s.whatsapp.net`,
        url,
        fileName,
        caption,
        type: "document",
        mimeType: "application/pdf",
        docName: fileName,
      },
    }),
  });

  const body = await resp.text();
  let erroLogico = false;
  try {
    erroLogico = JSON.parse(body)?.error === true;
  } catch { /* corpo não-JSON */ }

  const ok = resp.ok && !erroLogico;
  if (!ok) console.error(`[mega] envio de documento falhou [${resp.status}]: ${body.slice(0, 400)}`);
  return { ok, status: resp.status, body };
}

// Baixa uma mídia recebida pela Cloud API (media id) e devolve em base64.
export async function baixarMidiaDatafy(mediaId: string): Promise<{ base64: string; mimetype: string } | null> {
  const { base, token, phoneNumberId, configurado } = datafyConfig();
  if (!configurado || !mediaId) return null;

  const auth = { Authorization: `Bearer ${token}` };

  const paraBase64 = async (resp: Response, mimeFallback: string) => {
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length < 100) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 8192) {
      bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    }
    const mime = (resp.headers.get("content-type") || mimeFallback || "application/octet-stream").split(";")[0].trim();
    return { base64: btoa(bin), mimetype: mime };
  };

  try {
    // 1) Metadados / possíveis endpoints que já devolvem o binário ou base64
    const tentativas = [
      `${base}/${mediaId}?phone_number_id=${phoneNumberId}`,
      `${base}/${mediaId}`,
      `${base}/${phoneNumberId}/media/${mediaId}`,
      `${base}/media/${mediaId}`,
      `${base}/${mediaId}/download`,
      `${base}/media/${mediaId}/download`,
    ];

    let meta: any = null;
    for (const url of tentativas) {
      const r = await fetch(url, { headers: auth });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok) {
        console.error(`[datafy] metadados de mídia falharam [${r.status}] em ${url}`);
        continue;
      }
      // Endpoint devolveu o arquivo direto
      if (!ct.includes("json")) {
        const direto = await paraBase64(r, "");
        if (direto) {
          console.log(`[datafy] mídia baixada direto em ${url} (${direto.base64.length} chars)`);
          return direto;
        }
        continue;
      }
      const j = await r.json().catch(() => null);
      const b64 = j?.base64 || j?.data?.base64;
      if (typeof b64 === "string" && b64.length > 100) {
        return {
          base64: b64.replace(/^data:[^;]+;base64,/, ""),
          mimetype: j?.mime_type || j?.data?.mime_type || "application/octet-stream",
        };
      }
      if (j?.url || j?.data?.url) {
        meta = j.url ? j : j.data;
        break;
      }
    }

    if (!meta?.url) {
      console.error("[datafy] nenhum endpoint retornou URL da mídia");
      return null;
    }

    // 2) Baixar o binário. A URL da Meta (lookaside) exige o token; proxies
    // pré-assinados recusam o header. Tentamos as variantes conhecidas.
    const variantes: Array<{ nome: string; init: RequestInit }> = [
      { nome: "bearer", init: { headers: auth } },
      { nome: "sem-auth", init: {} },
      { nome: "apikey", init: { headers: { apikey: token, "x-api-key": token } } },
      { nome: "bearer+ua", init: { headers: { ...auth, "User-Agent": "curl/8.4.0" } } },
    ];

    for (const v of variantes) {
      const resp = await fetch(meta.url, v.init);
      if (!resp.ok) {
        const corpo = await resp.text().catch(() => "");
        console.error(`[datafy] download (${v.nome}) falhou [${resp.status}]: ${corpo.slice(0, 200)}`);
        continue;
      }
      const dados = await paraBase64(resp, meta.mime_type || "");
      if (dados) {
        console.log(`[datafy] mídia baixada via ${v.nome} (${dados.base64.length} chars)`);
        return dados;
      }
    }

    // 3) Último recurso: pedir o binário ao proxy da Datafy passando a URL da Meta
    const proxy = `${base}/media/download?url=${encodeURIComponent(meta.url)}`;
    const rp = await fetch(proxy, { headers: auth });
    if (rp.ok) {
      const dados = await paraBase64(rp, meta.mime_type || "");
      if (dados) {
        console.log(`[datafy] mídia baixada via proxy (${dados.base64.length} chars)`);
        return dados;
      }
    }

    console.error("[datafy] todas as tentativas de download de mídia falharam");
    return null;
  } catch (e) {
    console.error("[datafy] erro ao baixar mídia:", e);
    return null;
  }
}

