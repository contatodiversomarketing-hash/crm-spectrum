export const BLACK_FRIDAY_NAME = "black_friday_neuroacesso_2026";
export const BLACK_FRIDAY_PIPELINE = "PLANO NEUROACESSO";
export function campaignPlacement(existing: { pipeline_id?: string; status_pipeline?: string } | null, pipelineId: string) {
  return { pipeline_id: pipelineId, status_pipeline: existing?.pipeline_id === pipelineId ? (existing.status_pipeline || "novo") : "novo" };
}
export const BLACK_FRIDAY_TEXT = `BLACK FRIDAY NEUROACESSO — APENAS 15 VAGAS

Olá! Aqui é o Luca, da equipe da Dra. Amélia Carvalho.

Sua clínica recebe famílias que não conseguem manter o tratamento dos filhos por falta de recursos?

O Método NeuroAcesso orienta sua clínica a organizar casos de crianças com autismo e outros transtornos do neurodesenvolvimento para buscar acesso ao tratamento pela judicialização, respeitando a indicação clínica e cada processo.

Também ajuda a estruturar uma nova frente de receita, reduzindo a dependência exclusiva de particulares e convênios.

São 6 meses de acompanhamento: encontros individuais com a Dra. Amélia, suporte pelo WhatsApp, modelos de laudos e relatórios e treinamentos para sua equipe.

Nesta Black Friday, são apenas 15 vagas.

Quer conhecer a condição especial para sua clínica? Responda “QUERO NEUROACESSO”.

Para não receber novas mensagens, responda PARAR.`;

export const BLACK_FRIDAY_TEMPLATE = {
  name: BLACK_FRIDAY_NAME,
  language: "pt_BR",
  category: "MARKETING",
  components: [{ type: "BODY", text: BLACK_FRIDAY_TEXT }],
};

export function campaignCanSend(status: string, consent: boolean): boolean {
  return status === "APPROVED" && consent === true;
}

export function findBlackFridayTemplate(data: { data?: Array<{ name?: string; language?: string; status?: string; components?: Array<{ type?: string; text?: string }> }> }): string {
  const template = data.data?.find((t) => t.name === BLACK_FRIDAY_NAME && t.language === "pt_BR");
  if (!template) return "NOT_CREATED";
  if (template.components?.find((c) => c.type === "BODY")?.text !== BLACK_FRIDAY_TEXT) return "TEXT_MISMATCH";
  return template.status || "UNKNOWN";
}