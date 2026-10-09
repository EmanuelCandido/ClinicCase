import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout.jsx';
import RecordParagraph from '../components/RecordParagraph.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import SelectField from '../components/SelectField.jsx';
import questionsEmptyIcon from '../assets/figma/ui/questions-empty.svg';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import useAiRateLimit from '../hooks/useAiRateLimit.js';
import { beginAiRequest, completeAiRequest, shouldKeepAiRequestIdentity } from '../services/aiRequestIdentity.js';
import { buildReview } from '../services/caseMappers.js';
import { caseBreadcrumb } from '../services/navigationConfig.js';
import { readCaseGenerationPreferences } from '../services/professorPreferences.js';
import {
  QUESTION_TYPES,
  buildGenerationPayload,
  buildQuestionPayload,
  changeQuestionType,
  blankQuestion,
  mergeQuestions,
  reconcileSavedQuestions,
  normalizeQuestions,
  questionTypeLabel,
  rubricFieldsForType,
  usesAlternatives,
  usesManualReview,
  MAX_AI_QUESTIONS,
  QUESTION_DIFFICULTY_LEVELS,
} from '../services/questionModel.js';
import { difficultyLabel } from '../services/difficultyModel.js';
import {
  deleteQuestion,
  generateQuestionsWithAi,
  getCaseQuestions,
  saveQuestionsBatch,
} from '../services/pibicApi.js';
import { InlineFeedback } from './portal/PortalComponents.jsx';

const QUESTIONS_BREADCRUMB = [
  { label: 'Revisão', to: '/criar-caso/revisao' },
  { label: 'Construção de Perguntas' },
];

const AI_QUESTION_FORMATS = [
  {
    description: 'Respostas abertas para desenvolver raciocínio e argumentação.',
    label: 'Discursiva',
    tipo: 'DISCURSIVA',
  },
  {
    description: 'Questões de múltipla escolha com alternativas e respostas corretas.',
    label: 'Objetiva',
    tipo: 'MULTIPLA_ESCOLHA',
  },
  {
    description: 'Afirmações rápidas para verificar a compreensão de conceitos.',
    label: 'Verdadeiro ou falso',
    tipo: 'VERDADEIRO_FALSO',
  },
];

const QUESTION_TYPE_OPTIONS = QUESTION_TYPES.map((tipo) => ({
  label: questionTypeLabel(tipo),
  value: tipo,
}));

const AI_QUESTION_QUANTITIES = Array.from({ length: MAX_AI_QUESTIONS }, (_, index) => index + 1);
const AI_QUESTION_QUANTITY_OPTIONS = AI_QUESTION_QUANTITIES.map((quantity) => (
  `${quantity} ${quantity === 1 ? 'questão' : 'questões'}`
));

function sameAsCaseOption(caseDifficulty) {
  return caseDifficulty ? `Igual ao caso (${caseDifficulty})` : 'Igual ao caso';
}

function difficultyOptions(caseDifficulty) {
  return [sameAsCaseOption(caseDifficulty), ...QUESTION_DIFFICULTY_LEVELS.map((level) => level.label)];
}

function difficultyOption(level, caseDifficulty) {
  return QUESTION_DIFFICULTY_LEVELS.find((item) => item.value === level)?.label || sameAsCaseOption(caseDifficulty);
}

function difficultyFromOption(label) {
  return QUESTION_DIFFICULTY_LEVELS.find((item) => item.label === label)?.value || '';
}

function difficultyHint(level) {
  return QUESTION_DIFFICULTY_LEVELS.find((item) => item.value === level)?.description
    || 'Usa o nível de dificuldade definido nos parâmetros do caso.';
}

function questionQuantityLabel(quantity) {
  const numericQuantity = Number(quantity);
  return `${numericQuantity} ${numericQuantity === 1 ? 'questão' : 'questões'}`;
}

