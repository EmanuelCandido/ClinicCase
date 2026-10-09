import { readProfessorStorage, writeProfessorStorage } from './localStorage.js';

export const PROFESSOR_PREFERENCES_KEY = 'pibic.professorPreferences';

export const DEFAULT_PROFESSOR_PREFERENCES = Object.freeze({
  academicRole: 'Professor responsável',
  institution: '',
  caseContext: 'Ambulatório',
  caseComplexity: 'Intermediária',
  detailLevel: 'Padrão',
  questionCount: 10,
  questionDifficulty: 'Acompanhar dificuldade do caso',
  questionTypes: Object.freeze({
    multipleChoice: true,
    discursive: true,
    trueFalse: false,
    clinicalReasoning: false,
  }),
  generateAnswerKey: true,
  includeJustification: true,
  includeExams: true,
  includeLabs: true,
  includeEvolution: false,
  hideDiagnosis: true,
});

// A aba "Casos clínicos" das configurações está desligada: a geração usa sempre os padrões,
// mesmo que existam preferências salvas antes no navegador.
export const CASE_GENERATION_PREFERENCES_ENABLED = false;

// Sem preferências, nenhum campo do caso vem pré-preenchido e a geração pede menos perguntas,
// o que mantém a resposta da IA dentro do tempo-limite dos provedores gratuitos.
const NEUTRAL_GENERATION_PREFERENCES = Object.freeze({
  caseContext: '',
  includeExams: false,
  questionCount: 2,
});

export function readCaseGenerationPreferences(idProfessor) {
  return CASE_GENERATION_PREFERENCES_ENABLED
    ? readProfessorPreferences(idProfessor)
    : { ...normalizeProfessorPreferences({}), ...NEUTRAL_GENERATION_PREFERENCES };
}

export function readProfessorPreferences(idProfessor) {
  return normalizeProfessorPreferences(
    readProfessorStorage(PROFESSOR_PREFERENCES_KEY, idProfessor, {}),
  );
}

export function writeProfessorPreferences(idProfessor, preferences) {
  return writeProfessorStorage(
    PROFESSOR_PREFERENCES_KEY,
    idProfessor,
    normalizeProfessorPreferences(preferences),
  );
}

export function normalizeProfessorPreferences(value) {
  const stored = value && typeof value === 'object' ? value : {};
  const legacyTypes = legacyQuestionTypes(stored.formato);
  const questionTypes = {
    ...DEFAULT_PROFESSOR_PREFERENCES.questionTypes,
    ...legacyTypes,
    ...(stored.questionTypes && typeof stored.questionTypes === 'object' ? stored.questionTypes : {}),
  };
  const selectedGeneratorTypes = [
    questionTypes.multipleChoice,
    questionTypes.discursive,
    questionTypes.trueFalse,
  ].filter(Boolean).length;
  const legacyCount = Number.parseInt(String(stored.quantidade || ''), 10);
  const requestedCount = Number(stored.questionCount ?? legacyCount);
  const questionCount = Number.isInteger(requestedCount)
    ? Math.min(10, Math.max(1, requestedCount, selectedGeneratorTypes))
    : DEFAULT_PROFESSOR_PREFERENCES.questionCount;

  return {
    ...DEFAULT_PROFESSOR_PREFERENCES,
    ...stored,
    academicRole: stored.academicRole || stored.cargo || DEFAULT_PROFESSOR_PREFERENCES.academicRole,
    institution: stored.institution ?? stored.instituicao ?? DEFAULT_PROFESSOR_PREFERENCES.institution,
    caseContext: stored.caseContext || DEFAULT_PROFESSOR_PREFERENCES.caseContext,
    caseComplexity: normalizeComplexity(
      stored.caseComplexity || stored.dificuldade || DEFAULT_PROFESSOR_PREFERENCES.caseComplexity,
    ),
    detailLevel: stored.detailLevel || DEFAULT_PROFESSOR_PREFERENCES.detailLevel,
    questionCount,
    questionDifficulty: stored.questionDifficulty || DEFAULT_PROFESSOR_PREFERENCES.questionDifficulty,
    questionTypes,
    generateAnswerKey: booleanValue(stored.generateAnswerKey, DEFAULT_PROFESSOR_PREFERENCES.generateAnswerKey),
    includeJustification: booleanValue(
      stored.includeJustification ?? stored.feedbackAutomatico,
      DEFAULT_PROFESSOR_PREFERENCES.includeJustification,
    ),
    includeExams: booleanValue(
      stored.includeExams ?? stored.incluirExames,
      DEFAULT_PROFESSOR_PREFERENCES.includeExams,
    ),
    includeLabs: booleanValue(stored.includeLabs, DEFAULT_PROFESSOR_PREFERENCES.includeLabs),
    includeEvolution: booleanValue(stored.includeEvolution, DEFAULT_PROFESSOR_PREFERENCES.includeEvolution),
    hideDiagnosis: booleanValue(stored.hideDiagnosis, DEFAULT_PROFESSOR_PREFERENCES.hideDiagnosis),
  };
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeComplexity(value) {
  if (value === 'Básico') return 'Básica';
  if (value === 'Intermediário') return 'Intermediária';
  if (value === 'Avançado') return 'Avançada';
  return value;
}

function legacyQuestionTypes(format) {
  if (typeof format !== 'string' || !format) return {};
  const normalized = format.toLocaleLowerCase('pt-BR');
  return {
    multipleChoice: normalized.includes('múltipla'),
    discursive: normalized.includes('discursiva'),
  };
}
