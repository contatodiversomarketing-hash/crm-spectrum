export interface EtiquetaDef {
  chave: string;
  nome: string;
  grupo: "Para quem" | "Condição" | "Interesse" | "Personalizadas";
  classe: string;
}

/** Catálogo fixo de etiquetas do CRM (usado pela equipe e pela Ana). */
export const ETIQUETAS: EtiquetaDef[] = [
  { chave: "para_ele", nome: "Para ele(a)", grupo: "Para quem", classe: "bg-primary/15 text-primary border-primary/30" },
  { chave: "para_filho", nome: "Para o filho(a)", grupo: "Para quem", classe: "bg-secondary/20 text-secondary-foreground border-secondary/40" },
  { chave: "para_ambos", nome: "Para ele(a) e o filho(a)", grupo: "Para quem", classe: "bg-accent/30 text-accent-foreground border-accent" },
  { chave: "tea", nome: "TEA", grupo: "Condição", classe: "bg-primary/10 text-primary border-primary/25" },
  { chave: "tdah", nome: "TDAH", grupo: "Condição", classe: "bg-secondary/15 text-secondary-foreground border-secondary/30" },
  { chave: "outro", nome: "Outro quadro", grupo: "Condição", classe: "bg-muted text-muted-foreground border-border" },
  { chave: "cannabis", nome: "Cannabis medicinal", grupo: "Interesse", classe: "bg-primary/20 text-primary border-primary/40" },
  { chave: "neuroacesso", nome: "NeuroAcesso (médico)", grupo: "Interesse", classe: "bg-secondary/25 text-secondary-foreground border-secondary/50" },
];

export const ETIQUETAS_VALIDAS = ETIQUETAS.map((e) => e.chave);

export function getEtiqueta(chave: string): EtiquetaDef {
  return (
    ETIQUETAS.find((e) => e.chave === chave) || {
      chave,
      nome: chave,
      grupo: "Interesse",
      classe: "bg-muted text-muted-foreground border-border",
    }
  );
}

export const GRUPOS_ETIQUETAS: EtiquetaDef["grupo"][] = ["Para quem", "Condição", "Interesse"];
