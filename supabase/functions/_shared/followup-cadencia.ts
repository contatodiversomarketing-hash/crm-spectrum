// Cadência de reabordagem da Ana: sempre às 17h (Brasília), quando o lead não respondeu.
// Etapa 0 = mesmo dia, 1 = dia seguinte, 2 = 3 dias, 3 = 7 dias. Depois, encerra.

export type EtapaCadencia = {
  etapa: number;
  dias: number;
  template: string;
  texto: (primeiroNome: string) => string;
  corpoTemplate: string;
};

export const CADENCIA_FOLLOWUP: EtapaCadencia[] = [
  {
    etapa: 0,
    dias: 0,
    template: "ana_followup_mesmo_dia",
    corpoTemplate:
      "Olá, {{1}}! Aqui é a Ana, da equipe da Dra. Amélia Carvalho. Acredito que esteja na correria hoje, mas estou passando aqui para saber se você conseguiu ver minha mensagem de hoje. Posso te ajudar com alguma dúvida?",
    texto: (n) =>
      `Olá, ${n}! Aqui é a Ana, da equipe da Dra. Amélia Carvalho. Acredito que esteja na correria hoje, mas estou passando aqui para saber se você conseguiu ver minha mensagem de hoje. Posso te ajudar com alguma dúvida?`,
  },
  {
    etapa: 1,
    dias: 1,
    template: "ana_followup_dia_seguinte",
    corpoTemplate:
      "Olá, {{1}}! Sei que a rotina é corrida. Mas estou aqui para ajudar, e não gostaria que deixasse sua saúde para depois. Por isso gostaria de entender melhor pelo que está passando, tenho certeza que conseguiremos lhe ajudar. Podemos conversar rapidinho?",
    texto: (n) =>
      `Olá, ${n}! Sei que a rotina é corrida 😊 Mas estou aqui para ajudar, e não gostaria que deixasse sua saúde para depois. Por isso gostaria de entender melhor pelo que está passando, tenho certeza que conseguiremos lhe ajudar. Podemos conversar rapidinho?`,
  },
  {
    etapa: 2,
    dias: 3,
    template: "ana_followup_3_dias",
    corpoTemplate:
      "Olá, {{1}}! Muita gente me procura já cansada de não ter respostas sobre TEA, TDAH ou tratamento com cannabis medicinal. Se esse for o seu caso, posso te explicar como funciona a avaliação com a Dra. Amélia.",
    texto: (n) =>
      `Olá, ${n}! Muita gente me procura já cansada de não ter respostas sobre TEA, TDAH ou tratamento com cannabis medicinal. Se esse for o seu caso, posso te explicar como funciona a avaliação com a Dra. Amélia.`,
  },
  {
    etapa: 3,
    dias: 7,
    template: "ana_followup_7_dias",
    corpoTemplate:
      "Olá, {{1}}! Vou encerrar meu acompanhamento por aqui para não te incomodar. Se em algum momento quiser retomar, é só me responder nesta conversa que eu te atendo com prioridade. Um abraço!",
    texto: (n) =>
      `Olá, ${n}! Vou encerrar meu acompanhamento por aqui para não te incomodar. Se em algum momento quiser retomar, é só me responder nesta conversa que eu te atendo com prioridade. Um abraço!`,
  },
];

export const TEMPLATES_CADENCIA = CADENCIA_FOLLOWUP.map((e) => ({
  name: e.template,
  language: "pt_BR",
  category: "MARKETING",
  components: [
    { type: "BODY", text: e.corpoTemplate, example: { body_text: [["Maria"]] } },
    { type: "FOOTER", text: "Responda PARAR para não receber mais mensagens." },
  ],
}));
