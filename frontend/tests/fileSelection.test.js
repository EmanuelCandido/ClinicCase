import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFileSize, mergeSelectedFiles } from '../src/services/fileSelection.js';

test('acumula seleções feitas em momentos diferentes sem sobrescrever anexos anteriores', () => {
  const firstSelection = mergeSelectedFiles([], [
    { lastModified: 1, name: 'radiografia.png', size: 2_097_152, type: 'image/png' },
  ]);
  const secondSelection = mergeSelectedFiles(firstSelection, [
    { lastModified: 2, name: 'protocolo.pdf', size: 4_718_592, type: 'application/pdf' },
  ]);

  assert.deepEqual(secondSelection.map((file) => file.name), ['radiografia.png', 'protocolo.pdf']);
  assert.equal(secondSelection[0].size, 2_097_152);
});

test('não duplica o mesmo arquivo e mantém compatibilidade com rascunhos antigos', () => {
  const merged = mergeSelectedFiles(['arquivo-legado.pdf'], [
    { lastModified: 0, name: 'arquivo-legado.pdf', size: null, type: '' },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'arquivo-legado.pdf');
  assert.equal(merged[0].size, null);
});

test('formata o tamanho para o cartão do anexo', () => {
  assert.equal(formatFileSize(2_097_152), '2 MB');
  assert.equal(formatFileSize(4_718_592), '4.5 MB');
  assert.equal(formatFileSize(null), '');
});
