Execute this project upgrade end-to-end. Do not stop after planning. Implement the changes directly in the codebase. Stay focused only on the tasks below.

Project: Parvagas recruitment platform.

Use the existing uploaded Parvagas project as the visual starting point. Preserve the current clean red/white recruitment design, rounded buttons, Portuguese-first tone, and simple navigation, but extend it into a complete Angola-first recruitment platform.

Important exclusions:
- Do not add Stripe.
- Do not add payment checkout.
- Do not add billing dashboards.
- Do not add Stripe webhooks.
- Revenue must be handled only through manual ads/sponsorship management.

Core objective:
Build a recruitment platform where candidates create accounts from CV information, AI converts CV data into an editable professional profile, candidates apply to public jobs, and companies create accounts to publish public or private job opportunities.

Implement the following modules:

1. Public website
- Update navigation to: Início, Vagas Disponíveis, Empresas, Candidatos, Dicas de Carreira, Portal.
- Add homepage sections for candidate onboarding, company hiring, featured jobs, career tips, and ad placements.
- Keep the existing red/white design style.

2. Candidate CV-to-profile flow
- Allow users to register by uploading a CV.
- Support PDF and DOCX CV uploads.
- Store CV files through the existing storage abstraction. If real cloud storage is not configured, create a clean adapter interface and keep local storage only as development fallback.
- Extract CV text.
- Use an AI service abstraction to parse CV text into structured profile fields:
  - full name
  - email
  - phone
  - location
  - nationality
  - professional title
  - summary
  - experience
  - education
  - skills
  - languages
  - certifications
  - preferred roles
  - preferred locations
  - availability
  - expected salary
- Show the AI-generated profile to the candidate for review and editing before saving.
- Add profile completion score.
- Save candidate profile data to the database.

Quality checkpoint 1:
- Confirm CV upload route exists.
- Confirm PDF/DOCX text extraction works or has safe fallback errors.
- Confirm AI parsing is behind a service abstraction.
- Confirm user must approve AI-generated content before saving.
- Confirm no AI-generated content is submitted automatically.

3. Candidate portal
- Add candidate pages:
  - Meu Perfil
  - Vagas Recomendadas
  - Vagas Disponíveis
  - Candidaturas
  - CV e Documentos
  - Alertas
  - Definições
- Allow candidates to save jobs.
- Allow candidates to apply to jobs using their profile.
- Allow candidates to upload a custom CV per application.
- Add application status tracking:
  - draft
  - submitted
  - viewed
  - shortlisted
  - interview
  - rejected
  - hired
  - withdrawn

4. AI profile and matching
- Generate an editable professional summary.
- Extract skills and experience level.
- Recommend jobs based on candidate profile.
- Show match score and match explanation.
- Generate optional application summary or cover letter draft.
- Require candidate approval before using AI-generated application content.

Quality checkpoint 2:
- Confirm match scores are stored or calculated consistently.
- Confirm AI explanation is visible but editable where used in applications.
- Confirm candidate approval is required before submission.

5. Company accounts
- Allow companies to register and create profiles.
- Company profile fields:
  - company name
  - legal name
  - NIF
  - industry
  - company size
  - website
  - location
  - logo
  - description
  - contact person
  - contact email
  - phone
  - verification status
- Add employer verification status.
- Company users can create job postings and review applications.

6. Job posting system
- Companies can create job postings for specific human resources needs.
- Job fields:
  - title
  - company
  - department
  - location
  - work mode
  - job type
  - salary range
  - description
  - responsibilities
  - requirements
  - benefits
  - required skills
  - preferred skills
  - experience level
  - education level
  - application deadline
  - visibility
  - status
  - source type
  - source URL
- Add visibility options:
  - public
  - private
  - draft
  - archived
- Public jobs appear in Vagas Disponíveis and public search.
- Private jobs are visible only to the company and admins.
- Private jobs can optionally be used for internal candidate matching.

Quality checkpoint 3:
- Confirm public/private visibility is enforced in API queries.
- Confirm private jobs do not appear in public pages, search indexes, sitemaps, or public alerts.
- Confirm company users cannot edit another company’s jobs.

7. Vagas Disponíveis
- Add public/candidate job listing page.
- Add job detail pages.
- Include search and filters:
  - keyword
  - country
  - province/city
  - category
  - job type
  - work mode
  - experience level
  - salary
  - date posted
- Add one-click apply using candidate profile.
- Add saved jobs.

8. Admin dashboard
- Admin modules:
  - Overview
  - Candidatos
  - Empresas
  - Vagas
  - Candidaturas
  - Scraping
  - Anúncios
  - Conteúdo
  - Relatórios
  - Configurações
