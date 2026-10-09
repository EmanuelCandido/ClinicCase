import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemoSignup } from '../src/services/demoSignupValidation.js';

const valid = {
  nome: 'Ana',
  sobrenome: 'Martins',
  email: 'ana@instituicao.edu.br',
  senha: 'senha123',
  confirmacaoSenha: 'senha123',
  areaAtuacao: 'Fisioterapia',
  cargo: 'Preceptor',
  aceiteTermos: true,
};

test('aceita cadastro completo válido', () => {
  assert.equal(validateDemoSignup(valid), '');
});

test('exige nome, sobrenome e e-mail válido', () => {
  assert.match(validateDemoSignup({ ...valid, sobrenome: '  ' }), /sobrenome/);
  assert.match(validateDemoSignup({ ...valid, email: 'ana@instituicao' }), /e-mail/);
  assert.match(validateDemoSignup({ ...valid, email: `${'a'.repeat(95)}@x.com` }), /e-mail/);
});

test('exige senha com 8 caracteres, letras e números, e confirmação idêntica', () => {
  assert.match(validateDemoSignup({ ...valid, senha: 'abc12', confirmacaoSenha: 'abc12' }), /8 caracteres/);
  assert.match(validateDemoSignup({ ...valid, senha: 'somenteletras', confirmacaoSenha: 'somenteletras' }), /letras e números/);
  assert.match(validateDemoSignup({ ...valid, senha: '12345678', confirmacaoSenha: '12345678' }), /letras e números/);
  assert.match(validateDemoSignup({ ...valid, confirmacaoSenha: 'outra123' }), /não conferem/);
});

test('exige área, cargo e aceite dos termos', () => {
  assert.match(validateDemoSignup({ ...valid, cargo: '' }), /cargo/);
  assert.match(validateDemoSignup({ ...valid, aceiteTermos: false }), /Termos de Uso/);
});
