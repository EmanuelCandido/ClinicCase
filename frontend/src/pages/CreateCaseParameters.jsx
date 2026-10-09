import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout.jsx';
import Button from '../components/Button.jsx';
import FormField from '../components/FormField.jsx';
import SelectField from '../components/SelectField.jsx';
import Stepper from '../components/Stepper.jsx';
import TipCard from '../components/TipCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import { selectOptions, stepItems } from '../services/caseConfig.js';
import { persistCaseDraft } from '../services/caseDraftPersistence.js';
import useRequestedFieldFocus from '../hooks/useRequestedFieldFocus.js';

export default function CreateCaseParameters() {
  const { auth } = useAuth();
  const { draft, savedCase, setSavedCase, updateDraftSection } = useCaseDraft();
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const navigate = useNavigate();
  const caseInfo = draft.caseInfo;
  useRequestedFieldFocus(formRef);

  const handleChange = (event) => {
    const { name, value } = event.target;
    updateDraftSection('caseInfo', { [name]: value });
  };

  const saveDraft = async () => {
    if (!formRef.current?.reportValidity()) return;
    try {
      setSaving(true);
      const persisted = await persistCaseDraft(draft, auth, savedCase, setSavedCase);
      setSavedCase(persisted);
      setFeedbackError(false);
      setFeedback(`Rascunho #${persisted.case.idCaso} salvo.`);
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    navigate('/criar-caso/perfil-paciente');
  };

  const handleNext = () => formRef.current?.requestSubmit();

  return (
    <AppLayout>
      <section className="create-case-page" aria-labelledby="create-case-title">
        <h2 className="sr-only" id="create-case-title">
          Criar Caso Clínico - Parâmetros
        </h2>

        <div className="create-case-page__content">
          <Stepper currentStep={1} steps={stepItems} />

          <form className="case-form" onSubmit={handleFormSubmit} ref={formRef}>
            <div className="case-form__grid">
              <FormField
                label="Título"
                name="title"
                onChange={handleChange}
                placeholder="Ex: Choque Cardiogênico pós IAM"
                required
                value={caseInfo.title}
              />
              <SelectField
                label="Especialidade"
                name="specialty"
                onChange={handleChange}
                options={selectOptions.specialties}
                searchable
                searchPlaceholder="Pesquisar especialidade..."
                required
                value={caseInfo.specialty}
              />
              <FormField
                label="Disciplina"
                name="discipline"
                onChange={handleChange}
                placeholder="Ex: Semiologia Médica"
                value={caseInfo.discipline}
              />
              <SelectField
                label="Dificuldade"
                name="difficulty"
                onChange={handleChange}
                options={selectOptions.difficulties}
                value={caseInfo.difficulty}
              />
            </div>
          </form>

          <TipCard />
          {feedback && <p className={`form-feedback ${feedbackError ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</p>}

          <div className="page-actions">
            <Button icon="save" loading={saving} loadingText="Salvando..." onClick={saveDraft} variant="secondary">
              Salvar Rascunho
            </Button>

            <div className="page-actions__next">
              <Button disabled icon="arrowLeft" iconPosition="right" variant="ghost">
                Anterior
              </Button>
              <Button icon="chevronRight" iconPosition="right" onClick={handleNext} variant="primary">
                Próximo
              </Button>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