- Admin can:
  - verify companies
  - suspend users
  - approve/reject jobs
  - control job visibility
  - moderate reported jobs
  - manage categories, locations, and skills
  - manage ads
  - manage scraped jobs

Quality checkpoint 4:
- Confirm admin-only routes are protected.
- Confirm company verification workflow exists.
- Confirm suspended users cannot perform restricted actions.
- Confirm audit logs are created for admin actions.

9. Ads revenue module
- Add manual ad campaign management.
- Admin can create ads with:
  - title
  - image
  - link
  - placement
  - start date
  - end date
  - active status
- Supported placements:
  - homepage banner
  - job listing sidebar
  - job detail page
  - sponsored company card
  - blog/article ad
- Track impressions and clicks.
- Do not implement online payment processing.

10. Scraped job aggregation
- Keep scraping as admin-reviewed only.
- Scrape only approved sources after robots.txt and terms review.
- Store scraped jobs as pending.
- Normalize:
  - title
  - company
  - location
  - category
  - skills
- Detect duplicates.
- Admin can edit, approve, reject, or merge scraped jobs.
- Approved scraped jobs become public job posts with source attribution.
- Never auto-publish scraped jobs.

Quality checkpoint 5:
- Confirm scraped jobs are pending by default.
- Confirm admin approval is required before publication.
- Confirm source attribution is stored and displayed.
- Confirm duplicate detection exists.

11. Database/schema
Add or update models for:
- users
- sessions
- accounts
- roles
- permissions
- candidate_profiles
- candidate_experiences
- candidate_education
- candidate_skills
- candidate_languages
- candidate_certifications
- candidate_documents
- candidate_ai_profiles
- candidate_preferences
- companies
- company_users
- company_verification_requests
- jobs
- job_requirements
- job_skills
- job_categories
- job_locations
- saved_jobs
- applications
- application_documents
- application_status_history
- application_ai_summaries
- ai_parse_runs
- ai_profile_suggestions
- job_match_scores
- candidate_match_scores
- ai_audit_logs
- job_sources
- scraped_jobs
- scraper_runs
- scraper_errors
- job_duplicates
- ads
- ad_campaigns
- ad_placements
- ad_impressions
- ad_clicks
- job_alerts
- notification_preferences
- notification_logs
- admin_actions
- moderation_queue
- audit_logs
- blog_posts
- landing_pages
- seo_metadata

12. Search and indexing
- Use MeiliSearch.
- Index only approved public jobs.
- Do not index private, draft, archived, rejected, or pending scraped jobs.
- Add reindex command.
- Add filters and sortable fields.

13. Notifications
- Add notification preferences.
- Add job alerts.
- Add email notification abstraction.
- Keep SMS/WhatsApp behind provider adapters if credentials are not configured.

14. SEO and compliance
- Add JobPosting structured data for public jobs.
- Add dynamic sitemap.
- Exclude private/draft/archived jobs from sitemap.
- Add canonical URLs.
- Add Open Graph metadata.
- Add privacy policy.
- Add terms of service.
- Add cookie consent.
- Add data retention policy.
- Add candidate consent for CV/AI processing.
- Add employer posting terms.

15. Architecture and stack
Use the existing project stack where possible. Target stack:
- Next.js + TypeScript
- Tailwind CSS
- shadcn/ui or Headless UI if already compatible
- Prisma
- PostgreSQL
- Auth.js/NextAuth
- MeiliSearch
- Redis
- BullMQ or existing worker setup
- Scrapy/Playwright only if scraping service already exists
- Cloudflare R2 or Supabase Storage adapter, with local fallback only for development
- AI provider abstraction
- Email provider abstraction
- Sentry-ready error logging
- PostHog/Plausible-ready analytics hooks

Final quality checkpoint:
- Run lint.
- Run tests.
- Run typecheck.
- Run build.
- Run database migration generation.
- Confirm no Stripe code, Stripe dependencies, Stripe environment variables, or payment routes remain.
- Confirm private jobs are not publicly visible.
- Confirm candidate AI-generated profile is editable before saving.
- Confirm scraped jobs require admin approval.
- Confirm ads tracking works.
- Confirm documentation is updated.

Documentation required:
- Update README with setup instructions.
- Document environment variables.
- Document AI provider setup.
- Document storage setup.
- Document scraping setup.
- Document MeiliSearch indexing.
- Document role permissions.
- Document deployment steps.
- Document known limitations and next steps.

Execution rule:
Do not only describe the plan. Implement the code changes. Keep changes scoped to the tasks above. After finishing, provide a concise summary of changed files, completed checkpoints, commands run, and any remaining blockers.