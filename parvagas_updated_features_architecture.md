# Parvagas — Updated Features and System Architecture

## 1. Product Direction

Parvagas should evolve from a CV-submission website into an Angola-first recruitment platform where:

- Candidates create accounts from their CV information.
- AI helps transform uploaded CV data into a structured professional profile.
- Candidates can apply to available job postings using their AI-enhanced profile.
- Companies create verified employer accounts.
- Companies define human resource needs for specific positions.
- Companies can choose whether a job post is public or private.
- Public jobs appear in the employment/job-seeking area.
- Private jobs remain visible only to the company, admins, and matched/internal candidates if enabled.
- Admins moderate users, companies, job posts, scraped jobs, and ads.
- Ads become a non-Stripe revenue source.

Stripe/payment processing remains removed from scope.

## 2. Design Direction

Use the current Parvagas design as the starting point:

- Clean white background.
- Red primary brand color.
- Dark text with red highlights.
- Simple rounded buttons.
- Lightweight corporate recruitment tone.
- Mobile-first navigation.
- Existing pages such as Home, Empresas, Login, Submission, Candidates, and Dashboard should be redesigned but not visually abandoned.

Recommended visual refinements:

- Keep red as the primary action color.
- Use stronger spacing and card-based layouts.
- Add polished dashboard interfaces for candidates, companies, and admins.
- Keep copy in Portuguese first.
- Prepare English support later.

## 3. Updated System Feature Breakdown

### 3.1 Public Website

Core pages:

- Homepage.
- Job listings page.
- Job detail page.
- Candidate registration page.
- Company registration page.
- Company information page.
- Career advice/blog section.
- Contact page.
- Privacy policy.
- Terms of service.

Public homepage sections:

- Hero section explaining Parvagas.
- CTA for candidates: “Criar perfil com CV”.
- CTA for companies: “Publicar vaga / Encontrar talento”.
- Featured public jobs.
- Featured companies.
- Career tips.
- Advertisement placements.

### 3.2 Candidate Account From CV

The candidate should be able to create an account using CV information.

Flow:

1. Candidate uploads CV.
2. System extracts CV text.
3. AI parses the CV into structured data.
4. Candidate reviews extracted information.
5. Candidate confirms or edits the profile.
6. Account is created.
7. Candidate can apply to jobs using the generated profile.

Candidate profile fields:

- Full name.
- Email.
- Phone.
- Location.
- Nationality.
- Professional title.
- Summary/about section.
- Work experience.
- Education.
- Skills.
- Languages.
- Certifications.
- Preferred job categories.
- Preferred locations.
- Availability.
- Expected salary.
- CV file.
- AI-generated profile strength score.

AI candidate features:

- CV parsing.
- Profile summary generation.
- Skill extraction.
- Experience-level detection.
- Suggested job categories.
- Suggested improvements to CV/profile.
- Candidate-job match score.
- Auto-generated application summary.
- Optional cover letter draft.

Important: AI-generated content must always be reviewable and editable by the user before submission.

### 3.3 Candidate Job-Seeking Area

Add a dedicated tab/page for users seeking employment.

Suggested navigation label:

- “Vagas Disponíveis”
- or “Procurar Emprego”

Features:

- View public job postings.
- Search by keyword.
- Filter by province/city.
- Filter by category.
- Filter by job type.
- Filter by remote/hybrid/on-site.
- Filter by experience level.
- Save jobs.
- Apply with one click using profile.
- Upload custom CV per application if needed.
- Track application status.
- Receive job alerts.

Application statuses:

- Draft.
- Submitted.
- Viewed.
- Shortlisted.
- Interview.
- Rejected.
- Hired.
- Withdrawn.

### 3.4 Company Accounts

Companies should create accounts to provide human resources requirements for specific positions.

Company registration fields:

- Company name.
- Company legal name.
- NIF/tax number, if applicable.
- Industry.
- Company size.
- Website.
- Location.
- Contact person.
- Contact email.
- Phone.
- Logo.
- Description.
- Verification status.

Company dashboard features:

- Manage company profile.
- Create job postings.
- Mark postings as public or private.
- View candidate applications.
- Search candidate profiles, if allowed by candidate privacy settings.
- Shortlist candidates.
- Request interviews.
- Close job postings.
- View basic analytics.

### 3.5 Job Posting Visibility

Each job posting should support visibility control.

Visibility options:

- Public.
- Private.
- Draft.
- Archived.

Public jobs:

- Appear in “Vagas Disponíveis”.
- Are indexed by search.
- Can be shown on homepage.
- Can appear in email alerts.
- Can be crawled by search engines if approved.

Private jobs:

