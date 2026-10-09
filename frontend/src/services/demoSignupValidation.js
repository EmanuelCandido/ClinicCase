// O e-mail vira o usuário de acesso, por isso respeita o limite de 100 caracteres do backend.
export const MAX_EMAIL_LENGTH = 100;
export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTER_PATTERN = /\p{L}/u;
const DIGIT_PATTERN = /\d/;

export const AREA_OPTIONS = [
  'Biomedicina',
  'Educação Física',
  'Enfermagem',
  'Farmácia',
  'Fisioterapia',
  'Fonoaudiologia',
  'Medicina',
  'Nutrição',
  'Odontologia',
  'Psicologia',
  'Terapia Ocupacional',
  'Outra',
];

export const ROLE_OPTIONS = [
  'Professor',
  'Preceptor',
  'Coordenador de curso',
  'Tutor',
  'Outro',
];

export function validateDemoSignup(form) {
  if (!form.nome.trim() || !form.sobrenome.trim()) {
    return 'Informe nome e sobrenome.';
  }
  const email = form.email.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return 'Informe um e-mail válido.';
  }
  if (form.senha.length < MIN_PASSWORD_LENGTH
    || !LETTER_PATTERN.test(form.senha)
    || !DIGIT_PATTERN.test(form.senha)) {
    return `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres, incluindo letras e números.`;
  }
  if (form.senha !== form.confirmacaoSenha) {
    return 'As senhas não conferem.';
  }
  if (!form.areaAtuacao || !form.cargo) {
    return 'Selecione sua área de atuação e seu cargo.';
  }
  if (!form.aceiteTermos) {
    return 'Aceite os Termos de Uso e a Política de Privacidade para continuar.';
  }
  return '';
}
