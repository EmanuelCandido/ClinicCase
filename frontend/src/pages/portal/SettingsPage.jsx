import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/Button.jsx';
import PortalLayout from '../../components/PortalLayout.jsx';
import StandardSelectField from '../../components/SelectField.jsx';
import figmaAvatar from '../../assets/figma/profile-figma.jpeg';
import deviceIcon from '../../assets/figma/ui/settings-device.svg';
import { useAuth } from '../../context/AuthContext.jsx';
import { healthSpecialties } from '../../services/caseConfig.js';
import {
  CASE_GENERATION_PREFERENCES_ENABLED,
  readProfessorPreferences,
  writeProfessorPreferences,
} from '../../services/professorPreferences.js';
import { getProfessor, updateProfessor } from '../../services/pibicApi.js';
import { InlineFeedback } from './PortalComponents.jsx';
import { errorMessage } from './portalUtils.js';

const TAB_ORDER = CASE_GENERATION_PREFERENCES_ENABLED
  ? ['conta', 'casos', 'seguranca']
  : ['conta', 'seguranca'];
const TAB_SUBTITLES = {
  conta: 'Gerencie seus dados pessoais e vínculo acadêmico.',
  casos: 'Personalize sua conta e a geração de casos clínicos.',
  seguranca: 'Proteja sua conta, senha e sessões de acesso.',
};

const CASE_CONTEXT_OPTIONS = ['Ambulatório', 'Atenção primária', 'Emergência', 'Enfermaria', 'UTI'];
const CASE_COMPLEXITY_OPTIONS = ['Básica', 'Intermediária', 'Avançada'];
const DETAIL_LEVEL_OPTIONS = ['Conciso', 'Padrão', 'Detalhado'];
const QUESTION_DIFFICULTY_OPTIONS = [
  'Acompanhar dificuldade do caso',
  'Básica',
  'Intermediária',
  'Avançada',
];

const PREFERENCE_CARDS = [
  { description: 'Cria as respostas corretas junto às questões.', key: 'generateAnswerKey', label: 'Gerar gabarito automaticamente' },
  { description: 'Explica por que cada resposta está correta.', key: 'includeJustification', label: 'Incluir justificativa das respostas' },
  { description: 'Adiciona exames quando contribuírem para o caso.', key: 'includeExams', label: 'Incluir exames complementares' },
  { description: 'Insere resultados clínicos quando forem relevantes.', key: 'includeLabs', label: 'Incluir dados laboratoriais quando relevantes' },
  { description: 'Adiciona a progressão do quadro ao longo do caso.', key: 'includeEvolution', label: 'Incluir evolução clínica' },
  { description: 'Mantém o desafio diagnóstico no enunciado.', key: 'hideDiagnosis', label: 'Evitar revelar explicitamente o diagnóstico no enunciado' },
];

function splitName(name = '') {
  const [nome = '', ...rest] = name.trim().split(/\s+/);
  return { nome, sobrenome: rest.join(' ') };
}

function accountSnapshot(form, preferences) {
  return JSON.stringify({
    form,
    academicRole: preferences.academicRole,
    institution: preferences.institution,
  });
}

