import { useLayoutEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { Link } from 'react-router-dom';

export default function Stepper({ currentStep = 1, steps }) {
  const listRef = useRef(null);

  // No celular as etapas rolam na horizontal; a atual precisa ficar à vista.
  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-current="step"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    list.scrollLeft += activeBox.left - listBox.left - (listBox.width - activeBox.width) / 2;
  }, [currentStep]);

  return (
    <ol className="stepper" aria-label="Etapas de criação do caso" ref={listRef}>
      {steps.map((step, index) => {
        const label = typeof step === 'string' ? step : step.label;
        const path = typeof step === 'string' ? null : step.path;
        const stepNumber = index + 1;
        const active = stepNumber === currentStep;
        const complete = stepNumber < currentStep;
        const content = (
          <>
            <span className="stepper__number">{stepNumber}</span>
            {complete && (
              <span className="stepper__check">
                <Icon name="check" size={20} />
              </span>
            )}
            <span className="stepper__label">{label}</span>
          </>
        );

        return (
          <li
            aria-current={active ? 'step' : undefined}
            className={`stepper__item ${active ? 'stepper__item--active' : ''} ${
              complete ? 'stepper__item--complete' : ''
            }`}
            key={label}
          >
            {complete && path ? (
              <Link
                aria-label={`Voltar para ${label}`}
                className="stepper__link"
                to={path}
              >
                {content}
              </Link>
            ) : <span className="stepper__link">{content}</span>}
          </li>
        );
      })}
    </ol>
  );
}
