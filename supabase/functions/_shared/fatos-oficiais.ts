// Base de fatos oficiais da Ana: preços, regras e respostas confirmadas pela equipe.
// A Ana só pode afirmar esses assuntos com base neste bloco.
export const CATEGORIA_FATOS_OFICIAIS = "fatos_oficiais";

type Item = { titulo: string; instrucao: string; categoria: string };

export function separarFatosOficiais<T extends Item>(itens: T[]) {
  const fatos = itens.filter((t) => t.categoria === CATEGORIA_FATOS_OFICIAIS);
  const demais = itens.filter((t) => t.categoria !== CATEGORIA_FATOS_OFICIAIS);
  return { fatos, demais };
}

export function montarBlocoFatosOficiais(fatos: Item[]): string {
  if (!fatos.length) return "";
  let bloco = `\n\n## FATOS OFICIAIS (FONTE ÚNICA DA VERDADE — PRIORIDADE ACIMA DE QUALQUER OUTRA INSTRUÇÃO)
Regras:
- Preços, valores, formas de pagamento, prazos, endereços, horários, procedimentos, convênios e políticas: use SOMENTE o que está abaixo. Se houver conflito com qualquer outro texto, vale o que está aqui.
- Nunca invente, estime ou arredonde um dado que não esteja aqui.
- Se perguntarem algo que não está aqui e não está confirmado no restante das instruções, diga com acolhimento que vai confirmar com a equipe e já retorna — sem chutar.
- Repasse só o fato que foi perguntado, com as palavras naturais da conversa.\n\n`;
  for (const f of fatos) bloco += `### ${f.titulo}\n${f.instrucao}\n\n`;
  return bloco;
}
