import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAiRequest,
  findAiRequest,
  completeAiRequest,
  shouldKeepAiRequestIdentity,
} from '../src/services/aiRequestIdentity.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    removeItem: (key) => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
  };
}

test('reutiliza a chave na mesma tentativa e libera após sucesso', () => {
  globalThis.window = { sessionStorage: createStorage() };
  const first = beginAiRequest('generate-content', 9, { b: 2, a: 1 });
  const retry = beginAiRequest('generate-content', 9, { a: 1, b: 2 });
  assert.equal(retry.idempotencyKey, first.idempotencyKey);

  completeAiRequest(first);
  const nextOperation = beginAiRequest('generate-content', 9, { a: 1, b: 2 });
  assert.notEqual(nextOperation.idempotencyKey, first.idempotencyKey);
});

test('mantém a chave para falhas incertas e conflito transitório', () => {
  assert.equal(shouldKeepAiRequestIdentity({ name: 'TimeoutError' }), true);
  assert.equal(shouldKeepAiRequestIdentity({ status: 409, retryAfter: '2' }), true);
  assert.equal(shouldKeepAiRequestIdentity({ status: 400 }), false);
  assert.equal(shouldKeepAiRequestIdentity({ code: 'INVALID_JSON', status: 200 }), true);
  assert.equal(shouldKeepAiRequestIdentity({ status: 502 }), true);
  assert.equal(shouldKeepAiRequestIdentity({ status: 503, code: 'urn:sistema-api-pibic:problem:capacidade-ia-esgotada' }), false);
});

test('o fallback da chave de idempotência mantém o formato UUID', () => {
  globalThis.window = { sessionStorage: createStorage() };
  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
  } });
  try {
    const request = beginAiRequest('generate-content', 9, { a: 1 });
    assert.match(request.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  }
});

test('consulta pendente não cria chave antes de salvar o rascunho', () => {
  globalThis.window = { sessionStorage: createStorage() };
  assert.equal(findAiRequest('adjust-content', 9, { tipoAjuste: 'REGERAR' }), null);
  // Um timeout ao salvar os dados não pode parecer uma geração já enviada.
  assert.equal(findAiRequest('adjust-content', 9, { tipoAjuste: 'REGERAR' }), null);
  const started = beginAiRequest('adjust-content', 9, { tipoAjuste: 'REGERAR' });
  assert.equal(findAiRequest('adjust-content', 9, { tipoAjuste: 'REGERAR' }).idempotencyKey, started.idempotencyKey);
});

test('não envia chave insegura quando o ambiente não oferece aleatoriedade segura', () => {
  globalThis.window = { sessionStorage: createStorage() };
  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    assert.throws(() => beginAiRequest('generate-content', 9, {}), /geração segura/);
    assert.equal(findAiRequest('generate-content', 9, {}), null);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  }
});
