const CASE_SEARCH_DEBOUNCE_MS = 250;

export function normalizeCaseSearch(input) {
  return String(input || '').trim();
}

export function caseMatchesSearch(caseItem, input) {
  const query = normalizeSearchText(input);
  if (!query) return true;
  return [
    caseItem?.titulo,
    caseItem?.especialidade,
    caseItem?.disciplina,
    caseItem?.areaSaude,
  ].some((value) => normalizeSearchText(value).includes(query));
}

export function paginateCaseItems(items, page, size) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeSize = Math.max(1, Number(size) || 1);
  const safePage = Math.max(0, Number(page) || 0);
  const start = safePage * safeSize;
  return {
    content: safeItems.slice(start, start + safeSize),
    number: safePage,
    totalElements: safeItems.length,
    totalPages: Math.ceil(safeItems.length / safeSize),
  };
}

export function pageAfterRemovingLastVisibleItem(page, visibleItemCount) {
  const safePage = Math.max(0, Number(page) || 0);
  const safeItemCount = Math.max(0, Number(visibleItemCount) || 0);
  return safePage > 0 && safeItemCount <= 1 ? safePage - 1 : safePage;
}

export function sortCasesNewest(items) {
  return [...items].sort((first, second) => (
    Date.parse(second?.dataCriacao || '') - Date.parse(first?.dataCriacao || '')
      || Number(second?.idCaso || 0) - Number(first?.idCaso || 0)
  ));
}

export function scheduleCaseSearch(input, onReady, delay = CASE_SEARCH_DEBOUNCE_MS) {
  const timer = globalThis.setTimeout(() => onReady(normalizeCaseSearch(input)), delay);
  return () => globalThis.clearTimeout(timer);
}

function normalizeSearchText(input) {
  return normalizeCaseSearch(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
