# Docker Compose Architecture

This repository now uses four canonical Compose files:

- `docker-compose.yml`: local base stack using build contexts
- `docker-compose.dev.yml`: local development override (merged with base)
- `docker-compose.dev.portainer.yml`: image-only development stack for Portainer Git stacks
- `docker-compose.prod.portainer.yml`: image-only production stack for Portainer Git stacks

Deployment split:

- Frontend (Parvagas Next.js): Vercel for dev and prod
- Backend + workers + CV Builder + infra (Postgres/Redis/MinIO): Portainer server

Source vs image behavior:

- Local compose builds from source.
- Portainer compose files are image-only and pull prebuilt GHCR images.

## 1) Local development (build-context mode)

Use local build contexts for development on your machine.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Main local stack with CV Builder enabled:

```bash
docker compose --profile cv-builder -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Stop:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## 2) Portainer development (image-only)

Use this for server-side dev/staging backend deployments through Portainer.
This stack does not include the Parvagas frontend container.
Portainer must not rebuild images from source; this file is image-only.

```bash
docker compose --env-file .env.dev.portainer.example -f docker-compose.dev.portainer.yml config
```

In Portainer, map environment variables from your real dev env file and deploy `docker-compose.dev.portainer.yml`.

## 3) Portainer production (image-only)

Use this for production backend deployments through Portainer.
This stack does not include the Parvagas frontend container.
Portainer must not rebuild images from source; this file is image-only.

```bash
docker compose --env-file .env.prod.portainer.example -f docker-compose.prod.portainer.yml config
```

In Portainer, map environment variables from your real prod env file and deploy `docker-compose.prod.portainer.yml`.

## Environment examples

- `.env.example`: shared defaults and reference values
- `.env.local.example`: local machine defaults
- `.env.dev.portainer.example`: dev Portainer reference values
- `.env.prod.portainer.example`: prod Portainer reference values

Important:

- Keep `CV_BUILDER_DATABASE_URL` fully expanded in Portainer env files (no nested interpolation).
- `cv-builder` listens internally on port `3000`.
- Dev and prod stacks use isolated names for volumes, DB names, buckets, and Traefik routers.
- Set `FRONTEND_URL` and `CORS_ORIGIN` to Vercel domains for each environment.
- GHCR credentials are required in Portainer if images are private.
- For local source builds, copy full CV Builder sources directly into `./reactive-resume` (no nested `reactive-resume/reactive-resume-main` folder).

## Validation

Use the provided scripts before deploying:

```powershell
./scripts/validate-compose.ps1
```

```bash
./scripts/validate-compose.sh
```

Checks include:

- canonical file presence
- retired file removal from repository root
- `docker compose config` parse checks
- duplicate host port detection
- duplicate Traefik router names between dev/prod
- obsolete variable detection in canonical files
- dependency healthcheck consistency
- dev/prod isolation (volumes, DB names, buckets)
- nested interpolation detection

## Retired files

The following legacy files were archived under `docker/archive/` and should not be used for new deployments:

- `docker-compose-updated.yml`
- `docker-compose.prod.yml`
- `docker-compose.portainer.yml`
