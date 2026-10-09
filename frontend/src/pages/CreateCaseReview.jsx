import AppLayout from '../components/AppLayout.jsx';
import RecordParagraph from '../components/RecordParagraph.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import SelectField from '../components/SelectField.jsx';
import TextAreaField from '../components/TextAreaField.jsx';
import { useEffect, useRef, useState } from 'react';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import useAiRateLimit from '../hooks/useAiRateLimit.js';
import { selectOptions } from '../services/caseConfig.js';
import { buildReview } from '../services/caseMappers.js';
import { caseBreadcrumb } from '../services/navigationConfig.js';
import { difficultyLevel } from '../services/difficultyModel.js';
import { beginAiRequest, completeAiRequest, shouldKeepAiRequestIdentity } from '../services/aiRequestIdentity.js';
import {
  adjustClinicalContentWithAi,
  getCompleteCase,
  updateCase,
  updateClinicalContent,
  updatePatient,
} from '../services/pibicApi.js';
import { InlineFeedback } from './portal/PortalComponents.jsx';

const quickActions = [
  { label: 'Tornar o Caso mais Simples', icon: 'minus', tipoAjuste: 'SIMPLIFICAR' },
  { label: 'Tornar o Caso mais Complexo', icon: 'arrowUp', tipoAjuste: 'COMPLEXIFICAR' },
];

