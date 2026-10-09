import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout.jsx';
import Button from '../components/Button.jsx';
import CheckboxField from '../components/CheckboxField.jsx';
import FormField from '../components/FormField.jsx';
import GenderOption from '../components/GenderOption.jsx';
import Stepper from '../components/Stepper.jsx';
import TextAreaField from '../components/TextAreaField.jsx';
import TipCard from '../components/TipCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import { patientProfileForm, stepItems } from '../services/caseConfig.js';
import { persistPatientDraft } from '../services/caseDraftPersistence.js';
import useRequestedFieldFocus from '../hooks/useRequestedFieldFocus.js';

export default function CreateCasePatientProfile() {
  const { auth } = useAuth();
  const { draft, savedCase, setSavedCase, updateDraftSection } = useCaseDraft();
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const navigate = useNavigate();
  const patient = draft.patient;
  useRequestedFieldFocus(formRef);

  const handleChange = (event) => {
    const { checked, name, type, value } = event.target;
    updateDraftSection('patient', { [name]: type === 'checkbox' ? checked : value });
  };

  const handleSexSelect = (biologicalSex) => {
    updateDraftSection('patient', { biologicalSex });
  };

  const saveDraft = async () => {
    if (!formRef.current?.reportValidity()) return;
    try {
      setSaving(true);
      const persisted = await persistPatientDraft(draft, auth, savedCase, setSavedCase);
      setSavedCase(persisted);
      setFeedbackError(false);
      setFeedback(`Caso e paciente do rascunho #${persisted.case.idCaso} salvos.`);
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    navigate('/criar-caso/conteudo-clinico');
  };

  const handleNext = () => formRef.current?.requestSubmit();

  return (
    <AppLayout breadcrumbCurrent="Perfil do Paciente">
      <section className="create-case-page" aria-labelledby="patient-profile-title">
        <h2 className="sr-only" id="patient-profile-title">
          Criar Caso Clínico - Perfil do Paciente
        </h2>

        <div className="create-case-page__content create-case-page__content--large-gap">
          <Stepper currentStep={2} steps={stepItems} />

          <form className="case-form patient-form" onSubmit={handleFormSubmit} ref={formRef}>
            <CheckboxField
              checked={patient.allowAiCompletion}
              label="Permitir que a IA complemente as informações"
              name="allowAiCompletion"
              onChange={handleChange}
            />
            <p className="form-help">
              Quando ativado, os campos manuais ficam bloqueados e a IA preenche as informações ausentes durante a geração do caso.
            </p>

            <div className="patient-form__grid">
              <FormField
                disabled={patient.allowAiCompletion}
                label="Idade"
                max="130"
                min="0"
                name="age"
                onChange={handleChange}
                placeholder={patientProfileForm.agePlaceholder}
                type="number"
                value={patient.age}
              />
              <FormField
                disabled={patient.allowAiCompletion}
                label="Profissão"
                name="profession"
                onChange={handleChange}
                placeholder={patientProfileForm.professionPlaceholder}
                value={patient.profession}
              />
              <FormField
                disabled={patient.allowAiCompletion}
                label="Peso"
                name="weight"
                onChange={handleChange}
                placeholder={patientProfileForm.weightPlaceholder}
                value={patient.weight}
              />
              <FormField
                disabled={patient.allowAiCompletion}
                label="Altura(Em cm)"
                name="height"
                onChange={handleChange}
                placeholder={patientProfileForm.heightPlaceholder}
                value={patient.height}
              />

              <div className="field">
                <span className="field__label">Sexo Biológico</span>
                <GenderOption
                  disabled={patient.allowAiCompletion}
                  icon="man"
                  label="Masculino"
                  onSelect={() => handleSexSelect('MASCULINO')}
                  selected={patient.biologicalSex === 'MASCULINO'}
                />
              </div>

              <div className="field field--gender-offset">
                <GenderOption
                  disabled={patient.allowAiCompletion}
                  icon="woman"
                  label="Feminino"
                  onSelect={() => handleSexSelect('FEMININO')}
                  selected={patient.biologicalSex === 'FEMININO'}
                  tone="female"
                />
              </div>

              <TextAreaField
                disabled={patient.allowAiCompletion}
                label="Outra informação"
                name="otherInfo"
                onChange={handleChange}
                placeholder={patientProfileForm.otherPlaceholder}
                value={patient.otherInfo}
              />
            </div>
          </form>

          <TipCard>Um paciente bem contextualizado torna a atividade mais próxima da prática profissional.</TipCard>
          {feedback && <p className={`form-feedback ${feedbackError ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</p>}

          <div className="page-actions page-actions--patient">
            <Button icon="save" loading={saving} loadingText="Salvando..." onClick={saveDraft} variant="secondary">
              Salvar Rascunho
            </Button>

            <div className="page-actions__next">
              <Button icon="arrowLeft" iconPosition="right" to="/criar-caso/parametros" variant="outline">
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