function prepareGenerationConfig(config) {
  const supportedTypes = new Set(AI_QUESTION_FORMATS.map((format) => format.tipo));
  const selectedTypes = [...new Set(
    (config.selectedTypes?.length ? config.selectedTypes : [config.tipo]).filter((tipo) => supportedTypes.has(tipo)),
  )];
  const normalizedTypes = selectedTypes.length ? selectedTypes : ['MULTIPLA_ESCOLHA'];
  if (normalizedTypes.length === 1) {
    return { ...config, mode: 'SINGULAR', tipo: normalizedTypes[0] };
  }

  const quantidade = Number(config.quantidade);
  if (quantidade < normalizedTypes.length) {
    throw new Error('A quantidade de perguntas deve ser igual ou maior que o número de formatos selecionados.');
  }
  const baseQuantity = Math.floor(quantidade / normalizedTypes.length);
  const remainder = quantidade % normalizedTypes.length;
  const distribuicao = Object.fromEntries(normalizedTypes.map((tipo, index) => [tipo, {
    quantidade: baseQuantity + (index < remainder ? 1 : 0),
    quantidadeAlternativas: Number(config.quantidadeAlternativas || 4),
  }]));
  return { ...config, distribuicao, mode: 'VARIADO' };
}

function generationConfigFromPreferences(preferences) {
  const selectedTypes = [];
  if (preferences.questionTypes.multipleChoice) selectedTypes.push('MULTIPLA_ESCOLHA');
  if (preferences.questionTypes.discursive) selectedTypes.push('DISCURSIVA');
  if (preferences.questionTypes.trueFalse) selectedTypes.push('VERDADEIRO_FALSO');
  if (!selectedTypes.length) selectedTypes.push('MULTIPLA_ESCOLHA');

  const instructions = [];
  if (preferences.questionDifficulty !== 'Acompanhar dificuldade do caso') {
    instructions.push(`Adote dificuldade ${preferences.questionDifficulty.toLocaleLowerCase('pt-BR')}.`);
  }
  if (preferences.questionTypes.clinicalReasoning) {
    instructions.push('Priorize raciocínio clínico e tomada de decisão.');
  }
  if (preferences.includeJustification) {
    instructions.push('Inclua justificativas claras para as respostas.');
  }
  if (preferences.hideDiagnosis) {
    instructions.push('Não revele explicitamente o diagnóstico no enunciado.');
  }

  return {
    mode: selectedTypes.length > 1 ? 'VARIADO' : 'SINGULAR',
    tipo: selectedTypes[0],
    selectedTypes,
    quantidade: Math.min(preferences.questionCount, MAX_AI_QUESTIONS),
    quantidadeAlternativas: 4,
    instrucoesAdicionais: instructions.join(' '),
    distribuicao: {},
  };
}

