import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClinicalCoherenceProblem,
  isClinicalCoherenceError,
} from '../src/services/clinicalCoherence.js';

test('reconhece o problema 422 de coerência clínica', () => {
  const error = {
    code: 'urn:sistema-api-pibic:problem:dados-clinicos-incoerentes',
    fields: { especialidade: 'A especialidade conflita com o diagnóstico.' },
    status: 422,
  };

  assert.equal(isClinicalCoherenceError(error), true);
  assert.equal(isClinicalCoherenceError({ status: 400 }), false);
  assert.equal(isClinicalCoherenceError({
    code: 'outro-problema',
    fields: { campo: 'Erro de outro contrato.' },
    status: 422,
  }), false);
});

test('mapeia campos da API para a etapa e o controle que devem ser corrigidos', () => {
  const problem = buildClinicalCoherenceProblem({
    code: 'urn:sistema-api-pibic:problem:dados-clinicos-incoerentes',
    fields: {
      especialidade: 'Revise a especialidade.',
      diagEsperado: 'Revise o diagnóstico.',
      objetivoAprendizagem: 'Revise o objetivo.',
    },
    message: 'Os dados informados são incoerentes.',
    status: 422,
  }, 41);

  assert.equal(problem.draftId, 41);
  assert.equal(problem.issues[0].route, '/criar-caso/parametros');
  assert.equal(problem.issues[0].controlName, 'specialty');
  assert.equal(problem.issues[1].route, '/criar-caso/conteudo-clinico');
  assert.equal(problem.issues[1].controlName, 'centralHypothesis');
  assert.equal(problem.issues[2].controlName, 'pedagogicalGoal');
});

test('produz uma orientação segura quando o backend não envia campos', () => {
  const problem = buildClinicalCoherenceProblem({
    code: 'dados-clinicos-incoerentes',
    fields: {},
    message: 'Não foi possível confirmar a coerência.',
    status: 422,
  });

  assert.equal(problem.issues.length, 1);
  assert.equal(problem.issues[0].field, 'request');
  assert.equal(problem.issues[0].route, '/criar-caso/conteudo-clinico');
});
