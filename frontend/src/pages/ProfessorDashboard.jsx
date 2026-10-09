import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { normalizePageResponse } from './portal/portalUtils.js';
import { useAuth } from '../context/AuthContext.jsx';
import figmaAvatar from '../assets/figma/profile-figma.jpeg';
import {
  getProfessorCases,
  getProfessorReport,
  listCases,
} from '../services/pibicApi.js';
import { InlineFeedback } from './portal/PortalComponents.jsx';

const emptyDashboard = {
  metrics: [
    { label: 'Casos Criados', value: '0', icon: 'note', tone: 'primary' },
    { label: 'Avaliações Pendentes', value: '0', icon: 'pending', tone: 'warning' },
    { label: 'Turmas Ativas', value: '—', icon: 'peopleMetric', tone: 'success' },
  ],
  classPerformance: [],
  recentCases: [],
};

export default function ProfessorDashboard() {
  const { auth, profile } = useAuth();
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setFeedback('');
      setIsLoading(true);

      try {
        const idProfessor = auth?.idProfessor;
        const [cases, report] = await loadDashboardData(idProfessor, { signal: controller.signal });

        if (controller.signal.aborted) {
          return;
        }

        setDashboard(buildDashboard(cases, report));
      } catch (requestError) {
        if (!controller.signal.aborted && requestError.name !== 'AbortError') {
          setFeedback(requestError.message || 'Não foi possível carregar o dashboard.');
          setDashboard(emptyDashboard);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      controller.abort();
    };
  }, [auth]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="dashboard-topbar">
          <h1>
            Bem vindo, <strong>{getFirstName(profile.name)}!</strong>
          </h1>

          <div className="dashboard-topbar__actions">
            <Button icon="case" to="/criar-caso/parametros" variant="primary">
              Criar novo caso
            </Button>

            <Link aria-label="Abrir configurações do perfil" className="profile" to="/configuracoes">
              <img alt="" className="profile__avatar" src={profile.avatar || figmaAvatar} />
              <span className="profile__copy">
                <strong>{profile.name}</strong>
                <small>{profile.course}</small>
              </span>
              <Icon name="chevronDown" size={10} />
            </Link>
          </div>
        </header>

        <section className="dashboard-page" aria-label="Dashboard do professor">
          {feedback && <InlineFeedback message={feedback} onDismiss={() => setFeedback('')} tone="error" />}
          {isLoading && <InlineFeedback message="Carregando seus dados..." resetKey="dashboard-loading" />}

          <div className="dashboard-metrics">
            {dashboard.metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span className={`metric-card__icon metric-card__icon--${metric.tone}`}>
                  <Icon name={metric.icon} size={24} />
                </span>
                <div>
                  <h2>{metric.label}</h2>
                  <strong>{metric.value}</strong>
                </div>
              </article>
            ))}
          </div>

          <section className="dashboard-panel performance-panel">
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <span className="dashboard-panel__icon">
                  <Icon name="chartMetric" size={20} />
                </span>
                <div>
                  <h2>Desempenho das turmas</h2>
                  <p>Acompanhe e analise os resultados das turmas e alunos.</p>
                </div>
              </div>
              <Link to="/desempenho">Ver desempenho completo</Link>
            </header>

            <div className="bar-chart" aria-label="Taxa de acerto por turma">
              <span className="bar-chart__axis">Taxa de Acerto</span>
              <div className="bar-chart__plot">
                {[100, 75, 50, 25, 0].map((tick) => (
                  <span className="bar-chart__grid" key={tick}>
                    <span>{tick}%</span>
                  </span>
                ))}
                {dashboard.classPerformance.length > 0 ? (
                  <div className="bar-chart__bars">
                    {dashboard.classPerformance.map((item) => (
                      <div className="bar-chart__bar-item" key={item.label}>
                        <span className="bar-chart__bar" style={{ height: `${item.value}%` }} />
                        <small>{item.label}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-empty-chart">
                    <strong>Sem dados por turma</strong>
                    <span>Por enquanto, só o desempenho geral está disponível.</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="dashboard-panel recent-cases">
            <header className="recent-cases__header">
              <h2>Lista de Casos Recentes</h2>
              <p>Último mês</p>
            </header>

            <div className="cases-table">
              <div className="cases-table__row cases-table__row--head">
                <span>Título</span>
                <span>Data</span>
                <span>Status</span>
              </div>
              {dashboard.recentCases.map((caseItem, index) => (
                <div className="cases-table__row" key={`${caseItem.title}-${index}`}>
                  <span>{caseItem.title}</span>
                  <span>{caseItem.date}</span>
                  <span className={`status-pill status-pill--${caseItem.tone}`}>
                    {caseItem.status}
                  </span>
                </div>
              ))}
              {!isLoading && dashboard.recentCases.length === 0 && (
                <div className="cases-table__row">
                  <span>Nenhum caso encontrado</span>
                  <span>-</span>
                  <span className="status-pill status-pill--done">Vazio</span>
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

async function loadDashboardData(idProfessor, options) {
  if (idProfessor) {
    const [casesResult, reportResult] = await Promise.allSettled([
      getProfessorCases(idProfessor, options),
      getProfessorReport(idProfessor, options),
    ]);

    if (casesResult.status === 'rejected' && reportResult.status === 'rejected') {
      throw casesResult.reason;
    }

    return [
      casesResult.status === 'fulfilled' ? casesResult.value : [],
      reportResult.status === 'fulfilled' ? reportResult.value : null,
    ];
  }

  const casesPage = await listCases({ page: 0, size: 20 }, options);
  return [casesPage, null];
}

function buildDashboard(cases, report) {
  // O total vem dos metadados da página (page.totalElements), não do tamanho da primeira página.
  const { content: caseList, totalElements: totalCases } = normalizePageResponse(cases);
  const pendingReviews = report?.totalPendentesRevisao || 0;

  return {
    metrics: [
      { label: 'Casos Criados', value: String(totalCases), icon: 'note', tone: 'primary' },
      { label: 'Avaliações Pendentes', value: String(pendingReviews), icon: 'pending', tone: 'warning' },
      { label: 'Turmas Ativas', value: '—', icon: 'peopleMetric', tone: 'success' },
    ],
    classPerformance: [],
    recentCases: caseList.slice(0, 6).map((caseItem) => ({
      title: caseItem.titulo,
      date: formatDate(caseItem.dataCriacao),
      status: getStatusLabel(caseItem.status),
      tone: getStatusTone(caseItem.status),
    })),
  };
}


function getFirstName(name) {
  return name?.split(' ')[0] || 'Professor';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

function getStatusLabel(status) {
  const labels = {
    PUBLICADO: 'Publicado',
    RASCUNHO: 'Rascunho',
    ARQUIVADO: 'Arquivado',
  };

  return labels[status] || status || '-';
}

function getStatusTone(status) {
  if (status === 'PUBLICADO') {
    return 'active';
  }

  if (status === 'RASCUNHO') {
    return 'draft';
  }

  return 'done';
}
