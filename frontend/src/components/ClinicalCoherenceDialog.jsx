import { useEffect, useRef } from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

export default function ClinicalCoherenceDialog({ onClose, onSelectIssue, problem }) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const actionableIssue = problem.issues.find((issue) => issue.route) || null;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled)') || [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-describedby="clinical-coherence-description"
        aria-labelledby="clinical-coherence-title"
        aria-modal="true"
        className="generation-modal clinical-coherence-dialog"
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 className="generation-modal__title" id="clinical-coherence-title">
              <span className="clinical-coherence-dialog__icon"><Icon name="info" size={18} /></span>
              Revise as informações do caso
            </h2>
            <p id="clinical-coherence-description">{problem.message}</p>
          </div>
          <button aria-label="Fechar" onClick={onClose} type="button"><Icon name="close" size={24} /></button>
        </header>

        <hr />

        <div className="clinical-coherence-dialog__body">
          <p>Corrija os campos indicados antes de solicitar uma nova geração.</p>
          <ul className="clinical-coherence-dialog__issues">
            {problem.issues.map((issue) => (
              <li key={`${issue.field}:${issue.message}`}>
                <button onClick={() => onSelectIssue(issue)} type="button">
                  <strong>{issue.label}</strong>
                  <span>{issue.message}</span>
                  <Icon name="chevronRight" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {problem.draftId && (
            <p className="clinical-coherence-dialog__draft">
              O rascunho #{problem.draftId} foi mantido e nenhum conteúdo incoerente foi salvo.
            </p>
          )}
        </div>

        <div className="generation-modal__actions">
          <Button onClick={onClose} variant="outline">Fechar</Button>
          {actionableIssue && (
            <Button onClick={() => onSelectIssue(actionableIssue)} variant="primary">
              Corrigir primeiro campo
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
