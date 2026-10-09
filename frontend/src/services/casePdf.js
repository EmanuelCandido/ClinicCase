import { jsPDF } from 'jspdf';
import {
  RUBRIC_FIELDS,
  isKnownQuestionType,
  questionTypeLabel,
} from './questionModel.js';
import { difficultyLabel } from './difficultyModel.js';
import { LOGO_PNG } from './casePdfLogo.js';

const PAGE = {
  width: 210,
  height: 297,
  margin: 20,
  contentTop: 24,
  contentBottom: 276,
};
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
// Pontos tipográficos para milímetros.
const PT = 0.3528;
const BRAND = 'ClinicCase';

const COLORS = {
  ink: [15, 23, 42],
  body: [51, 60, 78],
  muted: [100, 110, 130],
  faint: [150, 158, 175],
  border: [221, 225, 232],
  line: [196, 202, 213],
  surface: [246, 247, 250],
  white: [255, 255, 255],
  primary: [56, 82, 255],
  primaryDark: [30, 44, 140],
  primarySoft: [238, 241, 255],
  success: [3, 135, 90],
  successSoft: [236, 250, 243],
  danger: [190, 45, 60],
};

export const PDF_EXPORT_MODES = Object.freeze({
  CASE_ONLY: 'case-only',
  QUESTIONS: 'questions',
  ANSWERS: 'answers',
});

// A versão "questões" é a folha entregue aos estudantes: nada de gabarito nem dados internos do professor.
const MODE_LABELS = {
  [PDF_EXPORT_MODES.CASE_ONLY]: { document: 'Caso clínico', footer: 'Caso clínico' },
  [PDF_EXPORT_MODES.QUESTIONS]: { document: 'Atividade', footer: 'Atividade de caso clínico' },
  [PDF_EXPORT_MODES.ANSWERS]: { document: 'Gabarito do professor', footer: 'Gabarito do professor · uso exclusivo do docente' },
};

const DEFAULT_PDF_FILENAME = 'casos-clinicos-selecionados.pdf';
const MAX_PDF_BASENAME_LENGTH = 120;
const OPEN_ANSWER_LINES = 8;
const SHORT_ANSWER_LINES = 3;

export async function createCasesPdfArrayBuffer(completeCases, options) {
  const document = await buildCasesPdfDocument(completeCases, options);
  return document.output('arraybuffer');
}

export async function downloadCasesPdf(completeCases, filename, options) {
  const document = await buildCasesPdfDocument(completeCases, options);
  document.save(filename || buildCasesPdfFilename(completeCases));
}

export function buildCasesPdfFilename(completeCases) {
  if (!Array.isArray(completeCases) || completeCases.length !== 1) {
    return DEFAULT_PDF_FILENAME;
  }

  const caseInfo = completeCases[0]?.caso || completeCases[0] || {};
  const title = pdfText(caseInfo.titulo).replace(/\.pdf$/i, '');
  const titleWithoutControls = Array.from(title, (character) => (
    character.codePointAt(0) < 32 ? ' ' : character
  )).join('');
  const sanitizedTitle = titleWithoutControls
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, MAX_PDF_BASENAME_LENGTH)
    .replace(/[. ]+$/g, '');
  const isWindowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitizedTitle);
  const safeTitle = sanitizedTitle
    ? `${isWindowsReservedName ? 'caso-' : ''}${sanitizedTitle}`
    : 'caso-clinico';

  return `${safeTitle}.pdf`;
}

export function resolvePdfExportMode({ includeQuestions = true, includeAnswers = true } = {}) {
  if (!includeQuestions) return PDF_EXPORT_MODES.CASE_ONLY;
  return includeAnswers ? PDF_EXPORT_MODES.ANSWERS : PDF_EXPORT_MODES.QUESTIONS;
}

async function buildCasesPdfDocument(completeCases, {
  compress = true,
  includeQuestions = true,
  includeAnswers = true,
} = {}) {
  if (!Array.isArray(completeCases) || completeCases.length === 0) {
    throw new Error('Selecione pelo menos um caso para exportar.');
  }

  const mode = resolvePdfExportMode({ includeQuestions, includeAnswers });
  const document = new jsPDF({ compress, format: 'a4', unit: 'mm' });
  document.setProperties({ title: MODE_LABELS[mode].footer, creator: BRAND });
  const models = completeCases.map((completeCase) => normalizeCompleteCase(completeCase, {
    includeQuestions,
    includeAnswers,
  }));

  models.forEach((model, index) => {
    if (index > 0) document.addPage();
    renderCase(document, model, mode);
  });

  addFooters(document, MODE_LABELS[mode].footer);
  return document;
}