export default function SettingsPage() {
  const { auth, profile, refreshProfile, updateProfileState } = useAuth();
  const initialPreferences = useMemo(
    () => readProfessorPreferences(auth?.idProfessor),
    [auth?.idProfessor],
  );
  const initialForm = useMemo(() => ({
    ...splitName(profile.name),
    email: profile.email || '',
    materia: profile.course || '',
  }), [profile.course, profile.email, profile.name]);
  const [tab, setTab] = useState('conta');
  const [form, setForm] = useState(initialForm);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [savedAccountSnapshot, setSavedAccountSnapshot] = useState(
    () => accountSnapshot(initialForm, initialPreferences),
  );
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const accountEditedRef = useRef(false);

  useEffect(() => {
    const nextPreferences = readProfessorPreferences(auth?.idProfessor);
    setPreferences(nextPreferences);
    accountEditedRef.current = false;

    if (!auth?.idProfessor) {
      setForm(initialForm);
      setSavedAccountSnapshot(accountSnapshot(initialForm, nextPreferences));
      return undefined;
    }

    const controller = new AbortController();
    getProfessor(auth.idProfessor, { signal: controller.signal }).then((professor) => {
      if (controller.signal.aborted || accountEditedRef.current) return;
      const nextForm = {
        ...splitName(professor.nome),
        email: professor.email || '',
        materia: professor.materia || '',
      };
      setForm(nextForm);
      setSavedAccountSnapshot(accountSnapshot(nextForm, nextPreferences));
    }).catch((error) => {
      if (error.name !== 'AbortError') setFeedback(errorMessage(error));
    });
    return () => controller.abort();
  }, [auth?.idProfessor, initialForm]);

  const accountDirty = useMemo(
    () => accountSnapshot(form, preferences) !== savedAccountSnapshot,
    [form, preferences, savedAccountSnapshot],
  );

  const setField = (key, value) => {
    accountEditedRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setAccountPreference = (key, value) => {
    accountEditedRef.current = true;
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const setPreference = (key, value) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const saveAccount = async (event) => {
    event?.preventDefault();
    if (!accountDirty || saving || !auth?.idProfessor) return;
    setSaving(true);
    try {
      await updateProfessor(auth.idProfessor, {
        nome: [form.nome, form.sobrenome].filter(Boolean).join(' '),
        email: form.email,
        materia: form.materia,
      });
      writeProfessorPreferences(auth.idProfessor, preferences);
      await refreshProfile();
      accountEditedRef.current = false;
      setSavedAccountSnapshot(accountSnapshot(form, preferences));
      setFeedback('Perfil salvo. O vínculo acadêmico fica salvo neste navegador.');
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveClinicalPreferences = () => {
    if (!writeProfessorPreferences(auth?.idProfessor, preferences)) {
      setFeedback('Não foi possível salvar as preferências neste navegador.');
      return;
    }
    setFeedback('Preferências de geração salvas neste navegador.');
  };

  const handleAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 1_500_000) {
      setFeedback('Escolha uma imagem de até 1,5 MB. A foto é mantida apenas neste navegador.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProfileState({ avatar: String(reader.result || '') });
      setFeedback('Foto alterada somente neste navegador.');
    };
    reader.readAsDataURL(file);
  };

  const selectTab = (nextTab) => {
    setFeedback('');
    setTab(nextTab);
  };

  const handleTabKeyDown = (event) => {
    const currentIndex = TAB_ORDER.indexOf(tab);
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TAB_ORDER.length - 1;
    else return;

    event.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    selectTab(nextTab);
    globalThis.requestAnimationFrame(() => {
      document.querySelector(`[data-settings-tab="${nextTab}"]`)?.focus();
    });
  };

  const headerAction = tab === 'conta' && accountDirty
    ? (
      <Button
        icon="settingsSave"
        loading={saving}
        onClick={() => document.getElementById('settings-account-form')?.requestSubmit()}
        variant="primary"
      >
        Salvar alterações
      </Button>
    )
    : null;

  return (
    <PortalLayout actions={headerAction} subtitle={TAB_SUBTITLES[tab]} title="Configurações">
      <section className="management-page settings-redesign">
        {feedback && <InlineFeedback message={feedback} onDismiss={() => setFeedback('')} />}
        <nav
          aria-label="Seções de configurações"
          className="settings-redesign__tabs"
          onKeyDown={handleTabKeyDown}
          role="tablist"
        >
          <Tab active={tab === 'conta'} name="conta" onClick={() => selectTab('conta')} label="Conta" />
          <Tab
            active={tab === 'casos'}
            disabled={!CASE_GENERATION_PREFERENCES_ENABLED}
            label="Casos clínicos"
            name="casos"
            onClick={() => selectTab('casos')}
          />
          <Tab active={tab === 'seguranca'} name="seguranca" onClick={() => selectTab('seguranca')} label="Segurança" />
        </nav>

        {tab === 'conta' && (
          <form id="settings-account-form" onSubmit={saveAccount}>
            <AccountSettings
              form={form}
              onAvatar={handleAvatar}
              onFieldChange={setField}
              onPreferenceChange={setAccountPreference}
              preferences={preferences}
              profile={profile}
            />
          </form>
        )}
        {tab === 'casos' && (
          <ClinicalSettings
            onSave={saveClinicalPreferences}
            preferences={preferences}
            setPreference={setPreference}
          />
        )}
        {tab === 'seguranca' && <SecuritySettings onFeedback={setFeedback} />}
      </section>
    </PortalLayout>
  );
}

function Tab({ active, disabled = false, label, name, onClick }) {
  return (
    <button
      aria-controls={disabled ? undefined : `settings-panel-${name}`}
      aria-disabled={disabled || undefined}
      aria-selected={active}
      className={active ? 'is-active' : ''}
      data-settings-tab={name}
      disabled={disabled}
      id={`settings-tab-${name}`}
      onClick={onClick}
      role="tab"
      tabIndex={active ? 0 : -1}
      title={disabled ? 'Disponível em breve' : undefined}
      type="button"
    >
      {label}
      {disabled && <span className="settings-redesign__tab-badge">Em breve</span>}
    </button>
  );
}

function AccountSettings({ form, onAvatar, onFieldChange, onPreferenceChange, preferences, profile }) {
  const areaOptions = useMemo(() => (
    form.materia && !healthSpecialties.includes(form.materia)
      ? [form.materia, ...healthSpecialties]
      : healthSpecialties
  ), [form.materia]);

  return (
    <div
      aria-labelledby="settings-tab-conta"
      className="settings-redesign__content settings-redesign__content--account"
      id="settings-panel-conta"
      role="tabpanel"
    >
      <SettingsSection
        className="settings-redesign__section--profile"
        description="Mantenha seus dados pessoais e de acesso atualizados."
        title="Perfil"
      >
        <div className="settings-redesign__profile-grid">
          <div className="settings-redesign__personal-fields">
            <div className="settings-redesign__name-grid">
              <Field label="Nome" required>
                <input required value={form.nome} onChange={(event) => onFieldChange('nome', event.target.value)} />
              </Field>
              <Field label="Sobrenome" required>
                <input required value={form.sobrenome} onChange={(event) => onFieldChange('sobrenome', event.target.value)} />
              </Field>
            </div>
            <Field label="E-mail" required>
              <input required type="email" value={form.email} onChange={(event) => onFieldChange('email', event.target.value)} />
            </Field>
          </div>
          <label className="settings-redesign__avatar">
            <img alt="Foto de perfil" src={profile.avatar || figmaAvatar} />
            <span>Alterar foto</span>
            <input accept="image/*" aria-label="Alterar foto do perfil" onChange={onAvatar} type="file" />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        className="settings-redesign__section--academic"
        description="Informe sua atuação para contextualizar a autoria dos casos."
        title="Vínculo acadêmico"
      >
        <div className="settings-redesign__academic-grid">
          <SelectField
            label="Área de atuação"
            onChange={(value) => onFieldChange('materia', value)}
            options={areaOptions}
            required
            searchable
            value={form.materia}
          />
          <Field label="Cargo acadêmico" required>
            <input
              required
              value={preferences.academicRole}
              onChange={(event) => onPreferenceChange('academicRole', event.target.value)}
            />
          </Field>
          <Field label="Instituição" required>
            <input
              required
              value={preferences.institution}
              onChange={(event) => onPreferenceChange('institution', event.target.value)}
            />
          </Field>
        </div>
      </SettingsSection>
    </div>
  );
}

function ClinicalSettings({ onSave, preferences, setPreference }) {
  const setQuestionType = (key, value) => {
    const nextTypes = { ...preferences.questionTypes, [key]: value };
    const selectedGeneratorTypes = [
      nextTypes.multipleChoice,
      nextTypes.discursive,
      nextTypes.trueFalse,
    ].filter(Boolean).length;
    setPreference('questionTypes', nextTypes);
    if (selectedGeneratorTypes > preferences.questionCount) {
      setPreference('questionCount', selectedGeneratorTypes);
    }
  };

  return (
    <div
      aria-labelledby="settings-tab-casos"
      className="settings-redesign__content settings-redesign__content--clinical"
      id="settings-panel-casos"
      role="tabpanel"
    >
      <header className="settings-redesign__introduction">
        <h2>Preferências de geração de casos clínicos</h2>
        <p>Defina os padrões usados sempre que iniciar a criação de um novo caso clínico.</p>
      </header>

      <div className="settings-redesign__preference-controls">
        <section className="settings-redesign__preference-block">
          <h3>Padrões do caso</h3>
          <div className="settings-redesign__three-grid">
            <SelectField label="Contexto clínico padrão" onChange={(value) => setPreference('caseContext', value)} options={CASE_CONTEXT_OPTIONS} value={preferences.caseContext} />
            <SelectField label="Complexidade padrão" onChange={(value) => setPreference('caseComplexity', value)} options={CASE_COMPLEXITY_OPTIONS} value={preferences.caseComplexity} />
            <SelectField label="Nível de detalhamento" onChange={(value) => setPreference('detailLevel', value)} options={DETAIL_LEVEL_OPTIONS} value={preferences.detailLevel} />
          </div>
        </section>

        <section className="settings-redesign__preference-block settings-redesign__preference-block--questions">
          <h3>Questões padrão</h3>
          <div className="settings-redesign__question-fields">
            <Field label="Quantidade padrão de questões">
              <input max="10" min="1" onChange={(event) => setPreference('questionCount', Number(event.target.value))} type="number" value={preferences.questionCount} />
            </Field>
            <SelectField label="Dificuldade das questões" onChange={(value) => setPreference('questionDifficulty', value)} options={QUESTION_DIFFICULTY_OPTIONS} value={preferences.questionDifficulty} />
          </div>
          <fieldset className="settings-redesign__preferred-types">
            <legend>Tipos de questões preferidos</legend>
            <div>
              <PreferredType checked={preferences.questionTypes.multipleChoice} label="Múltipla escolha" onChange={(value) => setQuestionType('multipleChoice', value)} />
              <PreferredType checked={preferences.questionTypes.discursive} label="Discursiva" onChange={(value) => setQuestionType('discursive', value)} />
              <PreferredType checked={preferences.questionTypes.trueFalse} label="Verdadeiro ou falso" onChange={(value) => setQuestionType('trueFalse', value)} />
              <PreferredType checked={preferences.questionTypes.clinicalReasoning} label="Raciocínio clínico" onChange={(value) => setQuestionType('clinicalReasoning', value)} />
            </div>
          </fieldset>
        </section>

        <section className="settings-redesign__preference-block settings-redesign__preference-block--content">
          <h3>Conteúdo e respostas</h3>
          <div className="settings-redesign__preference-grid">
            {PREFERENCE_CARDS.map((item) => (
              <PreferenceCard checked={preferences[item.key]} description={item.description} key={item.key} label={item.label} onChange={(value) => setPreference(item.key, value)} />
            ))}
          </div>
        </section>

        <div className="settings-redesign__save-row">
          <p>Estas preferências serão aplicadas às novas gerações de casos clínicos.</p>
          <Button onClick={onSave} variant="primary">Salvar alterações</Button>
        </div>
      </div>
    </div>
  );
}

function SecuritySettings({ onFeedback }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const deviceDescription = useMemo(describeCurrentDevice, []);

  const validate = () => {
    if (!currentPassword || !newPassword || !confirmation) {
      onFeedback('Preencha todos os campos para validar a solicitação.');
      return;
    }
    if (
      newPassword.length < 8
      || !/[A-Za-zÀ-ÿ]/.test(newPassword)
      || !/\d/.test(newPassword)
      || !/[^A-Za-zÀ-ÿ0-9\s]/.test(newPassword)
    ) {
      onFeedback('Use no mínimo 8 caracteres, incluindo letras, números e um caractere especial.');
      return;
    }
    if (newPassword === currentPassword) {
      onFeedback('A nova senha deve ser diferente da senha atual.');
      return;
    }
    if (newPassword !== confirmation) {
      onFeedback('A confirmação da nova senha não corresponde.');
      return;
    }

    onFeedback('A troca de senha ainda não está disponível. Nenhuma senha foi alterada.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
  };

  return (
    <div
      aria-labelledby="settings-tab-seguranca"
      className="settings-redesign__content settings-redesign__content--security"
      id="settings-panel-seguranca"
      role="tabpanel"
    >
      <SettingsSection className="settings-redesign__section--password" description="Atualize sua senha periodicamente para manter a conta protegida." title="Senha e acesso">
        <div className="settings-redesign__password-controls">
          <div className="settings-redesign__password-grid">
            <Field label="Senha atual" required>
              <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Digite sua senha atual" type="password" value={currentPassword} />
            </Field>
            <Field label="Nova senha" required>
              <input aria-describedby="settings-password-requirements" autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} placeholder="Crie uma nova senha" type="password" value={newPassword} />
            </Field>
            <Field label="Confirmar nova senha" required>
              <input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} placeholder="Digite novamente" type="password" value={confirmation} />
            </Field>
          </div>
          <div className="settings-redesign__password-action">
            <p id="settings-password-requirements">Use no mínimo 8 caracteres, incluindo letras, números e um caractere especial.</p>
            <button className="settings-redesign__primary-action" onClick={validate} title="A troca de senha ainda não está disponível." type="button">Redefinir senha</button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection className="settings-redesign__section--sessions" description="Revise os dispositivos conectados à sua conta." title="Sessões ativas">
        <div className="settings-redesign__sessions-controls">
          <div className="settings-redesign__session-card">
            <div className="settings-redesign__device">
              <img alt="" aria-hidden="true" src={deviceIcon} />
              <div>
                <strong>Dispositivo atual</strong>
                <span>{deviceDescription}</span>
              </div>
            </div>
            <span className="settings-redesign__session-badge">Sessão Atual</span>
          </div>
          <div className="settings-redesign__sessions-summary">
            <p>A consulta de outras sessões ainda não está disponível.</p>
            <button className="settings-redesign__danger-action" disabled title="Ainda não é possível encerrar outras sessões." type="button">Encerrar outras sessões</button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ children, className = '', description, title }) {
  return (
    <section className={`settings-redesign__section ${className}`.trim()}>
      <header className="settings-redesign__introduction">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Field({ children, className = '', label, required = false }) {
  return (
    <label className={`settings-redesign__field ${className}`.trim()}>
      <span>{label}{required && <em> *</em>}</span>
      {children}
    </label>
  );
}

function SelectField({ label, onChange, options, required = false, searchable = false, value }) {
  return (
    <StandardSelectField
      className="settings-redesign__select"
      label={label}
      onChange={(event) => onChange(event.target.value)}
      options={options}
      required={required}
      searchable={searchable}
      value={value}
    />
  );
}

function PreferredType({ checked, label, onChange }) {
  return (
    <label className="settings-redesign__preferred-type">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function PreferenceCard({ checked, description, label, onChange }) {
  return (
    <label className="settings-redesign__preference-card">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="settings-redesign__toggle-wrap">
        <input aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      </span>
    </label>
  );
}

function describeCurrentDevice() {
  const userAgent = globalThis.navigator?.userAgent || '';
  const operatingSystem = /Windows/i.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS X/i.test(userAgent)
      ? 'macOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/i.test(userAgent)
          ? 'iOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Sistema atual';
  const browser = /Edg\//i.test(userAgent)
    ? 'Microsoft Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Google Chrome'
      : /Firefox\//i.test(userAgent)
        ? 'Mozilla Firefox'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'Navegador atual';
  return `${operatingSystem} · ${browser} · Ativo agora`;
}
