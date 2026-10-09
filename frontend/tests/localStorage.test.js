import test from 'node:test';
import assert from 'node:assert/strict';
import {
  professorStorageKey,
  readProfessorStorage,
  migrateLegacyProfessorStorage,
  removeProfessorStorage,
  writeProfessorStorage,
} from '../src/services/localStorage.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
    removeItem: (key) => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
  };
}

test('separa valores por professor e remove apenas o alvo', () => {
  globalThis.window = { localStorage: createStorage() };
  writeProfessorStorage('pibic.caseDraft', 1, { title: 'A' });
  writeProfessorStorage('pibic.caseDraft', 2, { title: 'B' });
  assert.equal(professorStorageKey('pibic.caseDraft', 1), 'pibic.caseDraft.1');
  assert.deepEqual(readProfessorStorage('pibic.caseDraft', 1, null), { title: 'A' });
  assert.deepEqual(readProfessorStorage('pibic.caseDraft', 2, null), { title: 'B' });
  removeProfessorStorage('pibic.caseDraft', 1);
  assert.equal(readProfessorStorage('pibic.caseDraft', 1, null), null);
  assert.deepEqual(readProfessorStorage('pibic.caseDraft', 2, null), { title: 'B' });
});

test('migra chaves globais legadas sem perder o rascunho', () => {
  globalThis.window = { localStorage: createStorage() };
  globalThis.window.localStorage.setItem('pibic.caseDraft', '{"title":"legado"}');
  globalThis.window.localStorage.setItem('pibic.savedCase', '{"id":9}');
  migrateLegacyProfessorStorage(7);
  assert.equal(globalThis.window.localStorage.getItem('pibic.caseDraft'), null);
  assert.equal(globalThis.window.localStorage.getItem('pibic.savedCase'), null);
  assert.deepEqual(readProfessorStorage('pibic.caseDraft', 7, null), { title: 'legado' });
  assert.deepEqual(readProfessorStorage('pibic.savedCase', 7, null), { id: 9 });
});

test('expira envelope antigo somente quando um prazo é informado', () => {
  globalThis.window = { localStorage: createStorage() };
  globalThis.window.localStorage.setItem('pibic.caseDraft.7', JSON.stringify({
    version: 1,
    savedAt: Date.now() - 2000,
    value: { title: 'antigo' },
  }));
  assert.equal(readProfessorStorage('pibic.caseDraft', 7, null, { maxAgeMs: 1000 }), null);
});
