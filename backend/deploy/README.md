# Implantação: Supabase + Oracle Cloud Always Free

Arquitetura: a API (Spring) e o gateway de IA (FreeLLMAPI) rodam em Docker numa VM Oracle, atrás do Caddy, que emite o certificado HTTPS sozinho. O PostgreSQL é o do Supabase; as migrações Flyway criam as tabelas na primeira subida.

## 1. Supabase (banco)

1. Crie um projeto em <https://supabase.com/dashboard> (plano Free). Anote a senha do banco.
2. Em **Connect**, copie a string do **Session pooler** (porta `5432`). Ela funciona em IPv4; a conexão direta do Supabase é só IPv6 e não chega da VM.
3. Converta para o formato do `.env`:
   - `DB_URL=jdbc:postgresql://aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require`
   - `DB_USER=postgres.<ref-do-projeto>`
   - `DB_PASSWORD=<senha do banco>`

Não use o *Transaction pooler* (porta `6543`): ele quebra as migrações e as transações longas da IA.

Projetos Free pausam após 7 dias sem acesso; abra o painel antes do evento.

## 2. Oracle Cloud (VM)

1. Crie a conta em <https://www.oracle.com/cloud/free/> e escolha uma região com capacidade Ampere (ex.: São Paulo ou Vinhedo).
2. **Compute > Instances > Create instance**:
   - Imagem: **Canonical Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex**, 2 OCPU e 12 GB (dentro do Always Free).
   - SSH: **Paste public keys** com a sua chave pública SSH (ex.: gerada com `ssh-keygen -t ed25519 -f ~/.ssh/oracle_pibic`).
3. Na **VCN > Security List** da sub-rede, adicione regras de entrada TCP para as portas **80** e **443** com origem `0.0.0.0/0`.
4. Anote o **IP público**.

## 3. Primeira publicação

Na pasta `SistemaAPI_PIBIC`, pelo Git Bash:

```bash
ssh -i ~/.ssh/oracle_pibic ubuntu@<IP> 'bash -s' < deploy/preparar-vm.sh
```

Crie `~/pibic/deploy/.env` na VM a partir de `deploy/.env.example`. `API_DOMINIO` pode ser `<IP-com-hifens>.sslip.io`.

```bash
VM=ubuntu@<IP> ./deploy/publicar.sh
```

O primeiro build leva alguns minutos. Depois:

- API: `https://<API_DOMINIO>/auth/demonstracao` deve responder JSON.
- Painel do gateway (só pela sua máquina): `ssh -i ~/.ssh/oracle_pibic -L 3001:127.0.0.1:3001 ubuntu@<IP>` e abra `http://localhost:3001`. Cadastre as chaves dos provedores e copie a chave unificada para `IA_CHAVE_API` no `.env`, depois rode `publicar.sh` de novo.
- Após o primeiro login do admin, troque `BOOTSTRAP_ADMIN_ENABLED` para `false`.

## 4. Front (Vercel)

No projeto da Vercel, defina `VITE_API_BASE_URL=https://<API_DOMINIO>` e coloque a URL da Vercel em `CORS_ALLOWED_ORIGINS` no `.env` da VM.

## Atualizações

Repita `VM=ubuntu@<IP> ./deploy/publicar.sh`. Logs: `ssh ... 'cd ~/pibic/deploy && docker compose logs -f api'`.
