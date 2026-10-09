export const QUESTION_TYPES = [
  'MULTIPLA_ESCOLHA',
  'VERDADEIRO_FALSO',
  'DISCURSIVA',
];

const LEGACY_QUESTION_TYPES = ['DIAGNOSTICO', 'CONDUTA_CLINICA'];
const KNOWN_QUESTION_TYPES = [...QUESTION_TYPES, ...LEGACY_QUESTION_TYPES];

const QUESTION_TYPE_LABELS = {
  MULTIPLA_ESCOLHA: 'Múltipla escolha',
  VERDADEIRO_FALSO: 'Verdadeiro ou falso',
  DIAGNOSTICO: 'Diagnóstico',
  DISCURSIVA: 'Discursiva',
  CONDUTA_CLINICA: 'Conduta clínica',
};

const UNKNOWN_QUESTION_TYPE = 'TIPO_NAO_INFORMADO';

export const RUBRIC_FIELDS = [
  {
    key: 'criteriosEssenciais',
    label: 'Critérios essenciais',
    types: ['DISCURSIVA', 'CONDUTA_CLINICA'],
  },
  {
    key: 'criteriosPontuacao',
    label: 'Critérios de pontuação',
    types: ['DISCURSIVA', 'CONDUTA_CLINICA'],
  },
  {
    key: 'errosGraves',
    label: 'Erros graves',
    types: ['DISCURSIVA', 'CONDUTA_CLINICA'],
  },
  {
    key: 'justificativas',
    label: 'Justificativas',
    types: ['DISCURSIVA', 'CONDUTA_CLINICA'],
  },
  {
    key: 'prioridades',
    label: 'Prioridades',
    types: ['CONDUTA_CLINICA'],
  },
  {
    key: 'sinaisEscalonamento',
    label: 'Sinais de escalonamento',
    types: ['CONDUTA_CLINICA'],
  },
];

export function questionTypeLabel(type) {
  return QUESTION_TYPE_LABELS[type] || 'Tipo não informado';
}

export function isKnownQuestionType(type) {
  return KNOWN_QUESTION_TYPES.includes(type);
}

export function isAvailableQuestionType(type) {
  return QUESTION_TYPES.includes(type);
}

export function usesAlternatives(type) {
  return type === 'MULTIPLA_ESCOLHA';
}

export function usesManualReview(type) {
  return type === 'DISCURSIVA' || type === 'CONDUTA_CLINICA';
}

export function rubricFieldsForType(type) {
  return RUBRIC_FIELDS.filter((field) => field.types.includes(type));
}

function normalizeRubric(rubric) {
  if (!rubric || typeof rubric !== 'object') return null;
  const normalized = {};
  RUBRIC_FIELDS.forEach(({ key }) => {
    const source = Array.isArray(rubric[key])
      ? rubric[key]
      : typeof rubric[key] === 'string' ? rubric[key].split(/\r?\n/) : [];
    const items = source.map((item) => String(item || '').trim()).filter(Boolean);
    if (items.length) normalized[key] = items;
  });
  return Object.keys(normalized).length ? normalized : null;
}

export function normalizeQuestion(question = {}) {
  const tipo = isKnownQuestionType(question.tipo) ? question.tipo : UNKNOWN_QUESTION_TYPE;
  const alternatives = usesAlternatives(tipo)
    ? normalizeAlternatives(question.alternativas, question.gabarito)
    : [];
  return {
    ...question,
    clientId: question.clientId || `question-${question.id || Date.now()}-${Math.random().toString(16).slice(2)}`,
    dirty: Boolean(question.dirty),
    texto: question.texto || '',
    tipo,
    resposta: question.resposta || '',
    rubrica: usesManualReview(tipo) ? normalizeRubric(question.rubrica) : null,
    gabarito: question.gabarito || (usesManualReview(tipo) ? 'REVISAO_MANUAL' : ''),
    alternativas: alternatives,
  };
}

export function normalizeQuestions(response) {
  const list = Array.isArray(response) ? response : response?.content || [];
  return list.map(normalizeQuestion);
}

export function mergeQuestions(currentQuestions, receivedQuestions) {
  const merged = new Map();
  [...normalizeQuestions(currentQuestions), ...normalizeQuestions(receivedQuestions)].forEach((question) => {
    const key = question.id != null ? `id:${question.id}` : `client:${question.clientId}`;
    const previous = merged.get(key);
    merged.set(key, previous?.dirty ? previous : question);
  });
  return [...merged.values()];
}