- Do not appear publicly.
- Are visible to the company and admins.
- Can be used internally for candidate matching.
- Can be shared by private link if enabled.
- Can receive admin-assisted candidate recommendations.

Job posting fields:

- Title.
- Company.
- Department.
- Location.
- Work mode.
- Job type.
- Salary range.
- Description.
- Responsibilities.
- Requirements.
- Benefits.
- Required skills.
- Preferred skills.
- Experience level.
- Education level.
- Application deadline.
- Visibility.
- Status.
- Source type.
- Source URL.

### 3.6 AI Matching

AI should help connect candidates and companies.

Candidate-side matching:

- Recommend jobs based on CV/profile.
- Show match percentage.
- Explain why a job matches.
- Suggest missing skills.

Company-side matching:

- Recommend candidates for a job.
- Rank applicants by fit.
- Summarize applicant strengths.
- Identify missing requirements.

Admin-side AI support:

- Detect duplicate jobs.
- Detect low-quality or scam job posts.
- Normalize scraped jobs.
- Suggest categories and skills.
- Generate SEO descriptions for public jobs.

### 3.7 Ads as Revenue Source

Since Stripe is removed, ads become a practical early revenue source.

Ad types:

- Homepage banner ads.
- Job listing sidebar ads.
- Job detail page ads.
- Sponsored company cards.
- Sponsored job placement.
- Blog/career article ads.

Ad management features:

- Admin creates ad campaigns.
- Admin uploads ad image/text/link.
- Admin sets placement.
- Admin sets start and end date.
- Admin sets active/inactive status.
- Admin tracks impressions and clicks.

Manual monetization options:

- Direct invoice to companies.
- Monthly sponsorship packages.
- Featured employer package.
- Sponsored job package.
- Recruitment partner package.

No online payment automation is required at this stage.

### 3.8 Admin Features

Admin dashboard modules:

- Overview dashboard.
- Candidates.
- Companies.
- Jobs.
- Applications.
- Scraped jobs.
- Ads.
- Categories.
- Locations.
- Skills.
- Blog/content.
- Notifications.
- Analytics.
- Audit logs.

Admin actions:

- Verify companies.
- Suspend users.
- Approve/reject jobs.
- Approve/reject scraped jobs.
- Convert scraped jobs into public jobs.
- Manage ads.
- Manage public/private job visibility.
- Moderate reported jobs.
- View platform metrics.

### 3.9 Scraped Job Aggregation

The platform should still support automatic job collection, but only with admin review before publishing.

Flow:

1. Scraper collects job data from approved sources.
2. Data is stored in scraped_jobs as pending.
3. System normalizes title, company, location, category, and skills.
4. System checks duplicates.
5. Admin reviews the scraped job.
6. Admin approves, edits, rejects, or merges.
7. Approved job becomes a public job.

Important rules:

- Respect robots.txt.
- Respect source terms.
- Use rate limits.
- Attribute the original source.
- Keep source URL.
- Never auto-publish scraped jobs without review.

## 4. Updated Suggested Navigation

Public navigation:

- Início.
- Vagas Disponíveis.
- Empresas.
- Candidatos.
- Dicas de Carreira.
- Portal.

Candidate portal:

- Meu Perfil.
- Vagas Recomendadas.
- Vagas Disponíveis.
- Candidaturas.
- CV e Documentos.
- Alertas.
- Definições.

Company portal:

- Dashboard.
- Perfil da Empresa.
- Publicar Vaga.
- Minhas Vagas.
- Candidaturas.
- Talentos Recomendados.
- Análises.
- Definições.

Admin portal:

- Overview.
- Candidatos.
- Empresas.
- Vagas.
- Scraping.
- Anúncios.
- Conteúdo.
- Relatórios.
- Configurações.

## 5. Updated Database Modules

### Identity and Access

- users
- sessions
- accounts
- roles
- permissions
- password_reset_tokens

### Candidate Profile

- candidate_profiles
- candidate_experiences
- candidate_education
- candidate_skills
- candidate_languages
- candidate_certifications
- candidate_documents
- candidate_ai_profiles
- candidate_preferences

### Company Profile

- companies
- company_users
- employer_profiles
- company_verification_requests

### Jobs

- jobs
- job_requirements
- job_skills
- job_categories
- job_locations
- job_visibility_rules
- saved_jobs

### Applications

- applications
- application_documents
- application_status_history
- application_ai_summaries

### AI and Matching

- ai_parse_runs
- ai_profile_suggestions
- job_match_scores
- candidate_match_scores
- ai_audit_logs

### Scraping

- job_sources
- scraped_jobs
- scraper_runs
- scraper_errors
- job_duplicates

### Ads

- ads
- ad_campaigns
- ad_placements
- ad_impressions
- ad_clicks

