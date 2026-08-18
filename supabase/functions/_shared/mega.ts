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
  if (!resp.ok) console.error(`[mega] envio falhou [${resp.status}]: ${body.slice(0, 400)}`);
  return { ok: resp.ok, status: resp.status, body };
}
