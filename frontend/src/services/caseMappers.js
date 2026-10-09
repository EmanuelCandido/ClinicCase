import { difficultyLabel, difficultyLevel } from './difficultyModel.js';

export function buildCasePayload(draft, auth) {
  const difficulty = draft.caseInfo.difficulty?.trim() || 'Intermediário';
  return {
    idProfessor: auth.idProfessor,
    titulo: draft.caseInfo.title.trim(),
    disciplina: draft.caseInfo.discipline.trim() || 'Não informada',
    areaSaude: draft.caseInfo.healthArea.trim() || draft.caseInfo.specialty || 'Saúde',
    estilo: draft.caseInfo.style?.trim() || 'Múltipla escolha',
    especialidade: draft.caseInfo.specialty.trim(),
    status: 'RASCUNHO',
    objetivoAprendizagem: draft.clinical.pedagogicalGoal.trim(),
    nivelDificuldade: difficultyLevel(difficulty),
  };
}

export function buildPatientPayload(draft, idCaso) {
  return {
    idCaso,
    nome: draft.patient.name.trim() || 'Paciente simulado',
    profissao: draft.patient.profession.trim() || 'NAO_INFORMADO',
    sexo: draft.patient.biologicalSex || 'NAO_INFORMADO',
    idade: String(draft.patient.age ?? '').trim() ? Number(draft.patient.age) : 0,
    estadoCivil: draft.patient.maritalStatus || 'NAO_INFORMADO',
    altura: draft.patient.height.trim() || 'NAO_INFORMADO',
    peso: draft.patient.weight.trim() || 'NAO_INFORMADO',
  };
}

export function buildAiClinicalContentPayload(draft) {
  return {
    sintomas: draft.clinical.symptoms.trim(),
    contexto: draft.clinical.clinicalContext.trim(),
    examClinico: draft.clinical.clinicalExam.trim(),
    antecClinico: draft.clinical.comorbidities.trim(),
    diagEsperado: draft.clinical.centralHypothesis.trim(),
    permitirComplementoIa: Boolean(draft.patient.allowAiCompletion),
    informacoesAdicionaisPaciente: draft.patient.otherInfo.trim(),
    incluirResultadosExamesClinicos: Boolean(draft.clinical.includeClinicalExams),
    dadosSinteticosOuDesidentificados: true,
  };
}

export function buildClinicalContentPayload(draft, idCaso) {
  return {
    idCaso,
    sintomas: draft.clinical.symptoms.trim(),
    contexto: draft.clinical.clinicalContext.trim(),
    examClinico: draft.clinical.clinicalExam.trim(),
    antecClinico: draft.clinical.comorbidities.trim(),
    diagEsperado: draft.clinical.centralHypothesis.trim(),
  };
}

export function buildReview(savedCase) {
  const completeCase = savedCase?.complete;
  const caseInfo = completeCase?.caso || savedCase?.case;
  const patient = completeCase?.pacientes?.[0] || savedCase?.patient;
  const clinicalContent = newestById(completeCase?.conteudosClinicos, 'idConteudo') || savedCase?.clinicalContent;

  if (!caseInfo) {
    return null;
  }

  return {
    title: 'PRONTUÁRIO MÉDICO SIMULADO',
    generatedAt: `${savedCase.generatedByAi ? 'Gerado' : 'Salvo'} em ${formatDateTime(savedCase.savedAt)}${caseInfo.idCaso ? ` | ID ${caseInfo.idCaso}` : ''}`,
    sections: [
      {
        title: 'DADOS DO CASO:',
        paragraphs: [
          `Título: ${caseInfo.titulo}`,
          `Especialidade: ${caseInfo.especialidade}`,
          `Disciplina: ${caseInfo.disciplina}`,
          `Área da saúde: ${caseInfo.areaSaude}`,
          `Dificuldade: ${difficultyLabel(caseInfo)}`,
          `Status: ${caseInfo.status}`,
        ],
      },
      {
        title: 'IDENTIFICAÇÃO DO PACIENTE:',
        paragraphs: patient
          ? [
              `Paciente: ${patient.nome}, ${patient.idade} anos.`,
              `Sexo: ${patient.sexo}. Estado civil: ${patient.estadoCivil}.`,
              `Profissão: ${patient.profissao}. Peso: ${patient.peso}. Altura: ${patient.altura}.`,
            ]
          : ['Paciente ainda não cadastrado para este caso.'],
      },
      {
        title: 'CONTEÚDO CLÍNICO:',
        paragraphs: clinicalContent
          ? [
              `Sintomas: ${clinicalContent.sintomas}`,
              `Contexto: ${clinicalContent.contexto}`,
              `Exame clínico: ${clinicalContent.examClinico}`,
              `Antecedentes/comorbidades: ${clinicalContent.antecClinico}`,
              `Diagnóstico esperado: ${clinicalContent.diagEsperado}`,
            ]
          : ['Conteúdo clínico ainda não cadastrado para este caso.'],
      },
      {
        title: 'OBJETIVO DE APRENDIZAGEM:',
        paragraphs: [caseInfo.objetivoAprendizagem || 'Não informado.'],
      },
    ],
  };
}

function newestById(list, key) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((a, b) => Number(b?.[key] || 0) - Number(a?.[key] || 0))[0];
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
