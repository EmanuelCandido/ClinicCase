import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCasePayload,
  buildAiClinicalContentPayload,
  buildClinicalContentPayload,
  buildPatientPayload,
  buildReview,
} from '../src/services/caseMappers.js';
import { hasCompleteClinicalContent, validateDraftForApi } from '../src/services/caseValidation.js';

const draft = {
  caseInfo: {
    title: '  Caso de teste  ',
    specialty: 'Cardiologia',
    discipline: '  Semiologia  ',
    difficulty: 'Básico',
    healthArea: '',
    style: 'Múltipla escolha',
  },
  patient: {
    age: '45',
    profession: '  Professora  ',
    weight: '70 kg',
    height: '1,68 m',
    name: 'Paciente simulado',
    biologicalSex: 'FEMININO',
    maritalStatus: 'NAO_INFORMADO',
    allowAiCompletion: false,
    otherInfo: '',
  },
  clinical: {
    pedagogicalGoal: '  Reconhecer sinais  ',
    centralHypothesis: '  Hipótese  ',
    symptoms: '  Dor torácica  ',
    comorbidities: '  Hipertensão  ',
    clinicalContext: '  Pronto atendimento  ',
    clinicalExam: '  Ausculta sem alterações  ',
  },
};

test('valida um rascunho completo', () => {
  assert.equal(validateDraftForApi(draft, { idProfessor: 7 }), '');
});

test('mapeia e normaliza payloads da API', () => {
  assert.deepEqual(buildCasePayload(draft, { idProfessor: 7 }), {
    idProfessor: 7,
    titulo: 'Caso de teste',
    disciplina: 'Semiologia',
    areaSaude: 'Cardiologia',
    estilo: 'Múltipla escolha',
    especialidade: 'Cardiologia',
    status: 'RASCUNHO',
    objetivoAprendizagem: 'Reconhecer sinais',
    nivelDificuldade: 'BAIXA',
  });
  assert.equal(buildPatientPayload(draft, 10).idade, 45);
  assert.equal(buildClinicalContentPayload(draft, 10).examClinico, 'Ausculta sem alterações');
  assert.equal(buildAiClinicalContentPayload(draft).dadosSinteticosOuDesidentificados, true);
});

test('mostra a dificuldade retornada pela API sem produzir undefined', () => {
  const review = buildReview({
    savedAt: '2026-08-23T12:00:00Z',
    case: {
      idCaso: 10,
      titulo: 'Caso intermediário',
      especialidade: 'Clínica médica',
      disciplina: 'Semiologia',
      areaSaude: 'Medicina',
      nivelDificuldade: 'MEDIA',
      status: 'RASCUNHO',
    },
  });

  assert.ok(review.sections[0].paragraphs.includes('Dificuldade: Intermediário'));
  assert.ok(review.sections[0].paragraphs.every((paragraph) => !paragraph.includes('undefined')));
});

test('informa o primeiro campo obrigatório ausente', () => {
  const incomplete = {
    ...draft,
    caseInfo: { ...draft.caseInfo, title: '' },
  };
  assert.match(validateDraftForApi(incomplete, { idProfessor: 7 }), /título/);
});

test('exige especialidade como âncora da geração clínica', () => {
  const withoutSpecialty = {
    ...draft,
    caseInfo: { ...draft.caseInfo, specialty: '' },
  };

  assert.match(validateDraftForApi(withoutSpecialty, { idProfessor: 7 }), /especialidade/);
});

test('usa a mesma faixa de idade aceita pela persistência progressiva', () => {
  const invalidAge = {
    ...draft,
    patient: { ...draft.patient, age: '131' },
  };

  assert.match(validateDraftForApi(invalidAge, { idProfessor: 7 }), /entre 0 e 130 anos/);
});

test('permite deixar a idade vazia mesmo sem ativar a complementação por IA', () => {
  const draftWithoutAge = {
    ...draft,
    patient: { ...draft.patient, age: '', allowAiCompletion: false },
  };

  assert.equal(validateDraftForApi(draftWithoutAge, { idProfessor: 7 }), '');
  assert.equal(buildPatientPayload(draftWithoutAge, 10).idade, 0);
});

test('mantém opcionais os campos clínicos que podem ser completados pela IA', () => {
  const minimalDraft = {
    ...draft,
    caseInfo: {
      ...draft.caseInfo,
      discipline: '',
      difficulty: '',
    },
    patient: {
      ...draft.patient,
      profession: '',
      weight: '',
      height: '',
    },
    clinical: {
      ...draft.clinical,
      centralHypothesis: draft.clinical.centralHypothesis,
      symptoms: '',
      comorbidities: '',
      clinicalContext: '',
      clinicalExam: '',
    },
  };

  assert.equal(validateDraftForApi(minimalDraft, { idProfessor: 7 }), '');
  assert.equal(hasCompleteClinicalContent(minimalDraft), false);
  assert.equal(buildCasePayload(minimalDraft, { idProfessor: 7 }).disciplina, 'Não informada');
  assert.equal(buildPatientPayload(minimalDraft, 10).profissao, 'NAO_INFORMADO');
});

test('dispensa os dados do paciente e o conteúdo clínico opcional quando a IA está habilitada', () => {
  const aiDraft = {
    ...draft,
    patient: {
      ...draft.patient,
      allowAiCompletion: true,
      age: '',
      profession: '',
      weight: '',
      height: '',
    },
    clinical: {
      pedagogicalGoal: 'Reconhecer sinais de gravidade',
      centralHypothesis: 'Pneumonia',
      symptoms: '',
      comorbidities: '',
      clinicalContext: '',
      clinicalExam: '',
      includeClinicalExams: false,
    },
  };

  assert.equal(validateDraftForApi(aiDraft, { idProfessor: 7 }), '');
  assert.equal(buildPatientPayload(aiDraft, 10).idade, 0);
});

test('exige objetivo pedagógico e hipótese clínica mesmo quando a IA está habilitada', () => {
  const missingGoal = {
    ...draft,
    patient: { ...draft.patient, allowAiCompletion: true },
    clinical: { ...draft.clinical, pedagogicalGoal: '' },
  };
  const missingHypothesis = {
    ...missingGoal,
    clinical: {
      ...missingGoal.clinical,
      pedagogicalGoal: 'Reconhecer sinais de gravidade',
      centralHypothesis: '',
    },
  };

  assert.match(validateDraftForApi(missingGoal, { idProfessor: 7 }), /objetivo pedagógico/);
  assert.match(validateDraftForApi(missingHypothesis, { idProfessor: 7 }), /hipótese clínica central/);
});

test('marca automaticamente todo caso como fictício nas chamadas de IA', () => {
  const legacyDraft = {
    ...draft,
    patient: { ...draft.patient, dataAreDeidentified: false },
  };

  assert.equal(validateDraftForApi(legacyDraft, { idProfessor: 7 }), '');
  assert.equal(buildAiClinicalContentPayload(legacyDraft).dadosSinteticosOuDesidentificados, true);
});
