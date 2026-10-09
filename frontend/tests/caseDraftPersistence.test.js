import test from 'node:test';
import assert from 'node:assert/strict';
import { persistCaseDraft, persistPatientDraft } from '../src/services/caseDraftPersistence.js';

const draft = {
  draftKey: 'draft-test',
  caseInfo: {
    title: 'Caso de teste',
    specialty: 'Cardiologia',
    discipline: 'Semiologia',
    difficulty: 'Básico',
    healthArea: '',
    style: 'Múltipla escolha',
  },
  patient: {
    age: '45',
    profession: 'Professora',
    weight: '70 kg',
    height: '1,68 m',
    name: 'Paciente simulado',
    biologicalSex: 'FEMININO',
    maritalStatus: 'NAO_INFORMADO',
  },
  clinical: {
    pedagogicalGoal: '',
    centralHypothesis: '',
    symptoms: '',
    comorbidities: '',
    clinicalContext: '',
  },
};

function requestStubs(overrides = {}) {
  return {
    createCase: async () => ({ idCaso: 42 }),
    createClinicalContent: async () => ({ idConteudo: 9 }),
    createPatient: async () => ({ idPaciente: 8 }),
    updateCase: async (idCaso) => ({ idCaso }),
    updateClinicalContent: async (idConteudo) => ({ idConteudo }),
    updatePatient: async (idPaciente) => ({ idPaciente }),
    ...overrides,
  };
}

test('preserva o ID do caso quando a criação do paciente falha', async () => {
  const progress = [];
  const requests = requestStubs({
    createPatient: async () => { throw new Error('falha no paciente'); },
  });

  await assert.rejects(
    persistPatientDraft(draft, { idProfessor: 7 }, null, (value) => progress.push(value), requests),
    /falha no paciente/,
  );

  assert.equal(progress.length, 1);
  assert.equal(progress[0].case.idCaso, 42);
  assert.equal(progress[0].draftKey, draft.draftKey);
});

test('uma nova tentativa atualiza o caso preservado em vez de criar outro', async () => {
  let createCaseCalls = 0;
  let updateCaseCalls = 0;
  const savedCase = { case: { idCaso: 42 }, draftKey: draft.draftKey };
  const requests = requestStubs({
    createCase: async () => { createCaseCalls += 1; return { idCaso: 99 }; },
    updateCase: async (idCaso) => { updateCaseCalls += 1; return { idCaso }; },
  });

  const result = await persistPatientDraft(draft, { idProfessor: 7 }, savedCase, undefined, requests);

  assert.equal(result.case.idCaso, 42);
  assert.equal(result.patient.idPaciente, 8);
  assert.equal(createCaseCalls, 0);
  assert.equal(updateCaseCalls, 1);
});

test('propaga cancelamento e informa as fases da persistência', async () => {
  const phases = [];
  const controller = new AbortController();
  const requests = requestStubs({
    createCase: async (_payload, options) => {
      assert.equal(options.signal, controller.signal);
      return { idCaso: 42 };
    },
    createPatient: async (_payload, options) => {
      assert.equal(options.signal, controller.signal);
      return { idPaciente: 8 };
    },
  });

  await persistPatientDraft(
    draft,
    { idProfessor: 7 },
    null,
    undefined,
    requests,
    { signal: controller.signal, onPhase: (phase) => phases.push(phase) },
  );

  assert.deepEqual(phases, ['saving-case', 'saving-patient']);
});

test('não reenvia o caso existente quando o payload é igual ao persistido', async () => {
  const requests = requestStubs({
    updateCase: async () => { throw new Error('não deveria atualizar o caso'); },
  });
  const savedCase = {
    draftKey: draft.draftKey,
    case: { idCaso: 42, idProfessor: 7, titulo: 'Caso de teste', disciplina: 'Semiologia', areaSaude: 'Cardiologia', estilo: 'Múltipla escolha', especialidade: 'Cardiologia', status: 'RASCUNHO', objetivoAprendizagem: '', nivelDificuldade: 'BAIXA' },
  };

  const result = await persistCaseDraft(draft, { idProfessor: 7 }, savedCase, undefined, requests);
  assert.equal(result.case.idCaso, 42);
});
