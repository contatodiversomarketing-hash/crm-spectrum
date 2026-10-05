import { baixarMidiaDatafy } from "../_shared/mega.ts";
import { transcreverAudioIA } from "../_shared/midia-ia.ts";
Deno.serve(async (req) => {
  const { id } = await req.json();
  const r = await baixarMidiaDatafy(id);
  let head = "";
  if (r) { const b = atob(r.base64.slice(0, 40)); head = [...b].slice(0, 12).map((c) => c.charCodeAt(0).toString(16)).join(" "); }
  const t = r ? await transcreverAudioIA(r.base64, r.mimetype) : null;
  return new Response(JSON.stringify({ ok: !!r, mime: r?.mimetype, len: r?.base64.length, head, t }));
});
