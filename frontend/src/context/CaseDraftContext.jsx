import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { readProfessorStorage, removeProfessorStorage, writeProfessorStorage } from '../services/localStorage.js';
import { CASE_GENERATION_PREFERENCES_ENABLED, readCaseGenerationPreferences } from '../services/professorPreferences.js';

const DRAFT_STORAGE_KEY = 'pibic.caseDraft';
const SAVED_CASE_STORAGE_KEY = 'pibic.savedCase';
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function createInitialDraft(preferences = readCaseGenerationPreferences(null)) {
  return {
  draftKey: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  caseInfo: {
    title: '',
    specialty: 'Cardiologia',
    discipline: '',
    difficulty: draftDifficulty(preferences.caseComplexity),
    healthArea: '',
    style: 'Múltipla escolha',
  },
  patient: {
    allowAiCompletion: false,
    name: 'Paciente simulado',
    age: '',
    profession: '',
    weight: '',
    height: '',
    biologicalSex: 'NAO_INFORMADO',
    maritalStatus: 'NAO_INFORMADO',
    otherInfo: '',
  },
  clinical: {
    pedagogicalGoal: '',
    centralHypothesis: '',
    symptoms: '',
    comorbidities: '',
    clinicalContext: preferences.caseContext || '',
    clinicalExam: '',
    includeClinicalExams: Boolean(preferences.includeExams),
  },
  files: {
    clinicalImages: [],
    documents: [],
  },
  };
}

const CaseDraftContext = createContext(null);

export function CaseDraftProvider({ children }) {
  const { auth } = useAuth();
  const idProfessor = auth?.idProfessor;
  const [draft, setDraft] = useState(() => (
    idProfessor
      ? mergeDraft(
          createInitialDraft(readCaseGenerationPreferences(idProfessor)),
          readProfessorStorage(DRAFT_STORAGE_KEY, idProfessor, {}, { maxAgeMs: DRAFT_MAX_AGE_MS }),
        )
      : createInitialDraft(readCaseGenerationPreferences(null))
  ));
  const [savedCase, setSavedCaseState] = useState(() => (
    readProfessorStorage(SAVED_CASE_STORAGE_KEY, idProfessor, null, { maxAgeMs: DRAFT_MAX_AGE_MS })
  ));
  const loadedProfessorRef = useRef(idProfessor);
  const pendingDraftRef = useRef(null);
  const draftWriteTimerRef = useRef(null);
  const [storageError, setStorageError] = useState('');

  const flushDraftStorage = useCallback(() => {
    if (!pendingDraftRef.current) return true;
    const pending = pendingDraftRef.current;
    const didSave = writeProfessorStorage(DRAFT_STORAGE_KEY, pending.idProfessor, pending.draft);
    if (didSave) {
      pendingDraftRef.current = null;
      setStorageError('');
    } else {
      setStorageError('Não foi possível salvar o rascunho neste dispositivo. Libere espaço e tente novamente.');
    }
    return didSave;
  }, []);

  const scheduleDraftStorage = useCallback((nextDraft) => {
    pendingDraftRef.current = { idProfessor, draft: nextDraft };
    globalThis.clearTimeout(draftWriteTimerRef.current);
    draftWriteTimerRef.current = globalThis.setTimeout(flushDraftStorage, 350);
  }, [flushDraftStorage, idProfessor]);

  useEffect(() => {
    if (loadedProfessorRef.current === idProfessor) return;
    globalThis.clearTimeout(draftWriteTimerRef.current);
    flushDraftStorage();
    pendingDraftRef.current = null;
    loadedProfessorRef.current = idProfessor;
    if (!idProfessor) {
      setDraft(createInitialDraft(readCaseGenerationPreferences(null)));
      setSavedCaseState(null);
      return;
    }
    setDraft(mergeDraft(
      createInitialDraft(readCaseGenerationPreferences(idProfessor)),
      readProfessorStorage(DRAFT_STORAGE_KEY, idProfessor, {}, { maxAgeMs: DRAFT_MAX_AGE_MS }),
    ));
    setSavedCaseState(readProfessorStorage(SAVED_CASE_STORAGE_KEY, idProfessor, null, { maxAgeMs: DRAFT_MAX_AGE_MS }));
  }, [flushDraftStorage, idProfessor]);

  useEffect(() => {
    const flush = () => flushDraftStorage();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      globalThis.clearTimeout(draftWriteTimerRef.current);
      flush();
    };
  }, [flushDraftStorage]);

  const updateDraftSection = useCallback((section, values) => {
    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        [section]: {
          ...currentDraft[section],
          ...values,
        },
      };

      scheduleDraftStorage(nextDraft);
      return nextDraft;
    });
  }, [scheduleDraftStorage]);

  const setSavedCase = useCallback((valueOrUpdater) => {
    setSavedCaseState((currentValue) => {
      const value = typeof valueOrUpdater === 'function'
        ? valueOrUpdater(currentValue)
        : valueOrUpdater;
      if (value === null) removeProfessorStorage(SAVED_CASE_STORAGE_KEY, idProfessor);
      else if (!writeProfessorStorage(SAVED_CASE_STORAGE_KEY, idProfessor, value)) {
        setStorageError('Não foi possível salvar o rascunho neste dispositivo. Libere espaço e tente novamente.');
      }
      return value;
    });
  }, [idProfessor]);

  const resetDraft = useCallback(() => {
    const nextDraft = createInitialDraft(readCaseGenerationPreferences(idProfessor));
    setDraft(nextDraft);
    pendingDraftRef.current = { idProfessor, draft: nextDraft };
    flushDraftStorage();
  }, [flushDraftStorage, idProfessor]);

  const value = useMemo(
    () => ({
      draft,
      savedCase,
      storageError,
      resetDraft,
      setSavedCase,
      updateDraftSection,
    }),
    [draft, resetDraft, savedCase, setSavedCase, storageError, updateDraftSection],
  );

  return <CaseDraftContext.Provider value={value}>{children}</CaseDraftContext.Provider>;
}

export function useCaseDraft() {
  const context = useContext(CaseDraftContext);

  if (!context) {
    throw new Error('useCaseDraft deve ser usado dentro de CaseDraftProvider');
  }

  return context;
}

function mergeDraft(baseDraft, storedDraft) {
  return {
    ...baseDraft,
    draftKey: typeof storedDraft?.draftKey === 'string' ? storedDraft.draftKey : baseDraft.draftKey,
    caseInfo: {
      ...baseDraft.caseInfo,
      ...storedDraft?.caseInfo,
    },
    patient: {
      ...baseDraft.patient,
      ...storedDraft?.patient,
    },
    clinical: withoutPreferenceContext({
      ...baseDraft.clinical,
      ...storedDraft?.clinical,
    }),
    files: {
      ...baseDraft.files,
      ...storedDraft?.files,
    },
  };
}

// Contextos que a aba de preferências preenchia sozinha. Com ela desligada, rascunhos antigos
// não devem continuar exibindo esse valor como se o professor o tivesse digitado.
const PREFERENCE_CONTEXT_VALUES = new Set(['Ambulatório', 'Atenção primária', 'Emergência', 'Enfermaria', 'UTI']);

function withoutPreferenceContext(clinical) {
  if (CASE_GENERATION_PREFERENCES_ENABLED || !PREFERENCE_CONTEXT_VALUES.has(clinical.clinicalContext)) {
    return clinical;
  }
  return { ...clinical, clinicalContext: '' };
}

function draftDifficulty(complexity) {
  if (complexity === 'Básica') return 'Básico';
  if (complexity === 'Avançada') return 'Avançado';
  return 'Intermediário';
}