export function normalizeCompleteCase(completeCase, { includeQuestions = true, includeAnswers = true } = {}) {
  const caseInfo = completeCase?.caso || completeCase || {};
  const patient = firstItem(completeCase?.pacientes);
  const clinical = newestById(completeCase?.conteudosClinicos, 'idConteudo');
  const questions = Array.isArray(completeCase?.perguntas) ? completeCase.perguntas : [];
  const normalizedQuestions = questions.map(normalizeQuestion);
  const showAnswers = includeQuestions && includeAnswers;
  // A versão sem respostas é entregue aos estudantes: sem gabarito, diagnóstico esperado,
  // objetivo de aprendizagem nem os parâmetros que o professor preencheu.
  const forStudents = includeQuestions && !includeAnswers;

  return {
    id: value(caseInfo.idCaso),
    title: value(caseInfo.titulo, 'Caso clínico sem título'),
    forStudents,
    specialty: forStudents ? '' : pdfText(caseInfo.especialidade),
    discipline: forStudents ? '' : pdfText(caseInfo.disciplina),
    metadata: forStudents ? [] : [
      ['Especialidade', caseInfo.especialidade],
      ['Disciplina', caseInfo.disciplina],
      ['Área da saúde', caseInfo.areaSaude],
      ['Dificuldade', difficultyLabel(caseInfo)],
      ...(includeQuestions ? [
        ['Estilo geral do caso', caseInfo.estilo],
        ['Tipos de pergunta', questionTypesSummary(normalizedQuestions, caseInfo.estilo)],
      ] : []),
    ],
    patient: patient
      ? [
          ['Nome', patient.nome],
          ['Idade', Number.isFinite(Number(patient.idade)) ? `${patient.idade} anos` : patient.idade],
          ['Sexo biológico', enumLabel(patient.sexo)],
          ['Estado civil', enumLabel(patient.estadoCivil)],
          ['Profissão', patient.profissao],
          ['Peso', patient.peso],
          ['Altura', patient.altura],
        ]
      : [],
    clinical: clinical
      ? [
          ['Sintomas', clinical.sintomas],
          ['Contexto clínico', clinical.contexto],
          ['Exame clínico', clinical.examClinico],
          ['Antecedentes e comorbidades', clinical.antecClinico],
          ...(showAnswers ? [['Diagnóstico esperado', clinical.diagEsperado]] : []),
        ]
      : [],
    // Objetivo e diagnóstico esperado só aparecem no gabarito do professor.
    learningGoal: showAnswers ? value(caseInfo.objetivoAprendizagem) : '',
    includeQuestions,
    includeAnswers: showAnswers,
    questions: includeQuestions
      ? normalizedQuestions.map((question) => (showAnswers ? question : withoutAnswer(question)))
      : [],
  };
}

function withoutAnswer(question) {
  return {
    ...question,
    answer: '',
    answerDisplay: '',
    explanation: '',
    rubricSections: [],
    alternatives: question.alternatives.map((alternative) => ({ ...alternative, correct: false })),
  };
}

/* ---------- Composição da página ---------- */

function renderCase(document, model, mode) {
  const writer = createWriter(document, model);
  writer.y = renderDocumentHeader(document, model, mode);

  if (model.forStudents) {
    renderStudentIdentification(writer);
    renderInstructions(writer, model.questions);
  } else if (model.learningGoal && model.learningGoal !== 'Não informado') {
    renderLearningGoal(writer, model.learningGoal);
  }

  renderSectionHeading(writer, 'Caso clínico');
  renderPatient(writer, model.patient);
  renderClinical(writer, model.clinical);

  if (model.includeQuestions) {
    const count = model.questions.length;
    renderSectionHeading(writer, 'Questões', count ? `${count} ${count === 1 ? 'questão' : 'questões'}` : '');
    renderQuestions(writer, model.questions, model.includeAnswers);
  }
}

function createWriter(document, model) {
  const writer = {
    doc: document,
    y: PAGE.contentTop,
    newPage() {
      document.addPage();
      drawContinuationHeader(document, model.title);
      writer.y = PAGE.contentTop;
    },
    ensure(height) {
      if (writer.y + height > PAGE.contentBottom) writer.newPage();
    },
  };
  return writer;
}

