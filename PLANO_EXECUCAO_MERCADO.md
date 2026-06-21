# Parvagas — Plano de Execução para o Mercado

_Objetivo: levar o Parvagas de "em construção" a **lançável e diferenciado no mercado angolano**. Junho 2026._

Este plano reconcilia a auditoria externa (`parvagas_analysis.html`) com o **estado real do código**, e organiza o trabalho em fases com critérios de aceitação, KPIs e riscos. Âmbito escolhido: **market-ready completo** (MVP + diferenciadores Angola antes do lançamento público).

---

## 0. Correção à auditoria externa (contexto importante)

A auditoria deu **38/100** e listou como "blockers": sem auth, sem base de dados, sem fluxo de candidatura, sem portal de empresa, sem 404, sem SEO. **O rodapé admite que foi feita sem acesso ao repositório** ("Repo was private — analysis based on org patterns"). O código real contradiz a maior parte:

| Afirmação da auditoria | Estado real no repositório |
|---|---|
| "No Authentication System" | ✅ Existe: registo/login JWT, verificação de email, reset de password, **OTP/telefone** e middleware de auth. |
| "No Database / Persistence" | ✅ Postgres + SQLAlchemy, **~22 modelos** e **8 migrações Alembic**. |
| "No Job Application Flow" | ✅ `applications.py` (~419 LOC), estados `draft→submitted→…→hired`. |
| "No Employer Portal / Posting" | ✅ `companies.py` (~730 LOC) + `jobs.py`, criação/gestão de vagas, verificação de empresa. |
| "No Error Handling / 404" | ✅ `error.tsx`, `global-error.tsx`, `not-found.tsx`. |
| "No SEO / Meta Tags" | ✅ Schema `JobPosting`, `sitemap.xml`, `robots.txt`, OG no layout. |
| "No CV Upload" | ✅ Pipeline completo (PDF/DOCX), parser com fallback. |
| "No Admin/Moderation" | ✅ `admin.py` (~1195 LOC): moderação, verificação, suspensão, scraping, ads. |

**Conclusão:** o Parvagas **não está em 38/100** — está em fase de integração/hardening, provavelmente **~60–65/100**. O que a auditoria acerta e mantém valor é a **inteligência de mercado angolano** e os **diferenciadores** (filtro por província, WhatsApp, gig/Biscato, Angolanização, mobile-first, OTP por telefone, baixa largura de banda). Este plano usa essa parte.

> Nota de âmbito: existe `payments.py` + modelos `Plan/Subscription/Transaction`. A confirmação é **manual/admin** ("stands in for a provider webhook"), sem Stripe — consistente com a regra "sem pagamento online". **Decisão necessária:** manter monetização manual no lançamento ou adiar o módulo. Recomendado: adiar para pós-lançamento e focar em supply/demand.

---

## Estado atual por dimensão (revisto)

| Dimensão | Auditoria | Real (estimado) | Lacuna principal |
|---|---|---|---|
| Auth & Segurança | 1/10 | 6/10 | Rotação de segredos vazados; CAPTCHA; verificação E2E |
| Dados / Backend | 2/10 | 7/10 | Validar contratos frontend↔backend a correr |
| Fluxo core de vagas | 3/10 | 6/10 | Testar loops ponta-a-ponta com dados reais |
| Mobile / Responsivo | 4/10 | 4/10 | QA a 360px em Android low-end (real) |
| UI / Design | 5/10 | 6/10 | Polimento + consistência PT |
| SEO | 2/10 | 6/10 | Verificar indexação real das vagas |
| DevOps / CI-CD | 4/10 | 6/10 | Deploy real + HTTPS + monitorização |
| Localização Angola | 3/10 | 4/10 | Diferenciadores por construir |
| Moderação / Confiança | 1/10 | 6/10 | Anti-fraude + fluxo de denúncia |
| Posicionamento | 7/10 | 7/10 | Forte — manter |

---

## Fases (visão geral)

| Fase | Foco | Duração | Saída |
|---|---|---|---|
| **F0** | Estabilizar & verificar | 1–2 sem | Stack a correr, contratos validados, CI verde |
| **F1** | Infra de produção & confiança | 1–2 sem | Deploy com HTTPS, backups, monitorização, email |
| **F2** | Endurecer o marketplace | 2–3 sem | Loops core sólidos, mobile, SEO, analytics |
| **F3** | Diferenciadores Angola | 2–3 sem | WhatsApp, Biscato, província, OTP, Angolanização |
| **F4** | Prontidão de lançamento | 1 sem | Beta fechada, carga, legal, go-live |

**Estimativa total: ~9–12 semanas** para market-ready completo (1–2 devs full-stack). MVP de beta fechada pode sair ao fim da F2 (~5–7 semanas).

---

