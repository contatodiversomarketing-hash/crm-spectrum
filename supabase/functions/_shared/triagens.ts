// ============================================================
// TRIAGENS (QUIZZES) — Dra. Amélia Carvalho
// Base: documentação "Pontuação dos Quizzes" (atualizada 18/08/2026)
// Usada para leitura dos leads vindos da planilha do Google Sheets
// ============================================================

export type Triagem = Record<string, any>;

export interface InterpretacaoTriagem {
  quiz: string;
  nomeQuiz: string;
  badge: string | null;
  severidade: number | null;
  severidadeMax: number | null;
  perfil: string | null;
  somaTdah?: number | null;
  somaTea?: number | null;
  prontidao: string | null;
  leadPrioritario: boolean;
  nivelPrioridade: 1 | 2 | 3 | 4;
  nomePrioridade: string;
  acao: string;
  resumo: string;
}

const NOMES_QUIZ: Record<string, string> = {
  termometro: "Termômetro da Sobrecarga Materna (mãe de criança atípica)",
  crianca: "Ponto de Partida (sinais de TDAH/TOD e TEA na criança)",
  adulto: "Ponto de Partida Adulto (sinais de TDAH e TEA no próprio adulto)",
  cannabis: "Quiz de Cannabis Medicinal (interesse/elegibilidade ao tema)",
  "neuroacesso-medicos": "NeuroAcesso (pesquisa com médicos — gaps de encaminhamento)",
};

const PRONTIDAO_LEITURA: Record<string, string> = {
  nunca_busquei:
    "Nunca considerou ajuda formal — precisa de mais acolhimento e normalização antes de propor agendamento.",
  pensei_nao_fui:
    "Já pensou em buscar ajuda e não foi — prontidão média/alta, responde bem a um empurrão gentil e concreto (horário disponível).",
  busquei_nao_continuei:
    "Já tentou antes e não seguiu — investigar o motivo (custo, tempo, não se identificou com o profissional) antes de reagendar.",
  em_acompanhamento:
    "Já está em acompanhamento — provavelmente busca segunda opinião; abordagem consultiva, não de captação inicial.",
};

function somar(arr: unknown): number | null {
  if (!Array.isArray(arr)) return null;
  const nums = arr.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

function normalizarRespostas(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map((x) => Number(x) || 0);
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map((x) => Number(x) || 0);
    } catch (_) { /* ignora */ }
  }
  return null;
}

/** Índices (0-based) por grupo no quiz da criança/adulto (12 perguntas). */
const IDX_TDAH = [0, 1, 3, 5, 7, 9];
const IDX_TEA = [2, 4, 6, 8, 10, 11];