export function reconcileSavedQuestions(currentQuestions, snapshot, responses) {
  if (!Array.isArray(responses) || responses.length !== snapshot.length || responses.some((item) => !item?.id)) {
    throw new Error('Não foi possível confirmar o salvamento das perguntas. Tente novamente.');
  }
  return currentQuestions.map((question) => {
    const key = question.id ? `id:${question.id}` : `client:${question.clientId}`;
    const index = snapshot.findIndex((item) => item.key === key);
    if (index < 0) return question;
    const pending = snapshot[index];
    // Mesmo uma pergunta nova editada durante a chamada precisa receber o ID salvo.
    if (question !== pending.question) return { ...question, id: responses[index].id, dirty: true };
    return normalizeQuestion({ ...question, ...pending.payload, ...responses[index], dirty: false });
  });
}

export function blankQuestion(type = 'MULTIPLA_ESCOLHA') {
  return normalizeQuestion({
    dirty: true,
    tipo: QUESTION_TYPES.includes(type) ? type : 'MULTIPLA_ESCOLHA',
    texto: '',
    gabarito: type === 'VERDADEIRO_FALSO' ? 'VERDADEIRO' : undefined,
    alternativas: usesAlternatives(type)
      ? ['A', 'B', 'C', 'D'].map((letra, index) => ({ correta: index === 0, letra, texto: '' }))
      : [],
  });
}

export function changeQuestionType(question, nextType) {
  const normalized = normalizeQuestion(question);
  if (!QUESTION_TYPES.includes(nextType) || normalized.tipo === nextType) return normalized;
  return normalizeQuestion({
    ...normalized,
    dirty: true,
    tipo: nextType,
    alternativas: usesAlternatives(nextType)
      ? ['A', 'B', 'C', 'D'].map((letra, index) => ({ correta: index === 0, letra, texto: '' }))
      : [],
    gabarito: nextType === 'VERDADEIRO_FALSO' ? 'VERDADEIRO' : usesManualReview(nextType) ? 'REVISAO_MANUAL' : '',
    resposta: '',
    rubrica: null,
  });
}

export function buildQuestionPayload(question, idCaso) {
  const normalized = normalizeQuestion(question);
  if (!isKnownQuestionType(normalized.tipo)) {
    throw new Error('Selecione um tipo válido para a pergunta.');
  }
  if (!isAvailableQuestionType(normalized.tipo) && !normalized.id) {
    throw new Error('Este tipo de pergunta está temporariamente indisponível para novas perguntas.');
  }
  const texto = normalized.texto.trim();
  if (!texto) throw new Error('Preencha o enunciado da pergunta.');

  const payload = { idCaso, texto, tipo: normalized.tipo };
  if (normalized.tipo === 'MULTIPLA_ESCOLHA') {
    const alternativas = normalized.alternativas.map((alternative, index) => ({
      id: alternative.id,
      correta: Boolean(alternative.correta),
      letra: alternative.letra || String.fromCharCode(65 + index),
      texto: (alternative.texto || '').trim(),
    }));
    if (alternativas.length < 2 || alternativas.length > 5 || alternativas.some((item) => !item.texto)) {
      throw new Error('Preencha entre duas e cinco alternativas.');
    }
    const corretas = alternativas.filter((item) => item.correta);
    if (corretas.length !== 1) throw new Error('Marque exatamente uma alternativa correta.');
    const resposta = normalized.resposta.trim();
    if (!resposta) throw new Error('Explique por que a alternativa marcada está correta.');
    return { ...payload, alternativas, gabarito: corretas[0].letra, resposta };
  }
  if (normalized.tipo === 'VERDADEIRO_FALSO') {
    const gabarito = normalized.gabarito.trim().toUpperCase();
    if (!['VERDADEIRO', 'FALSO'].includes(gabarito)) throw new Error('Selecione Verdadeiro ou Falso.');
    const resposta = normalized.resposta.trim();
    if (!resposta) throw new Error('Explique o gabarito verdadeiro ou falso.');
    return { ...payload, alternativas: [], gabarito, resposta };
  }
  if (normalized.tipo === 'DIAGNOSTICO') {
    const gabarito = normalized.gabarito.trim();
    if (!gabarito) throw new Error('Informe o diagnóstico esperado e, se necessário, sinônimos separados por |.');
    const sinonimos = gabarito.split('|').map((item) => item.trim());
    const sinonimosNormalizados = sinonimos.map(normalizeDiagnosticTerm);
    if (sinonimos.length > 5 || sinonimosNormalizados.some((item) => !item)) {
      throw new Error('Informe de um a cinco diagnósticos equivalentes, sem termos vazios.');
    }
    if (new Set(sinonimosNormalizados).size !== sinonimosNormalizados.length) {
      throw new Error('Os diagnósticos equivalentes não podem se repetir.');
    }
    const resposta = normalized.resposta.trim();
    if (!resposta) throw new Error('Explique os achados que sustentam o diagnóstico.');
    return { ...payload, alternativas: [], gabarito, resposta };
  }
  const resposta = normalized.resposta.trim();
  if (!resposta) {
    throw new Error(normalized.tipo === 'DISCURSIVA'
      ? 'Informe a resposta esperada.'
      : 'Informe a rubrica de avaliação.');
  }
  return {
    ...payload,
    alternativas: [],
    gabarito: 'REVISAO_MANUAL',
    resposta,
    rubrica: normalized.rubrica,
  };
}

