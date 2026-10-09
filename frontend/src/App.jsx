import AppRoutes from './routes/AppRoutes.jsx';
import { PREVIEW_MODE } from './services/previewApi.js';

export default function App() {
  return (
    <>
      {PREVIEW_MODE && (
        <div className="preview-ribbon" role="note">
          Versão de demonstração com dados fictícios: nada é salvo e a IA é simulada.
          Entre com qualquer e-mail e senha.
        </div>
      )}
      <AppRoutes />
    </>
  );
}
