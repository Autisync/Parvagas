# Parvagas

Plataforma de recrutamento Angola-first com foco em:
- Onboarding de candidatos por CV (PDF/DOCX)
- Extração e sugestão de perfil com IA (sempre revisável pelo candidato)
- Vagas públicas e privadas para empresas
- Moderação/admin, scraping com aprovação manual e módulo de anúncios sem pagamentos online

## Stack atual do projeto

- Next.js 14 + TypeScript + Tailwind CSS
- Backend Python (FastAPI) + PostgreSQL
- Adapters para IA, Storage, Notificações
- MeiliSearch (opcional) para indexação de vagas públicas

## CV Builder (Reactive Resume) Setup

```bash
# 1) Validate configuration
./scripts/check-cv-builder-integration.sh

# 2) Validate compose files
docker compose config
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.prod.yml config

# 3) Build CV Builder image
docker build -t parvagas-cv-builder-test ./reactive-resume

# 4) Start CV Builder profile (local)
docker compose --profile cv-builder up -d --build
```

Windows PowerShell preflight:

```powershell
.\scripts\check-cv-builder-integration.ps1
```

## Novos módulos implementados

### Site público
- Navegação: Início, Vagas Disponíveis, Empresas, Candidatos, Dicas de Carreira, Portal
- Home com secções: onboarding candidato, contratação empresa, vagas em destaque, dicas, espaços de anúncios
- Páginas públicas adicionais:
  - `/Vagas-Disponiveis`
  - `/Vagas-Disponiveis/[id]`
  - `/Dicas-de-Carreira`

### Fluxo CV -> Perfil candidato
- Upload de CV por rota dedicada (PDF/DOCX)
- Extração de texto por adapter de ficheiro
- Parsing por adapter de IA (fallback local quando provider não configurado)
- Perfil sugerido devolvido como draft para revisão
- Persistência só após aprovação explícita do candidato
- Score de completude do perfil

### Portal candidato
- Páginas de portal:
  - Meu Perfil
  - Vagas Recomendadas
  - Vagas Disponíveis
  - Candidaturas
  - CV e Documentos
  - Alertas
  - Definições
- Guardar vagas
- Candidatura com perfil
- CV personalizado por candidatura
- Estado da candidatura:
  - `draft`
  - `submitted`
  - `viewed`
  - `shortlisted`
  - `interview`
  - `rejected`
  - `hired`
  - `withdrawn`

### Empresas
- Registo de empresa e perfil
- Estado de verificação da empresa
- Criação e gestão de vagas
- Restrição para impedir edição de vagas de outras empresas

### Employer workflow (atualizado)
- Onboarding multi-passo para conta empresa com progresso persistido por utilizador (`hasSeenEmpresaTutorial` + passo em localStorage)
- Página dedicada de Definições no portal empresa para reabrir tutorial
- Auto-preenchimento inicial do perfil da empresa com dados do registo do owner
- Bloqueio de publicação de vagas enquanto `companyStatus !== active`
- Campos adicionais no modal de vaga: `responsibilities` e `requirements`

### Verificação e moderação de empresas
- Estados suportados: `pending_verification`, `active`, `rejected`, `inactive`
- Ações de moderador/admin na página de empresas:
  - Aprovar / rejeitar / inativar / devolver para pendente
  - Pré-visualizar email por template (`approval`, `more_info`, `rejected`, `meeting`)
  - Enviar email de verificação com assunto/corpo editáveis
- Fluxo de exclusão:
  - Moderador pode criar pedido de exclusão
  - Super-admin pode aprovar/rejeitar pedidos pendentes

### Notificações e mensagens internas
- Sino de notificações em portais candidate/company/admin
- Ações: marcar lida/não lida, resolver
- Mensagem interna de membro de equipa para owner com motivos whitelist:
  - `Solicitar aprovação de vaga`
  - `Atualizar perfil`
  - `Assunto administrativo`
  - `Outro`

### Vagas e visibilidade
- Campos de vaga suportados no schema
- Visibilidade: `public`, `private`, `draft`, `archived`
- Moderação por admin com status `pending_company_approval`, `pending_platform_review`, `approved`, `published`, `platform_rejected`, `archived`
- Listagem pública apenas para vagas `public + published/approved`

### Admin
- Overview
- Suspensão de utilizadores
- Moderação de vagas com atualização otimista no UI e sincronização periódica
- Verificação de empresas com templates de email (aprovar, pedir informação, rejeitar, inativar)
- Gestão de campanhas de anúncios (criar, editar, ativar/desativar, eliminar)
- Fluxo de scraping com revisão manual + edição e eliminação
- Logs de auditoria/admin actions com filtros por ação, utilizador, intervalo de datas e exportação CSV

