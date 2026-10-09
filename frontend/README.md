# Front-End-Casos-Clinicos

Front React/Vite conectado à API do PIBIC.

## Rodar localmente

Use Node.js `^20.19.0` ou `>=22.12.0`.

```powershell
npm install
npm run dev
```

## Verificações

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Para executar todas as verificações em sequência:

```powershell
npm run check
```

Em desenvolvimento, o Vite encaminha `/api` para `http://127.0.0.1:8080`, evitando divergências de origem entre `localhost` e `127.0.0.1`. Em produção, o padrão é usar a mesma origem do front. Se a API publicada estiver em outro domínio, configure explicitamente uma URL HTTPS em um `.env` de build:

```env
VITE_API_BASE_URL=https://api.exemplo.com
```

## Teste com a API

1. Suba a API PIBIC em `localhost:8080`.
2. Inicie o front uma única vez com `npm run dev` e abra a URL informada pelo Vite.
3. Entre com um professor já criado por um administrador.
4. Preencha as etapas de criação e gere o caso.

O front persiste caso e paciente antes de chamar a IA. A resposta de geração já inclui o caso completo; um `GET /casos/{id}/completo` é usado apenas como fallback para versões antigas da API. A geração de perguntas também usa diretamente a lista retornada pelo `POST`.

Ao publicar, o tempo limite e o status são alterados juntos pelo `PATCH /casos/{id}/publicar`, evitando um `PUT` completo com dados potencialmente desatualizados.

## Geração por IA

- Requisições comuns têm timeout de 15 segundos; geração de perguntas aguarda 75 segundos e geração/ajuste clínico aguardam 390 segundos. O timeout e o cancelamento abrangem também a leitura do corpo da resposta.
- O backend possui limite por chamada configurável por `IA_TEMPO_LIMITE` (60 segundos), com pré-validação, geração e pós-validação sequenciais e recuperação limitada. O orçamento da operação clínica admite chamadas dentro de seis minutos; proxy/gateway também precisam permitir essa espera.
- Cada clique de geração envia um `Idempotency-Key`. Falhas incertas reutilizam a chave, impedindo duas gerações/cobranças para a mesma tentativa.
- Respostas temporárias da IA (`409`, `429` e `503`) respeitam o `Retry-After`: a tela informa a contagem regressiva e bloqueia novos envios até o momento seguro.
- O andamento mostra a fase atual e o tempo decorrido; cancelar preserva o rascunho local e o que já foi salvo na API.
- Todos os casos são tratados pelo produto como fictícios; essa informação é enviada automaticamente à API, sem uma confirmação manual na interface.

Arquivos selecionados em “Referências e Mídias” permanecem somente na sessão atual. Eles ainda não são enviados nem usados pela IA porque a API de mídias não existe.

Edições manuais de perguntas são preservadas ao mesclar resultados da IA. O botão de salvar usa `PUT /casos/{id}/perguntas/lote`, em transação única; se uma pergunta mudar enquanto o lote é salvo, a nova edição continua pendente. Caso, paciente e conteúdo sem alterações não são reenviados. Uma tentativa de ajuste pendente é recuperada antes de gravar novamente o conteúdo.

O rascunho é gravado com debounce de 350 ms e descarregado ao sair da página. Rascunho e caso salvo expiram após 30 dias quando lidos; falhas de gravação são informadas na etapa de geração. O módulo de PDF é carregado apenas quando solicitado.

## Dados locais

Rascunhos são separados por professor, versionados e expiram após 30 dias. Logout ou expiração do JWT não apagam o rascunho. Dados de versões antigas são migrados para a chave do professor no primeiro acesso autenticado.

## Solução de problemas

Se `npm run dev` informar `Port 5173 is already in use`, já existe um Vite rodando. Use a instância aberta em `http://127.0.0.1:5173` ou encerre o processo antigo antes de iniciar outro.

Se o front responder, mas a geração falhar, confirme separadamente:

1. API em `http://localhost:8080`;
2. gateway FreeLLMAPI em `http://127.0.0.1:3001`;
3. `IA_CHAVE_API`, `IA_URL_BASE` e demais variáveis no processo iniciado pela IDE.
