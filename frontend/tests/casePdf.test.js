import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCasesPdfFilename,
  createCasesPdfArrayBuffer,
  normalizeCompleteCase,
  resolvePdfExportMode,
} from '../src/services/casePdf.js';

const completeCase = {
  caso: {
    idCaso: 42,
    titulo: 'Dor torácica aos esforços',
    especialidade: 'Cardiologia',
    disciplina: 'Semiologia',
    areaSaude: 'Medicina',
    nivelDificuldade: 'MEDIA',
    estilo: 'Múltipla escolha',
    status: 'PUBLICADO',
    objetivoAprendizagem: 'Reconhecer sinais de síndrome coronariana.',
    dataCriacao: '2026-08-20T12:00:00Z',
  },
  pacientes: [{
    nome: 'Paciente simulado',
    idade: 58,
    sexo: 'FEMININO',
    estadoCivil: 'CASADO',
    profissao: 'Professora',
    peso: '72 kg',
    altura: '1,65 m',
  }],
  conteudosClinicos: [{
    idConteudo: 9,
    sintomas: 'Dor precordial e dispneia.',
    contexto: 'Sintomas durante caminhada.',
    examClinico: 'Pressão arterial elevada.',
    antecClinico: 'Hipertensão arterial.',
    diagEsperado: 'Angina estável.',
  }],
  perguntas: [{
    texto: 'Qual é a principal hipótese?',
    tipo: 'MULTIPLA_ESCOLHA',
    alternativas: [
      { letra: 'A', texto: 'Angina estável', correta: true },
      { letra: 'B', texto: 'Pneumonia', correta: false },
    ],
    gabarito: 'A',
    resposta: 'Comentario do gabarito sobre a angina',
  }],
};

async function pdfText(options) {
  const buffer = await createCasesPdfArrayBuffer([completeCase], {
    compress: false,
    generatedAt: new Date('2026-08-20T15:00:00Z'),
    ...options,
  });
  return Buffer.from(buffer).toString('latin1');
}

test('normaliza todos os blocos relevantes de um caso completo', () => {
  const model = normalizeCompleteCase(completeCase);

  assert.equal(model.id, '42');
  assert.equal(model.title, 'Dor torácica aos esforços');
  assert.equal(model.patient[0][1], 'Paciente simulado');
  assert.equal(model.clinical.at(-1)[1], 'Angina estável.');
  assert.equal(model.questions[0].answer, 'A');
});

test('representa modalidades sem alternativas no modelo de PDF', () => {
  const model = normalizeCompleteCase({
    ...completeCase,
    perguntas: [
      {
        texto: 'Defina a conduta.',
        tipo: 'CONDUTA_CLINICA',
        resposta: 'Avaliar estabilidade e iniciar tratamento.',
        rubrica: {
          criteriosEssenciais: ['Avaliar estabilidade hemodinâmica'],
          prioridades: ['Estabilizar antes dos exames complementares'],
          justificativas: ['Relacionar a conduta aos sinais de gravidade'],
          errosGraves: ['Adiar suporte em paciente instável'],
        },
      },
      { texto: 'Qual o diagnóstico?', tipo: 'DIAGNOSTICO', gabarito: 'Angina estável | angina' },
    ],
  });
  assert.equal(model.questions[0].typeLabel, 'Conduta clínica');
  assert.equal(model.questions[0].alternatives.length, 0);
  assert.match(model.questions[0].answer, /Avaliar estabilidade/);
  assert.deepEqual(model.questions[0].rubricSections.map((section) => section.label), [
    'Resumo',
    'Critérios essenciais',
    'Erros graves',
    'Justificativas',
    'Prioridades',
  ]);
  assert.equal(model.questions[1].typeLabel, 'Diagnóstico');
});

