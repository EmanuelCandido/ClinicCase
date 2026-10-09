import { PREVIEW_MODE, handlePreviewRequest } from './previewApi.js';

const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL
  || (import.meta.env?.DEV ? '/api' : '')
).replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'pibic.auth';
const DEFAULT_REQUEST_TIMEOUT = 15000;

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = details.name || 'ApiError';
    this.status = details.status || 0;
    this.code = details.code || '';
    this.endpoint = details.endpoint || '';
    this.correlationId = details.correlationId || '';
    this.retryAfter = details.retryAfter || '';
    this.fields = details.fields || null;
  }
}

export function getStoredAuth() {
  const rawAuth = window.localStorage.getItem(AUTH_STORAGE_KEY)
    || window.sessionStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawAuth) {
    return null;
  }

  try {
    return JSON.parse(rawAuth);
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function storeAuth(auth, remember = false) {
  const storage = remember ? window.localStorage : window.sessionStorage;
  const otherStorage = remember ? window.sessionStorage : window.localStorage;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  otherStorage.removeItem(AUTH_STORAGE_KEY);
}

export function clearStoredAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function apiRequest(path, options = {}) {
  if (PREVIEW_MODE) {
    // Versão de pré-visualização: responde com dados fictícios, sem rede.
    try {
      return await handlePreviewRequest(path, options);
    } catch (cause) {
      throw new ApiError(cause.message || 'Não encontrado.', { status: cause.status || 500, endpoint: path });
    }
  }
  const {
    auth = true,
    body,
    headers = {},
    method = 'GET',
    timeout = DEFAULT_REQUEST_TIMEOUT,
    correlationId: suppliedCorrelationId,
    signal,
    validateResponse,
    ...rest
  } = options;

  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  const correlationId = suppliedCorrelationId
    || getHeaderValue(requestHeaders, 'X-Correlation-Id')
    || createCorrelationId();
  requestHeaders['X-Correlation-Id'] = correlationId;

  const storedAuth = getStoredAuth();
  if (auth && storedAuth?.token) {
    requestHeaders.Authorization = `${storedAuth.tipo || 'Bearer'} ${storedAuth.token}`;
  }

  let requestBody = body;
  if (body && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortForTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const handleExternalAbort = () => controller.abort();
  const timeoutId = globalThis.setTimeout(abortForTimeout, timeout);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', handleExternalAbort, { once: true });
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
      ...rest,
    });
    const responseCorrelationId = response.headers.get('x-correlation-id') || correlationId;
    const retryAfter = response.headers.get('retry-after') || '';

    if (auth && response.status === 401) {
      clearStoredAuth();
      window.dispatchEvent(new CustomEvent('pibic:unauthorized'));
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('json');
    let responseText;
    try {
      responseText = await response.text();
    } catch (cause) {
      if (controller.signal.aborted) throw abortError(timedOut, cause, correlationId, path);
      throw new ApiError('Recebemos uma resposta inesperada do servidor. Tente novamente.', {
        cause,
        code: 'INVALID_RESPONSE',
        correlationId: responseCorrelationId,
        endpoint: path,
        status: response.status,
      });
    }
    if (controller.signal.aborted) throw abortError(timedOut, undefined, correlationId, path);

    let data = responseText;
    if (isJson && responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (cause) {
        throw new ApiError('Recebemos uma resposta inesperada do servidor. Tente novamente.', {
          cause,
          code: 'INVALID_JSON',
          correlationId: responseCorrelationId,
          endpoint: path,
          status: response.status,
        });
      }
    } else if (isJson) {
      data = null;
    }

    if (!response.ok) {
      const message = friendlyErrorMessage(data, response.status);
      throw new ApiError(message, {
        code: getErrorCode(data, response.status),
        correlationId: responseCorrelationId,
        endpoint: path,
        fields: data && typeof data === 'object' ? data.campos || null : null,
        retryAfter,
        status: response.status,
      });
    }

    if (validateResponse && !validateResponse(data)) {
      throw new ApiError('A resposta veio incompleta. Tente novamente.', {
        code: 'INVALID_RESPONSE', correlationId: responseCorrelationId, endpoint: path, status: response.status,
      });
    }
    return data;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (controller.signal.aborted) throw abortError(timedOut, cause, correlationId, path);
    throw new ApiError(
      'Não foi possível conectar à plataforma. Verifique sua internet e tente novamente.',
      { cause, code: 'NETWORK_ERROR', correlationId, endpoint: path, name: 'NetworkError' },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleExternalAbort);
  }
}

