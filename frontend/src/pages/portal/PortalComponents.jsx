import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { FEEDBACK_DISMISS_DELAY_MS, scheduleFeedbackDismiss } from '../../services/feedbackTimer.js';

export function InlineFeedback({
  dismissAfter = FEEDBACK_DISMISS_DELAY_MS,
  message,
  onDismiss,
  resetKey = message,
  tone = 'info',
}) {
  const [visible, setVisible] = useState(Boolean(message));
  const onDismissRef = useRef(onDismiss);
  const hasMessage = Boolean(message);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismissRef.current?.();
  }, []);

  useEffect(() => {
    if (!hasMessage) {
      setVisible(false);
      return undefined;
    }

    setVisible(true);
    return scheduleFeedbackDismiss(dismiss, dismissAfter);
  }, [dismiss, dismissAfter, hasMessage, resetKey]);

  if (!hasMessage || !visible) return null;

  return (
    <p
      aria-atomic="true"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`corner-feedback integration-feedback integration-feedback--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon name="info" size={17} />
      <span className="corner-feedback__message">{message}</span>
      <button aria-label="Fechar aviso" className="corner-feedback__close" onClick={dismiss} type="button">
        <span aria-hidden="true">×</span>
      </button>
    </p>
  );
}