test('resume todos os tipos realmente presentes no caso', () => {
  const model = normalizeCompleteCase({
    ...completeCase,
    perguntas: [
      { texto: 'Q1', tipo: 'MULTIPLA_ESCOLHA' },
      { texto: 'Q2', tipo: 'VERDADEIRO_FALSO' },
      { texto: 'Q3', tipo: 'DIAGNOSTICO' },
      { texto: 'Q4', tipo: 'DISCURSIVA' },
      { texto: 'Q5', tipo: 'CONDUTA_CLINICA' },
    ],
  });
  const metadata = Object.fromEntries(model.metadata);

  assert.equal(metadata['Estilo geral do caso'], 'Múltipla escolha');
  assert.equal(
    metadata['Tipos de pergunta'],
    'Múltipla escolha, Verdadeiro ou falso, Diagnóstico, Discursiva, Conduta clínica',
  );
});

test('não converte pergunta sem tipo em múltipla escolha no PDF', () => {
  const model = normalizeCompleteCase({
    ...completeCase,
    perguntas: [{
      texto: 'Pergunta legada sem modalidade.',
      alternativas: [{ letra: 'A', texto: 'Alternativa legada', correta: true }],
    }],
  });

  assert.equal(model.questions[0].type, null);
  assert.equal(model.questions[0].typeLabel, 'Tipo não informado');
  assert.deepEqual(model.questions[0].alternatives, []);
});

test('separa marcadores de uma rubrica textual legada e remove prefixo duplicado', () => {
  const model = normalizeCompleteCase({
    ...completeCase,
    perguntas: [{
      texto: 'Explique o diagnóstico.',
      tipo: 'DISCURSIVA',
      resposta: 'Rubrica: Rubrica: Síntese clínica. Critérios de pontuação: 2 pontos pela hipótese. Erros graves: ignorar instabilidade. Justificativas: correlacionar os achados.',
    }],
  });
  const sections = model.questions[0].rubricSections;

  assert.deepEqual(sections.map((section) => section.label), [
    'Resumo',
    'Critérios de pontuação',
    'Erros graves',
    'Justificativas',
  ]);
  assert.ok(sections.every((section) => section.items.every((item) => !item.startsWith('Rubrica:'))));
});

test('usa o título do caso como nome do PDF em uma exportação individual', () => {
  assert.equal(buildCasesPdfFilename([completeCase]), 'Dor torácica aos esforços.pdf');
});

test('remove caracteres inválidos do título ao montar o nome do PDF', () => {
  const filename = buildCasesPdfFilename([{
    ...completeCase,
    caso: { ...completeCase.caso, titulo: 'Caso: coluna / L5?' },
  }]);

  assert.equal(filename, 'Caso coluna L5.pdf');
});

test('mantém um nome coletivo ao exportar mais de um caso', () => {
  assert.equal(buildCasesPdfFilename([completeCase, completeCase]), 'casos-clinicos-selecionados.pdf');
});

test('remove perguntas e metadados de formato no modo apenas caso clínico', () => {
  const model = normalizeCompleteCase(completeCase, { includeQuestions: false });
  const metadata = Object.fromEntries(model.metadata);

  assert.equal(model.includeQuestions, false);
  assert.deepEqual(model.questions, []);
  assert.equal(metadata['Estilo geral do caso'], undefined);
  assert.equal(metadata['Tipos de pergunta'], undefined);
  assert.equal(model.learningGoal, '');
  assert.ok(!model.clinical.some(([label]) => label === 'Diagnóstico esperado'));
});

test('gera um PDF válido contendo somente os casos recebidos', async () => {
  const buffer = await createCasesPdfArrayBuffer(
    [completeCase, { ...completeCase, caso: { ...completeCase.caso, idCaso: 43, titulo: 'Segundo caso' } }],
    { compress: false, generatedAt: new Date('2026-08-20T15:00:00Z') },
  );
  const binary = Buffer.from(buffer).toString('latin1');
  const pageObjects = binary.match(/\/Type \/Page\b/g) || [];

  assert.equal(binary.slice(0, 5), '%PDF-');
  assert.ok(buffer.byteLength > 3000);
  assert.ok(pageObjects.length >= 2);
  assert.match(binary, /Segundo caso/);
});