// Mantém a resposta da IA abaixo do limite de tokens por minuto do Groq gratuito.
export const MAX_AI_QUESTIONS = 2;

// Nível das questões geradas; vazio segue a dificuldade cadastrada no caso.
export const QUESTION_DIFFICULTY_LEVELS = [
  { value: 'BAIXA', label: 'Fácil', description: 'Conceitos fundamentais e achados centrais do caso.' },
  { value: 'MEDIA', label: 'Intermediário', description: 'Integra mais de um achado do caso para chegar à resposta.' },
  { value: 'ALTA', label: 'Difícil', description: 'Raciocínio em várias etapas, diagnóstico diferencial e priorização de conduta.' },
];
const QUESTION_DIFFICULTY_VALUES = new Set(QUESTION_DIFFICULTY_LEVELS.map((level) => level.value));

export function buildGenerationPayload(config) {
  const instructions = config.instrucoesAdicionais?.trim();
  if (instructions?.length > 2000) throw new Error('As instruções adicionais devem ter no máximo 2.000 caracteres.');
  const shared = {
    ...(instructions ? { instrucoesAdicionais: instructions } : {}),
    ...(QUESTION_DIFFICULTY_VALUES.has(config.nivelDificuldade) ? { nivelDificuldade: config.nivelDificuldade } : {}),
    dadosSinteticosOuDesidentificados: true,
  };
  if (config.mode === 'VARIADO') {
    const unavailableType = Object.entries(config.distribuicao || {})
      .find(([tipo, item]) => Number(item?.quantidade || 0) > 0 && !isAvailableQuestionType(tipo));
    if (unavailableType) {
      throw new Error('Este tipo de pergunta está temporariamente indisponível para geração.');
    }
    const distribuicao = QUESTION_TYPES.map((tipo) => ({
      tipo,
      quantidade: Number(config.distribuicao?.[tipo]?.quantidade || 0),
      quantidadeAlternativas: Number(config.distribuicao?.[tipo]?.quantidadeAlternativas || 4),
    })).filter((item) => item.quantidade > 0).map((item) => (
      item.tipo === 'MULTIPLA_ESCOLHA'
        ? item
        : { tipo: item.tipo, quantidade: item.quantidade }
    ));
    const total = distribuicao.reduce((sum, item) => sum + item.quantidade, 0);
    if (distribuicao.length < 2) throw new Error('No modo variado, escolha pelo menos dois tipos de pergunta.');
    if (total < 1 || total > MAX_AI_QUESTIONS || distribuicao.some((item) => !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > MAX_AI_QUESTIONS)) {
      throw new Error(`Gere no máximo ${MAX_AI_QUESTIONS} perguntas por vez.`);
    }
    const mcq = distribuicao.find((item) => item.tipo === 'MULTIPLA_ESCOLHA');
    if (mcq && (mcq.quantidadeAlternativas < 2 || mcq.quantidadeAlternativas > 5)) {
      throw new Error('Perguntas de múltipla escolha devem ter entre 2 e 5 alternativas.');
    }
    return { ...shared, distribuicao };
  }
  const quantidade = Number(config.quantidade);
  if (config.tipo && !isAvailableQuestionType(config.tipo)) {
    throw new Error('Este tipo de pergunta está temporariamente indisponível para geração.');
  }
  const tipo = config.tipo || 'MULTIPLA_ESCOLHA';
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_AI_QUESTIONS) throw new Error(`Escolha entre 1 e ${MAX_AI_QUESTIONS} perguntas.`);
  const payload = { ...shared, quantidade, tipo };
  if (tipo === 'MULTIPLA_ESCOLHA') {
    const quantidadeAlternativas = Number(config.quantidadeAlternativas);
    if (!Number.isInteger(quantidadeAlternativas) || quantidadeAlternativas < 2 || quantidadeAlternativas > 5) {
      throw new Error('Escolha entre 2 e 5 alternativas.');
    }
    payload.quantidadeAlternativas = quantidadeAlternativas;
  }
  return payload;
}

function normalizeAlternatives(alternatives, answer) {
  const source = Array.isArray(alternatives) && alternatives.length ? alternatives : ['A', 'B', 'C', 'D'].map((letra) => ({ letra, texto: '', correta: answer === letra }));
  const hasExplicitCorrect = source.some((alternative) => Boolean(alternative.correta));
  return source.map((alternative, index) => ({
    ...alternative,
    correta: hasExplicitCorrect
      ? Boolean(alternative.correta)
      : answer === (alternative.letra || String.fromCharCode(65 + index)),
    letra: alternative.letra || String.fromCharCode(65 + index),
    texto: alternative.texto || '',
  }));
}

function normalizeDiagnosticTerm(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