export function interpretarTriagem(dados: Triagem | null | undefined): InterpretacaoTriagem | null {
  if (!dados) return null;
  const quiz = String(dados.quiz || dados.aba || "").toLowerCase();
  if (!quiz) return null;

  const respostas = normalizarRespostas(dados.respostas);
  const badge: string | null = dados.resultado || null;
  const prontidao: string | null = dados.prontidao || null;
  const leadPrioritario = dados.leadPrioritario === true || dados.leadPrioritario === "true" ||
    dados.fezQuizCrianca === "true" && dados.fezQuizTermometro === "true";

  let severidade: number | null = null;
  let severidadeMax: number | null = null;
  let perfil: string | null = null;
  let somaTdah: number | null = null;
  let somaTea: number | null = null;
  let alta = false;

  if (quiz === "termometro") {
    severidade = respostas ? somar(respostas.slice(0, 9)) : null;
    severidadeMax = 27;
    if (severidade !== null) {
      perfil = severidade <= 9 ? "inicial" : severidade <= 18 ? "instalada" : "esgotamento";
      alta = severidade >= 19;
    } else if (badge) {
      perfil = /ESGOTAMENTO/i.test(badge)
        ? "esgotamento"
        : /INSTALADA/i.test(badge)
        ? "instalada"
        : "inicial";
      alta = perfil === "esgotamento";
    }
  } else if (quiz === "crianca" || quiz === "adulto") {
    if (respostas && respostas.length >= 12) {
      somaTdah = IDX_TDAH.reduce((a, i) => a + (respostas[i] || 0), 0);
      somaTea = IDX_TEA.reduce((a, i) => a + (respostas[i] || 0), 0);
      const diff = somaTdah - somaTea;
      severidade = somaTdah + somaTea;
      severidadeMax = 36;
      if (somaTdah < 9 && somaTea < 9) perfil = "baixo";
      else if (diff >= 5) perfil = "tdah";
      else if (diff <= -5) perfil = "tea";
      else perfil = "ambos";
      alta = perfil === "ambos" || somaTdah >= 12 || somaTea >= 12;
    } else if (badge) {
      perfil = /DOIS PERFIS/i.test(badge)
        ? "ambos"
        : /TEA/i.test(badge)
        ? "tea"
        : /TDAH/i.test(badge)
        ? "tdah"
        : "baixo";
      alta = perfil === "ambos";
    }
  }

  let nivelPrioridade: 1 | 2 | 3 | 4 = 4;
  if (leadPrioritario && alta) nivelPrioridade = 1;
  else if (prontidao === "pensei_nao_fui" || prontidao === "busquei_nao_continuei") nivelPrioridade = 2;
  else if (alta) nivelPrioridade = prontidao === "nunca_busquei" ? 3 : 2;
  else nivelPrioridade = 4;

  const nomePrioridade = ["", "Mais quente", "Quente", "Morno", "Frio (não descartar)"][nivelPrioridade];
  const acao = [
    "",
    "Atender primeiro, sempre. Sem fila de espera.",
    "Já considerou ajuda — oferecer horário concreto, empurrão direto.",
    "Mais acolhimento antes do agendamento — validar a dor antes de falar da consulta.",
    "Nutrir com conteúdo, menor prioridade, sem pressão de agendamento imediato.",
  ][nivelPrioridade];

  const partes = [
    `Quiz: ${NOMES_QUIZ[quiz] || quiz}`,
    badge ? `Resultado: ${badge}` : null,
    severidade !== null ? `Pontuação: ${severidade}/${severidadeMax}` : null,
    somaTdah !== null ? `TDAH ${somaTdah}/18 · TEA ${somaTea}/18` : null,
    prontidao ? `Prontidão: ${PRONTIDAO_LEITURA[prontidao] || prontidao}` : null,
    leadPrioritario ? "⚡ Fez os DOIS quizzes (mãe + criança) — intenção máxima." : null,
    `Prioridade: nível ${nivelPrioridade} (${nomePrioridade}) — ${acao}`,
  ].filter(Boolean);

  return {
    quiz,
    nomeQuiz: NOMES_QUIZ[quiz] || quiz,
    badge,
    severidade,
    severidadeMax,
    perfil,
    somaTdah,
    somaTea,
    prontidao,
    leadPrioritario,
    nivelPrioridade,
    nomePrioridade,
    acao,
    resumo: partes.join(" | "),
  };
}

