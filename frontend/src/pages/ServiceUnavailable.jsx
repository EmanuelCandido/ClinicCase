export default function ServiceUnavailable() {
  return (
    <main className="service-off">
      <section aria-labelledby="service-off-title" className="service-off__card">
        <img alt="" aria-hidden="true" className="service-off__logo" src="/favicon.svg" />
        <p className="service-off__brand">Clinic<span>Case</span></p>
        <h1 id="service-off-title">Plataforma indisponível</h1>
        <p className="service-off__badge">Por tempo indeterminado</p>
        <p className="service-off__text">
          O ClinicCase está temporariamente fora do ar e não é possível entrar, criar conta
          ou acessar casos clínicos no momento.
        </p>
        <p className="service-off__text service-off__text--muted">
          Quando a plataforma voltar, este aviso será removido. Obrigado pela compreensão.
        </p>
      </section>
    </main>
  );
}