function renderDocumentHeader(document, model, mode) {
  drawBrand(document, PAGE.margin, 14, 11);
  setText(document, { size: 7.5, style: 'bold', color: COLORS.muted });
  textRight(document, MODE_LABELS[mode].document.toUpperCase(), PAGE.width - PAGE.margin, 13.6, 0.4);
  document.setDrawColor(...COLORS.border);
  document.setLineWidth(0.3);
  document.line(PAGE.margin, 19, PAGE.width - PAGE.margin, 19);

  const titleFont = { size: 19, style: 'bold', color: COLORS.ink };
  const titleLineHeight = lineHeight(titleFont.size, 1.22);
  const titleLines = wrap(document, model.title, CONTENT_WIDTH, titleFont).slice(0, 3);
  let y = 31;
  setText(document, titleFont);
  titleLines.forEach((line, index) => document.text(line, PAGE.margin, y + index * titleLineHeight));
  y += (titleLines.length - 1) * titleLineHeight;

  const details = model.forStudents
    ? []
    : model.metadata
        .filter(([label]) => ['Especialidade', 'Disciplina', 'Dificuldade'].includes(label))
        .map(([, entryValue]) => pdfText(entryValue))
        .filter(Boolean);
  if (details.length) {
    setText(document, { size: 9.5, color: COLORS.muted });
    document.text(document.splitTextToSize(details.join('   ·   '), CONTENT_WIDTH)[0], PAGE.margin, y + 7);
    y += 7;
  }
  return y + 8;
}

function drawBrand(doc, x, baseline, size) {
  const mark = size * 0.85;
  const top = baseline - mark + 1.6;
  doc.addImage(LOGO_PNG, 'PNG', x, top, mark, mark);
  setText(doc, { size, style: 'bold', color: COLORS.ink });
  const textX = x + mark + 2;
  doc.text('Clinic', textX, baseline);
  const clinicWidth = doc.getTextWidth('Clinic');
  setText(doc, { size, style: 'bold', color: COLORS.primary });
  doc.text('Case', textX + clinicWidth, baseline);
}

function renderStudentIdentification(writer) {
  const { doc } = writer;
  const height = 21;
  const x = PAGE.margin;
  const y = writer.y;
  const right = PAGE.width - PAGE.margin;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, CONTENT_WIDTH, height, 2, 2, 'S');

  const field = (label, fieldX, fieldY, lineEnd) => {
    setText(doc, { size: 7.5, style: 'bold', color: COLORS.muted });
    doc.text(label.toUpperCase(), fieldX, fieldY, { charSpace: 0.3 });
    const start = fieldX + doc.getTextWidth(label.toUpperCase()) + label.length * 0.3 + 2.5;
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.3);
    doc.line(start, fieldY + 0.6, lineEnd, fieldY + 0.6);
  };
  field('Nome', x + 5, y + 8.2, right - 5);
  field('Turma', x + 5, y + 16, x + CONTENT_WIDTH * 0.58);
  field('Data', x + CONTENT_WIDTH * 0.58 + 6, y + 16, right - 5);
  writer.y = y + height + 6;
}

function renderInstructions(writer, questions) {
  const { doc } = writer;
  const types = new Set(questions.map((question) => question.type));
  const items = ['Leia todo o caso clínico com atenção antes de responder às questões.'];
  if (types.has('MULTIPLA_ESCOLHA') || types.has('VERDADEIRO_FALSO')) {
    items.push('Nas questões objetivas, marque apenas uma opção, preenchendo o círculo correspondente.');
  }
  if (['DISCURSIVA', 'CONDUTA_CLINICA', 'DIAGNOSTICO'].some((type) => types.has(type))) {
    items.push('Nas questões abertas, responda de forma clara e objetiva no espaço indicado.');
  }
  const innerX = PAGE.margin + 6;
  const rows = [labelRow(doc, 'Instruções', innerX, COLORS.primaryDark), spacer(1)];
  items.forEach((item) => {
    rows.push(...textRows(doc, item, {
      x: innerX + 3.5,
      width: CONTENT_WIDTH - 15,
      font: { size: 9.2, color: COLORS.body },
      factor: 1.45,
      bullet: { x: innerX + 0.7, color: COLORS.primary },
    }));
  });
  renderCard(writer, rows, { fill: COLORS.surface, padding: 4.5, gap: 4 });
}

function renderLearningGoal(writer, learningGoal) {
  const { doc } = writer;
  const rows = [
    labelRow(doc, 'Objetivo de aprendizagem', PAGE.margin + 6, COLORS.primaryDark),
    spacer(1),
    ...textRows(doc, learningGoal, {
      x: PAGE.margin + 6,
      width: CONTENT_WIDTH - 11,
      font: { size: 10, color: COLORS.ink },
    }),
  ];
  renderCard(writer, rows, { fill: COLORS.primarySoft, accent: COLORS.primary, padding: 4.5, gap: 4 });
}