### Ads (sem Stripe)
- Gestão manual de campanhas
- Placement suportado:
  - `homepage_banner`
  - `sidebar`
  - `inline`
  - `newsletter`
- Tracking de impressões e cliques
- Sem checkout, subscrição, webhook ou qualquer processamento de pagamento

### Scraping (admin-reviewed)
- Scraped jobs entram como `pending` por padrão
- Detecção de duplicados por fingerprint
- Review admin para aprovar/rejeitar/duplicado/arquivar
- Publicação nunca automática
- Atribuição de fonte suportada por `sourceUrl` e `sourceType`
- Seed de dados de teste: `npm run db:seed:scraped`

### Search / MeiliSearch
- Script de reindex: `npm run reindex:jobs`
- Indexa apenas vagas públicas aprovadas
- Define atributos filterable e sortable
- Comando ignora execução se env de DB/Search não estiver configurado

### SEO e compliance
- JobPosting schema em página de detalhe de vaga
- `sitemap.xml` dinâmico (rotas públicas)
- `robots.txt`
- Metadata base, canonical e Open Graph no layout
- Páginas legais:
  - `/privacidade`
  - `/termos`
  - `/politica-retencao`
  - `/termos-empregador`
- Banner de consentimento de cookies

## Estrutura backend (rotas)

- `GET /health`
- `GET /ready`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/candidates/profile`
- `PUT /api/v1/candidates/profile`
- `GET /api/v1/companies/profile`
- `PUT /api/v1/companies/profile`
- `POST /api/v1/cv/upload`

## Regras de validação operacional

- `PATCH /admin/jobs/:id/moderate` devolve a vaga atualizada e o frontend deve refrescar a lista após sucesso para evitar sobrescrever estado com polling antigo.
- `PATCH /companies/:id/verification` aceita aliases como `pending`, `pendente`, `ativa`, `inativa` e `rejeitada`, mas normaliza tudo para `active`, `pending_verification`, `inactive` e `rejected`.
- `PATCH /companies/:id/verification` valida transições e devolve mensagens específicas, por exemplo quando se tenta mover uma empresa ativa para pendente.
- `GET /admin/companies?status=...` filtra por `status` normalizado e também por `verificationStatus` legado, para que listas de empresas ativas/rejeitadas/inativas não desapareçam durante a migração de dados.
- `PATCH /admin/users/:id/suspend` exige `suspended` boolean, `reason`, e está restrito a `super-admin`; a API devolve erros específicos para auto-suspensão e utilizador inexistente.
- `POST /admin/ads`, `PUT /admin/ads/:id` e `PATCH /admin/ads/:id` validam `title`, `placement`, `link`, `startDate` e `endDate`, incluindo URL completo e `startDate <= endDate`; o frontend deve mostrar a mensagem específica devolvida pela API para erros `400`.

## Variáveis de ambiente

Crie um `.env` com:

```bash
# Core
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=change-me
PORT=6001
AUTH_MAX_FAILED_LOGINS=8
AUTH_LOCK_MINUTES=15
TEMP_PASSWORD_TTL_MINUTES=60

# Frontend
NEXT_PUBLIC_SITE_URL=https://parvagas.pt
FRONTEND_URL=https://parvagas.pt
BACKEND_URL=https://api.parvagas.pt

# Storage adapter
STORAGE_PROVIDER=local

# AI adapter
AI_PROVIDER=fallback
AI_API_KEY=

# CV Resume Parser
# Options: skima (default), apyhub, manual
RESUME_PARSER_PROVIDER=skima
SKIMA_API_KEY=
APYHUB_API_KEY=

# MeiliSearch (opcional)
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=

# Sentry (opcional)
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>

# Email adapter (opcional)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@parvagas.local

# Backward-compatible aliases (optional)
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=no-reply@parvagas.local
EMAIL_REQUIRE_TLS=true

