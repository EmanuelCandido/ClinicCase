// Caso aberto em "Meus casos" para edição: revisão e perguntas pertencem a essa seção,
// não ao fluxo de criação.
export const EDITING_CASE_ORIGIN = 'meus-casos';

export function isEditingExistingCase(savedCase) {
  return savedCase?.origin === EDITING_CASE_ORIGIN;
}

export function caseBreadcrumb(savedCase, items) {
  const root = isEditingExistingCase(savedCase)
    ? { label: 'Meus casos', to: '/meus-casos' }
    : { label: 'Criar Caso', muted: true };
  return [root, ...items];
}

export const navigationSections = [
  {
    title: 'Geral',
    items: [
      { label: 'Início', path: '/dashboard', icon: 'home' },
      { label: 'Criar Caso', path: '/criar-caso/parametros', icon: 'case' },
      { label: 'Meus casos', path: '/meus-casos', icon: 'folder' },
      { label: 'Turmas', path: '/turmas', icon: 'people' },
      { label: 'Desempenho', path: '/desempenho', icon: 'chart' },
    ],
  },
  {
    title: 'Outros',
    items: [
      { label: 'Configurações', path: '/configuracoes', icon: 'settings' },
      { label: 'Ajuda', path: null, icon: 'info' },
    ],
  },
];
