export const ESPERA_ATENDIMENTO_MS = 2 * 60 * 60 * 1000;
export const TEXTO_AVISO_ESPERA = "Aqui é a Ana, da equipe da Dra. Amélia. Peço desculpas pela demora 💚 Estamos com uma alta demanda de atendimentos, mas em breve um atendente entrará em contato com você.";

export function avisoEstaVencido(inicio: string, agora: number) {
  const data = Date.parse(inicio);
  return Number.isFinite(data) && agora - data > ESPERA_ATENDIMENTO_MS;
}

export function respostaHumanaValida(interacao: {
  resposta_final?: string | null;
  atendente_humano?: string | null;
  sistema_origem?: string | null;
  whatsapp_status?: string | null;
}) {
  return Boolean(interacao.resposta_final?.trim()) &&
    Boolean(interacao.atendente_humano || ["crm_manual", "whatsapp_echo"].includes(interacao.sistema_origem ?? "")) &&
    !["failed", "error", "pending"].includes(interacao.whatsapp_status ?? "");
}