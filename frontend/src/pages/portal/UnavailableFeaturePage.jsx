import Button from '../../components/Button.jsx';
import PortalLayout from '../../components/PortalLayout.jsx';

export default function UnavailableFeaturePage() {
  return (
    <PortalLayout subtitle="Esta área ainda não está disponível nesta versão." title="Funcionalidade indisponível">
      <main className="unavailable-feature" aria-labelledby="unavailable-feature-title">
        <section className="unavailable-feature__card">
          <div className="unavailable-feature__icon" aria-hidden="true">!</div>
          <span className="unavailable-feature__tag">Disponível em breve</span>
          <div className="unavailable-feature__message">
            <h2 id="unavailable-feature-title">Funcionalidade indisponível</h2>
            <p>Nesta versão atual do sistema, esta funcionalidade está indisponível. Estamos trabalhando para disponibilizá-la em breve.</p>
          </div>
          <Button to="/dashboard" variant="primary">Voltar ao início</Button>
        </section>
      </main>
    </PortalLayout>
  );
}
