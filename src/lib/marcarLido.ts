import { supabase } from "@/integrations/supabase/client";

/** Zera o contador de mensagens não lidas do lead com este telefone. */
export async function marcarLeadComoLido(telefone?: string | null) {
  const d = (telefone || "").replace(/\D/g, "");
  if (d.length < 8) return;
  await supabase.from("leads").update({ nao_lidas: 0 }).ilike("telefone", `%${d.slice(-8)}`).gt("nao_lidas", 0);
}