# Legal consent versions (signup)
TERMS_VERSION=2026-05
PRIVACY_VERSION=2026-05
```

### Onboarding de contas criadas por admin

- `POST /admin/users` e `POST /admin/users/admin` criam contas com password temporária forte, hash com `bcrypt` e expiração curta (`TEMP_PASSWORD_TTL_MINUTES`).
- `credentialDeliveryMode` suporta:
  - `set_password_link` (recomendado): envia link único de definição de password (`firstLoginToken`) com expiração curta.
  - `temporary_password`: envia password temporária e força alteração no primeiro login.
- Nota de segurança: prefira sempre `set_password_link` para evitar envio de passwords em texto simples por email.
- Proteção de autenticação:
  - `AUTH_MAX_FAILED_LOGINS` controla limite de tentativas falhadas.
  - `AUTH_LOCK_MINUTES` define o tempo de bloqueio temporário da conta.

### RBAC de moderação (jobs e anúncios)

- Migração SQL: `backend-python/migrations/`
- Permissões de moderação suportadas:
  - `job.review`, `job.approve`, `job.reject`
  - `ad.flag`, `ad.pause`, `ad.draft`, `ad.publish`
- Perfil `moderator` por omissão:
  - permitido: `job.review`, `job.approve`, `job.reject`, `ad.flag`, `ad.pause`, `ad.draft`
  - não permitido: `ad.publish`
- O backend continua a aplicar validação por permissão em cada rota protegida (`hasPermission`/`requirePermission`/`requireAnyPermission`).

Crie também um `.env.local` (frontend) com:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Para frontend a correr em Docker, use:

```bash
NEXT_PUBLIC_API_URL=http://backend-python:8000
```

Se `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` não estiverem definidos, a aplicação mostra um aviso no console em desenvolvimento.

## CV Parser

O pipeline de parsing de CVs suporta múltiplos providers, selecionados via variável de ambiente — sem necessidade de alterar código.

### Configuração

| Variável | Valores possíveis | Padrão |
|---|---|---|
| `RESUME_PARSER_PROVIDER` | `skima`, `apyhub`, `manual` | `skima` |
| `SKIMA_API_KEY` | chave API Skima AI | — |
| `APYHUB_API_KEY` | chave API ApyHub | — |

## Docker commands

```bash
docker compose up -d --build
docker compose logs -f backend-python
docker compose exec backend-python alembic upgrade head
docker compose exec postgres psql -U parvagas_user -d parvagas
```

Quick validation helpers:

```bash
docker compose logs -f celery-worker
Invoke-RestMethod -Uri 'http://localhost:8000/health' -Method Get
```

## Parvagas CV Builder (Branding + URLs)

O CV Builder está oficialmente rebatizado como **Parvagas CV Builder**.

### URLs oficiais

- Local: `http://localhost:3050`
- Development: `https://dev-cv.parvagas.pt`
- Production: `https://cv.parvagas.pt`

### Variáveis de ambiente essenciais

Backend (Docker):

- `RESUME_BUILDER_URL`
- `RESUME_BUILDER_SECRET`

Frontend (Next.js / Vercel):

- `NEXT_PUBLIC_RESUME_BUILDER_URL`
- `NEXT_PUBLIC_CV_BUILDER_URL` (compatibilidade)

CV Builder (SSO + integração com Parvagas API):

- `PARVAGAS_OAUTH_PROVIDER_NAME`
- `PARVAGAS_OAUTH_CLIENT_ID`
- `PARVAGAS_OAUTH_CLIENT_SECRET`
- `PARVAGAS_OAUTH_DISCOVERY_URL`
- `PARVAGAS_RESUME_SYNC_ENABLED`
- `PARVAGAS_API_URL`
- `PARVAGAS_API_KEY` (deve corresponder ao `RESUME_BUILDER_SECRET` no backend)
- `PARVAGAS_RESUME_SYNC_PATH` (default: `/api/v1/integrations/cv-builder/resumes/sync`)

Analytics (opcional, CV Builder Web):

- `VITE_ANALYTICS_SCRIPT_URL`
- `VITE_ANALYTICS_DOMAIN`

### Login com conta Parvagas

Callback URL para configurar no provider OAuth:

- `https://cv.parvagas.pt/api/auth/oauth2/callback/custom`
- `https://dev-cv.parvagas.pt/api/auth/oauth2/callback/custom`
- `http://localhost:3050/api/auth/oauth2/callback/custom`

Discovery URL (exemplo):

- `https://auth.parvagas.pt/.well-known/openid-configuration`

### Sync de curriculos para a API Parvagas

Endpoint backend implementado:

- `POST /api/v1/integrations/cv-builder/resumes/sync`

Headers esperados:

- `X-Source: parvagas-cv-builder`
- `Authorization: Bearer <PARVAGAS_API_KEY>` (obrigatorio quando `RESUME_BUILDER_SECRET` estiver definido)

Payload base:

```json
{
  "action": "create|update|patch|import|duplicate|delete",
  "userId": "<id-do-utilizador>",
  "resumeId": "<id-do-cv>",
  "resume": { "title": "...", "data": {} }
}
```

### Endpoints recomendados por ambiente

Development:

- API: `https://dev-api.parvagas.pt`
- CV Builder: `https://dev-cv.parvagas.pt`
- Storage: `https://dev-storage.parvagas.pt`