export default function CreateCaseQuestions() {
  const { auth } = useAuth();
  const { savedCase, setSavedCase } = useCaseDraft();
  const navigate = useNavigate();
  const idCaso = savedCase?.case?.idCaso || savedCase?.complete?.caso?.idCaso;
  const caseReview = buildReview(savedCase);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(Boolean(idCaso));
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [generationPhase, setGenerationPhase] = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [questionDeleteBusy, setQuestionDeleteBusy] = useState(false);
  const [questionDeleteError, setQuestionDeleteError] = useState('');
  const [generationConfig, setGenerationConfig] = useState(() => (
    generationConfigFromPreferences(readCaseGenerationPreferences(auth?.idProfessor))
  ));
  const questionsRef = useRef(questions);
  const activeCaseRef = useRef(idCaso);
  const loadControllerRef = useRef(null);
  const generationControllerRef = useRef(null);
  const batchInProgressRef = useRef(false);
  const {
    clearRateLimit,
    isRateLimited,
    rateLimitMessage,
    registerRateLimit,
    remainingSeconds,
  } = useAiRateLimit();
  questionsRef.current = questions;
  activeCaseRef.current = idCaso;

  const load = useCallback(async (signal) => {
    if (!idCaso) {
      setQuestionsLoading(false);
      return false;
    }
    setQuestionsLoading(true);
    try {
      const response = await getCaseQuestions(idCaso, { signal });
      if (signal?.aborted) return false;
      const normalized = normalizeQuestions(response);
      setQuestions(normalized);
      setFeedback('');
      return normalized;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      setFeedback(error?.message || 'Não foi possível carregar as perguntas.');
      return false;
    } finally {
      if (!signal?.aborted) setQuestionsLoading(false);
    }
  }, [idCaso]);

  useEffect(() => {
    const controller = new AbortController();
    activeCaseRef.current = idCaso;
    loadControllerRef.current = controller;
    load(controller.signal);
    return () => {
      controller.abort();
      generationControllerRef.current?.abort();
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
      if (activeCaseRef.current === idCaso) activeCaseRef.current = null;
    };
  }, [idCaso, load]);

  useEffect(() => {
    if (generationPhase === 'idle') {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const intervalId = globalThis.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [generationPhase]);

  const updateQuestionState = (index, values) => {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...values, dirty: true } : question
    )));
  };

  const updateAlternative = (questionIndex, alternativeIndex, values) => {
    setQuestions((current) => current.map((question, currentQuestionIndex) => {
      if (currentQuestionIndex !== questionIndex) return question;
      return {
        ...question,
        dirty: true,
        alternativas: question.alternativas.map((alternative, currentAlternativeIndex) => (
          currentAlternativeIndex === alternativeIndex ? { ...alternative, ...values } : alternative
        )),
      };
    }));
  };

  const updateRubricField = (questionIndex, question, field, text) => {
    updateQuestionState(questionIndex, {
      rubrica: {
        ...(question.rubrica || {}),
        [field]: text.split(/\r?\n/),
      },
    });
  };

  const chooseCorrectAlternative = (questionIndex, alternativeIndex) => {
    setQuestions((current) => current.map((question, currentQuestionIndex) => (
      currentQuestionIndex === questionIndex
        ? {
            ...question,
            dirty: true,
            alternativas: question.alternativas.map((alternative, index) => ({
              ...alternative,
              correta: index === alternativeIndex,
            })),
          }
        : question
    )));
  };

  const saveAllAndOpenPublish = async () => {
    if (busy || batchInProgressRef.current) return;
    batchInProgressRef.current = true;
    const requestedCaseId = idCaso;

    try {
      setBusy(true);
      const pendingQuestions = questions.filter((question) => !question.id || question.dirty);
      if (pendingQuestions.length) {
        const snapshot = pendingQuestions.map((question) => ({
          question,
          key: question.id ? `id:${question.id}` : `client:${question.clientId}`,
          payload: buildQuestionPayload(question, idCaso),
        }));
        const responses = await saveQuestionsBatch(idCaso, snapshot.map(({ question, payload }) => ({
          id: question.id || null,
          pergunta: payload,
        })));
        if (activeCaseRef.current !== requestedCaseId) return;
        const reconciled = reconcileSavedQuestions(questionsRef.current, snapshot, responses);
        questionsRef.current = reconciled;
        setQuestions(reconciled);
        if (reconciled.some((question) => question.dirty || !question.id)) {
          setFeedback('Algumas edições feitas durante o salvamento foram preservadas. Salve novamente antes de publicar.');
          return;
        }
      }
      setPublishOpen(true);
      setFeedback(questions.length
        ? 'Perguntas salvas. O caso continuará como rascunho.'
        : 'Caso salvo sem perguntas. Ele continuará como rascunho.');
    } catch (error) {
      if (activeCaseRef.current === requestedCaseId) setFeedback(error?.message || 'Não foi possível salvar todas as perguntas.');
    } finally {
      batchInProgressRef.current = false;
      if (activeCaseRef.current === requestedCaseId) setBusy(false);
    }
  };

  const generate = async () => {
    if (generationControllerRef.current) return;
    const requestedCaseId = idCaso;
    let payload;
    try {
      payload = buildGenerationPayload(prepareGenerationConfig(generationConfig));
    } catch (error) {
      setFeedback(error.message);
      return;
    }
    let requestIdentity;
    const controller = new AbortController();
    generationControllerRef.current = controller;
    try {
      setBusy(true);
      requestIdentity = beginAiRequest('generate-questions', requestedCaseId, payload);
      setGenerationPhase('waiting-ai');
      const response = await generateQuestionsWithAi(requestedCaseId, payload, {
        headers: { 'Idempotency-Key': requestIdentity.idempotencyKey },
        signal: controller.signal,
      });
      if (activeCaseRef.current !== requestedCaseId) return;
      setGenerationPhase('loading-result');
      const generatedQuestions = mergeQuestions(questionsRef.current, response);
      setQuestions(generatedQuestions);
      setSavedCase((current) => ({
        ...current,
        complete: current?.complete
          ? { ...current.complete, perguntas: generatedQuestions }
          : current?.complete,
      }));
      clearRateLimit();
      completeAiRequest(requestIdentity);
      setFeedback('Perguntas geradas e mescladas com suas edições ainda não salvas.');
      setAssistantOpen(false);
    } catch (error) {
      if (!shouldKeepAiRequestIdentity(error)) completeAiRequest(requestIdentity);
      if (activeCaseRef.current === requestedCaseId) {
        if (registerRateLimit(error)) setFeedback('');
        else {
          setFeedback(error?.name === 'AbortError'
            ? 'Geração de perguntas cancelada.'
            : error?.message || 'Não foi possível gerar perguntas com IA.');
        }
      }
    } finally {
      generationControllerRef.current = null;
      setGenerationPhase('idle');
      if (activeCaseRef.current !== null) setBusy(false);
    }
  };

  const updateGenerationConfig = (values) => setGenerationConfig((current) => ({ ...current, ...values }));

  const updateQuestionType = (index, tipo) => {
    const current = questions[index];
    const hasRubric = Object.values(current.rubrica || {}).some((items) => items?.length);
    const willDiscard = current.alternativas?.some((item) => item.texto)
      || current.gabarito
      || current.resposta
      || hasRubric;
    if (willDiscard && !window.confirm('Trocar o tipo limpará alternativas, gabarito e resposta incompatíveis. Deseja continuar?')) return;
    setQuestions((items) => items.map((item, itemIndex) => itemIndex === index ? changeQuestionType(item, tipo) : item));
  };

  const requestQuestionDeletion = (question, index) => {
    if (busy || batchInProgressRef.current) return;
    setQuestionDeleteError('');
    setQuestionToDelete({ index, question });
  };

  const cancelQuestionDeletion = () => {
    if (questionDeleteBusy) return;
    setQuestionDeleteError('');
    setQuestionToDelete(null);
  };

  const remove = async () => {
    const pendingDeletion = questionToDelete;
    if (!pendingDeletion || questionDeleteBusy) return;
    const { question } = pendingDeletion;
    try {
      setQuestionDeleteBusy(true);
      setQuestionDeleteError('');
      if (question.id) await deleteQuestion(question.id);
      setQuestions((current) => current.filter((item) => item !== question));
      setQuestionToDelete(null);
      setFeedback(question.id ? 'Pergunta removida.' : 'Pergunta removida.');
    } catch (error) {
      setQuestionDeleteError(error?.message || 'Não foi possível apagar a pergunta. Tente novamente.');
    } finally {
      setQuestionDeleteBusy(false);
    }
  };

  if (!idCaso) {
    return (
      <AppLayout breadcrumbItems={caseBreadcrumb(savedCase, QUESTIONS_BREADCRUMB)}>
        <section className="questions-empty"><Icon name="info" size={24} /><p>Gere ou abra um caso antes de construir perguntas.</p></section>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbItems={caseBreadcrumb(savedCase, QUESTIONS_BREADCRUMB)}>
      <section className="question-builder-page">
        <article className="medical-record medical-record--questions">
          <header className="medical-record__header">
            <h2>{caseReview?.title || 'PRONTUÁRIO MÉDICO SIMULADO'}</h2>
            <p>{caseReview?.generatedAt || 'Caso carregado'}</p>
          </header>
          <div className="medical-record__body">
            {caseReview?.sections?.map((section) => (
              <section className="medical-record__section" key={section.title}>
                <h3>{section.title}</h3>
                {section.paragraphs.map((paragraph) => <RecordParagraph key={paragraph}>{paragraph}</RecordParagraph>)}
              </section>
            ))}
          </div>
        </article>

        <div className="question-builder">
          <div className="academic-assistant question-builder__generate-action">
            <h2>Assistente Acadêmico</h2>
            <p>Deixe a IA gerar perguntas baseadas nos objetivos pedagógicos.</p>
            <Button
              disabled={busy}
              icon="sparkle"
              iconPosition="right"
              onClick={() => {
                setFeedback('');
                setAssistantOpen(true);
              }}
              variant="primary"
            >
              Gerar Perguntas
            </Button>
          </div>

          {!questionsLoading && questions.length === 0 && (
            <section aria-labelledby="questions-empty-title" className="question-builder-empty">
              <div className="question-builder-empty__message">
                <span className="question-builder-empty__icon"><img alt="" aria-hidden="true" src={questionsEmptyIcon} /></span>
                <h2 id="questions-empty-title">Nenhuma questão gerada ainda</h2>
                <p>Gere perguntas com o assistente acadêmico ou adicione uma questão manualmente para começar.</p>
              </div>
            </section>
          )}

          {questions.map((question, index) => (
            <article
              className={`question-card ${question.tipo === 'DISCURSIVA' ? 'question-card--discursive' : ''} ${question.tipo === 'VERDADEIRO_FALSO' ? 'question-card--true-false' : ''}`}
              key={question.id || question.clientId}
            >
              <header>
                <h2>Pergunta {index + 1}</h2>
                <div>
                  <SelectField
                    ariaLabel={`Tipo da pergunta ${index + 1}`}
                    className="question-type-select"
                    hideLabel
                    name={`question-type-${index + 1}`}
                    onChange={(event) => updateQuestionType(index, event.target.value)}
                    options={QUESTION_TYPE_OPTIONS}
                    value={question.tipo}
                    valueLabel={questionTypeLabel(question.tipo)}
                  />
                  <button disabled={busy} aria-label={`Apagar pergunta ${index + 1}`} className="delete-question" onClick={() => requestQuestionDeletion(question, index)} type="button">Apagar</button>
                </div>
              </header>
              <label className="question-prompt">Enunciado da Questão<textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateQuestionState(index, { texto: event.target.value })} placeholder="Digite o enunciado" spellCheck={false} value={question.texto} /></label>
              {usesAlternatives(question.tipo) && <fieldset className="alternatives-fieldset">
                <legend>Alternativas</legend>
                {question.alternativas.map((alternative, alternativeIndex) => (
                  <label className={`question-alternative ${alternative.correta ? 'question-alternative--correct' : ''}`} key={alternative.id || `${question.clientId}-${alternative.letra}`}>
                    <input checked={Boolean(alternative.correta)} name={`correct-${question.clientId}`} onChange={() => chooseCorrectAlternative(index, alternativeIndex)} type="radio" />
                    <strong>{alternative.letra}.</strong>
                    <textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateAlternative(index, alternativeIndex, { texto: event.target.value })} placeholder={`Alternativa ${alternative.letra}`} rows="2" spellCheck={false} value={alternative.texto} />
                  </label>
                ))}
              </fieldset>}
              {question.tipo === 'VERDADEIRO_FALSO' && (
                <fieldset className="alternatives-fieldset true-false-options">
                  <legend>Resposta correta</legend>
                  {[{ label: 'Verdadeiro', value: 'VERDADEIRO' }, { label: 'Falso', value: 'FALSO' }].map((option) => (
                    <label
                      className={`true-false-option ${question.gabarito === option.value ? 'true-false-option--correct' : ''}`}
                      key={option.value}
                    >
                      <input checked={question.gabarito === option.value} name={`answer-${question.clientId}`} onChange={() => updateQuestionState(index, { gabarito: option.value })} type="radio" />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {question.tipo === 'DIAGNOSTICO' && <label className="question-prompt">Diagnóstico esperado e sinônimos (separe por |)<textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateQuestionState(index, { gabarito: event.target.value })} placeholder="Ex.: pneumonia comunitária | PAC" spellCheck={false} value={question.gabarito} /></label>}
              {question.tipo === 'DISCURSIVA' && (
                <label className="question-prompt question-prompt--expected-answer">
                  Resposta esperada
                  <textarea
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    onChange={(event) => updateQuestionState(index, { resposta: event.target.value })}
                    placeholder="Digite a resposta esperada."
                    spellCheck={false}
                    value={question.resposta}
                  />
                </label>
              )}
              {question.tipo === 'CONDUTA_CLINICA' && <p className="question-type-note">Esta pergunta será avaliada por revisão manual.</p>}
              {!usesManualReview(question.tipo) && !usesAlternatives(question.tipo) && <label className="question-prompt">Explicação / justificativa<textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateQuestionState(index, { resposta: event.target.value })} placeholder="Explique o gabarito." spellCheck={false} value={question.resposta} /></label>}
              {usesAlternatives(question.tipo) && <label className="question-prompt">Explicação do gabarito<textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateQuestionState(index, { resposta: event.target.value })} placeholder="Explique por que a alternativa está correta." spellCheck={false} value={question.resposta} /></label>}
              {question.tipo === 'CONDUTA_CLINICA' && <label className="question-prompt">Resumo textual da rubrica<textarea autoCapitalize="none" autoComplete="off" autoCorrect="off" onChange={(event) => updateQuestionState(index, { resposta: event.target.value })} placeholder="Resuma os critérios para clientes e registros antigos." spellCheck={false} value={question.resposta} /></label>}
              {question.tipo === 'CONDUTA_CLINICA' && (
                <fieldset className="question-rubric">
                  <legend>Rubrica estruturada</legend>
                  <p>
                    Informe um item por linha. Se usar a estrutura, critérios essenciais são obrigatórios
                    {question.tipo === 'CONDUTA_CLINICA' ? ' e prioridades também.' : '.'}
                  </p>
                  <div className="question-rubric__grid">
                    {rubricFieldsForType(question.tipo).map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea
                          autoCapitalize="none"
                          autoComplete="off"
                          autoCorrect="off"
                          onChange={(event) => updateRubricField(index, question, field.key, event.target.value)}
                          placeholder={`Um item de ${field.label.toLowerCase()} por linha`}
                          rows="3"
                          spellCheck={false}
                          value={question.rubrica?.[field.key]?.join('\n') || ''}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </article>
          ))}

          <div className={`question-builder__actions ${!questionsLoading && questions.length === 0 ? 'question-builder__actions--empty' : ''}`}>
            <Button icon="add" iconPosition="right" onClick={() => setQuestions((current) => [...current, blankQuestion()])} variant="secondary">Adicionar Nova Pergunta</Button>
            <Button icon="send" iconPosition="right" loading={busy} onClick={saveAllAndOpenPublish} variant="primary">Publicar Caso Clínico</Button>
          </div>
          {rateLimitMessage && !assistantOpen && <InlineFeedback message={rateLimitMessage} resetKey="questions-rate-limit" tone="error" />}
          {feedback && !assistantOpen && <InlineFeedback message={feedback} onDismiss={() => setFeedback('')} />}
        </div>
      </section>

      {assistantOpen && (
        <GenerationModal
          busy={busy}
          elapsedSeconds={elapsedSeconds}
          feedback={feedback}
          caseDifficulty={difficultyLabel(savedCase?.complete?.caso || savedCase?.case, '')}
          generationConfig={generationConfig}
          generationPhase={generationPhase}
          isRateLimited={isRateLimited}
          onCancel={() => generationControllerRef.current?.abort()}
          onClose={() => setAssistantOpen(false)}
          onGenerate={generate}
          onUpdateConfig={updateGenerationConfig}
          rateLimitMessage={rateLimitMessage}
          remainingSeconds={remainingSeconds}
        />
      )}

      {questionToDelete && (
        <QuestionDeleteDialog
          busy={questionDeleteBusy}
          error={questionDeleteError}
          index={questionToDelete.index}
          onCancel={cancelQuestionDeletion}
          onConfirm={remove}
        />
      )}

      {publishOpen && (
        <PublishModal
          caseInfo={savedCase?.complete?.caso || savedCase?.case}
          completeCase={{ ...(savedCase?.complete || {}), perguntas: questions }}
          idCaso={idCaso}
          onClose={() => setPublishOpen(false)}
          onDraftSaved={(complete) => {
            setSavedCase((current) => ({
              ...current,
              case: complete?.caso || current?.case,
              complete: complete || current?.complete,
              savedAt: new Date().toISOString(),
            }));
            navigate('/meus-casos', {
              state: {
                savedCaseId: complete?.caso?.idCaso || idCaso,
                successMessage: 'Caso clínico salvo como rascunho.',
              },
            });
          }}
        />
      )}
    </AppLayout>
  );
}

function QuestionDeleteDialog({ busy, error, index, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const previouslyFocusedRef = useRef(null);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled)') || [];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-backdrop modal-backdrop--question-delete"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-busy={busy}
        aria-describedby={`delete-question-description${error ? ' delete-question-error' : ''}`}
        aria-labelledby="delete-question-title"
        aria-modal="true"
        className="question-delete-dialog"
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="question-delete-dialog__icon">!</span>
        <div className="question-delete-dialog__copy">
          <h2 id="delete-question-title">Apagar esta questão?</h2>
          <p id="delete-question-description">A questão e as respostas associadas serão removidas permanentemente.</p>
        </div>
        {error && <p className="question-delete-dialog__error" id="delete-question-error" role="alert">{error}</p>}
        <div className="question-delete-dialog__actions">
          <button className="button button--outline" disabled={busy} onClick={onCancel} ref={cancelButtonRef} type="button"><span>Cancelar</span></button>
          <Button disabled={busy} loading={busy} loadingText="Apagando..." onClick={onConfirm} variant="danger">Apagar questão</Button>
        </div>
        <span className="sr-only">Confirmação para apagar a pergunta {index + 1}.</span>
      </section>
    </div>
  );
}

function GenerationModal({
  busy,
  caseDifficulty,
  elapsedSeconds,
  feedback,
  generationConfig,
  generationPhase,
  isRateLimited,
  onCancel,
  onClose,
  onGenerate,
  onUpdateConfig,
  rateLimitMessage,
  remainingSeconds,
}) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef(null);
  const generationActiveRef = useRef(false);
  const generationActive = generationPhase !== 'idle';
  onCloseRef.current = onClose;
  generationActiveRef.current = generationActive;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    modalRef.current?.querySelector('.select-field__trigger')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!generationActiveRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = modalRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled)') || [];
      if (!focusable.length) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!modalRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (generationPhase === 'loading-result') modalRef.current?.focus();
  }, [generationPhase]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (!generationActive && event.target === event.currentTarget) onClose();
    }} role="presentation">
      <section
        aria-busy={generationActive}
        aria-describedby="generation-assistant-description"
        aria-labelledby="generation-assistant-title"
        aria-modal="true"
        className="academic-assistant generation-modal"
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 className="generation-modal__title" id="generation-assistant-title"><Icon name="sparkle" size={16} />Gerar perguntas com IA</h2>
            <p id="generation-assistant-description">Defina a quantidade, o nível de dificuldade e um ou mais formatos.</p>
          </div>
          <button aria-label="Fechar" disabled={generationActive} onClick={onClose} type="button"><Icon name="close" size={24} /></button>
        </header>

        <hr />

        {generationActive && (
          <p aria-live="polite" className="ai-progress" role="status">
            {generationPhase === 'loading-result'
              ? 'Atualizando a lista de perguntas...'
              : `Aguardando a IA${elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : '...'}`}
          </p>
        )}

        <div className="generation-modal__body">
          <div className="generation-modal__quantity">
            <SelectField
              disabled={busy}
              label="Quantidade de questões"
              name="quantidade"
              onChange={(event) => onUpdateConfig({ quantidade: Number.parseInt(event.target.value, 10) })}
              options={AI_QUESTION_QUANTITY_OPTIONS}
              value={questionQuantityLabel(generationConfig.quantidade)}
            />
            <small>Você poderá revisar e editar as perguntas antes de publicar.</small>
          </div>

          <div className="generation-modal__quantity">
            <SelectField
              disabled={busy}
              label="Nível de dificuldade"
              name="nivelDificuldade"
              onChange={(event) => onUpdateConfig({ nivelDificuldade: difficultyFromOption(event.target.value) })}
              options={difficultyOptions(caseDifficulty)}
              value={difficultyOption(generationConfig.nivelDificuldade, caseDifficulty)}
            />
            <small>{difficultyHint(generationConfig.nivelDificuldade)}</small>
          </div>

          <fieldset className="generation-formats" disabled={busy}>
            <legend>Formatos das questões</legend>
            <p>Selecione um ou mais formatos para compor o conjunto.</p>
            <div className="generation-formats__options">
              {AI_QUESTION_FORMATS.map((format) => {
                const selectedTypes = generationConfig.selectedTypes?.length
                  ? generationConfig.selectedTypes
                  : [generationConfig.tipo];
                const selected = selectedTypes.includes(format.tipo);
                // Cada formato precisa de pelo menos uma pergunta, então o limite vale também aqui.
                const blocked = !selected && selectedTypes.length >= MAX_AI_QUESTIONS;
                return (
                  <label className={`generation-format ${selected ? 'generation-format--selected' : ''}`} key={format.tipo}>
                    <input
                      checked={selected}
                      disabled={blocked}
                      name="generation-format"
                      onChange={() => {
                        if (selected && selectedTypes.length === 1) return;
                        const nextTypes = selected
                          ? selectedTypes.filter((tipo) => tipo !== format.tipo)
                          : [...selectedTypes, format.tipo];
                        onUpdateConfig({
                          mode: nextTypes.length > 1 ? 'VARIADO' : 'SINGULAR',
                          quantidade: Math.min(Math.max(Number(generationConfig.quantidade), nextTypes.length), MAX_AI_QUESTIONS),
                          selectedTypes: nextTypes,
                          tipo: nextTypes[0],
                        });
                      }}
                      type="checkbox"
                      value={format.tipo}
                    />
                    <span>
                      <strong>{format.label}</strong>
                      <small>{format.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        {rateLimitMessage && <p aria-live="polite" className="generation-modal__feedback" role="status"><Icon name="info" size={17} />{rateLimitMessage}</p>}
        {feedback && <p aria-live="polite" className="generation-modal__feedback" role="status"><Icon name="info" size={17} />{feedback}</p>}

        <div className="generation-modal__actions">
          <Button disabled={generationPhase === 'loading-result'} onClick={generationPhase === 'waiting-ai' ? onCancel : onClose} variant="outline">Cancelar</Button>
          <Button
            disabled={(busy && !generationActive) || isRateLimited}
            icon="sparkle"
            iconPosition="right"
            loading={generationActive}
            loadingText="Gerando perguntas..."
            onClick={onGenerate}
            variant="primary"
          >
            {isRateLimited ? `Aguarde ${remainingSeconds}s` : 'Gerar Perguntas'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PublishModal({ caseInfo, completeCase, idCaso, onClose, onDraftSaved }) {
  const [feedback, setFeedback] = useState('');
  const [downloading, setDownloading] = useState(false);
  const closeButtonRef = useRef(null);
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef(null);
  const modalBusyRef = useRef(false);
  onCloseRef.current = onClose;
  modalBusyRef.current = downloading;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!modalBusyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = modalRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]') || [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!modalRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  const confirm = () => {
    if (downloading) return;
    onDraftSaved?.({
      ...completeCase,
      caso: {
        ...(completeCase?.caso || caseInfo || {}),
        status: 'RASCUNHO',
      },
    });
  };

  const downloadPrivatePdf = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      const { downloadCasesPdf } = await import('../services/casePdf.js');
      await downloadCasesPdf([{
        ...completeCase,
        caso: completeCase?.caso || caseInfo,
      }], `caso-clinico-${idCaso}.pdf`);
      setFeedback('PDF gerado com sucesso. O caso continua como rascunho.');
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível gerar o PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!downloading && event.target === event.currentTarget) onClose();
    }}>
      <section aria-describedby="publish-description" aria-labelledby="publish-title" aria-modal="true" className="publish-modal" ref={modalRef} role="dialog">
        <header><div><h2 id="publish-title">Publicar Caso Clínico</h2><p id="publish-description">A publicação para turmas ainda não está disponível. O caso será mantido como rascunho.</p></div><button aria-label="Fechar" disabled={downloading} onClick={onClose} ref={closeButtonRef} type="button"><Icon name="close" size={24} /></button></header>
        <hr />
        <h3><Icon name="global" size={24} />Modo de Publicação</h3>
        <div className="publication-modes">
          <button aria-label="Publicar para turmas (indisponível)" className="publication-mode--unavailable" disabled type="button"><span><Icon name="people" size={20} />Publicar <small>Indisponível</small></span><p>A publicação para turmas ainda não está disponível.</p><i /></button>
          <button aria-pressed="true" className="is-active" disabled={downloading} type="button"><span><Icon name="lock" size={20} />Privado</span><p>Mantenha o caso na sua biblioteca privada e baixe em PDF quando quiser.</p><i /></button>
        </div>

        <div className="private-download"><h3>Download do caso</h3><div><strong>Exportar</strong><p>Gere uma versão em PDF do caso clínico para salvar, imprimir ou compartilhar manualmente.</p><Button icon="download" iconPosition="right" loading={downloading} loadingText="Gerando PDF..." onClick={downloadPrivatePdf} variant="outline">Baixar PDF</Button></div></div>

        {feedback && <p aria-live="polite" className="integration-feedback" role="status"><Icon name="info" size={17} />{feedback}</p>}
        <Button disabled={downloading} icon="save" iconPosition="right" onClick={confirm} variant="primary">Manter como Rascunho</Button>
      </section>
    </div>
  );
}
