// Rótulos dos campos editáveis do prontuário; aparecem em negrito para facilitar a leitura.
const EDITABLE_LABELS = [
  'Título', 'Especialidade', 'Disciplina', 'Área da saúde', 'Dificuldade',
  'Paciente', 'Sexo', 'Estado civil', 'Profissão', 'Peso', 'Altura',
  'Sintomas', 'Contexto', 'Exame clínico', 'Antecedentes/comorbidades', 'Diagnóstico esperado',
];
// Os rótulos não têm caracteres especiais de regex, então entram sem escape.
const EDITABLE_LABEL_PATTERN = new RegExp(`(^|\\. )(${EDITABLE_LABELS.join('|')}):`, 'g');

export default function RecordParagraph({ children }) {
  return <p>{withBoldLabels(String(children ?? ''))}</p>;
}

function withBoldLabels(paragraph) {
  const parts = [];
  let lastIndex = 0;
  for (const match of paragraph.matchAll(EDITABLE_LABEL_PATTERN)) {
    const labelStart = match.index + match[1].length;
    parts.push(paragraph.slice(lastIndex, labelStart));
    parts.push(<strong key={labelStart}>{match[2]}:</strong>);
    lastIndex = labelStart + match[2].length + 1;
  }
  if (!parts.length) return paragraph;
  parts.push(paragraph.slice(lastIndex));
  return parts;
}
