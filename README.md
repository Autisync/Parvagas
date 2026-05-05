# Parvagas

Plataforma de recrutamento Angola-first com foco em:
- Onboarding de candidatos por CV (PDF/DOCX)
- Extração e sugestão de perfil com IA (sempre revisável pelo candidato)
- Vagas públicas e privadas para empresas
- Moderação/admin, scraping com aprovação manual e módulo de anúncios sem pagamentos online

## Stack atual do projeto

- Next.js 14 + TypeScript + Tailwind CSS
- Backend Express + Supabase Postgres (document-store compatibility layer)
- Adapters para IA, Storage, Notificações
- MeiliSearch (opcional) para indexação de vagas públicas

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

### Vagas e visibilidade
- Campos de vaga suportados no schema
- Visibilidade: `public`, `private`, `draft`, `archived`
- Moderação por admin com status `pending`, `approved`, `rejected`
- Listagem pública apenas para vagas `public + approved`

### Admin
- Overview
- Suspensão de utilizadores
- Moderação de vagas
- Verificação de empresas
- Gestão de campanhas de anúncios
- Fluxo de scraping com revisão manual
- Logs de auditoria/admin actions

### Ads (sem Stripe)
- Gestão manual de campanhas
- Placement suportado:
  - `homepage_banner`
  - `job_listing_sidebar`
  - `job_detail_page`
  - `sponsored_company_card`
  - `blog_article_ad`
- Tracking de impressões e cliques
- Sem checkout, subscrição, webhook ou qualquer processamento de pagamento

### Scraping (admin-reviewed)
- Scraped jobs entram como `pending` por padrão
- Detecção de duplicados por fingerprint
- Review admin para aprovar/rejeitar/merge
- Publicação nunca automática
- Atribuição de fonte suportada por `sourceUrl` e `sourceType`

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

- `POST /auth/register`
- `POST /auth/login`

- `POST /candidates/cv/parse`
- `POST /candidates/profile/approve`
- `GET /candidates/profile`
- `GET /candidates/jobs/recommended`
- `POST /candidates/jobs/save`
- `GET /candidates/jobs/saved`
- `POST /candidates/jobs/apply`
- `GET /candidates/applications`
- `POST /candidates/alerts`
- `GET /candidates/alerts`
- `GET /candidates/notifications/preferences`
- `PUT /candidates/notifications/preferences`

- `POST /companies/register`
- `GET /companies/me`
- `POST /companies/jobs`
- `PATCH /companies/jobs/:id`
- `GET /companies/jobs`
- `GET /companies/applications`
- `PATCH /companies/:id/verification` (admin)

- `GET /jobs`
- `GET /jobs/:id`
- `GET /jobs/companies`

- `GET /admin/overview`
- `PATCH /admin/users/:id/suspend`
- `PATCH /admin/jobs/:id/moderate`
- `POST /admin/ads`
- `GET /admin/ads`
- `POST /admin/scraped-jobs`
- `PATCH /admin/scraped-jobs/:id/review`

- `GET /public/ads`
- `POST /public/ads/:id/impression`
- `POST /public/ads/:id/click`
- `GET /public/sitemap-jobs`

## Variáveis de ambiente

Crie um `.env` com:

```bash
# Core
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=change-me
PORT=6001

# Frontend
NEXT_PUBLIC_SITE_URL=https://parvagas.co.ao

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
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=no-reply@parvagas.local
```

Crie também um `.env.local` (frontend) com:

```bash
NEXT_PUBLIC_API_URL=http://localhost:6001
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
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

### Providers

**`skima`** (recomendado para desenvolvimento — tier gratuito disponível)
- Registe-se em [skima.ai](https://skima.ai) para obter uma chave gratuita
- Suporta PDF, DOCX, DOC, TXT e imagens
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
npm run server
```

4. Antes do primeiro arranque em ambiente novo, execute a migração SQL de bootstrap no SQL Editor do Supabase:
  - `server/migrations/2026-04-26-supabase-document-store.sql`

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
npm run reindex:jobs
```

## Migrações de base de dados

Este projeto usa Supabase Postgres. Para checkpoint de migração foi adicionado:
- `npm run db:migration:generate`
- Gera artefacto em `server/migrations/`

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
5. Start API server: `npm run server`
6. Opcional: configurar MeiliSearch e executar `npm run reindex:jobs`

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
