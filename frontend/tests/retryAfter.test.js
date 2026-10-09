import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRetryDelay,
  getAiRetryAfterSeconds,
  parseRetryAfterSeconds,
} from '../src/services/retryAfter.js';

test('interpreta Retry-After em segundos e em data HTTP', () => {
  assert.equal(parseRetryAfterSeconds('17'), 17);
  assert.equal(
    parseRetryAfterSeconds('Sun, 23 Aug 2026 12:00:30 GMT', Date.parse('Sun, 23 Aug 2026 12:00:00 GMT')),
    30,
  );
  assert.equal(parseRetryAfterSeconds('invalido'), 0);
});

test('aplica espera aos estados temporários específicos de IA', () => {
  assert.equal(getAiRetryAfterSeconds({ status: 429, code: 'limite-uso-ia', retryAfter: '9' }), 9);
  assert.equal(getAiRetryAfterSeconds({ status: 503, code: 'capacidade-ia-esgotada', retryAfter: '12' }), 12);
  assert.equal(getAiRetryAfterSeconds({ status: 409, code: 'solicitacao-ia-em-andamento', retryAfter: '2' }), 2);
  assert.equal(getAiRetryAfterSeconds({ status: 503, code: 'capacidade-ia-esgotada' }), 60);
  assert.equal(getAiRetryAfterSeconds({ status: 429, code: 'muitas-tentativas-login', retryAfter: '9' }), 0);
  assert.equal(getAiRetryAfterSeconds({ status: 500, code: 'limite-uso-ia', retryAfter: '9' }), 0);
});

test('formata a contagem de espera de forma compacta', () => {
  assert.equal(formatRetryDelay(9), '9s');
  assert.equal(formatRetryDelay(60), '1min');
  assert.equal(formatRetryDelay(75), '1min 15s');
});
