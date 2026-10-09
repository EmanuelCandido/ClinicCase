// @ts-check

/** @typedef {import('../types/domain.js').CaseDraft} CaseDraft */
/** @typedef {import('../types/domain.js').ProfessorAuth} ProfessorAuth */

/**
 * Valida todos os dados necessários para persistir um caso completo.
 *
 * @param {CaseDraft} draft
 * @param {ProfessorAuth | null | undefined} auth
 * @returns {string}
 */
export function validateDraftForApi(draft, auth) {
  return getCaseSectionError(draft, auth)
    || getPatientSectionError(draft)
    || getClinicalSectionError(draft);
}

/**
 * @param {CaseDraft} draft
 * @param {ProfessorAuth | null | undefined} auth
 */
export function assertCaseSection(draft, auth) {
  throwIfInvalid(getCaseSectionError(draft, auth));
}

/** @param {CaseDraft} draft */
export function assertPatientSection(draft) {
  throwIfInvalid(getPatientSectionError(draft));
}

/** @param {CaseDraft} draft */
export function assertClinicalSection(draft) {
  throwIfInvalid(getClinicalPersistenceError(draft));
}

/**
 * @param {CaseDraft} draft
 * @param {ProfessorAuth | null | undefined} auth
 * @returns {string}
 */
function getCaseSectionError(draft, auth) {
  if (!auth?.idProfessor) {
    return 'Entre com uma conta de professor para salvar o caso.';
  }

  return requiredFieldError(draft.caseInfo.title, 'título')
    || requiredFieldError(draft.caseInfo.specialty, 'especialidade');
}

/**
 * @param {CaseDraft} draft
 * @returns {string}
 */
function getPatientSectionError(draft) {
  const ageText = String(draft.patient.age ?? '').trim();
  if (!ageText) return '';

  const age = Number(ageText);
  if (!Number.isInteger(age) || age < 0 || age > 130) {
    return 'Informe uma idade válida entre 0 e 130 anos.';
  }

  return '';
}

/**
 * @param {CaseDraft} draft
 * @returns {string}
 */
function getClinicalSectionError(draft) {
  return requiredFieldError(draft.clinical.pedagogicalGoal, 'objetivo pedagógico')
    || requiredFieldError(draft.clinical.centralHypothesis, 'hipótese clínica central');
}

/** @param {CaseDraft} draft */
function getClinicalPersistenceError(draft) {
  return getClinicalSectionError(draft)
    || requiredFieldError(draft.clinical.centralHypothesis, 'hipótese clínica central')
    || requiredFieldError(draft.clinical.symptoms, 'sintomas principais')
    || requiredFieldError(draft.clinical.comorbidities, 'comorbidades')
    || requiredFieldError(draft.clinical.clinicalContext, 'contexto clínico')
    || requiredFieldError(draft.clinical.clinicalExam, 'exame clínico');
}

/**
 * Indica quando o conteúdo já satisfaz o contrato de persistência manual da API.
 * Campos ausentes continuam locais para que a geração por IA possa completá-los.
 *
 * @param {CaseDraft} draft
 * @returns {boolean}
 */
export function hasCompleteClinicalContent(draft) {
  return [
    draft.clinical.pedagogicalGoal,
    draft.clinical.centralHypothesis,
    draft.clinical.symptoms,
    draft.clinical.comorbidities,
    draft.clinical.clinicalContext,
    draft.clinical.clinicalExam,
  ].every((value) => Boolean(String(value ?? '').trim()));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requiredFieldError(value, label) {
  return String(value ?? '').trim()
    ? ''
    : `Preencha o campo ${label} antes de salvar.`;
}

/** @param {string} message */
function throwIfInvalid(message) {
  if (message) throw new Error(message);
}
