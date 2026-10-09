export const FEEDBACK_DISMISS_DELAY_MS = 30_000;

export function scheduleFeedbackDismiss(onDismiss, delay = FEEDBACK_DISMISS_DELAY_MS) {
  const timerId = globalThis.setTimeout(onDismiss, delay);
  return () => globalThis.clearTimeout(timerId);
}
