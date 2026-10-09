import { difficultyLabel as sharedDifficultyLabel } from '../../services/difficultyModel.js';

export function normalizePage(value) { return Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : []; }
export function normalizePageResponse(value) {
  if (Array.isArray(value)) {
    return { content: value, number: 0, totalElements: value.length, totalPages: value.length ? 1 : 0 };
  }

  const content = normalizePage(value);
  const metadata = value?.page || value || {};
  return {
    content,
    number: Number(metadata.number ?? 0),
    totalElements: Number(metadata.totalElements ?? content.length),
    totalPages: Number(metadata.totalPages ?? (content.length ? 1 : 0)),
  };
}
export function errorMessage(error) { return error?.message || 'Não foi possível carregar os dados do sistema.'; }
export function statusLabel(status) { return { ARQUIVADO: 'Arquivado', PUBLICADO: 'Publicado', RASCUNHO: 'Rascunho' }[status] || status || '—'; }
export function statusTone(status) { return status === 'PUBLICADO' ? 'success' : status === 'RASCUNHO' ? 'warning' : 'neutral'; }
export function difficultyLabel(caseItem) { return sharedDifficultyLabel(caseItem, '—'); }