### Notifications

- job_alerts
- notification_preferences
- notification_logs

### Admin and Audit

- admin_actions
- moderation_queue
- audit_logs
- reports

### Content and SEO

- blog_posts
- landing_pages
- seo_metadata
- sitemaps

## 6. Updated System Architecture

Recommended architecture:

1. **Next.js frontend**
   - Public website.
   - Candidate portal.
   - Company portal.
   - Admin dashboard.
   - SEO pages.

2. **Backend API**
   - Authentication.
   - Candidate profiles.
   - Company accounts.
   - Jobs.
   - Applications.
   - Ads.
   - Admin actions.
   - File upload signing.

3. **PostgreSQL database**
   - Main relational data store.
   - Users, profiles, companies, jobs, applications, ads, scraping, audit logs.

4. **Object storage**
   - CV files.
   - Company logos.
   - Job attachments.
   - Ad images.

5. **AI processing service**
   - CV parsing.
   - Profile generation.
   - Job matching.
   - Application summaries.
   - Job normalization.

6. **Search service**
   - MeiliSearch for public jobs.
   - Index approved public jobs only.
   - Support filters and sorting.

7. **Queue and workers**
   - Redis-backed queues.
   - CV parsing worker.
   - Scraping worker.
   - Notification worker.
   - Search indexing worker.

8. **Scraping service**
   - Collects jobs from approved Angola sources.
   - Sends data to review queue.

9. **Notification service**
   - Email alerts.
   - Employer application notifications.
   - Admin alerts.
   - SMS/WhatsApp later.

10. **Monitoring and logs**
   - Error tracking.
   - Scraper health.
   - Worker health.
   - API health.
   - Storage and database usage.

## 7. Recommended System Stack

### Preferred Stack

| Layer | Recommended Tool |
|---|---|
| Frontend | Next.js + TypeScript |
| Styling | Tailwind CSS + existing red theme |
| UI components | shadcn/ui or Headless UI |
| Backend API | NestJS or Express.js |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | Auth.js / NextAuth |
| File storage | Cloudflare R2 or Supabase Storage |
| Search | MeiliSearch |
| Queue/cache | Redis |
| Scraping | Python Scrapy + Playwright fallback |
| Workers | BullMQ if Node-only, or Celery if Python scraping is separate |
| AI | OpenAI API or compatible LLM provider |
| Email | Resend, SendGrid, or SMTP |
| SMS/WhatsApp | Twilio or local provider later |
| Ads tracking | Internal database tracking |
| Analytics | PostHog or Plausible |
| Monitoring | Sentry |
| Hosting frontend | Vercel |
| Hosting API/workers | Render, Fly.io, DigitalOcean, or AWS |

### Practical MVP Stack

For the fastest Angola-first launch:

- Next.js app.
- Prisma.
- PostgreSQL.
- Auth.js.
- Cloudflare R2 for files.
- MeiliSearch.
- Redis.
- BullMQ workers.
- OpenAI API for CV/profile processing.
- Resend for email.
- Vercel for web.
- Render or Fly.io for API/workers.

This keeps the architecture manageable while still being production-ready.

## 8. Updated Implementation Phases

### Phase 1 — Design and Core Accounts

- Preserve current red/white design direction.
- Rework homepage copy and navigation.
- Add candidate account creation from CV upload.
- Add company registration.
- Add role-based portals.

### Phase 2 — AI Candidate Profile

- Add CV upload storage.
- Extract CV text.
- Parse CV into structured profile.
- Generate editable AI profile summary.
- Add profile completion score.

### Phase 3 — Jobs and Applications

- Add company job posting.
- Add public/private job visibility.
- Add “Vagas Disponíveis” tab.
- Add candidate applications.
- Add application status tracking.

### Phase 4 — Search and Matching

- Configure MeiliSearch.
- Index public approved jobs.
- Add filters.
- Add AI job recommendations.
- Add company candidate recommendations.

### Phase 5 — Admin and Ads

- Add admin moderation.
- Add company verification.
- Add ads management.
- Track ad impressions and clicks.

### Phase 6 — Scraping

- Add approved job sources.
- Review robots.txt and terms.
- Add scraping workers.
- Add scraped job review queue.

### Phase 7 — Production

- Production environment variables.
- Managed PostgreSQL.
- Managed Redis.
- Managed MeiliSearch.
- Real object storage.
- Monitoring.
- Backups.
- Legal pages.

## 9. Updated Codex Prompt

