import { apiRequest } from './api.js';

// Operações clínicas podem executar pré/pós-validação, confirmação e recuperação.
// O orçamento cobre até seis chamadas sequenciais de até 60 s e margem de rede.
const CLINICAL_AI_TIMEOUT = 390000;
const validClinicalResponse = (data) => Number.isInteger(data?.idCaso) && Number.isInteger(data?.idConteudo);
const validQuestionsResponse = (data) => Array.isArray(data) && data.length > 0 && data.every((item) => Number.isInteger(item?.id));
// A margem evita o navegador cancelar enquanto o backend ainda finaliza de modo
// atômico; o usuário continua podendo cancelar explicitamente pela interface.

export function login(username, password, remember = false) {
  return apiRequest('/auth/login', {
    auth: false,
    method: 'POST',
    // "Lembrar de mim" pede ao backend um token de pelo menos um dia.
    body: { username, password, lembrar: Boolean(remember) },
  });
}

export function getDemoSignupStatus(options = {}) {
  return apiRequest('/auth/demonstracao', { ...options, auth: false });
}

export function registerDemoProfessor(payload, options = {}) {
  return apiRequest('/auth/demonstracao/cadastro', {
    ...options,
    auth: false,
    method: 'POST',
    body: payload,
  });
}

export function getProfessor(idProfessor, options) {
  return apiRequest(`/professores/${idProfessor}`, options);
}

export function getProfessorCases(idProfessor, options) {
  return apiRequest(`/professores/${idProfessor}/casos`, options);
}

export function getProfessorReport(idProfessor, options) {
  return apiRequest(`/professores/${idProfessor}/relatorio-desempenho`, options);
}

export function listCases(params = {}, options) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return apiRequest(`/casos${query ? `?${query}` : ''}`, options);
}

export function createCase(payload, options = {}) {
  return apiRequest('/casos', {
    ...options,
    method: 'POST',
    body: payload,
  });
}

export function createPatient(payload, options = {}) {
  return apiRequest('/pacientes', {
    ...options,
    method: 'POST',
    body: payload,
  });
}

export function updatePatient(idPaciente, payload, options = {}) {
  return apiRequest(`/pacientes/${idPaciente}`, { ...options, method: 'PUT', body: payload });
}

export function createClinicalContent(payload, options = {}) {
  return apiRequest('/conteudos', { ...options, method: 'POST', body: payload });
}

export function generateClinicalContentWithAi(idCaso, payload, options = {}) {
  return apiRequest(`/casos/${idCaso}/ia/gerar`, {
    ...options,
    method: 'POST',
    body: payload,
    timeout: options.timeout ?? CLINICAL_AI_TIMEOUT,
    validateResponse: validClinicalResponse,
  });
}

export function getCompleteCase(idCaso, options) {
  return apiRequest(`/casos/${idCaso}/completo`, options);
}

export function getCase(idCaso, options) {
  return apiRequest(`/casos/${idCaso}`, options);
}

export function updateCase(idCaso, payload, options = {}) { return apiRequest(`/casos/${idCaso}`, { ...options, method: 'PUT', body: payload }); }
export function deleteCase(idCaso, options = {}) { return apiRequest(`/casos/${idCaso}`, { ...options, method: 'DELETE' }); }
export function archiveCase(idCaso, options = {}) { return apiRequest(`/casos/${idCaso}/arquivar`, { ...options, method: 'PATCH' }); }
export function publishCase(idCaso, payload, options = {}) { return apiRequest(`/casos/${idCaso}/publicar`, { ...options, method: 'PATCH', body: payload }); }
export function getCaseQuestions(idCaso, options) { return apiRequest(`/casos/${idCaso}/perguntas`, options); }
export function createQuestion(idCaso, payload, options = {}) { return apiRequest(`/casos/${idCaso}/perguntas`, { ...options, method: 'POST', body: payload }); }
export function saveQuestionsBatch(idCaso, perguntas, options = {}) { return apiRequest(`/casos/${idCaso}/perguntas/lote`, { ...options, method: 'PUT', body: { perguntas } }); }
export function updateQuestion(idPergunta, payload, options = {}) { return apiRequest(`/perguntas/${idPergunta}`, { ...options, method: 'PUT', body: payload }); }
export function deleteQuestion(idPergunta, options = {}) { return apiRequest(`/perguntas/${idPergunta}`, { ...options, method: 'DELETE' }); }
// Logo abaixo dos 100 s que o túnel do Cloudflare espera antes de cortar a resposta.
const QUESTIONS_AI_TIMEOUT = 95000;
export function generateQuestionsWithAi(idCaso, payload, options = {}) { return apiRequest(`/casos/${idCaso}/ia/perguntas/gerar`, { ...options, method: 'POST', body: payload, timeout: options.timeout ?? QUESTIONS_AI_TIMEOUT, validateResponse: validQuestionsResponse }); }
export function adjustClinicalContentWithAi(idCaso, payload, options = {}) { return apiRequest(`/casos/${idCaso}/ia/ajustar`, { ...options, method: 'POST', body: payload, timeout: options.timeout ?? CLINICAL_AI_TIMEOUT, validateResponse: validClinicalResponse }); }
export function updateClinicalContent(idConteudo, payload, options = {}) { return apiRequest(`/conteudos/${idConteudo}`, { ...options, method: 'PUT', body: payload }); }
export function updateProfessor(idProfessor, payload, options = {}) { return apiRequest(`/professores/${idProfessor}`, { ...options, method: 'PUT', body: payload }); }
