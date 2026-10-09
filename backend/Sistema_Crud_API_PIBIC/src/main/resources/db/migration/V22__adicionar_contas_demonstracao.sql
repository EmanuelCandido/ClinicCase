-- Contas de professor criadas pelo cadastro de demonstracao expiram automaticamente.
ALTER TABLE usuario ADD COLUMN conta_demonstracao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuario ADD COLUMN demonstracao_expira_em TIMESTAMP WITH TIME ZONE;

-- Tentativas de codigo de convite invalidas usam o mesmo controle persistente do login.
ALTER TABLE tentativa_login DROP CONSTRAINT ck_tentativa_login_tipo;
ALTER TABLE tentativa_login ADD CONSTRAINT ck_tentativa_login_tipo CHECK (tipo IN ('CONTA', 'IP', 'DEMO_IP'));
