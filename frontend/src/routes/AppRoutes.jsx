import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PREVIEW_MODE } from '../services/previewApi.js';

const CreateCaseClinicalContent = lazy(() => import('../pages/CreateCaseClinicalContent.jsx'));
const CreateCaseParameters = lazy(() => import('../pages/CreateCaseParameters.jsx'));
const CreateCasePatientProfile = lazy(() => import('../pages/CreateCasePatientProfile.jsx'));
const CreateCaseReferencesMedia = lazy(() => import('../pages/CreateCaseReferencesMedia.jsx'));
const CreateCaseReview = lazy(() => import('../pages/CreateCaseReview.jsx'));
const CreateCaseQuestions = lazy(() => import('../pages/CreateCaseQuestions.jsx'));
const ProfessorDashboard = lazy(() => import('../pages/ProfessorDashboard.jsx'));
const ProfessorLogin = lazy(() => import('../pages/ProfessorLogin.jsx'));
const ProfessorDemoSignup = lazy(() => import('../pages/ProfessorDemoSignup.jsx'));

const CasesPage = lazy(() => import('../pages/portal/CasesPage.jsx'));
const SettingsPage = lazy(() => import('../pages/portal/SettingsPage.jsx'));
const ServiceUnavailable = lazy(() => import('../pages/ServiceUnavailable.jsx'));
const UnavailableFeaturePage = lazy(() => import('../pages/portal/UnavailableFeaturePage.jsx'));

export default function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<main className="route-loading">Carregando...</main>}>
    <Routes>
      {/* Quem chega sem sessão começa pelo cadastro; o link "Entrar" leva ao login. */}
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/cadastro-professor'} replace />} />
      <Route
        path="/dashboard"
        element={(
          <RequireAuth>
            <ProfessorDashboard />
          </RequireAuth>
        )}
      />
      <Route path="/login" element={<ProfessorLogin />} />
      {/* Disponível só na versão de pré-visualização, para conferir o aviso de indisponibilidade. */}
      {PREVIEW_MODE && <Route path="/indisponivel" element={<ServiceUnavailable />} />}
      <Route path="/cadastro-professor" element={<ProfessorDemoSignup />} />
      <Route
        path="/criar-caso/parametros"
        element={(
          <RequireAuth>
            <CreateCaseParameters />
          </RequireAuth>
        )}
      />
      <Route
        path="/criar-caso/perfil-paciente"
        element={(
          <RequireAuth>
            <CreateCasePatientProfile />
          </RequireAuth>
        )}
      />
      <Route
        path="/criar-caso/conteudo-clinico"
        element={(
          <RequireAuth>
            <CreateCaseClinicalContent />
          </RequireAuth>
        )}
      />
      <Route
        path="/criar-caso/referencias-midias"
        element={(
          <RequireAuth>
            <CreateCaseReferencesMedia />
          </RequireAuth>
        )}
      />
      <Route
        path="/criar-caso/revisao"
        element={(
          <RequireAuth>
            <CreateCaseReview />
          </RequireAuth>
        )}
      />
      <Route path="/criar-caso/perguntas" element={<RequireAuth><CreateCaseQuestions /></RequireAuth>} />
      <Route path="/meus-casos" element={<RequireAuth><CasesPage /></RequireAuth>} />
      <Route path="/turmas" element={<RequireAuth><UnavailableFeaturePage /></RequireAuth>} />
      <Route path="/turmas/:group" element={<RequireAuth><UnavailableFeaturePage /></RequireAuth>} />
      <Route path="/alunos/:id" element={<RequireAuth><UnavailableFeaturePage /></RequireAuth>} />
      <Route path="/desempenho" element={<RequireAuth><UnavailableFeaturePage /></RequireAuth>} />
      <Route path="/configuracoes" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/casos/:idCaso/correcoes" element={<RequireAuth><UnavailableFeaturePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/criar-caso/parametros" replace />} />
    </Routes>
    </Suspense>
  );
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
