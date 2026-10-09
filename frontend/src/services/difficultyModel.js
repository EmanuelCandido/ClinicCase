const LEVEL_BY_FORM_LABEL = {
  Básico: 'BAIXA',
  Intermediário: 'MEDIA',
  Avançado: 'ALTA',
};

const LABEL_BY_LEVEL = {
  BAIXA: 'Fácil',
  MEDIA: 'Intermediário',
  ALTA: 'Difícil',
};

export function difficultyLevel(formLabel) {
  return LEVEL_BY_FORM_LABEL[String(formLabel || '').trim()] || 'MEDIA';
}

export function difficultyLabel(caseInfo, fallback = 'Não informado') {
  const level = typeof caseInfo === 'string' ? caseInfo : caseInfo?.nivelDificuldade;
  const legacyLabel = typeof caseInfo === 'object' ? caseInfo?.dificuldade : '';
  return LABEL_BY_LEVEL[level] || String(legacyLabel || '').trim() || fallback;
}
