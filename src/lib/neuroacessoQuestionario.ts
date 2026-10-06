export type Pergunta =
  | { id: string; tipo: "texto"; label: string; longo?: boolean }
  | { id: string; tipo: "tabela"; label?: string; colunas: string[]; linhas: string[]; primeiraColuna: string }
  | { id: string; tipo: "opcoes"; label: string; opcoes: string[] }
  | { id: string; tipo: "aviso"; label: string };

export interface Secao { titulo: string; subtitulo?: string; perguntas: Pergunta[] }

const t = (id: string, label: string, longo = true): Pergunta => ({ id, tipo: "texto", label, longo });

export const QUESTIONARIO_MENTORADA: Secao[] = [
  {
    titulo: "1 · Identificação e agenda",
    perguntas: [
      t("crm", "Nome da médica e CRM/UF", false),
      t("consultorio", "Nome do consultório e município/bairro", false),
      t("contatos", "Contato da médica e da responsável da equipe", false),
      { id: "agenda", tipo: "tabela", label: "Informe três opções que sejam boas para você. Confirmaremos a opção compatível com nossa agenda.", primeiraColuna: "Opção", linhas: ["1", "2", "3"], colunas: ["Dia ou data", "Horário / disponibilidade"] },
    ],
  },
  {
    titulo: "2 · Resultado esperado",
    perguntas: [
      t("resultado", "O que precisa acontecer nos seis meses para você considerar a mentoria valiosa?"),
      t("dificuldade", "Qual é a maior dificuldade hoje?"),
    ],
  },
  {
    titulo: "3 · Perfil do atendimento",
    subtitulo: "Seu consultório e sua equipe",
    perguntas: [
      { id: "perfil", tipo: "tabela", primeiraColuna: "Indicador", colunas: ["Estimativa / descrição"], linhas: ["Consultas por mês", "Crianças e adolescentes acompanhados", "Pacientes com TEA ou outras condições do neurodesenvolvimento", "Atendimento particular / planos / SUS e vínculos", "Região de origem e dificuldade de deslocamento"] },
      t("sus", "Você atua no SUS? Em qual serviço e função? Como mantêm separados os vínculos públicos e privados?"),
    ],
  },
  {
    titulo: "4 · Organização atual",
    perguntas: [
      { id: "organizacao", tipo: "tabela", primeiraColuna: "Função", colunas: ["Nome / responsável", "Como trabalha hoje"], linhas: ["Recepção", "Pós-consulta", "Documentos e orçamentos", "Acompanhamento das famílias"] },
      t("pos_laudo", "Descreva o que acontece hoje depois da entrega do laudo."),
      t("canais", "Quais canais, sistema e horários de atendimento a equipe utiliza?"),
    ],
  },
  {
    titulo: "5 · Acesso efetivo ao tratamento",
    subtitulo: "Necessidades e barreiras das famílias",
    perguntas: [
      t("terapias", "Quais terapias os pacientes precisam e quais conseguem realizar hoje?"),
      { id: "barreiras", tipo: "tabela", primeiraColuna: "Barreira observada", colunas: ["Quantidade estimada / exemplos sem identificação"], linhas: ["Espera no SUS", "Terapia parcialmente disponível", "Negativa ou rede indisponível no plano", "Interrupção por custo ou deslocamento"] },
      t("protocolos", "Existem protocolos, respostas escritas e registros do tempo de espera? Quais?"),
    ],
  },
  {
    titulo: "6 · Relação com a rede local",
    perguntas: [
      t("rede", "Quais serviços públicos, ONGs, associações e instituições você conhece?"),
      t("convite", "Existe convite ou contato autorizado para ações educativas? Com quem?"),
      { id: "aviso6", tipo: "aviso", label: "Ações educativas devem informar sobre avaliação e acesso ao cuidado. Não utilizar cadastros do SUS ou de instituições para direcionar famílias ao consultório privado." },
    ],
  },
  {
    titulo: "7 · Rede terapêutica",
    subtitulo: "Parceiros e modelo de operação",
    perguntas: [
      { id: "parceiros", tipo: "tabela", primeiraColuna: "Área / intervenção", colunas: ["Parceiro / local", "Vaga e valor real"], linhas: ["Psicologia / intervenção comportamental", "Fonoaudiologia", "Terapia ocupacional", "Outras áreas indicadas"] },
      t("habilitacao", "Como verifica habilitação, supervisão, duração das sessões e evolução clínica?"),
    ],
  },
  {
    titulo: "8 · Contratação e faturamento",
    perguntas: [
      { id: "modelo", tipo: "opcoes", label: "Modelo pretendido", opcoes: ["Cada parceiro é contratado diretamente pela família", "Operação integrada por pessoa jurídica", "Ainda precisa ser definido"] },
      t("quem_contrata", "Quem contrata, recebe, emite nota fiscal e responde pela prestação de cada serviço?"),
      t("custos", "Quais custos, impostos, repasses e capacidade precisam ser confirmados?"),
      { id: "aviso8", tipo: "aviso", label: "As propostas devem apresentar serviços realmente executáveis e preços próprios. No modelo de contratação direta, a receita das terapias pertence aos parceiros." },
    ],
  },
  {
    titulo: "Ficha de casos para análise",
    subtitulo: "Até três casos. Use apenas códigos. A escolha para análise não significa indicação automática de ação judicial.",
    perguntas: [
      { id: "casos", tipo: "tabela", primeiraColuna: "Informação", colunas: ["Caso 1", "Caso 2", "Caso 3"], linhas: ["Código / idade / município", "Condição e necessidades clínicas conhecidas", "Terapias indicadas: área, frequência e duração", "Atendimento efetivo hoje", "Data da solicitação no SUS ou plano / protocolo", "Serviço procurado / resposta / previsão", "Negativa escrita ou verbal: data e fonte", "Tempo sem atendimento / atendimento parcial", "Prejuízos observados pela médica", "Documentos disponíveis e pendentes", "Representante jurídico consultado? Próximo passo?", "Preferências da família e prestadores considerados", "Próxima ação / responsável / prazo"] },
      { id: "aviso_casos", tipo: "aviso", label: "Distinguir achado clínico, documento e relato da família. Se a negativa foi verbal, registrar como relato. Não criar evidências nem afirmar inexistência de serviço sem verificar a oferta local." },
    ],
  },
  {
    titulo: "9 · Plano dos primeiros sete dias",
    perguntas: [
      { id: "entregas", tipo: "tabela", primeiraColuna: "Entrega", colunas: ["Responsável", "Prazo / status"], linhas: ["Mapear até dez pacientes já acompanhados com barreiras de acesso", "Selecionar até três casos e preencher as fichas", "Nomear responsável pela jornada das famílias", "Levantar parceiros, vagas, custos e faturamento", "Buscar orientações locais sobre orçamentos"] },
    ],
  },
  {
    titulo: "10 · Pesquisa sobre orçamentos em Petrópolis",
    subtitulo: "Buscar orientações públicas no fórum. Confirmar com advogado ou Defensoria quais exigências se aplicam ao caso e à fase processual; não presumir que três propostas sejam obrigatórias em todos os pedidos.",
    perguntas: [
      t("unidade", "Unidade, canal, data e pessoa/setor consultado", false),
      t("qtd_propostas", "Quantidade de propostas para instrução do pedido", false),
      t("exigencias", "Exigências para bloqueio, liberação e cumprimento"),
      t("atualizacao", "É necessária atualização? Como comparar itens e duração?"),
      t("orientacao", "Orientação confirmada pelo representante jurídico / pendências"),
      t("proximo", "Próximo encontro: data, participantes e principal caso a trabalhar"),
    ],
  },
];
