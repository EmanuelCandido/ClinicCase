const COHERENCE_ERROR_CODE = 'dados-clinicos-incoerentes';

const FIELD_TARGETS = Object.freeze({
  titulo: field('Título', '/criar-caso/parametros', 'title'),
  disciplina: field('Disciplina', '/criar-caso/parametros', 'discipline'),
  areaSaude: field('Área da saúde', '/criar-caso/parametros'),
  especialidade: field('Especialidade', '/criar-caso/parametros', 'specialty'),
  nivelDificuldade: field('Dificuldade', '/criar-caso/parametros', 'difficulty'),
  estilo: field('Estilo', '/criar-caso/parametros'),
  objetivoAprendizagem: field('Objetivo pedagógico', '/criar-caso/conteudo-clinico', 'pedagogicalGoal'),
  diagEsperado: field('Hipótese clínica central', '/criar-caso/conteudo-clinico', 'centralHypothesis'),
  sintomas: field('Sintomas principais', '/criar-caso/conteudo-clinico', 'symptoms'),
  contexto: field('Contexto clínico', '/criar-caso/conteudo-clinico', 'clinicalContext'),
  examClinico: field('Exame clínico', '/criar-caso/conteudo-clinico', 'clinicalExam'),
  antecClinico: field('Comorbidades', '/criar-caso/conteudo-clinico', 'comorbidities'),
  idade: field('Idade', '/criar-caso/perfil-paciente', 'age'),
  profissao: field('Profissão', '/criar-caso/perfil-paciente', 'profession'),
  peso: field('Peso', '/criar-caso/perfil-paciente', 'weight'),
  altura: field('Altura', '/criar-caso/perfil-paciente', 'height'),
  sexo: field('Sexo biológico', '/criar-caso/perfil-paciente'),
  estadoCivil: field('Estado civil', '/criar-caso/perfil-paciente'),
  informacoesAdicionaisPaciente: field('Outra informação', '/criar-caso/perfil-paciente', 'otherInfo'),
  request: field('Informações clínicas', '/criar-caso/conteudo-clinico', 'centralHypothesis'),
});

export function isClinicalCoherenceError(error) {
  if (error?.status !== 422) return false;
  return String(error?.code || '').includes(COHERENCE_ERROR_CODE);
}

export function buildClinicalCoherenceProblem(error, draftId) {
  if (!isClinicalCoherenceError(error)) return null;
  const fields = error?.fields && typeof error.fields === 'object' ? error.fields : {};
  const issues = Object.entries(fields)
    .filter(([key, message]) => String(key || '').trim() && String(message || '').trim())
    .map(([key, message]) => ({
      field: key,
      label: FIELD_TARGETS[key]?.label || humanizeField(key),
      message: String(message).trim(),
      route: FIELD_TARGETS[key]?.route || '/criar-caso/conteudo-clinico',
      controlName: FIELD_TARGETS[key]?.controlName || '',
    }));

  if (issues.length === 0) {
    issues.push({
      field: 'request',
      label: FIELD_TARGETS.request.label,
      message: error?.message || 'Revise a relação entre especialidade, diagnóstico e objetivo pedagógico.',
      route: FIELD_TARGETS.request.route,
      controlName: FIELD_TARGETS.request.controlName,
    });
  }

  return {
    draftId: Number.isFinite(Number(draftId)) ? Number(draftId) : null,
    issues,
    message: error?.message || 'Os dados informados precisam ser corrigidos antes da geração.',
  };
}

function field(label, route, controlName = '') {
  return { controlName, label, route };
}

function humanizeField(value) {
  const spaced = String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Informações clínicas';
}
