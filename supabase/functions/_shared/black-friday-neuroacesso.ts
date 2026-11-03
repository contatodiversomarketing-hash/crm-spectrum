export const BLACK_FRIDAY_NAME = "black_friday_neuroacesso_2026";
export const BLACK_FRIDAY_TEXT = `BLACK FRIDAY NEUROACESSO — APENAS 15 VAGAS

Olá! Aqui é o Luca, da equipe da Dra. Amélia Carvalho.

Quantas famílias procuram sua clínica, mas não conseguem manter o tratamento dos filhos por falta de recursos? E quanto sua operação ainda depende dos atendimentos particulares e das condições impostas pelos planos de saúde?

O Método NeuroAcesso conecta essas duas necessidades: ajudar famílias de crianças com autismo e outros transtornos do neurodesenvolvimento a buscar acesso ao tratamento pela judicialização e estruturar uma nova frente de receita para sua clínica, reduzindo a dependência exclusiva de particulares e convênios.

São 6 meses de acompanhamento, com encontros individuais com a Dra. Amélia, suporte pelo WhatsApp, modelos de laudos e relatórios, orientação para organizar os casos e treinamentos para sua equipe.

Mais acesso para as famílias. Mais organização e possibilidades de crescimento para sua clínica, respeitando a indicação clínica e as particularidades de cada processo.

Nesta Black Friday, a oferta está limitada a 15 vagas.

Quer conhecer a condição especial e entender como o Método se aplica à sua clínica? Responda “QUERO NEUROACESSO” que eu te explico por aqui.`;

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