import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import ExportCasesModal from '../../components/ExportCasesModal.jsx';
import Icon from '../../components/Icon.jsx';
import PortalLayout from '../../components/PortalLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCaseDraft } from '../../context/CaseDraftContext.jsx';
import {
  caseMatchesSearch,
  normalizeCaseSearch,
  pageAfterRemovingLastVisibleItem,
  paginateCaseItems,
  scheduleCaseSearch,
  sortCasesNewest,
} from '../../services/caseListSearch.js';
import { readProfessorStorage, writeProfessorStorage } from '../../services/localStorage.js';
import { archiveCase, deleteCase, getCase, getCompleteCase, listCases } from '../../services/pibicApi.js';
import { mapWithConcurrency } from '../../services/promisePool.js';
import { InlineFeedback } from './PortalComponents.jsx';
import { difficultyLabel, errorMessage, normalizePageResponse, statusLabel, statusTone } from './portalUtils.js';
import { EDITING_CASE_ORIGIN } from '../../services/navigationConfig.js';

const FAVORITES_KEY = 'pibic.favoriteCases';
const FAVORITES_FILTER = 'FAVORITOS';
const EXPORT_ACTIVATION_MS = 420;
const CASES_PER_PAGE = 8;
const CASE_STATUS_FILTERS = [
  { label: 'Todos os casos', triggerLabel: 'Filtros', value: '' },
  { label: 'Publicados', value: 'PUBLICADO' },
  { label: 'Rascunhos', value: 'RASCUNHO' },
  { label: 'Arquivados', value: 'ARQUIVADO' },
  { label: 'Favoritos', value: FAVORITES_FILTER },
];

