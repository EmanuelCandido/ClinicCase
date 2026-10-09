import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SelectField from '../components/SelectField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDemoSignupStatus } from '../services/pibicApi.js';
import {
  AREA_OPTIONS,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  ROLE_OPTIONS,
  validateDemoSignup,
} from '../services/demoSignupValidation.js';
import brandMark from '../assets/figma/login/brand-mark.svg';
import brandMarkInverse from '../assets/figma/login/brand-mark-inverse.svg';
import haloBlue from '../assets/figma/login/halo-blue.svg';
import orbitBlue from '../assets/figma/login/orbit-blue.svg';
import lightSecondary from '../assets/figma/login/light-secondary.svg';
import accentTop from '../assets/figma/login/accent-top.svg';

const emptyForm = {
  nome: '',
  sobrenome: '',
  email: '',
  senha: '',
  confirmacaoSenha: '',
  areaAtuacao: '',
  cargo: '',
  aceiteTermos: false,
};

const areaOptions = [{ value: '', label: 'Selecione sua área', disabled: true }, ...AREA_OPTIONS];
const roleOptions = [{ value: '', label: 'Professor, preceptor...', disabled: true }, ...ROLE_OPTIONS];

export default function ProfessorDemoSignup() {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ loading: true, enabled: false, validadeHoras: 0 });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { registerDemo } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    getDemoSignupStatus({ signal: controller.signal })
      .then((response) => setStatus({
        loading: false,
        enabled: Boolean(response?.cadastroHabilitado),
        validadeHoras: Number(response?.validadeHoras) || 0,
      }))
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ loading: false, enabled: false, validadeHoras: 0 });
      });
    return () => controller.abort();
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateDemoSignup(form);
    setError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    try {
      await registerDemo({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        email: form.email.trim(),
        senha: form.senha,
        areaAtuacao: form.areaAtuacao,
        cargo: form.cargo,
        aceiteTermos: form.aceiteTermos,
      });
      navigate('/dashboard');
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível criar a conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-access" aria-labelledby="signup-title">
        <div className="signup-shell">
          <header className="signup-header">
            <div className="signup-brand">
              <img alt="" aria-hidden="true" src={brandMark} />
              <span>ClinicCase</span>
            </div>
            <h1 id="signup-title">Crie sua conta de professor</h1>
            <p>Preencha seus dados para começar a criar casos clínicos e acompanhar suas turmas.</p>
            <span className="signup-badge">Cadastro em uma única etapa</span>
          </header>

          {status.loading && <p className="login-form__feedback" role="status">Verificando disponibilidade...</p>}

          {!status.loading && !status.enabled && (
            <p className="login-form__feedback" role="alert">
              O cadastro de professores não está disponível no momento. Procure a equipe do evento.
            </p>
          )}

          {status.enabled && (
            <form className="signup-form" noValidate onSubmit={handleSubmit}>
              <div className="signup-section">
                <h2>Dados da conta</h2>
                <div className="signup-row">
                  <SignupField autoComplete="given-name" label="Nome" maxLength={70} name="nome" onChange={handleChange} placeholder="Ex.: Ana" value={form.nome} />
                  <SignupField autoComplete="family-name" label="Sobrenome" maxLength={79} name="sobrenome" onChange={handleChange} placeholder="Ex.: Martins" value={form.sobrenome} />
                </div>
                <SignupField autoCapitalize="none" autoComplete="email" label="E-mail" maxLength={MAX_EMAIL_LENGTH} name="email" onChange={handleChange} placeholder="nome@instituicao.edu.br" spellCheck={false} type="email" value={form.email} />
                <div className="signup-row">
                  <SignupField autoComplete="new-password" label="Senha" maxLength={72} minLength={MIN_PASSWORD_LENGTH} name="senha" onChange={handleChange} placeholder="Crie uma senha" type="password" value={form.senha} />
                  <SignupField autoComplete="new-password" label="Confirmar senha" maxLength={72} name="confirmacaoSenha" onChange={handleChange} placeholder="Digite novamente" type="password" value={form.confirmacaoSenha} />
                </div>
                <p className="signup-hint">Use no mínimo {MIN_PASSWORD_LENGTH} caracteres, incluindo letras e números.</p>
              </div>

              <div className="signup-section">
                <h2>Perfil acadêmico</h2>
                <div className="signup-row">
                  <SelectField
                    className={`signup-select ${form.areaAtuacao ? '' : 'signup-select--empty'}`}
                    label="Área de atuação"
                    name="areaAtuacao"
                    onChange={handleChange}
                    options={areaOptions}
                    required
                    value={form.areaAtuacao}
                  />
                  <SelectField
                    className={`signup-select ${form.cargo ? '' : 'signup-select--empty'}`}
                    label="Cargo"
                    name="cargo"
                    onChange={handleChange}
                    options={roleOptions}
                    required
                    value={form.cargo}
                  />
                </div>
              </div>

              <div className="signup-actions">
                <label className="login-remember signup-consent">
                  <input checked={form.aceiteTermos} name="aceiteTermos" onChange={handleChange} type="checkbox" />
                  <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
                </label>

                {error && <p aria-live="polite" className="login-form__feedback" role="alert">{error}</p>}

                <button className="login-submit" disabled={isSubmitting} type="submit">
                  {isSubmitting ? 'Criando conta...' : 'Criar conta'}
                </button>

                {status.validadeHoras > 0 && (
                  <p className="signup-hint signup-hint--center">
                    Conta de demonstração: expira automaticamente em {formatValidity(status.validadeHoras)}.
                  </p>
                )}

                <p className="signup-login">
                  Já possui uma conta? <Link to="/login">Entrar</Link>
                </p>
              </div>
            </form>
          )}
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
            <h2>Crie casos que transformam a aprendizagem.</h2>
            <p>Personalize casos clínicos, organize suas turmas e acompanhe o desenvolvimento dos estudantes em um só lugar.</p>
          </div>
          <span className="login-institutional__badge">Feito para professores</span>
        </div>
      </aside>
    </main>
  );
}

function SignupField({ label, type = 'text', ...inputProps }) {
  return (
    <label className="login-field signup-field">
      <span className="login-field__label">{label} <strong>*</strong></span>
      <input autoCorrect="off" required type={type} {...inputProps} />
    </label>
  );
}

function formatValidity(hours) {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 dia' : `${days} dias`;
  }
  return hours === 1 ? '1 hora' : `${hours} horas`;
}