export default function CreateCaseReview() {
  const { savedCase, setSavedCase } = useCaseDraft();
  const caseReview = buildReview(savedCase);
  const [instruction, setInstruction] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editingSection, setEditingSection] = useState(null);
  const [sectionDraft, setSectionDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const operationInProgressRef = useRef(false);
  const operationControllerRef = useRef(null);
  const idCaso = savedCase?.case?.idCaso || savedCase?.complete?.caso?.idCaso;
  const {
    clearRateLimit,
    isRateLimited,
    rateLimitMessage,
    registerRateLimit,
  } = useAiRateLimit();
  useEffect(() => () => operationControllerRef.current?.abort(), []);

  const refresh = async (preferredComplete, signal) => {
    const complete = preferredComplete || await getCompleteCase(idCaso, { signal });
    setSavedCase((current) => ({
      ...current,
      case: complete?.caso || current?.case,
      complete,
      savedAt: new Date().toISOString(),
    }));
  };
  const adjust = async (tipoAjuste) => {
    if (!idCaso || operationInProgressRef.current) return;
    operationInProgressRef.current = true;
    const controller = new AbortController();
    operationControllerRef.current = controller;
    const payload = {
      tipoAjuste,
      instrucao: instruction,
      dadosSinteticosOuDesidentificados: true,
    };
    let requestIdentity;
    try {
      setBusy(true);
      requestIdentity = beginAiRequest('adjust-content', idCaso, {
        ...payload,
        sourceRevision: buildAdjustmentSourceRevision(savedCase),
      });
      const response = await adjustClinicalContentWithAi(idCaso, payload, {
        headers: { 'Idempotency-Key': requestIdentity.idempotencyKey },
        signal: controller.signal,
      });
      await refresh(response?.completo, controller.signal);
      clearRateLimit();
      completeAiRequest(requestIdentity);
      setFeedback('Caso ajustado pela IA.');
    } catch (error) {
      if (!shouldKeepAiRequestIdentity(error)) completeAiRequest(requestIdentity);
      if (registerRateLimit(error)) setFeedback('');
      else setFeedback(error?.name === 'AbortError' ? 'Ajuste cancelado.' : error.message);
    } finally {
      operationControllerRef.current = null;
      operationInProgressRef.current = false;
      setBusy(false);
    }
  };
  const startSectionEdit = (section) => {
    const descriptorConfig = getSectionEditDescriptor(savedCase, section);
    if (!descriptorConfig) return;
    setEditingSection(section.title);
    setSectionDraft(Object.fromEntries(descriptorConfig.fields.map((field) => [
      field.key,
      field.value === null || field.value === undefined ? '' : String(field.value),
    ])));
    setFeedback('');
  };
  const cancelSectionEdit = () => {
    setEditingSection(null);
    setSectionDraft({});
  };
  const saveSection = async (event, section) => {
    event.preventDefault();
    if (operationInProgressRef.current) return;
    const descriptorConfig = getSectionEditDescriptor(savedCase, section);
    if (!descriptorConfig) return;
    const emptyRequiredField = descriptorConfig.fields.find((field) => (
      field.required !== false && !String(sectionDraft[field.key] ?? '').trim()
    ));
    if (emptyRequiredField) {
      setFeedback(`Preencha ${emptyRequiredField.label.toLowerCase()} antes de salvar.`);
      return;
    }
    operationInProgressRef.current = true;
    try {
      setSavingManual(true);
      await persistParagraphEdit(savedCase, descriptorConfig, sectionDraft);
      await refresh(null);
      cancelSectionEdit();
      setFeedback('Seção atualizada. A IA usará estes dados nos próximos ajustes.');
    } catch (error) {
      setFeedback(error.message);
    } finally {
      operationInProgressRef.current = false;
      setSavingManual(false);
    }
  };

  return (
    <AppLayout breadcrumbItems={caseBreadcrumb(savedCase, [{ label: 'Revisão' }])}>
      <section className="review-page" aria-labelledby="review-title">
        <div className="review-page__content">
          <article className="medical-record">
            <header className="medical-record__header">
              <h2 id="review-title">{caseReview?.title || 'Nenhum caso aberto'}</h2>
              <p>{caseReview?.generatedAt || 'Preencha as etapas anteriores e salve o caso para revisar o retorno.'}</p>
            </header>

            <div className="medical-record__body">
              {caseReview?.sections.map((section) => {
                const sectionDescriptor = getSectionEditDescriptor(savedCase, section);
                const isEditing = editingSection === section.title;
                return (
                  <form
                    className={`medical-record__section ${isEditing ? 'medical-record__section--editing' : ''}`}
                    key={section.title}
                    onSubmit={(event) => saveSection(event, section)}
                  >
                    <div className="medical-record__section-heading">
                      <h3>{section.title}</h3>
                      {isEditing ? (
                        <div className="medical-record__section-actions">
                          <button disabled={savingManual} onClick={cancelSectionEdit} type="button">Cancelar</button>
                          <button disabled={savingManual} type="submit">{savingManual ? 'Salvando...' : 'Salvar'}</button>
                        </div>
                      ) : sectionDescriptor ? (
                        <button
                          aria-label={`Editar seção ${section.title.replace(/:$/, '').toLowerCase()}`}
                          className="medical-record__edit-button"
                          disabled={busy || savingManual || Boolean(editingSection)}
                          onClick={() => startSectionEdit(section)}
                          title="Editar seção"
                          type="button"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                      ) : null}
                    </div>
                    {section.paragraphs.map((paragraph, index) => {
                      const descriptorConfig = getParagraphEditDescriptor(savedCase, section.title, index);
                      return isEditing && descriptorConfig ? (
                        <EditableParagraph
                          autoFocus={index === 0}
                          descriptor={descriptorConfig}
                          disabled={busy || savingManual}
                          key={`${section.title}-${index}`}
                          onChange={(key, value) => setSectionDraft((current) => ({ ...current, [key]: value }))}
                          paragraphIndex={index}
                          sectionTitle={section.title}
                          values={sectionDraft}
                        />
                      ) : <RecordParagraph key={`${section.title}-${index}`}>{paragraph}</RecordParagraph>;
                    })}
                  </form>
                );
              }) || (
                <section className="medical-record__section">
                  <h3>CASO NÃO ENCONTRADO:</h3>
                  <p>A revisão será preenchida depois que `/casos`, `/pacientes` e `/casos/:id/ia/gerar` responderem com sucesso.</p>
                </section>
              )}
            </div>
          </article>

          <aside className="review-panel">
            <div className="review-panel__card">
              <section className="review-panel__section">
                <h3>Ações Rápidas</h3>
                <div className="review-panel__actions">
                  {quickActions.map((action) => (
                    <button className="quick-action" key={action.label} type="button" disabled={Boolean(editingSection) || busy || savingManual || isRateLimited} onClick={()=>adjust(action.tipoAjuste)}>
                      <span>{action.label}</span>
                      <Icon name={action.icon} size={16} />
                    </button>
                  ))}
                </div>
              </section>

              <section className="review-panel__section">
                <TextAreaField
                  label="Solicitar Ajuste"
                  onChange={(e)=>setInstruction(e.target.value)} value={instruction}
                  placeholder="Descreva o ajuste desejado"
                />
                <Button disabled={!instruction || Boolean(editingSection) || busy || savingManual || isRateLimited} onClick={()=>adjust('PERSONALIZADO')} variant="primary">Enviar</Button>
              </section>

              <section className="review-panel__manual">
                <div>
                  <h3>Edição Manual</h3>
                  <p>
                    Use o lápis no título de cada seção. Os rótulos permanecem fixos e somente os valores podem ser alterados.
                  </p>
                </div>
              </section>
            </div>

            {rateLimitMessage && <InlineFeedback message={rateLimitMessage} resetKey="review-rate-limit" tone="error" />}
            {feedback && <InlineFeedback message={feedback} onDismiss={() => setFeedback('')} />}
            <Button icon="chevronRight" iconPosition="right" to="/criar-caso/perguntas" variant="primary">
              Ir para perguntas
            </Button>
          </aside>
        </div>
      </section>
    </AppLayout>
  );
}

