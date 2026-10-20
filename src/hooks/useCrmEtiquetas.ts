import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ETIQUETAS, type EtiquetaDef } from "@/lib/etiquetas";

export const LABEL_COLORS = {
  primary: "bg-primary/15 text-primary border-primary/30",
  secondary: "bg-secondary/20 text-secondary-foreground border-secondary/40",
  accent: "bg-accent/30 text-accent-foreground border-accent",
  muted: "bg-muted text-muted-foreground border-border",
};
export type LabelColor = keyof typeof LABEL_COLORS;

export function useCrmEtiquetas() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["crm-etiquetas"],
    staleTime: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_etiquetas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
  const custom: EtiquetaDef[] = (query.data ?? []).map((row) => ({
    chave: row.id, nome: row.nome, grupo: "Personalizadas", classe: LABEL_COLORS[row.cor as LabelColor] ?? LABEL_COLORS.muted,
  }));
  return { catalog: [...ETIQUETAS, ...custom], error: query.error, refresh: () => client.invalidateQueries({ queryKey: ["crm-etiquetas"] }) };
}