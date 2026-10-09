import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout.jsx';
import Button from '../components/Button.jsx';
import CheckboxField from '../components/CheckboxField.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import Stepper from '../components/Stepper.jsx';
import TextAreaField from '../components/TextAreaField.jsx';
import TipCard from '../components/TipCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import { clinicalContentForm, stepItems } from '../services/caseConfig.js';
import { persistClinicalDraft, persistPatientDraft } from '../services/caseDraftPersistence.js';
import { hasCompleteClinicalContent } from '../services/caseValidation.js';
import useRequestedFieldFocus from '../hooks/useRequestedFieldFocus.js';

export default function CreateCaseClinicalContent() {
  const { auth } = useAuth();
  const { draft, savedCase, setSavedCase, updateDraftSection } = useCaseDraft();
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const navigate = useNavigate();
  const clinical = draft.clinical;
  useRequestedFieldFocus(formRef);

  const handleChange = (event) => {
    const { checked, name, type, value } = event.target;
    updateDraftSection('clinical', { [name]: type === 'checkbox' ? checked : value });
  };

  const saveDraft = async () => {
    if (!formRef.current?.reportValidity()) return;
    try {
      setSaving(true);
      const clinicalContentComplete = hasCompleteClinicalContent(draft);
      const persisted = clinicalContentComplete
        ? await persistClinicalDraft(draft, auth, savedCase, setSavedCase)
        : await persistPatientDraft(draft, auth, savedCase, setSavedCase);
      setSavedCase(persisted);
      setFeedbackError(false);
      setFeedback(clinicalContentComplete
        ? `Caso, paciente e conteúdo do rascunho #${persisted.case.idCaso} salvos.`
        : `Caso e paciente do rascunho #${persisted.case.idCaso} salvos. O conteúdo parcial fica neste navegador até ser completado pela IA.`);
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    navigate('/criar-caso/referencias-midias');
  };

  const handleNext = () => formRef.current?.requestSubmit();

  return (
    <AppLayout breadcrumbCurrent="Conteúdo Clínico">
      <section className="create-case-page" aria-labelledby="clinical-content-title">
        <h2 className="sr-only" id="clinical-content-title">
          Criar Caso Clínico - Conteúdo Clínico
        </h2>

        <div className="create-case-page__content create-case-page__content--large-gap">
          <Stepper currentStep={3} steps={stepItems} />

          <form className="case-form clinical-form" onSubmit={handleFormSubmit} ref={formRef}>
            <div className="clinical-form__grid">
              <FormField
                label="Objetivo Pedagógico"
                name="pedagogicalGoal"
                onChange={handleChange}
                placeholder={clinicalContentForm.pedagogicalGoalPlaceholder}
                required
                value={clinical.pedagogicalGoal}
              />
              <FormField
                label="Hipótese Clínica Central"
                name="centralHypothesis"
                onChange={handleChange}
                placeholder={clinicalContentForm.centralHypothesisPlaceholder}
                required
                value={clinical.centralHypothesis}
              />
              <FormField
                full
                label="Sintomas Principais"
                name="symptoms"
                onChange={handleChange}
                placeholder={clinicalContentForm.symptomsPlaceholder}
                value={clinical.symptoms}
              />
              <FormField
                full
                label="Comorbidades"
                name="comorbidities"
                onChange={handleChange}
                placeholder={clinicalContentForm.comorbiditiesPlaceholder}
                value={clinical.comorbidities}
              />
              <div className="clinical-form__textarea-wrap">
                <TextAreaField
                  label="Contexto Clínico"
                  large
                  name="clinicalContext"
                  onChange={handleChange}
                  placeholder={clinicalContentForm.clinicalContextPlaceholder}
                  value={clinical.clinicalContext}
                />
                <span className="clinical-form__resize-icon">
                  <Icon name="maximize" size={20} />
                </span>
              </div>
              <FormField
                full
                label="Exame Clínico"
                name="clinicalExam"
                onChange={handleChange}
                placeholder="Descreva os achados do exame físico ou deixe para a IA completar"
                value={clinical.clinicalExam}
              />
              <CheckboxField
                checked={clinical.includeClinicalExams}
                label="Incluir resultados de exames clínicos"
                name="includeClinicalExams"
                onChange={handleChange}
              />
            </div>
          </form>

          <TipCard>Sintomas, hipótese e objetivo pedagógico orientam a IA na criação do raciocínio clínico.</TipCard>
          {feedback && <p className={`form-feedback ${feedbackError ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</p>}

          <div className="page-actions page-actions--patient">
            <Button icon="save" loading={saving} loadingText="Salvando..." onClick={saveDraft} variant="secondary">
              Salvar Rascunho
            </Button>

            <div className="page-actions__next">
              <Button icon="arrowLeft" iconPosition="right" to="/criar-caso/perfil-paciente" variant="outline">
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
