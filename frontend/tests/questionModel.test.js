import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTION_TYPES,
  blankQuestion,
  buildGenerationPayload,
  buildQuestionPayload,
  changeQuestionType,
  mergeQuestions,
  reconcileSavedQuestions,
  normalizeQuestion,
  questionTypeLabel,
} from '../src/services/questionModel.js';

test('mescla geração sem apagar perguntas manuais ou alterações locais', () => {
  const local = normalizeQuestion({ id: 1, dirty: true, texto: 'Edição ainda local', tipo: 'DISCURSIVA' });
  const manual = blankQuestion('DISCURSIVA');
  const merged = mergeQuestions([local, manual], [{ id: 1, texto: 'Texto antigo' }, { id: 2, texto: 'Gerada', tipo: 'DISCURSIVA' }]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].texto, local.texto);
  assert.equal(merged[0].dirty, true);
  assert.equal(merged[1].clientId, manual.clientId);
  assert.equal(merged[2].id, 2);
});

test('atribui ID salvo à pergunta nova editada durante o lote e mantém dirty', () => {
  const original = blankQuestion('DISCURSIVA');
  const snapshot = [{ question: original, key: `client:${original.clientId}`, payload: { texto: 'Enviado' } }];
  const edited = { ...original, texto: 'Nova edição durante envio' };
  const merged = reconcileSavedQuestions([edited], snapshot, [{ id: 18, texto: 'Enviado', tipo: 'DISCURSIVA' }]);
  assert.equal(merged[0].id, 18);
  assert.equal(merged[0].texto, edited.texto);
  assert.equal(merged[0].dirty, true);
  const clean = reconcileSavedQuestions([original], snapshot, [{ id: 18, texto: 'Enviado', tipo: 'DISCURSIVA' }]);
  assert.equal(clean[0].dirty, false);
  assert.throws(() => reconcileSavedQuestions([original], snapshot, []), /confirmar o salvamento/);
});

test('preserva o tipo da API e não inventa alternativas fora de múltipla escolha', () => {
  const question = normalizeQuestion({ tipo: 'DISCURSIVA', texto: 'Explique.', resposta: 'Rubrica.' });
  assert.equal(question.tipo, 'DISCURSIVA');
  assert.deepEqual(question.alternativas, []);
  assert.equal(question.gabarito, 'REVISAO_MANUAL');
});

test('expõe tipo ausente em vez de assumir múltipla escolha', () => {
  const question = normalizeQuestion({ texto: 'Pergunta legada sem tipo.' });

  assert.equal(question.tipo, 'TIPO_NAO_INFORMADO');
  assert.equal(questionTypeLabel(question.tipo), 'Tipo não informado');
  assert.deepEqual(question.alternativas, []);
  assert.throws(() => buildQuestionPayload(question, 3), /Selecione um tipo válido/);
});

test('preserva rubrica estruturada no payload de revisão manual', () => {
  const payload = buildQuestionPayload({
    tipo: 'DISCURSIVA',
    texto: 'Explique o raciocínio clínico.',
    resposta: 'Relacionar os achados e justificar a resposta.',
    rubrica: {
      criteriosEssenciais: [' Avaliar estabilidade '],
      errosGraves: ['Adiar suporte em paciente instável'],
    },
  }, 3);

  assert.deepEqual(payload.rubrica, {
    criteriosEssenciais: ['Avaliar estabilidade'],
    errosGraves: ['Adiar suporte em paciente instável'],
  });
  assert.equal(payload.gabarito, 'REVISAO_MANUAL');
});

test('exige uma resposta esperada para pergunta discursiva', () => {
  assert.throws(() => buildQuestionPayload({
    tipo: 'DISCURSIVA',
    texto: 'Explique o raciocínio clínico.',
    resposta: '',
  }, 3), /resposta esperada/);
});

test('monta payload singular e misto com regras por tipo', () => {
  assert.deepEqual(buildGenerationPayload({ mode: 'SINGULAR', tipo: 'DISCURSIVA', quantidade: 2, instrucoesAdicionais: '  Foque em urgências. ' }), {
    tipo: 'DISCURSIVA', quantidade: 2, instrucoesAdicionais: 'Foque em urgências.', dadosSinteticosOuDesidentificados: true,
  });
  assert.deepEqual(buildGenerationPayload({ mode: 'VARIADO', distribuicao: {
    MULTIPLA_ESCOLHA: { quantidade: 1, quantidadeAlternativas: 5 }, VERDADEIRO_FALSO: { quantidade: 1 },
  } }), {
    dadosSinteticosOuDesidentificados: true,
    distribuicao: [{ tipo: 'MULTIPLA_ESCOLHA', quantidade: 1, quantidadeAlternativas: 5 }, { tipo: 'VERDADEIRO_FALSO', quantidade: 1 }],
  });
});