Production:

- API: `https://api.parvagas.pt`
- CV Builder: `https://cv.parvagas.pt`
- Storage: `https://storage.parvagas.pt`

### Como correr com a nova marca

Local:

```bash
docker compose --profile cv-builder up -d --build --force-recreate cv-builder
```

Development stack:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Production stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Verificação rápida

```bash
curl -I http://localhost:3050
curl -I https://dev-cv.parvagas.pt
curl -I https://cv.parvagas.pt
```

Documentação relacionada:

- `ENV_VARIABLES_REFERENCE.md`
- `VERCEL_DOCKER_SETUP.md`
- `VERCEL_FRONTEND_INTEGRATION.md`
- `PORTAINER_DEPLOYMENT_GUIDE.md`
- `DNS_CONFIGURATION.md`

### Resume AI local test

1. Enable AI locally in `backend-python/.env`:

```bash
RESUME_AI_ENABLED=true
RESUME_AI_PROVIDER=openai
RESUME_AI_BASE_URL=https://api.openai.com/v1
RESUME_AI_API_KEY=your-openai-key
RESUME_AI_MODEL=gpt-4.1-mini
RESUME_AI_TIMEOUT_SECONDS=30
RESUME_AI_SITE_URL=http://localhost:3000
RESUME_AI_APP_NAME="Parvagas Resume AI"
```

2. Start services:

```bash
docker compose up -d --build postgres redis minio backend-python celery-worker
```

3. Apply migrations:

```bash
docker compose exec backend-python alembic upgrade head
```

4. Test score endpoint:

```bash
curl -X POST http://localhost:8000/api/v1/resumes/score \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resume_id":"<resume_id>"}'
```

5. Test rewrite endpoint:

```bash
curl -X POST http://localhost:8000/api/v1/resumes/rewrite \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resume_id":"<resume_id>","tone":"professional","instructions":"Polish the experience section and improve impact language."}'
```

6. Test export stub endpoint:

```bash
curl -X POST http://localhost:8000/api/v1/resumes/export \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resume_id":"<resume_id>"}'
```

### Providers

