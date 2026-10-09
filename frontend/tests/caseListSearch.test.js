import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caseMatchesSearch,
  normalizeCaseSearch,
  pageAfterRemovingLastVisibleItem,
  paginateCaseItems,
  scheduleCaseSearch,
  sortCasesNewest,
} from '../src/services/caseListSearch.js';

test('normaliza o termo sem alterar o texto digitado no campo', () => {
  assert.equal(normalizeCaseSearch('  Caso respiratório  '), 'Caso respiratório');
  assert.equal(normalizeCaseSearch(null), '');
});

test('publica a busca após o debounce sem exigir submit', async () => {
  const received = [];
  const cancel = scheduleCaseSearch('  cardiologia ', (query) => received.push(query), 5);

  assert.deepEqual(received, []);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(received, ['cardiologia']);
  cancel();
});

test('cancela a busca anterior quando o usuário continua digitando', async () => {
  const received = [];
  const cancel = scheduleCaseSearch('cas', (query) => received.push(query), 5);
  cancel();

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(received, []);
});

test('filtra favoritos por qualquer dado textual ignorando acentos e caixa', () => {
  const caseItem = {
    areaSaude: 'Medicina',
    disciplina: 'Semiologia',
    especialidade: 'Cardiologia Pediátrica',
    titulo: 'Avaliação cardiovascular',
  };

  assert.equal(caseMatchesSearch(caseItem, 'pediatrica'), true);
  assert.equal(caseMatchesSearch(caseItem, 'SEMIOLOGIA'), true);
  assert.equal(caseMatchesSearch(caseItem, 'neurologia'), false);
});

test('ordena e pagina a visão de favoritos', () => {
  const ordered = sortCasesNewest([
    { dataCriacao: '2026-08-20T12:00:00', idCaso: 1 },
    { dataCriacao: '2026-08-22T12:00:00', idCaso: 2 },
    { dataCriacao: '2026-08-21T12:00:00', idCaso: 3 },
  ]);
  const result = paginateCaseItems(ordered, 1, 2);

  assert.deepEqual(result.content.map((item) => item.idCaso), [1]);
  assert.equal(result.totalElements, 3);
  assert.equal(result.totalPages, 2);
});

test('volta uma página ao remover o último item visível', () => {
  assert.equal(pageAfterRemovingLastVisibleItem(2, 1), 1);
  assert.equal(pageAfterRemovingLastVisibleItem(2, 2), 2);
  assert.equal(pageAfterRemovingLastVisibleItem(0, 1), 0);
});
