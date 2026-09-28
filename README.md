# ComputeMesh

**Peer-to-peer distributed compute marketplace.**

> **M1 Status:** Monorepo + Local Development Infrastructure. This milestone establishes the project foundation. Real compute workloads, marketplace features, payments, and GPU rental are NOT yet implemented.

## What is ComputeMesh?

ComputeMesh is a peer-to-peer distributed compute marketplace that connects:

- **Compute Providers** — Users with unused CPU/GPU resources
- **Compute Consumers** — Users who need on-demand compute power
- **ComputeMesh Platform** — Authentication, scheduling, billing, monitoring, and secure workload execution

## Current Status

**Milestone 1 (M1)** — Monorepo + Local Development Infrastructure

- [x] Monorepo structure with pnpm workspaces
- [x] Shared packages (types, config, logger, validation, database)
- [x] NestJS API with health endpoints
- [x] Next.js web application
- [x] Worker application
- [x] Go-based Provider Agent skeleton
- [x] PostgreSQL, Redis, SeaweedFS via Docker Compose
- [x] Database migration infrastructure (Prisma)
- [x] ESLint + Prettier code quality
- [x] TypeScript strict mode
- [ ] User authentication (future)
- [ ] Compute marketplace (future)
- [ ] Job scheduling (future)
- [ ] Billing & payments (future)

## Architecture Overview

The system is organized into two planes:

### Control Plane
- **Web** (`apps/web`) — Next.js frontend
- **API** (`apps/api`) — NestJS REST API
- **Worker** (`apps/worker`) — Background job processor
- **PostgreSQL** — Primary data store
- **Redis** — Cache and job queue
- **SeaweedFS** — S3-compatible object storage

### Compute Plane
- **Provider Agent** (`services/provider-agent`) — Go-based agent for compute providers

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 9.0.0
- [Docker](https://www.docker.com/) and Docker Compose
- [Go](https://go.dev/) >= 1.22 (for Provider Agent)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd computemesh

# Install dependencies
pnpm install
```

## Environment Setup

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and fill in required values:
# - DATABASE_URL (set for your local PostgreSQL)
# - SeaweedFS_ACCESS_KEY / SeaweedFS_SECRET_KEY
# - JWT_SECRET (generate: openssl rand -base64 64)
```

> **Important:** Never commit the `.env` file. Secrets must be set explicitly — they have no defaults.

## Starting Infrastructure

```bash
# Start PostgreSQL, Redis, and SeaweedFS
docker compose up -d

# Verify services are healthy
docker compose ps
```

Services:
| Service    | Port  | Description |
|------------|-------|-------------|
| PostgreSQL | 5432  | Database |
| Redis      | 6379  | Cache/Queue |
| SeaweedFS API  | 8333  | Object Storage |
| SeaweedFS Console | 9333 | SeaweedFS Web UI |

## Starting Applications

```bash
# Start all applications in development mode
pnpm dev
```

Or start individually:

```bash
# API (NestJS) — http://localhost:3001
pnpm --filter @computemesh/api run dev

# Web (Next.js) — http://localhost:3000
pnpm --filter @computemesh/web run dev

# Worker
pnpm --filter @computemesh/worker run dev

# Provider Agent (Go)
cd services/provider-agent
go run ./cmd/agent
```

## Running Tests

```bash
# Run all TypeScript tests
pnpm test

# Run API e2e tests
pnpm --filter @computemesh/api run test:e2e

# Run web tests
pnpm --filter @computemesh/web run test

# Run Go tests
cd services/provider-agent
go test ./... -v
```

## Running Lint

```bash
# Lint all TypeScript files
pnpm lint

# Fix lint errors
pnpm lint:fix
```

## Running Formatting

```bash
# Format all files
pnpm format

# Check formatting without writing
pnpm format:check
```

## Database Migration Commands

This project uses [Prisma](https://www.prisma.io/) for database management.

```bash
# Apply pending migrations (production/CI)
pnpm db:migrate

# Create and apply migrations (development)
pnpm db:migrate:dev

# Generate Prisma client after schema changes
pnpm db:generate

# Open Prisma Studio (database GUI)
pnpm db:studio
```

> **Note on rollback:** Prisma does not provide a dedicated rollback command.
> - To undo a migration in **development**, use `pnpm --filter @computemesh/database run migrate:reset` (this drops the database and re-applies all migrations — **destructive**).
> - To fix a **failed production migration**, create a new corrective migration.
> - See [Prisma migration docs](https://www.prisma.io/docs/concepts/components/prisma-migrate) for details.

## Project Structure

```
computemesh/
├── apps/
│   ├── web/            # Next.js frontend
│   ├── api/            # NestJS API
│   ├── worker/         # Background worker
│   └── admin/          # Admin dashboard (placeholder)
├── services/
│   └── provider-agent/ # Go-based provider agent
├── packages/
│   ├── types/          # Shared TypeScript types
│   ├── config/         # Environment configuration & validation
│   ├── database/       # Prisma client & migrations
│   ├── logger/         # Structured logging (pino)
│   └── validation/     # Zod validation utilities
├── infrastructure/
│   ├── docker/         # Dockerfiles (future)
│   └── scripts/        # Utility scripts
├── tests/
│   ├── integration/    # Integration tests (future)
│   └── e2e/            # End-to-end tests (future)
├── docs/               # Documentation
├── .github/workflows/  # CI/CD pipelines
├── docker-compose.yml  # Local infrastructure
├── package.json        # Root workspace config
├── pnpm-workspace.yaml # Workspace packages
├── tsconfig.json       # Base TypeScript config
├── eslint.config.mjs   # ESLint configuration
├── prettier.config.mjs # Prettier configuration
└── .env.example        # Environment template
```

## Security Notes

- No secrets are hardcoded or committed
- All environment variables are validated at startup
- API input is validated using Zod schemas
- Database queries use Prisma's parameterized queries
- Stack traces and credentials are never exposed to API consumers
- CORS is configured with explicit allowed origins
- Request IDs enable tracing without exposing internals

## Current Limitations

This is **M1 — infrastructure only**. The following are NOT implemented:

- User authentication and authorization
- Compute marketplace and resource listing
- Job scheduling and execution
- Docker workload execution on providers
- GPU/CPU rental and resource discovery
- Billing, payments, and provider payouts
- Automatic failover and checkpointing
- Job leasing
- Production deployment and Kubernetes
- Admin dashboard functionality

## Next Milestone

**M2** will focus on:
- User authentication (JWT-based)
- Provider registration
- Hardware discovery
- Basic marketplace listing
- Initial job submission workflow
