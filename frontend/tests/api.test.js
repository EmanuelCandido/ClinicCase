import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, apiRequest } from '../src/services/api.js';
import { generateClinicalContentWithAi, publishCase, saveQuestionsBatch } from '../src/services/pibicApi.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    removeItem: (key) => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
  };
}

function prepareWindow() {
  globalThis.window = {
    dispatchEvent: () => true,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  };
}

test('preserva status, código, correlação e Retry-After em erros da API', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.headers['X-Correlation-Id']);
    return new Response(JSON.stringify({
      codigo: 'limite-uso-ia',
      detalhe: 'Aguarde antes de tentar novamente.',
    }), {
      status: 429,
      headers: {
        'content-type': 'application/problem+json',
        'retry-after': '3',
        'x-correlation-id': 'server-correlation-id',
      },
    });
  };

  try {
    await assert.rejects(apiRequest('/teste'), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, 'limite-uso-ia');
      assert.equal(error.correlationId, 'server-correlation-id');
      assert.equal(error.retryAfter, '3');
      assert.equal(error.message, 'Você atingiu o limite de usos da IA por enquanto. Aguarde um pouco e tente novamente.');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserva os campos do problema 422 para o modal de coerência', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    campos: {
      especialidade: 'A especialidade conflita com o diagnóstico.',
      diagEsperado: 'O diagnóstico pertence a outro contexto clínico.',
    },
    detail: 'Os dados informados são clinicamente incoerentes.',
    status: 422,
    type: 'urn:sistema-api-pibic:problem:dados-clinicos-incoerentes',
  }), {
    status: 422,
    headers: { 'content-type': 'application/problem+json' },
  });

  try {
    await assert.rejects(apiRequest('/casos/41/ia/gerar'), (error) => {
      assert.equal(error.status, 422);
      assert.match(error.code, /dados-clinicos-incoerentes/);
      assert.deepEqual(error.fields, {
        especialidade: 'A especialidade conflita com o diagnóstico.',
        diagEsperado: 'O diagnóstico pertence a outro contexto clínico.',
      });
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('publica caso e tempo limite em uma única requisição PATCH', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/casos/42/publicar');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { tempoLimiteMinutos: 90 });
    return new Response(JSON.stringify({ idCaso: 42, status: 'PUBLICADO', tempoLimiteMinutos: 90 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await publishCase(42, { tempoLimiteMinutos: 90 });
    assert.equal(response.status, 'PUBLICADO');
    assert.equal(response.tempoLimiteMinutos, 90);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('salva perguntas pendentes em lote atômico no caso', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/casos/42/perguntas/lote');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { perguntas: [{ id: null, pergunta: { texto: 'Questão' } }] });
    return new Response(JSON.stringify([{ id: 9, texto: 'Questão' }]), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await saveQuestionsBatch(42, [{ id: null, pergunta: { texto: 'Questão' } }]);
    assert.equal(response[0].id, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reserva tempo para geração, reparo e validação clínica no backend', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let timeoutAgendado;
  globalThis.setTimeout = (_callback, delay) => {
    timeoutAgendado = delay;
    return 1;
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ idCaso: 42, idConteudo: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    await generateClinicalContentWithAi(42, { sintomas: '' });
    assert.equal(timeoutAgendado, 390000);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('o timeout permanece ativo durante a leitura lenta do corpo', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    headers: new Headers({ 'content-type': 'application/json' }),
    ok: true,
    status: 200,
    text: () => new Promise((resolve) => globalThis.setTimeout(() => resolve('{"ok":true}'), 30)),
  });

  try {
    await assert.rejects(apiRequest('/corpo-lento', { timeout: 5 }), (error) => {
      assert.equal(error.code, 'REQUEST_TIMEOUT');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejeita sucesso clínico vazio, truncado ou sem IDs como resposta incerta', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  try {
    for (const body of ['', '{', '{}', '<html>proxy</html>']) {
      globalThis.fetch = async () => new Response(body, {
        status: 200, headers: { 'content-type': body.startsWith('<') ? 'text/html' : 'application/json' },
      });
      await assert.rejects(generateClinicalContentWithAi(42, {}), (error) => {
        assert.ok(['INVALID_JSON', 'INVALID_RESPONSE'].includes(error.code));
        assert.equal(error.status, 200);
        return true;
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diferencia timeout de cancelamento e mantém o endpoint no erro', async () => {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Abortada', 'AbortError')), { once: true });
  });

  try {
    await assert.rejects(apiRequest('/ia-lenta', { timeout: 5 }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.name, 'TimeoutError');
      assert.equal(error.code, 'REQUEST_TIMEOUT');
      assert.equal(error.endpoint, '/ia-lenta');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function rejectionMessage(status, body) {
  prepareWindow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
  try {
    return await apiRequest('/teste').then(() => '', (error) => error.message);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('troca erros de IA e de servidor por mensagens sem termos técnicos', async () => {
  assert.equal(
    await rejectionMessage(503, {
      codigo: 'urn:sistema-api-pibic:problem:servico-indisponivel',
      detalhe: 'O gateway de IA esta indisponivel. Verifique IA_URL_BASE',
    }),
    'O serviço de IA está fora do ar no momento. Tente novamente em instantes.',
  );
  assert.equal(
    await rejectionMessage(500, { detalhe: 'NullPointerException em CasoService' }),
    'Algo deu errado. Tente novamente em instantes.',
  );
  assert.equal(
    await rejectionMessage(400, { detalhe: 'Corpo JSON malformado' }),
    'Algumas informações não foram aceitas. Revise os campos e tente novamente.',
  );
});

test('mantém mensagens de validação legíveis vindas do servidor', async () => {
  assert.equal(
    await rejectionMessage(400, { detalhe: 'Ja existe uma conta cadastrada com esse e-mail' }),
    'Ja existe uma conta cadastrada com esse e-mail',
  );
});

