export interface CRMColumn {
  chave: string;
  nome: string;
  ordem: number;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function conversationColumn(columns: CRMColumn[]) {
  return columns.find((c) => /conversas? iniciadas?/.test(normalize(c.nome))) ||
    columns.find((c) => /conversando|respondeu|respondido/.test(normalize(c.nome))) ||
    columns.find((c) => normalize(c.nome) === "em contato");
}

export function replyStage(current: string, columns: CRMColumn[]): string | null {
  const target = conversationColumn(columns);
  const column = columns.find((c) => c.chave === current);
  if (!column) return target?.chave ?? columns[0]?.chave ?? null;
  const waiting = /^(novo|primeiro_contato|nao_responde|leads_para_resgate|mensagem_inicio|aguardando_resposta|follow|folow|hoje|parou_de_responder|liguei_e_nao_atendeu)/.test(current);
  return waiting && target ? target.chave : column.chave;
}

export function extractedStage(current: string, proposed: string, columns: CRMColumn[]): string | null {
  const existing = columns.find((c) => c.chave === current);
  const target = columns.find((c) => c.chave === proposed) ||
    (proposed === "em_contato" ? conversationColumn(columns) : undefined);
  if (!existing) return replyStage(current, columns);
  if (!target) return existing.chave;
  return proposed === "perdido" || target.ordem > existing.ordem ? target.chave : existing.chave;
}