import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import ClinicalCoherenceDialog from '../components/ClinicalCoherenceDialog.jsx';
import Stepper from '../components/Stepper.jsx';
import UploadDropzone from '../components/UploadDropzone.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import useAiRateLimit from '../hooks/useAiRateLimit.js';
import { buildAiClinicalContentPayload } from '../services/caseMappers.js';
import { beginAiRequest, findAiRequest, completeAiRequest, shouldKeepAiRequestIdentity } from '../services/aiRequestIdentity.js';
import { hasCompleteClinicalContent, validateDraftForApi } from '../services/caseValidation.js';
import { referencesMediaUploads, stepItems } from '../services/caseConfig.js';
import { persistClinicalDraft, persistPatientDraft } from '../services/caseDraftPersistence.js';
import { mergeSelectedFiles } from '../services/fileSelection.js';
import { buildClinicalCoherenceProblem } from '../services/clinicalCoherence.js';
import {
  adjustClinicalContentWithAi,
  generateClinicalContentWithAi,
  getCompleteCase,
} from '../services/pibicApi.js';

export default function CreateCaseReferencesMedia() {
  const [generationPhase, setGenerationPhase] = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [coherenceProblem, setCoherenceProblem] = useState(null);
  const { auth } = useAuth();
  const { draft, resetDraft, savedCase, setSavedCase, storageError, updateDraftSection } = useCaseDraft();
  const navigate = useNavigate();
  const generationControllerRef = useRef(null);
  const operationInProgressRef = useRef(false);
  const isGenerating = generationPhase !== 'idle';
  const {
    clearRateLimit,
    isRateLimited,
    rateLimitMessage,
    registerRateLimit,
    remainingSeconds,
  } = useAiRateLimit();

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const intervalId = globalThis.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [isGenerating]);

  useEffect(() => () => generationControllerRef.current?.abort(), []);

  const handleFileChange = (group) => (event) => {
    const currentFiles = Array.isArray(draft.files[group]) ? draft.files[group] : [];
    const selectedFiles = Array.from(event.target.files || []);
    updateDraftSection('files', {
      [group]: mergeSelectedFiles(currentFiles, selectedFiles),
    });
    event.target.value = '';
  };

  const handleFileRemove = (group) => (indexToRemove) => {
    const currentFiles = Array.isArray(draft.files[group]) ? draft.files[group] : [];
    updateDraftSection('files', {
      [group]: currentFiles.filter((_, index) => index !== indexToRemove),
    });
  };

  const handleGenerateCase = async () => {
    if (operationInProgressRef.current) return;
    operationInProgressRef.current = true;
    setGenerationPhase('validating');
    const validationMessage = validateDraftForApi(draft, auth);

    if (validationMessage) {
      setFeedbackError(true);
      setFeedback(validationMessage);
      setGenerationPhase('idle');
      operationInProgressRef.current = false;
      return;
    }

    setFeedback('');
    setFeedbackError(false);
    setCoherenceProblem(null);
    const controller = new AbortController();
    generationControllerRef.current = controller;

    let persistedDraft;
    let requestIdentity;

    try {
      const existingContent = savedCase?.draftKey === draft.draftKey
        ? getLatestClinicalContent(savedCase)
        : null;
      const shouldUpdateExistingContent = Boolean(existingContent) && hasCompleteClinicalContent(draft);
      const savedCaseId = savedCase?.case?.idCaso || savedCase?.complete?.caso?.idCaso;
      const aiPayload = shouldUpdateExistingContent
        ? { tipoAjuste: 'REGERAR', instrucao: '', dadosSinteticosOuDesidentificados: true }
        : buildAiClinicalContentPayload(draft);

      // Uma chave já presente indica uma resposta possivelmente perdida. Recupere-a
      // antes de gravar o rascunho, que poderia substituir o ajuste já concluído.
      if (shouldUpdateExistingContent && savedCaseId) {
        requestIdentity = findAiRequest('adjust-content', savedCaseId, aiPayload);
        if (requestIdentity) {
          setGenerationPhase('waiting-ai');
          const recoveredContent = await adjustClinicalContentWithAi(savedCaseId, aiPayload, {
            headers: { 'Idempotency-Key': requestIdentity.idempotencyKey }, signal: controller.signal,
          });
          const recoveredComplete = recoveredContent?.completo
            || await getCompleteCase(savedCaseId, { signal: controller.signal });
          setSavedCase((current) => ({
            ...current, clinicalContent: recoveredContent, complete: recoveredComplete,
            generatedByAi: true, savedAt: new Date().toISOString(),
          }));
          clearRateLimit();
          completeAiRequest(requestIdentity);
          resetDraft();
          navigate('/criar-caso/revisao');
          return;
        }
      }
      persistedDraft = shouldUpdateExistingContent
        ? await persistClinicalDraft(draft, auth, savedCase, setSavedCase, undefined, {
            signal: controller.signal,
            onPhase: setGenerationPhase,
          })
        : await persistPatientDraft(draft, auth, savedCase, setSavedCase, undefined, {
            signal: controller.signal,
            onPhase: setGenerationPhase,
          });
      const idCaso = persistedDraft.case.idCaso;
      requestIdentity ||= beginAiRequest(
        shouldUpdateExistingContent ? 'adjust-content' : 'generate-content', idCaso, aiPayload,
      );
      setGenerationPhase('waiting-ai');
      const clinicalContentResponse = shouldUpdateExistingContent
        ? await adjustClinicalContentWithAi(idCaso, aiPayload, {
            headers: { 'Idempotency-Key': requestIdentity.idempotencyKey },
            signal: controller.signal,
          })
        : await generateClinicalContentWithAi(idCaso, aiPayload, {
            headers: { 'Idempotency-Key': requestIdentity.idempotencyKey },
            signal: controller.signal,
          });
      setGenerationPhase('loading-result');
      let completeResponse = clinicalContentResponse?.completo || null;
      if (!completeResponse) {
        try {
          completeResponse = await getCompleteCase(idCaso, { signal: controller.signal });
        } catch (refreshError) {
          if (refreshError?.name === 'AbortError') throw refreshError;
        }
      }

      setSavedCase({
        ...persistedDraft,
        clinicalContent: clinicalContentResponse,
        complete: completeResponse,
        generatedByAi: true,
        savedAt: new Date().toISOString(),
      });
      clearRateLimit();
      completeAiRequest(requestIdentity);
      resetDraft();

      navigate('/criar-caso/revisao');
    } catch (requestError) {
      if (requestIdentity && !shouldKeepAiRequestIdentity(requestError)) {
        completeAiRequest(requestIdentity);
      }
      if (persistedDraft) setSavedCase(persistedDraft);
      const preservedDraftMessage = persistedDraft
        ? ` O rascunho #${persistedDraft.case.idCaso} foi mantido.`
        : '';
      const clinicalProblem = buildClinicalCoherenceProblem(
        requestError,
        persistedDraft?.case?.idCaso,
      );
      if (clinicalProblem) {
        setFeedback('');
        setFeedbackError(false);
        setCoherenceProblem(clinicalProblem);
      } else if (registerRateLimit(requestError, preservedDraftMessage)) {
        setFeedback('');
      } else {
        setFeedbackError(true);
        setFeedback(requestError?.name === 'AbortError'
          ? `Geração cancelada. ${persistedDraft ? `O rascunho #${persistedDraft.case.idCaso} foi mantido.` : 'O rascunho local foi preservado.'}`
          : `${requestError.message || 'Não foi possível gerar o conteúdo do caso com IA.'}${preservedDraftMessage}`);
      }
    } finally {
      generationControllerRef.current = null;
      operationInProgressRef.current = false;
      setGenerationPhase('idle');
    }
  };

  const handleSaveDraft = async () => {
    try {
      setIsSaving(true);
      const clinicalContentComplete = hasCompleteClinicalContent(draft);
      const persisted = clinicalContentComplete
        ? await persistClinicalDraft(draft, auth, savedCase, setSavedCase)
        : await persistPatientDraft(draft, auth, savedCase, setSavedCase);
      setSavedCase(persisted);
      setFeedbackError(false);
      setFeedback(clinicalContentComplete
        ? `Rascunho #${persisted.case.idCaso} salvo. Os anexos ficam somente neste navegador.`
        : `Rascunho #${persisted.case.idCaso} salvo. O conteúdo parcial e os anexos ficam neste navegador até a geração pela IA.`);
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCoherenceIssue = (issue) => {
    setCoherenceProblem(null);
    navigate(issue.route, {
      state: {
        fieldError: issue.message,
        focusField: issue.controlName,
      },
    });
  };

  return (
    <AppLayout breadcrumbCurrent="Referências e Mídias">
      <section className="create-case-page" aria-labelledby="references-media-title">
        <h2 className="sr-only" id="references-media-title">
          Criar Caso Clínico - Referências e Mídias
        </h2>

        <div className="create-case-page__content create-case-page__content--large-gap">
          <Stepper currentStep={4} steps={stepItems} />
          {storageError && <p className="form-feedback form-feedback--error" role="alert">{storageError}</p>}

          <div className="feature-off-notice" role="note">
            <Icon name="info" size={20} />
            <p>
              <strong>Anexar arquivos está desativado nesta versão.</strong>
              <span>Imagens e materiais de estudo ainda não são enviados nem usados pela IA. Você pode gerar o caso clínico normalmente, sem anexos.</span>
            </p>
          </div>

          <div className="references-form">
            {referencesMediaUploads.map((upload, index) => (
              <UploadDropzone
                accept={index === 0 ? 'image/png,image/jpeg' : '.pdf,.doc,.docx,.ppt,.pptx'}
                description={upload.description}
                disabled
                files={index === 0 ? draft.files.clinicalImages : draft.files.documents}
                key={upload.title}
                multiple
                name={index === 0 ? 'clinicalImages' : 'documents'}
                onChange={handleFileChange(index === 0 ? 'clinicalImages' : 'documents')}
                onRemove={handleFileRemove(index === 0 ? 'clinicalImages' : 'documents')}
                title={upload.title}
              />
            ))}
          </div>

          {rateLimitMessage && <p aria-live="polite" className="form-feedback form-feedback--error" role="status">{rateLimitMessage}</p>}
          {feedback && <p aria-live="polite" className={`form-feedback ${feedbackError ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</p>}

          <div className="page-actions page-actions--patient">
            <Button disabled={isGenerating} icon="save" loading={isSaving} loadingText="Salvando..." onClick={handleSaveDraft} variant="secondary">
              Salvar Rascunho
            </Button>

            <div className="page-actions__next">
              <Button disabled={isGenerating || isSaving} icon="arrowLeft" iconPosition="right" to="/criar-caso/conteudo-clinico" variant="outline">
                Anterior
              </Button>
              <Button
                disabled={isRateLimited || isSaving}
                icon="sparkle"
                iconPosition="right"
                loading={isGenerating}
                loadingText="Gerando..."
                onClick={handleGenerateCase}
                variant="primary"
              >
                {isRateLimited ? `Aguarde ${remainingSeconds}s` : 'Gerar Caso'}
              </Button>
            </div>
          </div>
        </div>
      </section>
      {coherenceProblem && (
        <ClinicalCoherenceDialog
          onClose={() => setCoherenceProblem(null)}
          onSelectIssue={handleSelectCoherenceIssue}
          problem={coherenceProblem}
        />
      )}
      {isGenerating && (
        <CaseGenerationLoadingDialog
          elapsedSeconds={elapsedSeconds}
          generationPhase={generationPhase}
          onCancel={() => generationControllerRef.current?.abort()}
        />
      )}
    </AppLayout>
  );
}

function CaseGenerationLoadingDialog({ elapsedSeconds, generationPhase, onCancel }) {
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const previouslyFocusedRef = useRef(null);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        dialogRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  const phaseLabel = GENERATION_PHASE_LABELS[generationPhase] || 'Processando...';
  const elapsedLabel = elapsedSeconds > 0 ? ` Tempo decorrido: ${elapsedSeconds} segundos.` : '';

  return (
    <div className="modal-backdrop modal-backdrop--case-generation" role="presentation">
      <section
        aria-busy="true"
        aria-describedby="case-generation-description case-generation-status"
        aria-labelledby="case-generation-title"
        aria-modal="true"
        className="case-generation-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="case-generation-dialog__spinner-wrap"><span className="case-generation-dialog__spinner" /></span>
        <div className="case-generation-dialog__copy">
          <h2 id="case-generation-title">Gerando seu caso clínico</h2>
          <p id="case-generation-description">Estamos analisando os parâmetros e referências para criar um caso coerente e completo.</p>
        </div>
        <p aria-live="polite" className="sr-only" id="case-generation-status" role="status">{phaseLabel}{elapsedLabel} Pressione Escape para cancelar.</p>
      </section>
    </div>
  );
}

const GENERATION_PHASE_LABELS = {
  validating: 'Validando informações...',
  'saving-case': 'Salvando o caso...',
  'saving-patient': 'Salvando o paciente...',
  'saving-clinical-content': 'Salvando o conteúdo clínico...',
  'waiting-ai': 'Aguardando a IA...',
  'loading-result': 'Preparando o resultado...',
};

function getLatestClinicalContent(savedCase) {
  const list = savedCase?.complete?.conteudosClinicos;
  if (Array.isArray(list) && list.length) {
    return [...list].sort((a, b) => Number(b?.idConteudo || 0) - Number(a?.idConteudo || 0))[0];
  }
  return savedCase?.clinicalContent || null;
}