function getLatestClinicalContent(savedCase) {
  const list = savedCase?.complete?.conteudosClinicos;
  if (Array.isArray(list) && list.length) {
    return [...list].sort((a, b) => Number(b?.idConteudo || 0) - Number(a?.idConteudo || 0))[0];
  }
  return savedCase?.clinicalContent || null;
}

const CLINICAL_FIELDS = ['sintomas', 'contexto', 'examClinico', 'antecClinico', 'diagEsperado'];
const CLINICAL_LABELS = {
  sintomas: 'Sintomas',
  contexto: 'Contexto',
  examClinico: 'Exame clínico',
  antecClinico: 'Antecedentes/comorbidades',
  diagEsperado: 'Diagnóstico esperado',
};

const SEX_OPTIONS = [
  { label: 'Masculino', value: 'MASCULINO' },
  { label: 'Feminino', value: 'FEMININO' },
  { label: 'Outro', value: 'OUTRO' },
  { label: 'Não informado', value: 'NAO_INFORMADO' },
];
const MARITAL_STATUS_OPTIONS = [
  { label: 'Solteiro(a)', value: 'SOLTEIRO' },
  { label: 'Casado(a)', value: 'CASADO' },
  { label: 'Divorciado(a)', value: 'DIVORCIADO' },
  { label: 'Viúvo(a)', value: 'VIUVO' },
  { label: 'Separado(a)', value: 'SEPARADO' },
  { label: 'União estável', value: 'UNIAO_ESTAVEL' },
  { label: 'Não informado', value: 'NAO_INFORMADO' },
];
const SPECIALTY_OPTIONS = selectOptions.specialties.map((value) => ({ label: value, value }));
const DIFFICULTY_OPTIONS = selectOptions.difficulties.map((label) => ({
  label,
  value: difficultyLevel(label),
}));

