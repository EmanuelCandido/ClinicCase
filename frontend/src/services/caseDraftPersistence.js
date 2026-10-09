import {
  buildCasePayload,
  buildClinicalContentPayload,
  buildPatientPayload,
} from './caseMappers.js';
import {
  assertCaseSection,
  assertClinicalSection,
  assertPatientSection,
} from './caseValidation.js';
import {
  createCase,
  createClinicalContent,
  createPatient,
  updateCase,
  updateClinicalContent,
  updatePatient,
} from './pibicApi.js';

const defaultRequests = {
  createCase,
  createClinicalContent,
  createPatient,
  updateCase,
  updateClinicalContent,
  updatePatient,
};

export async function persistCaseDraft(draft, auth, savedCase, onProgress, requests = defaultRequests, options = {}) {
  assertCaseSection(draft, auth);
  options.onPhase?.('saving-case');
  const requestOptions = options.signal ? { signal: options.signal } : {};

  const belongsToCurrentDraft = savedCase?.draftKey === draft.draftKey;
  const currentSavedCase = belongsToCurrentDraft ? savedCase : null;
  const existingId = belongsToCurrentDraft
    ? savedCase?.case?.idCaso || savedCase?.complete?.caso?.idCaso
    : null;
  const payload = buildCasePayload(draft, auth);
  const existingCase = currentSavedCase?.case || currentSavedCase?.complete?.caso;
  const caseResponse = existingId
    ? payloadMatches(existingCase, payload)
      ? existingCase
      : await requests.updateCase(existingId, payload, requestOptions)
    : await requests.createCase(payload, requestOptions);

  const persistedCase = mergeSavedCase(currentSavedCase, {
    case: caseResponse,
    complete: currentSavedCase?.complete
      ? { ...currentSavedCase.complete, caso: caseResponse }
      : currentSavedCase?.complete,
  }, draft.draftKey);
  onProgress?.(persistedCase);
  return persistedCase;
}

export async function persistPatientDraft(draft, auth, savedCase, onProgress, requests = defaultRequests, options = {}) {
  assertPatientSection(draft);
  const caseDraft = await persistCaseDraft(draft, auth, savedCase, onProgress, requests, options);
  options.onPhase?.('saving-patient');
  const idCaso = caseDraft.case.idCaso;
  const existingPatient = caseDraft.patient || caseDraft.complete?.pacientes?.[0];
  const payload = buildPatientPayload(draft, idCaso);
  const patientResponse = existingPatient?.idPaciente
    ? payloadMatches(existingPatient, payload)
      ? existingPatient
      : await requests.updatePatient(existingPatient.idPaciente, payload, requestOptions(options))
    : await requests.createPatient(payload, requestOptions(options));

  const persistedPatient = mergeSavedCase(caseDraft, {
    patient: patientResponse,
    complete: caseDraft.complete
      ? { ...caseDraft.complete, pacientes: replaceFirst(caseDraft.complete.pacientes, patientResponse) }
      : caseDraft.complete,
  }, draft.draftKey);
  onProgress?.(persistedPatient);
  return persistedPatient;
}

export async function persistClinicalDraft(draft, auth, savedCase, onProgress, requests = defaultRequests, options = {}) {
  assertClinicalSection(draft);
  const patientDraft = await persistPatientDraft(draft, auth, savedCase, onProgress, requests, options);
  options.onPhase?.('saving-clinical-content');
  const idCaso = patientDraft.case.idCaso;
  const existingContent = newestById(patientDraft.complete?.conteudosClinicos, 'idConteudo')
    || patientDraft.clinicalContent;
  const payload = buildClinicalContentPayload(draft, idCaso);
  const clinicalContentResponse = existingContent?.idConteudo
    ? payloadMatches(existingContent, payload)
      ? existingContent
      : await requests.updateClinicalContent(existingContent.idConteudo, payload, requestOptions(options))
    : await requests.createClinicalContent(payload, requestOptions(options));

  const persistedClinical = mergeSavedCase(patientDraft, {
    clinicalContent: clinicalContentResponse,
    complete: patientDraft.complete
      ? {
          ...patientDraft.complete,
          conteudosClinicos: replaceById(
            patientDraft.complete.conteudosClinicos,
            clinicalContentResponse,
            'idConteudo',
          ),
        }
      : patientDraft.complete,
  }, draft.draftKey);
  onProgress?.(persistedClinical);
  return persistedClinical;
}

function mergeSavedCase(current, values, draftKey) {
  return {
    ...current,
    ...values,
    draftKey,
    generatedByAi: Boolean(current?.generatedByAi),
    savedAt: new Date().toISOString(),
  };
}

function replaceFirst(list, item) {
  const current = Array.isArray(list) ? list : [];
  return current.length ? [item, ...current.slice(1)] : [item];
}

function replaceById(list, item, key) {
  const current = Array.isArray(list) ? list : [];
  if (!item?.[key]) return [...current, item];
  const found = current.some((entry) => entry?.[key] === item[key]);
  return found
    ? current.map((entry) => entry?.[key] === item[key] ? item : entry)
    : [...current, item];
}

function newestById(list, key) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((a, b) => Number(b?.[key] || 0) - Number(a?.[key] || 0))[0];
}

function requestOptions(options) {
  return options.signal ? { signal: options.signal } : {};
}

function payloadMatches(entity, payload) {
  return Boolean(entity) && Object.entries(payload).every(([key, value]) => entity[key] === value);
}
