import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bytes = new Uint8Array([79, 103, 103, 83, 1, 2, 3, 4]);
  const raw = await fetch(`${url}/storage/v1/object/audio/recebidos/teste.ogg`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "audio/ogg", "x-upsert": "true" }, body: bytes });
  const rawTxt = `${raw.status} ${(await raw.text()).slice(0, 200)}`;
  const sb = createClient(url, key);
  const { error } = await sb.storage.from("audio").upload("recebidos/teste2.ogg", bytes, { contentType: "audio/ogg", upsert: true });
  return new Response(JSON.stringify({ rawTxt, js: error?.message ?? "ok" }));
});