function renderSectionHeading(writer, title, detail = '') {
  const { doc } = writer;
  writer.ensure(30);
  const y = writer.y + 6;
  setText(doc, { size: 13, style: 'bold', color: COLORS.ink });
  doc.text(pdfText(title), PAGE.margin, y);
  if (detail) {
    setText(doc, { size: 8.5, color: COLORS.muted });
    doc.text(detail, PAGE.width - PAGE.margin, y, { align: 'right' });
  }
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE.margin, y + 2.8, PAGE.width - PAGE.margin, y + 2.8);
  doc.setFillColor(...COLORS.primary);
  doc.rect(PAGE.margin, y + 2.2, 14, 1.1, 'F');
  writer.y = y + 8;
}

function renderPatient(writer, entries) {
  const { doc } = writer;
  const filled = entries.filter(([, entryValue]) => pdfText(entryValue) && pdfText(entryValue) !== 'Não informado');
  renderSubheading(writer, 'Identificação do paciente', 12);
  if (!filled.length) {
    renderFlow(writer, textRows(doc, 'Paciente não informado.', mutedParagraph()));
    writer.y += 5;
    return;
  }

  const columns = 3;
  const columnWidth = CONTENT_WIDTH / columns;
  const labelFont = { size: 7, style: 'bold', color: COLORS.muted };
  const valueFont = { size: 10, color: COLORS.ink };
  const valueLineHeight = lineHeight(valueFont.size, 1.3);
  const rows = [];
  // O nome ocupa a linha inteira; os demais dados formam uma grade de três colunas.
  const [first, ...rest] = filled;
  const groups = first[0] === 'Nome' ? [[first], ...chunk(rest, columns)] : chunk(filled, columns);

  groups.forEach((group, groupIndex) => {
    const width = group.length === 1 && groupIndex === 0 && group[0][0] === 'Nome' ? CONTENT_WIDTH : columnWidth;
    const cells = group.map(([label, entryValue]) => ({
      label: pdfText(label).toUpperCase(),
      lines: wrap(doc, value(entryValue), width - 5, valueFont),
    }));
    const height = 5 + Math.max(...cells.map((cell) => cell.lines.length)) * valueLineHeight + 3;
    rows.push({
      height,
      draw: (y) => {
        cells.forEach((cell, index) => {
          const x = PAGE.margin + index * width;
          setText(doc, labelFont);
          doc.text(cell.label, x, y + 2.6, { charSpace: 0.3 });
          setText(doc, valueFont);
          cell.lines.forEach((line, lineIndex) => doc.text(line, x, y + 7 + lineIndex * valueLineHeight));
        });
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.25);
        doc.line(PAGE.margin, y + height - 0.8, PAGE.width - PAGE.margin, y + height - 0.8);
      },
    });
  });
  renderCard(writer, rows, { padding: 0, gap: 5 });
}

function renderClinical(writer, entries) {
  const { doc } = writer;
  if (!entries.length) {
    renderFlow(writer, textRows(doc, 'Conteúdo clínico não informado.', mutedParagraph()));
    writer.y += 6;
    return;
  }

  entries.forEach(([label, entryValue]) => {
    const text = pdfText(entryValue);
    if (!text) return;
    if (label === 'Diagnóstico esperado') {
      renderCard(writer, [
        labelRow(doc, 'Diagnóstico esperado', PAGE.margin + 6, COLORS.success),
        spacer(0.8),
        ...textRows(doc, text, {
          x: PAGE.margin + 6,
          width: CONTENT_WIDTH - 11,
          font: { size: 10.5, style: 'bold', color: COLORS.ink },
        }),
      ], { fill: COLORS.successSoft, accent: COLORS.success, padding: 4.5, gap: 5 });
      return;
    }
    const body = textRows(doc, text, {
      x: PAGE.margin,
      width: CONTENT_WIDTH,
      font: { size: 10.5, color: COLORS.body },
      factor: 1.55,
    });
    renderSubheading(writer, label, 6.5 + Math.min(body.length, 2) * (body[0]?.height || 0));
    renderFlow(writer, body);
    writer.y += 4.5;
  });
  writer.y += 2;
}

// Subtítulo que nunca fica sozinho no fim da página.
function renderSubheading(writer, label, keepWith) {
  const { doc } = writer;
  writer.ensure(keepWith);
  setText(doc, { size: 9.5, style: 'bold', color: COLORS.primaryDark });
  doc.text(pdfText(label), PAGE.margin, writer.y + 3.8);
  writer.y += 6.5;
}

function renderQuestions(writer, questions, includeAnswers) {
  const { doc } = writer;
  if (!questions.length) {
    renderFlow(writer, textRows(doc, 'Nenhuma questão cadastrada para este caso.', mutedParagraph()));
    return;
  }
  questions.forEach((question, index) => {
    renderCard(writer, questionRows(doc, question, index + 1, includeAnswers), {
      stroke: COLORS.border,
      padding: 5.5,
      gap: 5,
    });
  });
}