function abortError(timedOut, cause, correlationId, path) {
  return new ApiError(
    timedOut ? 'A operação demorou mais que o esperado. Tente novamente.' : 'A operação foi cancelada.',
    { cause, code: timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED', correlationId, endpoint: path, name: timedOut ? 'TimeoutError' : 'AbortError' },
  );
}

// Erros de IA e de servidor têm texto próprio; mensagens do servidor com termos técnicos
// (nomes de variáveis, protocolos, serviços internos) nunca chegam ao professor.
const FRIENDLY_MESSAGES_BY_CODE = {
  'capacidade-ia-esgotada': 'A IA está muito requisitada agora. Aguarde um minuto e tente novamente.',
  'tempo-esgotado-ia': 'A IA demorou demais para responder. Tente novamente; pedir menos perguntas costuma ajudar.',
  'falha-provedor-ia': 'A IA não conseguiu concluir a solicitação. Tente novamente em instantes.',
  'servico-indisponivel': 'O serviço de IA está fora do ar no momento. Tente novamente em instantes.',
  'limite-uso-ia': 'Você atingiu o limite de usos da IA por enquanto. Aguarde um pouco e tente novamente.',
  'solicitacao-ia-em-andamento': 'Já existe uma solicitação à IA em andamento. Aguarde ela terminar.',
  'erro-interno': 'Algo deu errado do nosso lado. Tente novamente em instantes.',
  'conflito-de-persistencia': 'Não foi possível salvar agora. Atualize a página e tente novamente.',
};
const TECHNICAL_TERMS = /\b(api|backend|endpoint|http|json|gateway|provedor|token|exception|null|sql|IA_[A-Z_]+|url|timeout|stack)\b/i;

function friendlyErrorMessage(data, status) {
  const code = String(getErrorCode(data, status)).replace('urn:sistema-api-pibic:problem:', '');
  if (FRIENDLY_MESSAGES_BY_CODE[code]) return FRIENDLY_MESSAGES_BY_CODE[code];
  const serverMessage = getErrorMessage(data);
  if (status < 500 && serverMessage && !TECHNICAL_TERMS.test(serverMessage)) return serverMessage;
  return getStatusMessage(status);
}

function getErrorMessage(data) {
  if (!data) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (data.campos && typeof data.campos === 'object') {
    const fieldMessages = Object.values(data.campos).filter(Boolean);

    if (fieldMessages.length > 0) {
      return fieldMessages.join(' ');
    }
  }

  return data.erro || data.detalhe || data.message || data.detail || data.error || data.title || '';
}

function getErrorCode(data, status) {
  if (data && typeof data === 'object') {
    return data.codigo || data.code || data.tipo || data.type || `HTTP_${status}`;
  }
  return `HTTP_${status}`;
}

function getStatusMessage(status) {
  const messages = {
    400: 'Algumas informações não foram aceitas. Revise os campos e tente novamente.',
    401: 'Sua sessão expirou. Entre novamente para continuar.',
    403: 'Você não tem permissão para fazer isso.',
    404: 'Não encontramos o que você procurava.',
    409: 'A operação entrou em conflito com o estado atual. Atualize a página e tente novamente.',
    429: 'O limite de solicitações foi atingido. Aguarde um instante e tente novamente.',
    503: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
    502: 'A IA não conseguiu concluir a solicitação. Tente novamente em instantes.',
    504: 'A IA demorou demais para responder. Tente novamente.',
    524: 'A operação demorou demais e foi interrompida. Tente novamente.',
  };
  return messages[status] || 'Algo deu errado. Tente novamente em instantes.';
}

function getHeaderValue(headers, name) {
  const expectedName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === expectedName);
  return entry?.[1] || '';
}

function createCorrelationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
