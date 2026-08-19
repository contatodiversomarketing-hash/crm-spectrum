// Helper único de envio de texto pela MegaAPI (instância da Ana).
// Aceita MEGA_API_URL como host (https://apinocodeXX.megaapi.com.br) ou como URL completa.

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

export async function enviarTextoMega(numero: string, texto: string): Promise<{ ok: boolean; status: number; body: string }> {
  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { ok: false, status: 0, body: "MEGA_API não configurada" };

  const destino = numero.replace(/\D/g, "");
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

  // A MegaAPI pode responder HTTP 200 com { "error": true } — isso NÃO é envio entregue.
  let erroLogico = false;
  try {
    const parsed = JSON.parse(body);
    erroLogico = parsed?.error === true;
  } catch {
    /* corpo não-JSON */
  }

  const ok = resp.ok && !erroLogico;
  if (!ok) console.error(`[mega] envio falhou [${resp.status}]: ${body.slice(0, 400)}`);
  return { ok, status: resp.status, body };
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
): Promise<{ ok: boolean; status: number; body: string }> {
  const { origin, token, instanceKey, configurado } = megaConfig();
  if (!configurado) return { ok: false, status: 0, body: "MEGA_API não configurada" };

  const destino = numero.replace(/\D/g, "");
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