function getParagraphEditDescriptor(savedCase, sectionTitle, paragraphIndex) {
  const caseInfo = getCaseInfo(savedCase);
  const patient = getPatient(savedCase);
  const content = getLatestClinicalContent(savedCase);
  const caseFields = [
    [{ key: 'titulo', label: 'Título', value: caseInfo?.titulo }],
    [{
      key: 'especialidade',
      label: 'Especialidade',
      options: includeCurrentOption(SPECIALTY_OPTIONS, caseInfo?.especialidade),
      searchable: true,
      searchPlaceholder: 'Pesquisar especialidade...',
      value: caseInfo?.especialidade,
    }],
    [{ key: 'disciplina', label: 'Disciplina', value: caseInfo?.disciplina }],
    [{ key: 'areaSaude', label: 'Área da saúde', value: caseInfo?.areaSaude }],
    [{ key: 'nivelDificuldade', label: 'Dificuldade', options: DIFFICULTY_OPTIONS, value: caseInfo?.nivelDificuldade || 'MEDIA' }],
    null,
  ];
  const patientFields = [
    [
      { key: 'nome', label: 'Nome', value: patient?.nome },
      { key: 'idade', label: 'Idade', max: 130, min: 0, required: false, type: 'number', value: patient?.idade },
    ],
    [
      { key: 'sexo', label: 'Sexo', options: SEX_OPTIONS, value: patient?.sexo || 'NAO_INFORMADO' },
      { key: 'estadoCivil', label: 'Estado civil', options: MARITAL_STATUS_OPTIONS, value: patient?.estadoCivil || 'NAO_INFORMADO' },
    ],
    [
      { emptyValue: 'NAO_INFORMADO', key: 'profissao', label: 'Profissão', required: false, value: patient?.profissao },
      { emptyValue: 'NAO_INFORMADO', key: 'peso', label: 'Peso', required: false, value: patient?.peso },
      { emptyValue: 'NAO_INFORMADO', key: 'altura', label: 'Altura', required: false, value: patient?.altura },
    ],
  ];

  if (sectionTitle === 'DADOS DO CASO:' && caseInfo && caseFields[paragraphIndex]) {
    return descriptor('case', caseFields[paragraphIndex]);
  }
  if (sectionTitle === 'IDENTIFICAÇÃO DO PACIENTE:' && patient && patientFields[paragraphIndex]) {
    return descriptor('patient', patientFields[paragraphIndex]);
  }
  if (sectionTitle === 'CONTEÚDO CLÍNICO:' && content && CLINICAL_FIELDS[paragraphIndex]) {
    const key = CLINICAL_FIELDS[paragraphIndex];
    return descriptor('clinical', [{ key, label: CLINICAL_LABELS[key], multiline: true, value: content[key] }]);
  }
  if (sectionTitle === 'OBJETIVO DE APRENDIZAGEM:' && caseInfo && paragraphIndex === 0) {
    return descriptor('case', [{
      key: 'objetivoAprendizagem',
      label: 'Objetivo de aprendizagem',
      multiline: true,
      required: false,
      value: caseInfo.objetivoAprendizagem,
    }]);
  }
  return null;
}

function getSectionEditDescriptor(savedCase, section) {
  const paragraphDescriptors = section.paragraphs
    .map((_, index) => getParagraphEditDescriptor(savedCase, section.title, index))
    .filter(Boolean);
  if (!paragraphDescriptors.length) return null;

  const entities = new Set(paragraphDescriptors.map((item) => item.entity));
  if (entities.size !== 1) return null;
  const fieldsByKey = new Map();
  paragraphDescriptors.forEach((item) => item.fields.forEach((field) => fieldsByKey.set(field.key, field)));
  return descriptor(paragraphDescriptors[0].entity, [...fieldsByKey.values()]);
}

function descriptor(entity, fields) {
  return {
    accessibleLabel: fields.map((field) => field.label.toLowerCase()).join(' e '),
    entity,
    fields,
  };
}