export default function CasesPage() {
  const { auth } = useAuth();
  const { setSavedCase } = useCaseDraft();
  const location = useLocation();
  const navigate = useNavigate();
  const [pageData, setPageData] = useState({ content: [], number: 0, totalElements: 0, totalPages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogError, setExportDialogError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [caseToArchive, setCaseToArchive] = useState(null);
  const [caseToDelete, setCaseToDelete] = useState(null);
  const [navigationFeedback, setNavigationFeedback] = useState(() => location.state?.successMessage || '');
  const [favorites, setFavorites] = useState(() => new Set(readProfessorStorage(FAVORITES_KEY, auth?.idProfessor, [])));
  const [selectedCaseIds, setSelectedCaseIds] = useState(() => new Set());
  const [selectedCaseItems, setSelectedCaseItems] = useState(() => new Map());
  const [exportMotion, setExportMotion] = useState({ key: 0, activating: false });
  const actionControllerRef = useRef(null);
  const actionInProgressRef = useRef(false);
  const exportActivationPendingRef = useRef(false);
  const exportActivationTimerRef = useRef(null);
  const loadSequenceRef = useRef(0);
  const favoriteIdsKey = [...favorites].map(String).sort().join(',');
  const viewKey = `${auth?.idProfessor ?? ''}|${page}|${status}|${query}|${status === FAVORITES_FILTER ? favoriteIdsKey : ''}`;
  const activeViewKeyRef = useRef(viewKey);
  activeViewKeyRef.current = viewKey;

  useEffect(() => {
    if (!location.state?.successMessage) return;
    window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state?.successMessage, navigate]);

  useEffect(() => {
    setActionBusy(false);
    setCaseToArchive(null);
    setCaseToDelete(null);
    setSelectedCaseIds(new Set());
    setSelectedCaseItems(new Map());
    setExportDialogOpen(false);
    setExportDialogError('');
    exportActivationPendingRef.current = false;
    window.clearTimeout(exportActivationTimerRef.current);
    setExportMotion((current) => ({ ...current, activating: false }));
    return () => {
      actionControllerRef.current?.abort();
      actionControllerRef.current = null;
      actionInProgressRef.current = false;
      exportActivationPendingRef.current = false;
      window.clearTimeout(exportActivationTimerRef.current);
    };
  }, [auth?.idProfessor]);

  useEffect(() => {
    setFavorites(new Set(readProfessorStorage(FAVORITES_KEY, auth?.idProfessor, [])));
  }, [auth?.idProfessor]);

  const load = useCallback(async (signal) => {
    if (signal?.aborted || activeViewKeyRef.current !== viewKey) return false;
    const requestSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = requestSequence;
    setLoading(true);
    try {
      const response = status === FAVORITES_FILTER
        ? paginateCaseItems(
          sortCasesNewest((await mapWithConcurrency(
            [...favorites],
            4,
            async (idCaso) => {
              try {
                return await getCase(idCaso, { signal });
              } catch (error) {
                if (error.status === 404) return null;
                throw error;
              }
            },
          )).filter((caseItem) => caseItem && caseMatchesSearch(caseItem, query))),
          page,
          CASES_PER_PAGE,
        )
        : await listCases({
          idProfessor: auth?.idProfessor,
          incluirArquivados: status ? undefined : false,
          page,
          size: CASES_PER_PAGE,
          status,
          termo: query,
        }, { signal });
      if (signal?.aborted || activeViewKeyRef.current !== viewKey || loadSequenceRef.current !== requestSequence) return false;
      setPageData(normalizePageResponse(response));
      setFeedback('');
      return true;
    } catch (error) {
      if (signal?.aborted || activeViewKeyRef.current !== viewKey || loadSequenceRef.current !== requestSequence || error.name === 'AbortError') return false;
      setFeedback(errorMessage(error));
      setPageData({ content: [], number: page, totalElements: 0, totalPages: 0 });
      return false;
    } finally {
      if (!signal?.aborted && activeViewKeyRef.current === viewKey && loadSequenceRef.current === requestSequence) setLoading(false);
    }
  }, [auth?.idProfessor, favorites, page, query, status, viewKey]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    return scheduleCaseSearch(searchInput, (nextQuery) => {
      setPage(0);
      setQuery(nextQuery);
    });
  }, [searchInput]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(0);
    setQuery(normalizeCaseSearch(searchInput));
  };

  const changeStatus = (nextStatus) => {
    setStatus(nextStatus);
    setPage(0);
  };

  const editCase = async (caseItem) => {
    const controller = beginActionRequest(actionControllerRef, actionInProgressRef);
    if (!controller) return;
    setActionBusy(true);
    try {
      const complete = await getCompleteCase(caseItem.idCaso, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSavedCase({
        case: complete?.caso || caseItem,
        complete,
        generatedByAi: Boolean(complete?.conteudosClinicos?.length),
        origin: EDITING_CASE_ORIGIN,
        savedAt: new Date().toISOString(),
      });
      navigate('/criar-caso/revisao');
    } catch (error) {
      if (error.name !== 'AbortError') setFeedback(errorMessage(error));
    } finally {
      finishActionRequest(actionControllerRef, actionInProgressRef, controller);
      if (!controller.signal.aborted) setActionBusy(false);
    }
  };

  const requestCaseDeletion = (caseItem) => {
    if (actionInProgressRef.current) return;
    setFeedback('');
    setCaseToDelete(caseItem);
  };

  const cancelCaseDeletion = useCallback(() => {
    if (actionInProgressRef.current) return;
    setCaseToDelete(null);
  }, []);

  const removeCase = async () => {
    const caseItem = caseToDelete;
    if (!caseItem) return;
    if (actionInProgressRef.current) return;
    const controller = beginActionRequest(actionControllerRef, actionInProgressRef);
    if (!controller) return;
    setActionBusy(true);
    try {
      await deleteCase(caseItem.idCaso, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSelectedCaseIds((current) => {
        const next = new Set(current);
        next.delete(caseItem.idCaso);
        return next;
      });
      setSelectedCaseItems((current) => {
        const next = new Map(current);
        next.delete(caseItem.idCaso);
        return next;
      });
      setCaseToDelete(null);
      const nextPage = pageAfterRemovingLastVisibleItem(page, pageData.content.length);
      if (nextPage !== page) {
        setPage(nextPage);
        setFeedback(`Caso “${caseItem.titulo}” excluído com sucesso.`);
      } else {
        const refreshed = await load(controller.signal);
        if (controller.signal.aborted) return;
        if (refreshed) setFeedback(`Caso “${caseItem.titulo}” excluído com sucesso.`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setCaseToDelete(null);
        setFeedback(errorMessage(error));
      }
    } finally {
      finishActionRequest(actionControllerRef, actionInProgressRef, controller);
      if (!controller.signal.aborted) setActionBusy(false);
    }
  };

  const requestCaseArchival = (caseItem) => {
    if (actionInProgressRef.current || caseItem.status === 'ARQUIVADO') return;
    setFeedback('');
    setCaseToArchive(caseItem);
  };

  const cancelCaseArchival = useCallback(() => {
    if (actionInProgressRef.current) return;
    setCaseToArchive(null);
  }, []);

  const archive = async () => {
    const caseItem = caseToArchive;
    if (!caseItem || actionInProgressRef.current || caseItem.status === 'ARQUIVADO') return;
    const controller = beginActionRequest(actionControllerRef, actionInProgressRef);
    if (!controller) return;
    setActionBusy(true);
    try {
      await archiveCase(caseItem.idCaso, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSelectedCaseIds((current) => {
        const next = new Set(current);
        next.delete(caseItem.idCaso);
        return next;
      });
      setSelectedCaseItems((current) => {
        const next = new Map(current);
        next.delete(caseItem.idCaso);
        return next;
      });
      setCaseToArchive(null);
      const nextPage = status === FAVORITES_FILTER
        ? page
        : pageAfterRemovingLastVisibleItem(page, pageData.content.length);
      if (nextPage !== page) {
        setPage(nextPage);
        setFeedback(`Caso “${caseItem.titulo}” arquivado com sucesso.`);
      } else {
        const refreshed = await load(controller.signal);
        if (controller.signal.aborted) return;
        if (refreshed) setFeedback(`Caso “${caseItem.titulo}” arquivado com sucesso.`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setCaseToArchive(null);
        setFeedback(errorMessage(error));
      }
    } finally {
      finishActionRequest(actionControllerRef, actionInProgressRef, controller);
      if (!controller.signal.aborted) setActionBusy(false);
    }
  };

  const toggleFavorite = (idCaso) => {
    const next = new Set(favorites);
    if (next.has(idCaso)) next.delete(idCaso);
    else next.add(idCaso);
    setFavorites(next);
    writeProfessorStorage(FAVORITES_KEY, auth?.idProfessor, [...next]);
    if (status === FAVORITES_FILTER) setPage(0);
  };

  const toggleSelection = (caseItem) => {
    const { idCaso } = caseItem;
    const next = new Set(selectedCaseIds);
    const adding = !next.has(idCaso);
    if (adding) next.add(idCaso);
    else next.delete(idCaso);
    setSelectedCaseIds(next);
    setSelectedCaseItems((current) => {
      const nextItems = new Map(current);
      if (adding) nextItems.set(idCaso, caseItem);
      else nextItems.delete(idCaso);
      return nextItems;
    });

    if (adding) {
      const shouldActivate = selectedCaseIds.size === 0 || exportActivationPendingRef.current;
      setExportMotion((current) => ({ key: current.key + 1, activating: shouldActivate }));
      if (shouldActivate) {
        exportActivationPendingRef.current = true;
        window.clearTimeout(exportActivationTimerRef.current);
        exportActivationTimerRef.current = window.setTimeout(() => {
          exportActivationPendingRef.current = false;
          setExportMotion((current) => ({ ...current, activating: false }));
        }, EXPORT_ACTIVATION_MS);
      }
      return;
    }

    if (next.size === 0) {
      exportActivationPendingRef.current = false;
      window.clearTimeout(exportActivationTimerRef.current);
      setExportMotion((current) => ({ ...current, activating: false }));
    }
  };

  const openExportDialog = () => {
    if (!selectedCaseIds.size || actionInProgressRef.current) return;
    setExportDialogError('');
    setExportDialogOpen(true);
  };

  const closeExportDialog = () => {
    if (actionInProgressRef.current) return;
    setExportDialogOpen(false);
    setExportDialogError('');
  };

  const exportCases = async ({ includeQuestions, includeAnswers }) => {
    const idsToExport = [...selectedCaseIds];
    if (!idsToExport.length) return;
    const controller = beginActionRequest(actionControllerRef, actionInProgressRef);
    if (!controller) return;
    setActionBusy(true);
    setExportProgress({ completed: 0, total: idsToExport.length });
    try {
      const completeCases = await mapWithConcurrency(
        idsToExport,
        4,
        (idCaso) => getCompleteCase(idCaso, { signal: controller.signal }),
        (completed, total) => setExportProgress({ completed, total }),
      );
      if (controller.signal.aborted) return;
      const { downloadCasesPdf } = await import('../../services/casePdf.js');
      await downloadCasesPdf(completeCases, undefined, { includeQuestions, includeAnswers });
      setExportDialogOpen(false);
      setExportDialogError('');
      setFeedback(`${completeCases.length} caso${completeCases.length === 1 ? '' : 's'} exportado${completeCases.length === 1 ? '' : 's'} em PDF.`);
    } catch (error) {
      controller.abort();
      if (error.name !== 'AbortError') setExportDialogError(errorMessage(error));
    } finally {
      const isCurrentAction = actionControllerRef.current === controller;
      if (isCurrentAction) setExportProgress(null);
      finishActionRequest(actionControllerRef, actionInProgressRef, controller);
      if (isCurrentAction) setActionBusy(false);
    }
  };

  return (
    <PortalLayout subtitle="Gerencie seus casos clínicos, rascunhos e publicações em um só lugar." title="Meus Casos">
      <section className="management-page cases-management" aria-labelledby="cases-table-title">
        <div className="management-toolbar">
          <form className="search-box" onSubmit={handleSearch} role="search">
            <Icon name="search" size={16} />
            <input aria-label="Buscar casos" autoComplete="off" onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar casos..." type="search" value={searchInput} />
          </form>
          <div className="management-toolbar__actions">
            <StatusFilter onChange={changeStatus} value={status} />
            <div
              className={`cases-export-action ${selectedCaseIds.size ? 'cases-export-action--ready' : ''} ${exportMotion.activating ? 'cases-export-action--activating' : ''}`}
              key={`export-motion-${exportMotion.key}`}
            >
              <Button disabled={actionBusy || selectedCaseIds.size === 0} icon="export" onClick={openExportDialog} variant={selectedCaseIds.size ? 'primary' : 'outline'}>Exportar{selectedCaseIds.size > 1 ? ` (${selectedCaseIds.size})` : ''}</Button>
            </div>
            <Button icon="case" to="/criar-caso/parametros" variant="primary">Novo Caso</Button>
          </div>
        </div>

        {navigationFeedback && <InlineFeedback message={navigationFeedback} onDismiss={() => setNavigationFeedback('')} tone="success" />}
        {feedback && <InlineFeedback message={feedback} onDismiss={() => setFeedback('')} />}
        <div className="design-table-wrap">
          <table className="design-table design-table--cases">
            <caption className="sr-only" id="cases-table-title">Casos clínicos do professor</caption>
            <thead><tr><th aria-label="Selecionar" /><th aria-label="Favorito" /><th>Título</th><th>Especialidade</th><th>Disciplina</th><th>Status</th><th>Dificuldade</th><th>Turmas</th><th>Respostas</th><th>Ações</th></tr></thead>
            <tbody>
              {pageData.content.map((caseItem) => (
                <tr
                  aria-selected={selectedCaseIds.has(caseItem.idCaso)}
                  className={selectedCaseIds.has(caseItem.idCaso) ? 'case-table-row--selected' : undefined}
                  key={caseItem.idCaso}
                >
                  <td className="cases-cell--select"><input aria-label={`Selecionar ${caseItem.titulo}`} checked={selectedCaseIds.has(caseItem.idCaso)} className="case-selection-checkbox" disabled={actionBusy} onChange={() => toggleSelection(caseItem)} type="checkbox" /></td>
                  <td className="cases-cell--favorite"><button aria-label={favorites.has(caseItem.idCaso) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} className={`favorite-button ${favorites.has(caseItem.idCaso) ? 'favorite-button--active' : ''}`} onClick={() => toggleFavorite(caseItem.idCaso)} type="button"><Icon name={favorites.has(caseItem.idCaso) ? 'starActive' : 'star'} size={20} /></button></td>
                  <td className="cases-cell--title"><strong>{caseItem.titulo}</strong></td>
                  <td data-label="Especialidade">{caseItem.especialidade || '—'}</td>
                  <td data-label="Disciplina">{caseItem.disciplina || '—'}</td>
                  <td className="cases-cell--status"><span className={`case-status case-status--${statusTone(caseItem.status)}`}>{statusLabel(caseItem.status)}</span></td>
                  <td data-label="Dificuldade">{difficultyLabel(caseItem)}</td>
                  <td className="cases-cell--placeholder" title="Turmas ainda não estão disponíveis">—</td>
                  <td className="cases-cell--placeholder" title="Respostas por caso ainda não estão disponíveis">—</td>
                  <td className="cases-cell--actions"><div className="row-actions"><button aria-label="Editar caso" disabled={actionBusy} onClick={() => editCase(caseItem)} title="Editar" type="button"><Icon name="edit" size={18} /></button><button aria-label="Arquivar caso" disabled={actionBusy || caseItem.status === 'ARQUIVADO'} onClick={() => requestCaseArchival(caseItem)} title={caseItem.status === 'ARQUIVADO' ? 'Caso já arquivado' : 'Arquivar'} type="button"><Icon name="archive" size={18} /></button><button aria-label="Excluir caso" className="row-actions__danger" disabled={actionBusy} onClick={() => requestCaseDeletion(caseItem)} title="Excluir" type="button"><Icon name="trash" size={18} /></button></div></td>
                </tr>
              ))}
              {!loading && pageData.content.length === 0 && <tr><td className="table-empty" colSpan="10">Nenhum caso encontrado.</td></tr>}
              {loading && <tr><td className="table-empty" colSpan="10">Carregando casos...</td></tr>}
            </tbody>
          </table>
          <footer className="table-pagination"><span>{pageData.totalElements ? `${pageData.number * CASES_PER_PAGE + 1}–${Math.min((pageData.number + 1) * CASES_PER_PAGE, pageData.totalElements)} de ${pageData.totalElements} casos` : '0 casos'}</span><div><button disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))} type="button">‹</button><span className="table-pagination__current">{pageData.totalPages ? page + 1 : 1}</span><button disabled={page + 1 >= pageData.totalPages} onClick={() => setPage((value) => value + 1)} type="button">›</button></div></footer>
        </div>
      </section>
      {caseToArchive && (
        <ArchiveCaseDialog
          busy={actionBusy}
          caseItem={caseToArchive}
          onCancel={cancelCaseArchival}
          onConfirm={archive}
        />
      )}
      {caseToDelete && (
        <DeleteCaseDialog
          busy={actionBusy}
          caseItem={caseToDelete}
          onCancel={cancelCaseDeletion}
          onConfirm={removeCase}
        />
      )}
      {exportDialogOpen && (
        <ExportCasesModal
          busy={actionBusy}
          cases={[...selectedCaseItems.values()]}
          error={exportDialogError}
          onCancel={closeExportDialog}
          onExport={exportCases}
          progress={exportProgress}
        />
      )}
    </PortalLayout>
  );
}

function ArchiveCaseDialog({ busy, caseItem, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!busy) cancelButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        aria-describedby="archive-case-description"
        aria-labelledby="archive-case-title"
        aria-modal="true"
        className="case-delete-dialog case-archive-dialog"
        role="alertdialog"
      >
        <span className="case-delete-dialog__icon case-archive-dialog__icon"><Icon name="archive" size={24} /></span>
        <h2 id="archive-case-title">Arquivar caso clínico?</h2>
        <p id="archive-case-description">
          Você está prestes a arquivar <strong>“{caseItem.titulo}”</strong>.
        </p>
        <p className="case-delete-dialog__warning case-archive-dialog__warning">
          O caso sairá de Todos os casos e ficará em Arquivados. Se estiver favoritado, continuará também em Favoritos.
        </p>
        <div className="case-delete-dialog__actions">
          <button className="button button--outline" disabled={busy} onClick={onCancel} ref={cancelButtonRef} type="button"><span>Cancelar</span></button>
          <Button disabled={busy} loading={busy} loadingText="Arquivando..." onClick={onConfirm} variant="primary">Arquivar caso</Button>
        </div>
      </section>
    </div>
  );
}

function DeleteCaseDialog({ busy, caseItem, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!busy) cancelButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        aria-describedby="delete-case-description"
        aria-labelledby="delete-case-title"
        aria-modal="true"
        className="case-delete-dialog"
        role="alertdialog"
      >
        <span className="case-delete-dialog__icon"><Icon name="trash" size={24} /></span>
        <h2 id="delete-case-title">Excluir caso clínico?</h2>
        <p id="delete-case-description">
          Você está prestes a excluir <strong>“{caseItem.titulo}”</strong> definitivamente.
        </p>
        <p className="case-delete-dialog__warning">
          O conteúdo clínico, as perguntas e as respostas vinculadas também serão removidos. Esta ação não pode ser desfeita.
        </p>
        <div className="case-delete-dialog__actions">
          <button className="button button--outline" disabled={busy} onClick={onCancel} ref={cancelButtonRef} type="button"><span>Cancelar</span></button>
          <Button disabled={busy} loading={busy} loadingText="Excluindo..." onClick={onConfirm} variant="danger">Excluir caso</Button>
        </div>
      </section>
    </div>
  );
}

function StatusFilter({ value, onChange }) {
  const selectedIndex = Math.max(0, CASE_STATUS_FILTERS.findIndex((option) => option.value === value));
  const selectedOption = CASE_STATUS_FILTERS[selectedIndex];
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const optionRefs = useRef([]);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const focusOption = (index) => {
    const safeIndex = (index + CASE_STATUS_FILTERS.length) % CASE_STATUS_FILTERS.length;
    setActiveIndex(safeIndex);
    optionRefs.current[safeIndex]?.focus();
  };

  const openFromKeyboard = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const targetIndex = event.key === 'ArrowUp' ? CASE_STATUS_FILTERS.length - 1 : selectedIndex;
    setActiveIndex(targetIndex);
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(targetIndex));
  };

  const navigateOptions = (event, index) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusOption(event.key === 'Home' ? 0 : CASE_STATUS_FILTERS.length - 1);
    }
  };

  const selectOption = (option) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const toggleMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen((current) => !current);
  };

  return (
    <div
      className={`filter-menu ${open ? 'filter-menu--open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      ref={containerRef}
    >
      <button
        aria-controls="case-status-filter-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Filtrar casos por status: ${selectedOption.label}`}
        className="filter-menu__trigger"
        onClick={toggleMenu}
        onKeyDown={openFromKeyboard}
        ref={triggerRef}
        type="button"
      >
        <Icon name="filter" size={16} />
        <span>{selectedOption.triggerLabel || selectedOption.label}</span>
        <Icon className="filter-menu__chevron" name="chevronDown" size={10} />
      </button>
      <div aria-hidden={!open} aria-label="Status dos casos" className="filter-menu__popover" id="case-status-filter-menu" role="menu">
        {CASE_STATUS_FILTERS.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              aria-checked={selected}
              className={`filter-menu__option ${selected ? 'filter-menu__option--selected' : ''}`}
              key={option.value || 'all'}
              onClick={() => selectOption(option)}
              onKeyDown={(event) => navigateOptions(event, index)}
              ref={(element) => { optionRefs.current[index] = element; }}
              role="menuitemradio"
              tabIndex={open && index === activeIndex ? 0 : -1}
              type="button"
            >
              <span>{option.label}</span>
              {selected && <Icon name="check" size={16} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function beginActionRequest(controllerRef, inProgressRef) {
  if (inProgressRef.current) return null;
  inProgressRef.current = true;
  const controller = new AbortController();
  controllerRef.current = controller;
  return controller;
}

function finishActionRequest(controllerRef, inProgressRef, controller) {
  if (controllerRef.current === controller) {
    controllerRef.current = null;
    inProgressRef.current = false;
  }
}
