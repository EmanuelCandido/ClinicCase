# ClinicCase

Plataforma educacional para criação e resolução de **casos clínicos** com apoio de IA, desenvolvida no contexto de um projeto PIBIC. Professores montam casos (perfil do paciente, conteúdo clínico, perguntas e alternativas), podem gerar e ajustar conteúdo com IA e acompanhar o desempenho dos alunos.

## Estrutura

| Pasta | Descrição | Stack |
|---|---|---|
| [`frontend/`](frontend) | Portal do professor (criação de casos em etapas, painel, exportação em PDF) | React, Vite, JavaScript |
| [`backend/`](backend) | API REST com autenticação JWT, geração de casos/perguntas por IA, auditoria e limites de uso | Java 25, Spring Boot, Spring AI, PostgreSQL, Flyway |

## Destaques técnicos

- **IA com segurança clínica:** pré-validação de coerência (especialidade, diagnóstico, objetivo), geração e pós-validação; idempotência por `Idempotency-Key` para evitar gerações duplicadas.
- **Gateway de modelos:** o Spring AI fala com um gateway compatível com a API da OpenAI (FreeLLMAPI), com ordem de fallback entre modelos.
- **Segurança:** JWT, BCrypt, bloqueio por tentativas de login, CORS restrito, limites de corpo de requisição e cotas de IA por usuário.
- **Qualidade:** testes de unidade e integração (JUnit, Vitest), Checkstyle, SpotBugs e CI com GitHub Actions.
- **Deploy:** Docker Compose com Caddy (HTTPS automático), banco gerenciado no Supabase e front estático.

## Como rodar localmente

Backend (detalhes em [`backend/README.md`](backend/README.md)):

```bash
cd backend
# crie um .env com DB_USER e DB_PASSWORD (veja docs/ia-piloto.md)
docker compose up -d postgres
cd Sistema_Crud_API_PIBIC
DB_USER=... DB_PASSWORD=... SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

Frontend (detalhes em [`frontend/README.md`](frontend/README.md)):

```bash
cd frontend
npm install
npm run dev
```

> Nenhuma credencial real está versionada. Todos os valores sensíveis são lidos de variáveis de ambiente (veja `backend/deploy/.env.example`).