## Fase 0 — Estabilizar & Verificar (P0)

Objetivo: provar que o que já existe funciona ponta-a-ponta antes de construir mais.

- [ ] **Rotação de segredos vazados** (ver `SECRET_ROTATION_REQUIRED.md`): email `no-reply@parvagas.pt`, `JWT_SECRET`, Postgres, `ADMIN_SIGNUP_KEY`, Skima. Limpar histórico Git (`git filter-repo`).
- [ ] **Alinhar dependências frontend**: `npm ci` (o `node_modules` está desatualizado — Next 14 instalado vs Next 16 no projeto). Confirmar `lint`, `typecheck`, `test`, `build` verdes.
- [ ] **Subir a stack local**: `docker compose up -d --build` + `alembic upgrade head`. Confirmar `/health` e `/ready`.
- [ ] **Validar contratos frontend↔backend**: percorrer cada chamada `authFetch`/`apiFetch` do frontend contra os routers reais (`admin`, `jobs`, `applications`, `companies`, `candidates`, `ads`, `notifications`). Corrigir divergências de shape/rota.
- [ ] **Smoke test dos fluxos**: registar candidato → upload CV → perfil → candidatar; registar empresa → verificar → publicar vaga → ver candidaturas; admin → moderar vaga/empresa.
- [ ] **Dados de seed** para desenvolvimento/demo: empresas, vagas, candidatos (`db:seed:scraped` já existe — alargar).
- [ ] **Cobertura de testes mínima**: testes de integração para os 3 loops core (backend) + ampliar testes frontend.

**Aceitação F0:** stack sobe limpa; os 3 loops funcionam manualmente; CI (frontend + backend) verde; nenhum segredo real no repo/histórico.

---

## Fase 1 — Infraestrutura de Produção & Confiança (P0)

A auditoria está certa em HTTPS e deploy: é aqui que se ganha/perde confiança no mercado angolano (onde o receio de fraude digital é real).

- [ ] **Deploy**: frontend (Next 16) e backend (container FastAPI + Celery + Redis) num host com região próxima/latência aceitável para AO. Postgres gerido + backups automáticos.
- [ ] **Domínio + HTTPS**: `parvagas.pt` e `api.parvagas.pt` com TLS válido e auto-renovação. Redirect http→https. HSTS.
- [ ] **Storage de CVs em cloud**: substituir storage local por Supabase Storage / Cloudflare R2 (o adapter já existe por interface). Validação de tipo/tamanho + verificação antivírus.
- [ ] **Email transacional**: garantir entregabilidade do domínio (SPF, DKIM, DMARC para `parvagas.pt`/`.co.ao`). Testar confirmação de candidatura, verificação, reset, alertas.
- [ ] **Monitorização**: Sentry (backend já preparado), uptime/health checks, alertas de erro e de `429` por classe de rota (já emitidos).
- [ ] **Anti-abuso**: confirmar rate limiting (já existe por classe de rota) + **CAPTCHA** em registo e candidatura (a auditoria insiste, com razão).
- [ ] **Ambiente de staging** espelho de produção para QA e gate de carga (`test:load:gate` já existe).

**Aceitação F1:** site público em HTTPS; CVs em storage cloud com backup; emails a chegar à inbox; Sentry a receber eventos; staging operacional.

---

## Fase 2 — Endurecer o Marketplace (P1)

Objetivo: os loops existem — torná-los sólidos, rápidos e mobile-first.

- [ ] **QA mobile-first a 360px** em Android low-end (85% do tráfego em AO é mobile). Corrigir layouts partidos; testar em 3G simulado.
- [ ] **Loop candidato**: onboarding → CV → revisão de perfil sugerido por IA (aprovação explícita) → candidatura → estado. Medir conclusão de cada passo.
- [ ] **Loop empresa**: registo → verificação → publicar vaga (bloqueio enquanto `status !== active`) → moderação → rever candidatos. Tutorial de onboarding.
- [ ] **Confiança/anti-fraude**: fluxo de **denúncia de vaga** + moderação antes de publicação (já parcialmente presente). Badge "empresa verificada".
- [ ] **Pesquisa & filtros**: título, **província** (Luanda, Benguela, Huambo, Cabinda…), setor, tipo de contrato. Ligar MeiliSearch (`reindex:jobs`) ou Postgres FTS como fallback.
- [ ] **SEO real**: confirmar que vagas públicas são indexadas (Search Console), `JobPosting` válido (Rich Results Test), OG a renderizar em partilhas.
- [ ] **Analytics + funil**: PostHog/Plausible/GA com eventos (registo, candidatura, publicação, drop-off). Saber que províncias/categorias performam.
- [ ] **Acessibilidade & revisão de copy PT** (PT-Angola), estados vazios, mensagens de erro amigáveis (sistema de erros já existe).

