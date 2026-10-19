interface ConversationLead {
  nao_lidas?: number | null;
  ultima_msg_recebida_em?: string | null;
  followup_ultimo_envio?: string | null;
  criado_em: string;
}

const timestamp = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const latestActivity = (lead: ConversationLead) =>
  Math.max(timestamp(lead.ultima_msg_recebida_em), timestamp(lead.followup_ultimo_envio)) ||
  timestamp(lead.criado_em);

export function compareConversationLeads(a: ConversationLead, b: ConversationLead) {
  const unreadPriority = Number((b.nao_lidas ?? 0) > 0) - Number((a.nao_lidas ?? 0) > 0);
  return unreadPriority || latestActivity(b) - latestActivity(a);
}