function questionRows(doc, question, number, includeAnswers) {
  const innerX = PAGE.margin + 6;
  const innerWidth = CONTENT_WIDTH - 12;
  const rows = [{
    height: 7,
    draw: (y) => {
      const label = `QUESTÃO ${number}`;
      setText(doc, { size: 7.5, style: 'bold', color: COLORS.white });
      const width = doc.getTextWidth(label) + label.length * 0.35 + 5;
      doc.setFillColor(...COLORS.primaryDark);
      doc.roundedRect(innerX, y, width, 5.4, 1.2, 1.2, 'F');
      setText(doc, { size: 7.5, style: 'bold', color: COLORS.white });
      doc.text(label, innerX + 2.5, y + 3.75, { charSpace: 0.35 });
      if (question.type) {
        setText(doc, { size: 7.5, style: 'bold', color: COLORS.muted });
        textRight(doc, question.typeLabel.toUpperCase(), PAGE.width - PAGE.margin - 6, y + 3.75, 0.3);
      }
    },
  }];

  rows.push(spacer(2));
  rows.push(...textRows(doc, question.text, {
    x: innerX,
    width: innerWidth,
    font: { size: 10.5, style: 'bold', color: COLORS.ink },
    factor: 1.45,
  }));
  rows.push(spacer(3.5));

  if (question.type === 'MULTIPLA_ESCOLHA') {
    question.alternatives.forEach((alternative) => {
      rows.push(alternativeRow(doc, alternative, innerX, innerWidth, includeAnswers));
    });
  } else if (question.type === 'VERDADEIRO_FALSO') {
    rows.push(trueFalseRow(doc, question, innerX, includeAnswers));
  } else if (!includeAnswers) {
    const lines = question.type === 'DIAGNOSTICO' ? SHORT_ANSWER_LINES : OPEN_ANSWER_LINES;
    rows.push(...answerLineRows(doc, innerX, innerWidth, lines));
  }

  if (includeAnswers) {
    rows.push(spacer(2));
    rows.push(...answerRows(doc, question, innerX, innerWidth));
  }
  return rows;
}

function drawBubble(doc, x, centerY, letter, filled) {
  if (filled) {
    doc.setFillColor(...COLORS.success);
    doc.circle(x, centerY, 2.7, 'F');
    setText(doc, { size: 8, style: 'bold', color: COLORS.white });
  } else {
    doc.setDrawColor(...COLORS.faint);
    doc.setLineWidth(0.35);
    doc.circle(x, centerY, 2.7, 'S');
    setText(doc, { size: 8, style: 'bold', color: COLORS.muted });
  }
  doc.text(pdfText(letter), x, centerY + 1, { align: 'center' });
}

function alternativeRow(doc, alternative, x, width, includeAnswers) {
  const font = { size: 10.2, color: COLORS.body };
  const textX = x + 9;
  const lines = wrap(doc, alternative.text, width - 11, font);
  const textLineHeight = lineHeight(font.size, 1.4);
  const boxHeight = Math.max(7.6, lines.length * textLineHeight + 3);
  const highlighted = includeAnswers && alternative.correct;

  return {
    height: boxHeight + 1.2,
    draw: (y) => {
      if (highlighted) {
        doc.setFillColor(...COLORS.successSoft);
        doc.roundedRect(x - 2, y, width + 4, boxHeight, 1.6, 1.6, 'F');
      }
      const firstBaseline = y + (boxHeight - lines.length * textLineHeight) / 2 + font.size * PT * 1.02;
      // Com várias linhas, o círculo acompanha a primeira linha da alternativa.
      const bubbleY = lines.length > 1 ? firstBaseline - font.size * PT * 0.35 : y + boxHeight / 2;
      drawBubble(doc, x + 2.9, bubbleY, alternative.letter, highlighted);
      setText(doc, highlighted ? { ...font, style: 'bold', color: COLORS.ink } : font);
      lines.forEach((line, index) => doc.text(line, textX, firstBaseline + index * textLineHeight));
    },
  };
}

function trueFalseRow(doc, question, x, includeAnswers) {
  const options = [['VERDADEIRO', 'V', 'Verdadeiro'], ['FALSO', 'F', 'Falso']];
  const optionWidth = 40;
  const height = 8.5;
  return {
    height: height + 1,
    draw: (y) => {
      options.forEach(([key, letter, label], index) => {
        const optionX = x + index * optionWidth;
        const correct = includeAnswers && normalizeKey(question.answer) === key;
        if (correct) {
          doc.setFillColor(...COLORS.successSoft);
          doc.roundedRect(optionX - 2, y, optionWidth - 4, height, 1.6, 1.6, 'F');
        }
        drawBubble(doc, optionX + 2.9, y + height / 2, letter, correct);
        setText(doc, { size: 10.2, style: correct ? 'bold' : 'normal', color: correct ? COLORS.ink : COLORS.body });
        doc.text(label, optionX + 9, y + height / 2 + 1.3);
      });
    },
  };
}