/** Bloco de conhecimento injetado nos prompts da Ana. */
export const TRIAGENS_CONTEXTO = `
## TRIAGENS (QUIZZES) DA DRA. AMÉLIA — COMO LER O LEAD

Os leads chegam de quizzes do site e caem na planilha de leads (abas QUIZ, NEUROACESSO e BLOG).
Cada linha traz: data/hora, tipo de quiz, nome, paciente/criança, idade, WhatsApp, e-mail, resultado (badge) e o array de respostas (0=Nunca, 1=Às vezes, 2=Frequentemente, 3=Sempre).

### 1) Termômetro da Sobrecarga Materna (quiz "termometro")
Público: mãe de criança atípica (TEA/TDAH) — mede a sobrecarga DA MÃE, não da criança.
9 perguntas de severidade (0-27): exaustão física, autocobrança, isolamento social por vergonha, hipervigilância, solidão no cuidado, perda de identidade, vergonha nas redes, labilidade emocional, dificuldade de pedir ajuda.
- 0-9 "SOBRECARGA EM ESTÁGIO INICIAL": sinais pontuais. Acolher e educar, sem alarmismo; urgência baixa.
- 10-18 "SOBRECARGA JÁ INSTALADA": padrão crônico. Validar ("você não fez nada de errado") e mostrar que dá para agir antes de piorar.
- 19-27 "SINAIS DE ESGOTAMENTO": perto do limite. Acolhimento direto + prioridade alta de agendamento, sem fila.
10ª pergunta (fora da soma) = prontidão: "o que você já tentou até agora?"
- nunca_busquei → mais acolhimento antes de propor a consulta.
- pensei_nao_fui → prontidão alta; oferecer horário concreto.
- busquei_nao_continuei → investigar por que parou (custo, tempo, profissional) antes de reagendar.
- em_acompanhamento → segunda opinião; abordagem consultiva.

### 2) Ponto de Partida (quiz "crianca" e "adulto")
12 perguntas, dois grupos de 6 (0-18 cada): TDAH/TOD (não termina tarefas, agitação, esquecimento, impulsividade, birras desproporcionais, desafio a combinados) e TEA (brinca sozinho, não lê humor alheio, hipersensibilidade sensorial, sofre com mudança de rotina, interesse muito específico, repetições/estereotipias).
- Ambos < 9 → "POUCOS SINAIS NESTE MOMENTO": consultivo, sem pressa.
- TDAH − TEA ≥ 5 → "SINAIS MAIS PRESENTES: TDAH/TOD": falar de avaliação com escalas específicas (SNAP-IV, Vanderbilt, Conners) e equipe multidisciplinar.
- TEA − TDAH ≥ 5 → "SINAIS MAIS PRESENTES: TEA": falar de M-CHAT-R/F, CARS-2, Perfil Sensorial 2.
- Demais casos → "SINAIS DOS DOIS PERFIS": reforçar que investigar os dois JUNTOS é o caminho, não processos separados.

### 3) Quiz de Cannabis Medicinal (quiz "cannabis")
Mede o quanto o tema é pertinente ao caso ("TEMA RELEVANTE PRA CONVERSA", "PODE VALER MENCIONAR"). Nunca prometer resultado, dose ou indicação — isso é decisão da Dra. Amélia na consulta.

### 4) NeuroAcesso (quiz "neuroacesso-medicos")
Público MÉDICO, não paciente. Mede gaps de encaminhamento ("MAIOR GAP: OPORTUNIDADE ALTA"). Tratar como contato profissional/parceria, jamais oferecer consulta como se fosse paciente.

### Sinal cruzado (leadPrioritario)
Quando a mesma pessoa completa os dois quizzes (mãe + criança) no mesmo navegador, o segundo grava leadPrioritario = true. É o sinal de intenção mais forte que existe — mais forte que qualquer severidade isolada. Prioridade máxima na fila.

### Fila de prioridade
1. Mais quente: leadPrioritario + severidade alta (esgotamento ou TDAH+TEA) → atender primeiro, sem fila.
2. Quente: prontidão pensei_nao_fui / busquei_nao_continuei → oferecer horário concreto.
3. Morno: severidade alta + nunca_busquei → validar a dor antes de falar da consulta.
4. Frio (não descartar): severidade baixa e sem cruzamento → nutrir com conteúdo, sem pressão.

### COMO USAR NA CONVERSA
- Use o resultado da triagem para ESPELHAR a dor com palavras da própria pessoa; nunca cite pontuação, escala, algoritmo ou "quiz respondido" de forma técnica.
- Nunca diagnostique. O quiz é um mapa de sinais, não laudo: "esses sinais merecem uma avaliação, e é exatamente isso que a Dra. Amélia faz na consulta".
- Termômetro alto = a MÃE também está adoecendo; acolha a mãe antes de falar da criança.
- Adapte o programa citado: quiz "crianca" → SPECTRA KIDS; "adulto"/"termometro" (mãe adulta) → SPECTRA ADULTO. A Ana continua fechando apenas a consulta inicial.
`;
