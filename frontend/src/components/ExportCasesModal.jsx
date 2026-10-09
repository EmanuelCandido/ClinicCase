import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';

const EXPORT_MODES = [
  {
    value: 'answers',
    title: 'Caso clínico + questões + respostas',
    description: 'Inclui gabarito, comentários e critérios de correção. Para uso do professor.',
    options: { includeQuestions: true, includeAnswers: true },
  },
  {
    value: 'questions',
    title: 'Caso clínico + questões',
    description: 'Folha de atividade para os alunos, com espaço para nome e respostas. Sem gabarito, objetivo ou dados internos do caso.',
    options: { includeQuestions: true, includeAnswers: false },
  },
  {
    value: 'case-only',
    title: 'Apenas o caso clínico',
    description: 'Exporta somente as informações e o conteúdo clínico.',
    options: { includeQuestions: false, includeAnswers: false },
  },
];

export default function ExportCasesModal({
  busy = false,
  cases = [],
  error = '',
  onCancel,
  onExport,
  progress,
}) {
  const [mode, setMode] = useState(EXPORT_MODES[0].value);
  const dialogRef = useRef(null);
  const firstRadioRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const previouslyFocusedRef = useRef(null);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    firstRadioRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) onCancelRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]',
      ) || [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  const multiple = cases.length > 1;
  const titles = cases.map(caseTitle);

  return (
    <div
      className="modal-backdrop modal-backdrop--export"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-describedby="export-case-description"
        aria-labelledby="export-case-title"
        aria-modal="true"
        className="export-cases-modal"
        ref={dialogRef}
        role="dialog"
      >
        <header className="export-cases-modal__header">
          <h2 id="export-case-title">Exportar caso clínico</h2>
          <p id="export-case-description">Escolha o conteúdo que deseja incluir no arquivo.</p>
        </header>

        <div className={`export-cases-modal__selection ${multiple ? 'export-cases-modal__selection--multiple' : ''}`}>
          <span>{multiple ? 'CASOS SELECIONADOS' : 'CASO SELECIONADO'}</span>
          {multiple ? (
            <ul>
              {titles.map((title, index) => <li key={`${cases[index]?.idCaso || index}-${title}`}>{title}</li>)}
            </ul>
          ) : (
            <strong>{titles[0] || 'Caso sem título'}</strong>
          )}
        </div>

        <fieldset className="export-cases-modal__modes">
          <legend>Modo de Exportação</legend>
          <div>
            {EXPORT_MODES.map((option, index) => (
              <label className="export-cases-modal__mode" key={option.value}>
                <input
                  checked={mode === option.value}
                  disabled={busy}
                  name="export-mode"
                  onChange={() => setMode(option.value)}
                  ref={index === 0 ? firstRadioRef : undefined}
                  type="radio"
                  value={option.value}
                />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p aria-live="polite" className="export-cases-modal__error" role="alert">{error}</p>}

        <footer className="export-cases-modal__actions">
          <Button disabled={busy} onClick={onCancel} variant="outline">Cancelar</Button>
          <Button
            loading={busy}
            loadingText={progress ? `Exportando ${progress.completed}/${progress.total}` : 'Exportando...'}
            onClick={() => onExport(EXPORT_MODES.find((option) => option.value === mode).options)}
            variant="primary"
          >
            Exportar
          </Button>
        </footer>
      </section>
    </div>
  );
}

function caseTitle(caseItem) {
  return String(caseItem?.caso?.titulo || caseItem?.titulo || '').trim() || 'Caso sem título';
}