function answerLineRows(doc, x, width, count) {
  const rows = [{
    height: 4,
    draw: (y) => {
      setText(doc, { size: 7, style: 'bold', color: COLORS.muted });
      doc.text('RESPOSTA', x, y + 2.6, { charSpace: 0.3 });
    },
  }];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      height: 8,
      draw: (y) => {
        doc.setDrawColor(...COLORS.line);
        doc.setLineWidth(0.25);
        doc.line(x, y + 7.2, x + width, y + 7.2);
      },
    });
  }
  return rows;
}

function answerRows(doc, question, x, width) {
  // Cada linha pinta a própria faixa de fundo; juntas formam uma caixa que pode quebrar entre páginas.
  const boxX = x - 2;
  const boxWidth = width + 4;
  const textX = x + 3;
  const textWidth = width - 5;
  const band = (row) => ({
    height: row.height,
    draw: (y) => {
      doc.setFillColor(...COLORS.successSoft);
      doc.rect(boxX, y, boxWidth, row.height, 'F');
      doc.setFillColor(...COLORS.success);
      doc.rect(boxX, y, 1, row.height, 'F');
      row.draw(y);
    },
  });
  const rows = [spacer(3), labelRow(doc, 'Gabarito', textX, COLORS.success), spacer(0.8)];

  if (question.type === 'DISCURSIVA' || question.type === 'CONDUTA_CLINICA') {
    const sections = question.rubricSections.length
      ? question.rubricSections
      : [{ label: 'Resposta esperada', tone: 'neutral', items: ['Não informado'] }];
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) rows.push(spacer(1.8));
      rows.push(labelRow(doc, section.label, textX, section.tone === 'danger' ? COLORS.danger : COLORS.ink, 7.5));
      section.items.forEach((item) => {
        rows.push(...textRows(doc, item, {
          x: textX + 3.5,
          width: textWidth - 3.5,
          font: { size: 9.5, color: COLORS.body },
          bullet: { x: textX + 0.6, color: section.tone === 'danger' ? COLORS.danger : COLORS.success },
        }));
      });
    });
  } else {
    rows.push(...textRows(doc, question.answerDisplay || 'Não informado', {
      x: textX,
      width: textWidth,
      font: { size: 10.5, style: 'bold', color: COLORS.ink },
    }));
    if (question.explanation) {
      rows.push(spacer(1.8));
      rows.push(labelRow(doc, 'Comentário', textX, COLORS.success));
      rows.push(spacer(0.6));
      rows.push(...textRows(doc, question.explanation, {
        x: textX,
        width: textWidth,
        font: { size: 9.5, color: COLORS.body },
      }));
    }
  }
  rows.push(spacer(3));
  return rows.map(band);
}

/* ---------- Primitivas de layout ---------- */

// Desenha linhas dentro de uma caixa; a caixa fica inteira numa página sempre que couber e,
// se for maior que uma página, continua na seguinte com o fundo redesenhado.
function renderCard(writer, rows, style) {
  const { doc } = writer;
  const padding = style.padding ?? 5;
  const total = rows.reduce((sum, row) => sum + row.height, 0) + padding * 2;
  const pageCapacity = PAGE.contentBottom - PAGE.contentTop;
  if (writer.y + total > PAGE.contentBottom && total <= pageCapacity) writer.newPage();

  let index = 0;
  while (index < rows.length) {
    const start = writer.y;
    const segment = [];
    let height = padding;
    while (
      index < rows.length
      && (segment.length === 0 || start + height + rows[index].height + padding <= PAGE.contentBottom)
    ) {
      segment.push(rows[index]);
      height += rows[index].height;
      index += 1;
    }
    height += padding;
    drawCardBackground(doc, start, height, style);
    let y = start + padding;
    segment.forEach((row) => {
      row.draw(y);
      y += row.height;
    });
    writer.y = start + height;
    if (index < rows.length) writer.newPage();
  }
  writer.y += style.gap ?? 5;
}

function drawCardBackground(doc, y, height, { fill, stroke, accent }) {
  const x = PAGE.margin;
  if (fill) {
    doc.setFillColor(...fill);
    doc.roundedRect(x, y, CONTENT_WIDTH, height, 2, 2, 'F');
  }
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, CONTENT_WIDTH, height, 2, 2, 'S');
  }
  if (accent) {
    doc.setFillColor(...accent);
    doc.roundedRect(x, y, 1.2, height, 0.6, 0.6, 'F');
  }
}

