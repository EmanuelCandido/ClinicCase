const DEFAULT_AI_RETRY_SECONDS = 60;
const AI_RETRYABLE_ERRORS = new Map([
  ['409:solicitacao-ia-em-andamento', 2],
  ['429:limite-uso-ia', DEFAULT_AI_RETRY_SECONDS],
  ['503:capacidade-ia-esgotada', DEFAULT_AI_RETRY_SECONDS],
]);

export function parseRetryAfterSeconds(value, now = Date.now()) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 0;

  const numericSeconds = Number(normalized);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.max(1, Math.ceil(numericSeconds));
  }

  const retryDate = Date.parse(normalized);
  if (!Number.isFinite(retryDate)) return 0;

  return Math.max(1, Math.ceil((retryDate - now) / 1000));
}

export function getAiRetryAfterSeconds(error, now = Date.now()) {
  const fallbackSeconds = AI_RETRYABLE_ERRORS.get(`${error?.status}:${error?.code}`);
  if (!fallbackSeconds) return 0;

  return parseRetryAfterSeconds(error.retryAfter, now) || fallbackSeconds;
}

export function formatRetryDelay(seconds) {
  const safeSeconds = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (safeSeconds < 60) return `${safeSeconds}s`;

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return remainingSeconds ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
}
