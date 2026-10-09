import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ServiceUnavailable from './pages/ServiceUnavailable.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CaseDraftProvider } from './context/CaseDraftContext.jsx';
import { SERVICE_UNAVAILABLE } from './services/serviceStatus.js';
import { PREVIEW_MODE } from './services/previewApi.js';
import './styles/base.css';
import './styles/portal.css';
import './styles/figma-overrides.css';
import './styles/mobile.css';
import './styles/service-off.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (SERVICE_UNAVAILABLE && !PREVIEW_MODE) {
  // Sem roteamento, sessão nem chamadas à API: qualquer endereço mostra só o aviso.
  root.render(<React.StrictMode><ServiceUnavailable /></React.StrictMode>);
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <CaseDraftProvider>
            <App />
          </CaseDraftProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
