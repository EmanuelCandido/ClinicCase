import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageResponse } from '../src/pages/portal/portalUtils.js';

test('lê os metadados paginados aninhados enviados pelo Spring Data', () => {
  const response = normalizePageResponse({
    content: Array.from({ length: 8 }, (_, index) => ({ idCaso: index + 1 })),
    page: {
      number: 0,
      size: 8,
      totalElements: 19,
      totalPages: 3,
    },
  });

  assert.equal(response.content.length, 8);
  assert.equal(response.number, 0);
  assert.equal(response.totalElements, 19);
  assert.equal(response.totalPages, 3);
});

test('mantém compatibilidade com metadados paginados no nível superior', () => {
  const response = normalizePageResponse({
    content: [{ idCaso: 9 }],
    number: 1,
    totalElements: 9,
    totalPages: 2,
  });

  assert.equal(response.number, 1);
  assert.equal(response.totalElements, 9);
  assert.equal(response.totalPages, 2);
});