**Aceitação F2:** loops sem atrito em mobile real; pesquisa por província funcional; vagas indexadas no Google; dashboard de analytics com funil; lint/test/build verdes.

---

## Fase 3 — Diferenciadores Angola (P1/P2 — o fosso competitivo)

Nenhum concorrente (Jobartis, AngoVagas, Bolsa de Oportunidades) tem isto. É onde o Parvagas ganha a categoria.

- [ ] **Login por telefone/OTP** (já há modelo `OtpCode` + refs em `auth.py`): integrar provedor SMS com cobertura AO (ex.: Africa's Talking/Twilio/local). Baixa adoção de email → telefone é crítico.
- [ ] **"Candidatar via WhatsApp"**: botão com mensagem pré-preenchida; **cartões de vaga partilháveis** no WhatsApp (imagem/ócartão + link). Maior canal de conversão em AO.
- [ ] **Categoria "Biscato" (gig/informal)**: tipo de vaga casual + filtros próprios. Endereça os 43,6% de desemprego jovem — mercado por servir.
- [ ] **Filtro granular por província/corredor** (Lobito corridor, etc.): UX dedicada; alinha com foco geográfico do AYEOP (Banco Mundial).
- [ ] **Badge/Guia de Angolanização**: indicador de conformidade (empresas 5+ → 70% nacionais) e guia para empregadores. Único no mercado; atrai empresas internacionais.
- [ ] **Modo baixa largura de banda / PWA offline**: Service Worker + cache + páginas só-texto de fallback para usar fora de Luanda.
- [ ] **Toques de língua local** (Kimbundu/Umbundu/Kikongo) em pontos-chave — sinaliza compromisso local (i18n já preparado, atualmente forçado a PT).

**Aceitação F3:** OTP por telefone a funcionar em número AO; candidatura por WhatsApp medível; categoria Biscato com vagas; filtro por província; badge Angolanização visível no perfil de empresa; app utilizável em ligação fraca.

---

## Fase 4 — Prontidão de Lançamento (P0 antes do público)

- [ ] **Beta fechada** com empresas-âncora e vagas reais (resolver o "cold start" da oferta — sem vagas, não há candidatos).
- [ ] **Teste de carga** no staging com o gate existente (p95/p99/error-rate).
- [ ] **Revisão legal/compliance**: `/privacidade`, `/termos`, `/politica-retencao`, `/termos-empregador` já existem — rever com foco em proteção de dados em AO + consentimento de cookies.
- [ ] **Suporte & feedback**: canal de suporte (email/WhatsApp), captura de feedback in-app.
- [ ] **Go-live checklist** (usar `PRODUCTION_CHECKLIST.md` + este plano): segredos rodados, backups testados (restore!), rollback definido, monitorização ativa.
- [ ] **Parcerias/aquisição**: World Bank AYEOP ($250M, 500k jovens), TIS Academy (10.000 formandos digitais) como pipeline de candidatos; outreach a empresas para a oferta.

**Aceitação F4:** beta com X empresas e Y vagas; carga dentro dos thresholds; restore de backup validado; lançamento público aprovado.

---

## KPIs de sucesso (definir baseline na F2)

- **Oferta:** nº de empresas verificadas, nº de vagas publicadas/semana, % vagas por província.
- **Procura:** registos de candidatos, candidaturas/semana, % via WhatsApp, % via OTP.
- **Funil:** conclusão de onboarding, upload CV → candidatura, vaga vista → candidatura.
- **Confiança:** tempo de moderação, vagas denunciadas/removidas, NPS.
- **Performance:** p95 de leitura pública, taxa de erro, Core Web Vitals mobile.

---

## Riscos principais

1. **Cold start da oferta** — sem vagas, candidatos não voltam. Mitigar: scraping (com revisão admin, já existe) + outreach direto + beta com âncoras.
2. **Segredos vazados** — risco de segurança imediato até rotação. **P0.**
3. **Entregabilidade de email/SMS** em AO — testar cedo; custo de SMS pode ser material.
4. **Conectividade** — sem modo baixa-banda, perde-se mercado fora de Luanda.
5. **Fraude/scam de vagas** — sem moderação forte, erode confiança. Moderação + verificação + denúncia.
6. **Âmbito de pagamentos** — decidir manter manual vs adiar; não introduzir pagamento online (regra do projeto).

---

## Sequência recomendada (resumo)

```
F0 Estabilizar ─▶ F1 Infra/HTTPS ─▶ F2 Hardening+Mobile+SEO ─┬▶ Beta fechada
                                                              └▶ F3 Diferenciadores ─▶ F4 Lançamento público
```

A beta fechada pode arrancar no fim da F2; a F3 corre em paralelo com feedback da beta; o lançamento público faz-se após F3+F4.
