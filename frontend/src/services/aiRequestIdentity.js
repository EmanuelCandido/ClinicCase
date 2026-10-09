const STORAGE_PREFIX = 'pibic.aiRequest';

export function beginAiRequest(operation, idCaso, payload) {
  const pending = findAiRequest(operation, idCaso, payload);
  if (pending) return pending;
  const fingerprint = hashString(stableStringify(payload));
  const storageKey = `${STORAGE_PREFIX}.${operation}.${idCaso}.${fingerprint}`;
  const idempotencyKey = createRequestId();
  try {
    window.sessionStorage.setItem(storageKey, idempotencyKey);
  } catch {
    throw new Error('Permita o armazenamento de sessão no navegador antes de gerar conteúdo.');
  }
  return { idempotencyKey, storageKey, reused: false };
}

// Consultar uma tentativa não deve criar uma chave antes de salvar seus dados.
export function findAiRequest(operation, idCaso, payload) {
  const storageKey = `${STORAGE_PREFIX}.${operation}.${idCaso}.${hashString(stableStringify(payload))}`;
  try {
    const idempotencyKey = window.sessionStorage.getItem(storageKey);
    return idempotencyKey ? { idempotencyKey, storageKey, reused: true } : null;
  } catch {
    return null;
  }
}

export function completeAiRequest(requestIdentity) {
  if (!requestIdentity?.storageKey) return;
  try {
    window.sessionStorage.removeItem(requestIdentity.storageKey);
  } catch {
    // A expiração natural da sessão remove a chave posteriormente.
  }
}

export function shouldKeepAiRequestIdentity(error) {
  return error?.name === 'TimeoutError'
    || error?.name === 'NetworkError'
    || error?.name === 'AbortError'
    || error?.code === 'REQUEST_TIMEOUT'
    || error?.code === 'NETWORK_ERROR'
    || error?.code === 'REQUEST_ABORTED'
    || error?.code === 'INVALID_RESPONSE'
    || error?.code === 'INVALID_JSON'
    || ([502, 503, 504].includes(error?.status) && ![
      'falha-provedor-ia', 'servico-indisponivel', 'capacidade-ia-esgotada', 'tempo-esgotado-ia',
    ].includes(String(error?.code || '').replace('urn:sistema-api-pibic:problem:', '')))
    || (error?.status === 409 && Boolean(error?.retryAfter));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Este navegador não oferece geração segura de identificadores. Atualize-o para gerar conteúdo.');
  }
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