**`skima`** (recomendado para desenvolvimento — tier gratuito disponível)
- Registe-se em [skima.ai](https://skima.ai) para obter uma chave gratuita
- Endpoint do provider suporta múltiplos formatos, mas o upload do Parvagas aceita PDF e DOCX
- Endpoint: `POST https://parser.skima.ai/api/parse-resume`

**`apyhub`** (baseado em tokens — para produção)
- Registe-se em [apyhub.com](https://apyhub.com/utility/resume-extractor)
- Suporta PDF e DOCX
- Endpoint: `POST https://api.apyhub.com/extract/resume/file/json`

**`manual`** (sem chamada externa — extração local por regex)
- Não requer chave API
- Qualidade de parsing limitada; ideal para desenvolvimento offline ou como medida de segurança
- Usa `pdf-parse` e `mammoth` para extração de texto

### Fallback automático

Se o provider primário falhar (timeout ou erro de API), o sistema recorre automaticamente ao `ManualFallbackParser` e devolve `fallbackUsed: true` na resposta. O frontend mostra os dados parciais e pede ao candidato que reveja os campos.

### Notas de operação

- Se `MEILISEARCH_HOST` estiver vazio, a indexação/pesquisa fica desativada no backend.
- Se `SENTRY_DSN` estiver vazio, o SDK não envia eventos de erro.

Para forçar sempre o parser local:
```bash
RESUME_PARSER_PROVIDER=manual
```

## Setup local

1. Instalar dependências
```bash
npm install
```

2. Iniciar frontend
```bash
npm run dev
```

3. Iniciar backend (noutra aba)
```bash
docker compose up -d
```

4. Antes do primeiro arranque em ambiente novo, execute a migração SQL de bootstrap no SQL Editor do Supabase:
  - `docker compose exec backend-python alembic upgrade head`

## Tratamento de erros unificado

- Biblioteca de UI:
  - `src/app/components/errors/FormFieldError.tsx`
  - `src/app/components/errors/ToastError.tsx`
  - `src/app/components/errors/BannerError.tsx`
  - `src/app/components/errors/ModalError.tsx`
- Handler global:
  - `src/app/components/AppNotifier.tsx`
  - `src/lib/errorBridge.ts`
  - `src/lib/errorMonitoring.ts`
- Fallbacks amigáveis:
  - `src/app/not-found.tsx`
  - `src/app/error.tsx`
  - `src/app/global-error.tsx`

## Modo português temporário

- Configuração central em `src/config/appConfig.ts`.
- `ENABLE_I18N=false` força locale `pt` em client/server e oculta seletores de idioma.
- Para reativar i18n no futuro, ajustar:
  - `ENABLE_I18N=true`

## Comandos de qualidade

```bash
npm run lint
npm run test
npm run test:ui
npm run typecheck
npm run build
npm run db:migration:generate
```

## Migrações de base de dados

Este projeto usa Supabase Postgres. Para checkpoint de migração foi adicionado:
- `npm run db:migration:generate`
- Gera artefacto em `backend-python/migrations/versions/`

Para copiar todos os dados da base antiga para a nova base:
- Definir `OLD_DATABASE_URL` no `.env.docker`
- Opcional: definir `NEW_DATABASE_URL` (se não definido, usa o Postgres do docker compose)
- Executar `npm run db:copy:old-to-new`

Este comando faz dump completo + restore completo e valida contagem de linhas por tabela no schema `public`.

## Permissões por role

- `candidate`:
  - gestão de perfil, alertas, candidaturas e vagas guardadas
- `company`:
  - gestão de empresa, vagas próprias e candidaturas recebidas
- `admin`:
  - moderação, verificação, suspensão, scraping review e anúncios

## Deploy (resumo)

1. Provisionar projeto Supabase
2. Configurar variáveis de ambiente
3. Build frontend: `npm run build`
4. Start frontend: `npm run start`
5. Start API stack: `docker compose up -d --build`
6. Aplicar migrations: `npm run db:migrate`

### Gate de carga e limites por rota

- O backend aplica limites diferenciados por classe de rota:
  - Auth e escrita sensível: limites mais estritos
  - Leitura pública: janela curta para burst
  - Uploads/candidaturas: limites dedicados
- Variáveis de tuning:
  - `RATE_LIMIT_PUBLIC_READ_WINDOW_MS`
  - `RATE_LIMIT_PUBLIC_READ_MAX`
  - `RATE_LIMIT_GENERAL_READ_MAX`
  - `RATE_LIMIT_WRITE_MAX`
  - Todos os `429` passam a emitir evento externo via Sentry com `routeClass`, `path` e `method` para alertas por classe de rota.
- O gate de carga usa thresholds p95/p99/error-rate via env:
  - `LOAD_HEALTH_MAX_P95_MS`, `LOAD_HEALTH_MAX_P99_MS`, `LOAD_HEALTH_MAX_ERROR_RATE`
  - `LOAD_PUBLIC_MAX_P95_MS`, `LOAD_PUBLIC_MAX_P99_MS`, `LOAD_PUBLIC_MAX_ERROR_RATE`
- O gate também permite modelar taxa por conexão (simulação de utilizadores simultâneos sem sobrecarga sintética):
  - `LOAD_HEALTH_CONNECTIONS`, `LOAD_HEALTH_CONNECTION_RATE`
  - `LOAD_PUBLIC_CONNECTIONS`, `LOAD_PUBLIC_CONNECTION_RATE`
- CI inclui um job `Load Gate` que arranca a API localmente e falha o workflow se os thresholds forem ultrapassados.
- Para staging/prod-like infra, executar o mesmo gate apontando `LOAD_BASE_URL` para o ambiente alvo. Exemplo: `LOAD_BASE_URL=$STAGING_LOAD_BASE_URL npm run test:load:gate`
- Falhas de Supabase no boundary do document-store são emitidas para Sentry com contexto de `operation`, `tableName` e `modelName` para alertas de upstream DB.

### Sessões e timeout por inatividade

- Login passa a manter apenas uma sessão ativa por utilizador; novo login invalida o token anterior.
- Sessões expiram por inatividade via `AUTH_SESSION_IDLE_TIMEOUT_MS` no backend e `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS` no frontend.
- Logout manual chama `/auth/logout`, revoga a sessão ativa e sincroniza saída entre separadores do browser.

## Limitações atuais e próximos passos

- O adapter de IA está em fallback heurístico por default.
- Storage cloud (R2/Supabase) está preparado por interface, mas ainda com implementação local.
- Não há fila BullMQ/Redis ativa neste snapshot.
- O backend usa Supabase Postgres com camada de compatibilidade em JSON (document-store); a normalização relacional completa ainda pode ser feita numa fase futura.
- Indexação MeiliSearch depende de configuração externa.

## Confirmações de escopo

- Sem Stripe no código, dependências, env vars e rotas.
- Sem processamento de pagamento online.
- Vagas privadas não aparecem em listagens públicas.
- Conteúdo de IA para perfil/candidatura exige aprovação do candidato antes de uso final.
- Scraped jobs exigem revisão admin antes de publicação.
