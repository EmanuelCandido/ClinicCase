-- Cargo informado no cadastro completo do professor (professor, preceptor, coordenador...).
ALTER TABLE professor ADD COLUMN cargo VARCHAR(60);