test('limita a geração por IA a duas perguntas por vez', () => {
  assert.throws(() => buildGenerationPayload({ mode: 'SINGULAR', tipo: 'DISCURSIVA', quantidade: 3 }), /entre 1 e 2/);
  assert.throws(() => buildGenerationPayload({ mode: 'VARIADO', distribuicao: {
    MULTIPLA_ESCOLHA: { quantidade: 2, quantidadeAlternativas: 4 }, VERDADEIRO_FALSO: { quantidade: 1 },
  } }), /no máximo 2/);
});

test('limpa campos incompatíveis ao trocar o tipo e cria payloads adequados', () => {
  const vf = changeQuestionType(blankQuestion(), 'VERDADEIRO_FALSO');
  assert.equal(vf.alternativas.length, 0);
  assert.equal(vf.gabarito, 'VERDADEIRO');
  const payload = buildQuestionPayload({ ...vf, texto: 'A afirmação está correta?', resposta: 'Justificativa.' }, 3);
  assert.deepEqual(payload, { idCaso: 3, texto: 'A afirmação está correta?', tipo: 'VERDADEIRO_FALSO', alternativas: [], gabarito: 'VERDADEIRO', resposta: 'Justificativa.' });
});

test('exige explicação nos tipos corrigidos automaticamente', () => {
  assert.throws(() => buildQuestionPayload({
    ...blankQuestion(), texto: 'Qual alternativa?', alternativas: [
      { letra: 'A', texto: 'Uma', correta: true }, { letra: 'B', texto: 'Duas', correta: false },
    ],
  }, 3), /Explique/);
});

test('remove diagnóstico e conduta das novas escolhas sem perder a leitura legada', () => {
  assert.deepEqual(QUESTION_TYPES, ['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'DISCURSIVA']);
  assert.equal(blankQuestion('DIAGNOSTICO').tipo, 'MULTIPLA_ESCOLHA');

  const diagnosticoLegado = normalizeQuestion({
    tipo: 'DIAGNOSTICO',
    texto: 'Qual diagnóstico?',
    gabarito: 'Pneumonia',
    resposta: 'Achados compatíveis.',
  });
  assert.equal(diagnosticoLegado.tipo, 'DIAGNOSTICO');
  assert.throws(() => buildQuestionPayload(diagnosticoLegado, 3), /temporariamente indisponível/);
  assert.throws(
    () => buildGenerationPayload({ mode: 'SINGULAR', tipo: 'CONDUTA_CLINICA', quantidade: 2 }),
    /temporariamente indisponível/,
  );
});

test('mescla recarga e resposta idempotente sem ocultar ou duplicar perguntas', () => {
  const merged = mergeQuestions(
    [{ id: 1, tipo: 'DISCURSIVA', texto: 'Explique.', resposta: 'Rubrica.' }],
    [{ id: 2, tipo: 'DIAGNOSTICO', texto: 'Diagnóstico?', resposta: 'Explicação.', gabarito: 'Pneumonia' }, { id: 1, tipo: 'DISCURSIVA', texto: 'Explique melhor.', resposta: 'Rubrica.' }],
  );
  assert.deepEqual(merged.map((item) => item.id), [1, 2]);
  assert.equal(merged[0].texto, 'Explique melhor.');
});

test('envia o nível de dificuldade escolhido para as perguntas geradas', () => {
  const base = { mode: 'SINGULAR', tipo: 'MULTIPLA_ESCOLHA', quantidade: 2, quantidadeAlternativas: 4 };

  assert.equal(buildGenerationPayload({ ...base, nivelDificuldade: 'ALTA' }).nivelDificuldade, 'ALTA');
  assert.equal('nivelDificuldade' in buildGenerationPayload({ ...base, nivelDificuldade: '' }), false);
  assert.equal('nivelDificuldade' in buildGenerationPayload({ ...base, nivelDificuldade: 'QUALQUER' }), false);
});