function renderFlow(writer, rows) {
  rows.forEach((row) => {
    writer.ensure(row.height);
    row.draw(writer.y);
    writer.y += row.height;
  });
}

function textRows(doc, text, { x, width, font, factor = 1.45, bullet }) {
  const lines = wrap(doc, text, width, font);
  const height = lineHeight(font.size, factor);
  return lines.map((line, index) => ({
    height,
    draw: (y) => {
      const baseline = y + font.size * PT * 1.02;
      if (bullet && index === 0) {
        doc.setFillColor(...bullet.color);
        doc.circle(bullet.x, baseline - font.size * PT * 0.32, 0.6, 'F');
      }
      setText(doc, font);
      doc.text(line, x, baseline);
    },
  }));
}

function labelRow(doc, text, x, color, size = 7) {
  return {
    height: lineHeight(size, 1.5),
    draw: (y) => {
      setText(doc, { size, style: 'bold', color });
      doc.text(pdfText(text).toUpperCase(), x, y + size * PT * 1.05, { charSpace: 0.3 });
    },
  };
}

function spacer(height) {
  return { height, draw: () => {} };
}

function mutedParagraph() {
  return { x: PAGE.margin, width: CONTENT_WIDTH, font: { size: 9.5, color: COLORS.muted } };
}

// O espaçamento entre letras não entra no alinhamento à direita do jsPDF; calcula a largura real.
function textRight(doc, text, right, y, charSpace) {
  const width = doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
  doc.text(text, right - width, y, { charSpace });
}

function chunk(list, size) {
  const groups = [];
  for (let start = 0; start < list.length; start += size) groups.push(list.slice(start, start + size));
  return groups;
}

function drawContinuationHeader(doc, title) {
  drawBrand(doc, PAGE.margin, 12, 8.5);
  setText(doc, { size: 8, color: COLORS.muted });
  const shortTitle = doc.splitTextToSize(pdfText(title), CONTENT_WIDTH - 40)[0];
  doc.text(shortTitle, PAGE.width - PAGE.margin, 12, { align: 'right' });
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE.margin, 15.5, PAGE.width - PAGE.margin, 15.5);
}

function addFooters(document, footerLabel) {
  const totalPages = document.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setDrawColor(...COLORS.border);
    document.setLineWidth(0.3);
    document.line(PAGE.margin, 284, PAGE.width - PAGE.margin, 284);
    setText(document, { size: 7.5, style: 'bold', color: COLORS.primary });
    document.text(BRAND, PAGE.margin, 289.5);
    const brandWidth = document.getTextWidth(BRAND);
    setText(document, { size: 7.5, color: COLORS.muted });
    document.text(footerLabel, PAGE.margin + brandWidth + 3, 289.5);
    document.text(`Página ${pageNumber} de ${totalPages}`, PAGE.width - PAGE.margin, 289.5, { align: 'right' });
  }
}

function setText(doc, { size = 10, style = 'normal', color = COLORS.ink } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function wrap(doc, text, width, font) {
  setText(doc, font);
  return doc.splitTextToSize(pdfText(text), width);
}

function lineHeight(size, factor = 1.45) {
  return size * PT * factor;
}

/* ---------- Normalização dos dados ---------- */

function normalizeQuestion(question) {
  const type = isKnownQuestionType(question?.tipo) ? question.tipo : null;
  const alternatives = type === 'MULTIPLA_ESCOLHA'
    && Array.isArray(question?.alternativas)
    && question.alternativas.length
    ? question.alternativas.map((alternative, index) => ({
        letter: value(alternative.letra, String.fromCharCode(65 + index)),
        text: value(alternative.texto),
        correct: Boolean(alternative.correta),
      }))
    : type === 'MULTIPLA_ESCOLHA' ? ['A', 'B', 'C', 'D', 'E']
        .map((letter) => ({ letter, text: value(question?.[`alternativa${letter}`], ''), correct: false }))
        .filter((alternative) => alternative.text) : [];
  const correct = alternatives.find((alternative) => alternative.correct);
  const manualReview = type === 'DISCURSIVA' || type === 'CONDUTA_CLINICA';
  const answer = value(manualReview ? question?.resposta : question?.gabarito || correct?.letter);

  return {
    text: value(question?.texto, 'Pergunta sem enunciado').replace(/^\s*\d+[.)]\s*/, ''),
    type,
    typeLabel: questionTypeLabel(type),
    alternatives: type === 'MULTIPLA_ESCOLHA' ? alternatives : [],
    answer,
    answerDisplay: answerDisplay(type, answer),
    explanation: manualReview ? '' : value(question?.resposta, ''),
    rubricSections: manualReview
      ? normalizeRubricSections(question?.rubrica, question?.resposta)
      : [],
  };
}

