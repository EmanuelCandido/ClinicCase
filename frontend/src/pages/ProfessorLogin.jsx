import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDemoSignupStatus } from '../services/pibicApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import brandMark from '../assets/figma/login/brand-mark.svg';
import brandMarkInverse from '../assets/figma/login/brand-mark-inverse.svg';
import eyeSlash from '../assets/figma/login/eye-slash.svg';
import haloBlue from '../assets/figma/login/halo-blue.svg';
import orbitBlue from '../assets/figma/login/orbit-blue.svg';
import lightSecondary from '../assets/figma/login/light-secondary.svg';
import accentTop from '../assets/figma/login/accent-top.svg';

export default function ProfessorLogin() {
  const [credentials, setCredentials] = useState({ username: '', password: '', remember: false });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [demoSignupEnabled, setDemoSignupEnabled] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    getDemoSignupStatus({ signal: controller.signal })
      .then((status) => setDemoSignupEnabled(Boolean(status?.cadastroHabilitado)))
      .catch(() => setDemoSignupEnabled(false));
    return () => controller.abort();
  }, []);

  const handleCreateAccount = () => {
    if (demoSignupEnabled) {
      navigate('/cadastro-professor');
      return;
    }
    setError('A criação de contas ainda é feita por um administrador.');
  };

  const handleChange = (event) => {
    const { checked, name, type, value } = event.target;
    setCredentials((currentCredentials) => ({ ...currentCredentials, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(credentials);
      navigate('/dashboard');
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível entrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showUnavailableMessage = (message) => {
    setError(message);
  };

  return (
    <main className="login-page">
      <section className="login-access" aria-labelledby="login-title">
        <div className="login-shell">
          <header className="login-header">
            <img alt="ClinicCase" className="login-header__mark" src={brandMark} />
            <h1 id="login-title">Bem-vindo de volta!</h1>
            <p>
              Ainda não tem uma conta?
              <button onClick={handleCreateAccount} type="button">
                Criar conta
              </button>
            </p>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-form__fields">
              <label className="login-field">
                <span className="login-field__label">Email <strong>*</strong></span>
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  name="username"
                  onChange={handleChange}
                  placeholder="nome@instituicao.edu.br"
                  required
                  spellCheck={false}
                  type="text"
                  value={credentials.username}
                />
              </label>

              <div className="login-field">
                <label className="login-field__label" htmlFor="login-password">Senha <strong>*</strong></label>
                <span className="login-password">
                  <input
                    autoComplete="current-password"
                    id="login-password"
                    name="password"
                    onChange={handleChange}
                    placeholder="Digite sua senha"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={credentials.password}
                  />
                  <button
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    type="button"
                  >
                    <img alt="" aria-hidden="true" src={eyeSlash} />
                  </button>
                </span>
              </div>
            </div>

            <div className="login-form__actions">
              <div className="login-form__helpers">
                <label className="login-remember">
                  <input checked={credentials.remember} name="remember" onChange={handleChange} type="checkbox" />
                  <span>Lembrar de mim</span>
                </label>
                <button className="login-link" onClick={() => showUnavailableMessage('A recuperação de senha ainda não está disponível.')} type="button">Esqueceu a senha?</button>
              </div>

              {error && <p aria-live="polite" className="login-form__feedback" role="alert">{error}</p>}

              <button className="login-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="login-divider" aria-hidden="true"><span /> <small>ou</small> <span /></div>
              <button className="login-institutional-link" onClick={() => showUnavailableMessage('O acesso institucional ainda não está disponível.')} type="button">
                Entrar com acesso institucional
              </button>
            </div>
          </form>
        </div>
      </section>

      <aside className="login-institutional" aria-label="Apresentação do ambiente ClinicCase">
        <img alt="" aria-hidden="true" className="login-decoration login-decoration--halo" src={haloBlue} />
        <img alt="" aria-hidden="true" className="login-decoration login-decoration--orbit" src={orbitBlue} />
        <img alt="" aria-hidden="true" className="login-decoration login-decoration--light" src={lightSecondary} />
        <img alt="" aria-hidden="true" className="login-decoration login-decoration--accent" src={accentTop} />

        <div className="login-institutional__content">
          <div className="login-institutional__brand">
            <img alt="" aria-hidden="true" src={brandMarkInverse} />
            <strong>ClinicCase</strong>
          </div>
          <div className="login-institutional__message">
            <h2>Pesquisa que transforma.</h2>
            <p>Acesse seus projetos, acompanhe resultados e continue construindo conhecimento.</p>
          </div>
          <span className="login-institutional__badge">Ambiente de pesquisa acadêmica</span>
        </div>
      </aside>
    </main>
  );
}