```text
Project: Parvagas recruitment platform.

Use the uploaded Parvagas project as the visual starting point. Preserve the clean red/white recruitment design, simple navigation, rounded buttons, and Portuguese-first tone, but rebuild/extend it into a full recruitment platform.

Important: Stripe/payment features are removed from scope. Do not add Stripe checkout, subscriptions, webhooks, billing dashboards, or Stripe environment variables. Revenue should be supported through manual ads/sponsorship management only.

Main objective:
Build an Angola-first recruitment platform where candidates create accounts from CV information, AI converts CV data into an editable professional profile, candidates apply to public job postings, and companies create accounts to publish public or private job opportunities.

Required modules:

1. Public website
- Keep the current red/white design direction.
- Update navigation to include: Início, Vagas Disponíveis, Empresas, Candidatos, Dicas de Carreira, Portal.
- Add homepage sections for candidates, companies, featured jobs, career tips, and ad placements.

2. Candidate account from CV
- Allow a user to register by uploading a CV.
- Store the CV in real object storage, not local disk.
- Extract text from PDF/DOCX CVs.
- Use AI to parse the CV into structured profile fields: name, contact info, professional title, summary, experience, education, skills, languages, certifications, location, preferred roles, and preferred locations.
- Show the AI-generated profile to the candidate for review and editing before saving.
- Add candidate profile completion score.
- Allow candidate to save jobs, apply to jobs, and track application status.

3. AI profile and matching
- Generate an editable professional summary from the CV.
- Extract skills and experience level.
- Recommend jobs based on candidate profile.
- Show match score and explanation.
- Generate optional application summary/cover letter draft, but require candidate approval before submission.

4. Company accounts
- Allow companies to register and create a company profile.
- Include company name, legal name, NIF if available, industry, size, location, website, logo, description, and contact user.
- Add employer verification status.
- Company users can create job postings and review applications.

5. Job posting system
- Companies can create job postings for specific HR needs.
- Add fields for title, department, location, job type, work mode, salary range, description, responsibilities, requirements, benefits, skills, deadline, status, and visibility.
- Add visibility options: public, private, draft, archived.
- Public jobs appear in the “Vagas Disponíveis” area and public search.
- Private jobs are visible only to the company and admins, with optional internal candidate matching.

6. Vagas Disponíveis
- Add a dedicated public/candidate job listing page.
- Include search and filters: keyword, location, province/city, category, job type, work mode, experience level, salary, and date posted.
- Add job detail pages.
- Add one-click apply using candidate profile.

7. Admin dashboard
- Admin can manage candidates, companies, jobs, applications, ads, scraped jobs, categories, locations, skills, content, and reports.
- Admin can verify companies, suspend users, approve/reject jobs, and control public/private visibility.

8. Ads revenue module
- Add manual ad campaign management.
- Admin can create ads with title, image, link, placement, start date, end date, and active status.
- Support placements: homepage banner, job listing sidebar, job detail page, sponsored company card, blog/article ad.
- Track impressions and clicks.
- No online payment processing is required.

9. Scraped job aggregation
- Keep scraping as an admin-reviewed pipeline.
- Scrape only approved sources after robots.txt and terms review.
- Store scraped jobs as pending.
- Normalize title, company, location, category, and skills.
- Detect duplicates.
- Admin can edit, approve, reject, or merge before publication.
- Approved scraped jobs become public job posts with source attribution.

10. Architecture and stack
- Frontend: Next.js + TypeScript + Tailwind CSS.
- UI: existing style plus Headless UI or shadcn/ui.
- Backend: NestJS or Express.js with TypeScript.
- ORM: Prisma.
- Database: PostgreSQL.
- Auth: Auth.js/NextAuth with candidate, company, and admin roles.
- Search: MeiliSearch.
- Queue/cache: Redis.
- Workers: BullMQ or Celery.
- Scraping: Python Scrapy with Playwright fallback.
- File storage: Cloudflare R2 or Supabase Storage.
- AI: OpenAI API or compatible LLM provider.
- Email: Resend, SendGrid, or SMTP.
- Monitoring: Sentry.
- Analytics: PostHog or Plausible.
- Hosting: Vercel for frontend, Render/Fly.io/DigitalOcean for API and workers.

11. SEO and compliance
- Add JobPosting structured data for public jobs.
- Add dynamic sitemap.
- Add canonical URLs.
- Add Open Graph metadata.
- Add privacy policy, terms, cookie consent, data retention policy, candidate consent for CV processing, and employer posting terms.

Deliverables:
- Updated app structure.
- Updated navigation and pages.
- Candidate CV-to-profile flow.
- AI profile generation flow.
- Company account and job posting flow.
- Public/private job visibility.
- Vagas Disponíveis tab/page.
- Ads module.
- Admin dashboard updates.
- Updated architecture and database schema.
- Documentation for setup, environment variables, AI processing, storage, scraping, and deployment.
```