function answerDisplay(type, answer) {
  if (!answer || answer === 'Não informado') return '';
  if (type === 'MULTIPLA_ESCOLHA') return `Alternativa ${answer}`;
  if (type === 'VERDADEIRO_FALSO') {
    const key = normalizeKey(answer);
    if (key === 'VERDADEIRO') return 'Verdadeiro';
    if (key === 'FALSO') return 'Falso';
  }
  if (type === 'DIAGNOSTICO') {
    const accepted = answer.split('|').map((item) => item.trim()).filter(Boolean);
    return accepted.length > 1 ? `Respostas aceitas: ${accepted.join('; ')}` : accepted[0] || answer;
  }
  return answer;
}

function normalizeKey(text) {
  return pdfText(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function questionTypesSummary(questions, legacyStyle) {
  const labels = [...new Set(questions.map((question) => question.typeLabel))];
  return labels.length ? labels.join(', ') : value(legacyStyle);
}

function normalizeRubricSections(rubric, legacyText) {
  const structuredSections = RUBRIC_FIELDS.flatMap((field) => {
    const source = Array.isArray(rubric?.[field.key]) ? rubric[field.key] : [];
    const items = source.map(pdfText).filter(Boolean);
    return items.length
      ? [{
          label: field.label,
          tone: field.key === 'errosGraves' ? 'danger' : 'neutral',
          items,
        }]
      : [];
  });
  if (structuredSections.length) {
    const summary = cleanRubricSegment(
      pdfText(legacyText).replace(/^(?:rubrica\s*:\s*)+/i, ''),
    );
    return summary
      ? [{ label: 'Resumo', tone: 'neutral', items: [summary] }, ...structuredSections]
      : structuredSections;
  }
  return parseLegacyRubric(legacyText);
}

function parseLegacyRubric(input) {
  const text = pdfText(input).replace(/^(?:rubrica\s*:\s*)+/i, '').trim();
  if (!text) return [];

  const markerPattern = /(CRITÉRIOS DE PONTUAÇÃO|CRITERIOS DE PONTUACAO|CRITÉRIOS ESSENCIAIS|CRITERIOS ESSENCIAIS|CONCEITOS ESSENCIAIS|ERROS CLINICAMENTE RELEVANTES|ERROS GRAVES|JUSTIFICATIVAS?|PRIORIDADES?|SINAIS QUE EXIGEM ESCALONAMENTO|SINAIS DE ESCALONAMENTO|ESCALONAMENTO|SEQUÊNCIA DE CONDUTAS?|SEQUENCIA DE CONDUTAS?|PONTUAÇÃO|PONTUACAO|ERROS)\s*:/giu;
  const markers = [...text.matchAll(markerPattern)];
  if (!markers.length) {
    return [{ label: 'Resposta esperada', tone: 'neutral', items: [text] }];
  }

  const sections = [];
  const summary = cleanRubricSegment(text.slice(0, markers[0].index));
  if (summary) {
    sections.push({ label: 'Resumo', tone: 'neutral', items: [summary] });
  }
  markers.forEach((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = markers[index + 1]?.index ?? text.length;
    const content = cleanRubricSegment(text.slice(start, end));
    if (!content) return;
    const label = legacyRubricLabel(marker[1]);
    sections.push({
      label,
      tone: label === 'Erros graves' ? 'danger' : 'neutral',
      items: [content],
    });
  });
  return sections.length ? sections : [{ label: 'Resposta esperada', tone: 'neutral', items: [text] }];
}

function cleanRubricSegment(text) {
  return pdfText(text)
    .replace(/^[-\s:;,.]+/, '')
    .replace(/[-\s;]+$/, '')
    .trim();
}

function legacyRubricLabel(rawLabel) {
  const normalized = rawLabel.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (normalized.includes('pontuacao')) return 'Critérios de pontuação';
  if (normalized.includes('essenciais')) return 'Critérios essenciais';
  if (normalized.includes('erro')) return 'Erros graves';
  if (normalized.includes('justific')) return 'Justificativas';
  if (normalized.includes('prioridade') || normalized.includes('sequencia')) return 'Prioridades';
  if (normalized.includes('escalonamento')) return 'Sinais de escalonamento';
  return pdfText(rawLabel);
}

function newestById(list, key) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((first, second) => Number(second?.[key] || 0) - Number(first?.[key] || 0))[0];
}

function firstItem(list) {
  return Array.isArray(list) && list.length ? list[0] : null;
}


function enumLabel(text) {
  return value(text).toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}



function value(input, fallback = 'Não informado') {
  const text = pdfText(input);
  return text || fallback;
}

function pdfText(input) {
  return String(input ?? '')
    .trim()
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/…/g, '...');
}