function EditableParagraph({
  autoFocus,
  descriptor: descriptorConfig,
  disabled,
  onChange,
  paragraphIndex,
  sectionTitle,
  values,
}) {
  const fields = new Map(descriptorConfig.fields.map((field) => [field.key, field]));
  const editable = (key, shouldFocus = false) => {
    const field = fields.get(key);
    return (
      <EditableValue
        autoFocus={autoFocus && shouldFocus}
        disabled={disabled}
        field={field}
        key={key}
        onChange={(value) => onChange(key, value)}
        value={values[key] ?? ''}
      />
    );
  };

  if (sectionTitle === 'IDENTIFICAÇÃO DO PACIENTE:') {
    if (paragraphIndex === 0) {
      return <div className="medical-record__editable-paragraph"><strong>Paciente: </strong>{editable('nome', true)}<span>, </span>{editable('idade')}<span> anos.</span></div>;
    }
    if (paragraphIndex === 1) {
      return <div className="medical-record__editable-paragraph"><strong>Sexo: </strong>{editable('sexo', true)}<span>. </span><strong>Estado civil: </strong>{editable('estadoCivil')}<span>.</span></div>;
    }
    return <div className="medical-record__editable-paragraph"><strong>Profissão: </strong>{editable('profissao', true)}<span>. </span><strong>Peso: </strong>{editable('peso')}<span>. </span><strong>Altura: </strong>{editable('altura')}<span>.</span></div>;
  }

  const field = descriptorConfig.fields[0];
  if (sectionTitle === 'OBJETIVO DE APRENDIZAGEM:') {
    return <div className="medical-record__editable-paragraph">{editable(field.key, true)}</div>;
  }
  return <div className="medical-record__editable-paragraph"><strong>{field.label}: </strong>{editable(field.key, true)}</div>;
}

function EditableValue({ autoFocus, disabled, field, onChange, value }) {
  const editableRef = useRef(null);

  useEffect(() => {
    if (field?.options || !editableRef.current) return;
    const nextValue = String(value ?? '');
    if (editableRef.current.textContent !== nextValue) editableRef.current.textContent = nextValue;
  }, [field?.options, value]);

  useEffect(() => {
    if (autoFocus && !field?.options) editableRef.current?.focus();
  }, [autoFocus, field?.options]);

  if (field?.options) {
    const selectedOption = field.options.find((option) => String(option.value) === String(value));
    return (
      <SelectField
        ariaLabel={`Editar ${field.label.toLowerCase()}`}
        autoFocus={autoFocus}
        className="medical-record__inline-select"
        disabled={disabled}
        hideLabel
        onChange={(event) => onChange(event.target.value)}
        options={field.options}
        searchable={field.searchable}
        searchPlaceholder={field.searchPlaceholder}
        value={value}
        valueLabel={selectedOption?.label}
      />
    );
  }

  return (
    <span
      aria-label={`Editar ${field.label.toLowerCase()}`}
      aria-multiline={field.multiline || undefined}
      className={`medical-record__editable-value ${disabled ? 'medical-record__editable-value--disabled' : ''}`}
      contentEditable={disabled ? false : 'plaintext-only'}
      data-empty={!String(value ?? '').trim() || undefined}
      inputMode={field.type === 'number' ? 'numeric' : undefined}
      onInput={(event) => onChange(event.currentTarget.textContent || '')}
      onKeyDown={(event) => {
        if (!field.multiline && event.key === 'Enter') event.preventDefault();
      }}
      ref={editableRef}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
      tabIndex={disabled ? -1 : 0}
    />
  );
}