test('não renderiza a seção de perguntas no PDF quando ela é desativada', async () => {
  const buffer = await createCasesPdfArrayBuffer([completeCase], {
    compress: false,
    generatedAt: new Date('2026-08-20T15:00:00Z'),
    includeQuestions: false,
  });
  const binary = Buffer.from(buffer).toString('latin1');

  assert.doesNotMatch(binary, /Perguntas/);
  assert.doesNotMatch(binary, /Qual é a principal hipótese/);
});

test('impede gerar PDF sem seleção', async () => {
  await assert.rejects(() => createCasesPdfArrayBuffer([]), /Selecione pelo menos um caso/);
});

test('resolve os três modos de exportação', () => {
  assert.equal(resolvePdfExportMode({ includeQuestions: false }), 'case-only');
  assert.equal(resolvePdfExportMode({ includeQuestions: true, includeAnswers: false }), 'questions');
  assert.equal(resolvePdfExportMode({ includeQuestions: true, includeAnswers: true }), 'answers');
});

test('a versão sem respostas remove gabarito, comentário e diagnóstico esperado', () => {
  const model = normalizeCompleteCase(completeCase, { includeQuestions: true, includeAnswers: false });

  assert.equal(model.includeAnswers, false);
  assert.equal(model.questions.length, 1);
  assert.equal(model.questions[0].answer, '');
  assert.equal(model.questions[0].explanation, '');
  assert.ok(model.questions[0].alternatives.every((alternative) => !alternative.correct));
  assert.ok(!model.clinical.some(([label]) => label === 'Diagnóstico esperado'));
  assert.equal(model.forStudents, true);
  assert.equal(model.learningGoal, '');
  assert.deepEqual(model.metadata, []);
});

test('a versão com respostas mantém gabarito, comentário e diagnóstico esperado', () => {
  const model = normalizeCompleteCase(completeCase, { includeQuestions: true, includeAnswers: true });

  assert.equal(model.questions[0].answerDisplay, 'Alternativa A');
  assert.match(model.questions[0].explanation, /Comentario do gabarito/);
  assert.ok(model.clinical.some(([label]) => label === 'Diagnóstico esperado'));
});

test('o PDF sem respostas não contém o gabarito e o PDF com respostas contém', async () => {
  const semRespostas = await pdfText({ includeQuestions: true, includeAnswers: false });
  const comRespostas = await pdfText({ includeQuestions: true, includeAnswers: true });

  assert.match(semRespostas, /principal hip/);
  assert.doesNotMatch(semRespostas, /GABARITO/i);
  assert.doesNotMatch(semRespostas, /Comentario do gabarito/);
  assert.doesNotMatch(semRespostas, /Alternativa A/);
  assert.match(comRespostas, /GABARITO DO PROFESSOR/);
  assert.match(comRespostas, /Comentario do gabarito/);
  assert.match(comRespostas, /Alternativa A/);
});

test('a folha do aluno não mostra objetivo, ID nem os parâmetros preenchidos pelo professor', async () => {
  const folhaAluno = await pdfText({ includeQuestions: true, includeAnswers: false });

  assert.match(folhaAluno, /NOME/);
  assert.match(folhaAluno, /TURMA/);
  assert.doesNotMatch(folhaAluno, /Reconhecer sinais/);
  assert.doesNotMatch(folhaAluno, /OBJETIVO/);
  assert.doesNotMatch(folhaAluno, /ID 42/);
  assert.doesNotMatch(folhaAluno, /Semiologia/);
  assert.doesNotMatch(folhaAluno, /Cardiologia/);
  assert.doesNotMatch(folhaAluno, /Publicado/i);
});

test('o PDF usa a marca ClinicCase', async () => {
  assert.match(await pdfText({ includeQuestions: false }), /ClinicCase/);
});