async function persistParagraphEdit(savedCase, descriptorConfig, values) {
  const caseInfo = getCaseInfo(savedCase);
  const idCaso = caseInfo?.idCaso;
  const normalizedValues = Object.fromEntries(descriptorConfig.fields.map((field) => [
    field.key,
    normalizeFieldValue(field, values[field.key]),
  ]));

  if (descriptorConfig.entity === 'case') {
    const nextCase = { ...caseInfo, ...normalizedValues };
    return updateCase(idCaso, {
      idProfessor: nextCase.idProfessor,
      titulo: nextCase.titulo,
      disciplina: nextCase.disciplina,
      areaSaude: nextCase.areaSaude,
      estilo: nextCase.estilo,
      especialidade: nextCase.especialidade,
      objetivoAprendizagem: nextCase.objetivoAprendizagem,
      nivelDificuldade: nextCase.nivelDificuldade,
      tempoLimiteMinutos: nextCase.tempoLimiteMinutos,
    });
  }

  if (descriptorConfig.entity === 'patient') {
    const patient = getPatient(savedCase);
    if (!patient?.idPaciente) throw new Error('Não há paciente persistido para editar.');
    const nextPatient = { ...patient, ...normalizedValues };
    return updatePatient(patient.idPaciente, {
      idCaso,
      nome: nextPatient.nome,
      profissao: nextPatient.profissao,
      sexo: nextPatient.sexo,
      idade: nextPatient.idade,
      estadoCivil: nextPatient.estadoCivil,
      altura: nextPatient.altura,
      peso: nextPatient.peso,
    });
  }

  const content = getLatestClinicalContent(savedCase);
  if (!content?.idConteudo) throw new Error('Não há conteúdo clínico persistido para editar.');
  const nextContent = { ...content, ...normalizedValues };
  return updateClinicalContent(content.idConteudo, {
    idCaso,
    sintomas: nextContent.sintomas,
    contexto: nextContent.contexto,
    examClinico: nextContent.examClinico,
    antecClinico: nextContent.antecClinico,
    diagEsperado: nextContent.diagEsperado,
  });
}

function normalizeFieldValue(field, input) {
  const text = String(input ?? '').trim();
  if (!text && field.emptyValue !== undefined) return field.emptyValue;

  if (field.options) {
    const normalizedInput = normalizeOptionText(text);
    const selected = field.options.find((option) => (
      normalizeOptionText(option.value) === normalizedInput
      || normalizeOptionText(option.label) === normalizedInput
    ));
    if (!selected) throw new Error(`Escolha uma opção válida para ${field.label.toLowerCase()}.`);
    return selected.value;
  }

  if (field.type === 'number') {
    if (!text) return 0;
    const number = Number(text);
    if (!Number.isInteger(number)
      || (field.min !== undefined && number < field.min)
      || (field.max !== undefined && number > field.max)) {
      throw new Error(`Informe ${field.label.toLowerCase()} entre ${field.min} e ${field.max}.`);
    }
    return number;
  }

  return text;
}

function normalizeOptionText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('_', ' ')
    .trim()
    .toLowerCase();
}

function includeCurrentOption(options, currentValue) {
  const value = String(currentValue ?? '').trim();
  if (!value || options.some((option) => option.value === value)) return options;
  return [{ label: value, value }, ...options];
}

function buildAdjustmentSourceRevision(savedCase) {
  const caseInfo = getCaseInfo(savedCase) || {};
  const patient = getPatient(savedCase) || {};
  const content = getLatestClinicalContent(savedCase) || {};
  return {
    case: {
      areaSaude: caseInfo.areaSaude,
      disciplina: caseInfo.disciplina,
      especialidade: caseInfo.especialidade,
      nivelDificuldade: caseInfo.nivelDificuldade,
      objetivoAprendizagem: caseInfo.objetivoAprendizagem,
      titulo: caseInfo.titulo,
    },
    clinical: Object.fromEntries(CLINICAL_FIELDS.map((key) => [key, content[key]])),
    patient: {
      altura: patient.altura,
      estadoCivil: patient.estadoCivil,
      idade: patient.idade,
      nome: patient.nome,
      peso: patient.peso,
      profissao: patient.profissao,
      sexo: patient.sexo,
    },
  };
}

function getCaseInfo(savedCase) {
  return savedCase?.complete?.caso || savedCase?.case || null;
}

function getPatient(savedCase) {
  return savedCase?.complete?.pacientes?.[0] || savedCase?.patient || null;
}
