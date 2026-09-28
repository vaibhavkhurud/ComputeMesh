# ComputeMesh Architecture

## System Overview

ComputeMesh uses a two-plane architecture:

### Control Plane
Managed infrastructure running the marketplace platform:
- Web application (Next.js)
- REST API (NestJS)
- Background workers
- PostgreSQL (source of truth)
- Redis (cache, queues)
- SeaweedFS (object storage)

### Compute Plane
Distributed provider machines:
- Provider Agent (Go) runs on each provider machine
- Communicates with control plane via API
- Will execute containerized workloads in future milestones

## Architectural Principles

1. **PostgreSQL is the durable source of truth** — All critical state is stored in PostgreSQL.
2. **Redis is not the financial source of truth** — Redis is for caching and queuing only.
3. **Provider machines are untrusted** — The control plane never trusts provider-reported state blindly.
4. **Customer workloads are untrusted code** — Workloads must never execute on the host OS directly.
5. **Monolithic-first** — No unnecessary microservices. Keep the architecture simple until scale demands otherwise.
6. **Modules are replaceable** — Well-defined boundaries between components.

## Data Flow (Future)

```
Consumer → API → Scheduler → Worker → Provider Agent → Docker Container
                    ↕             ↕
              PostgreSQL        Redis
                    ↕
                  SeaweedFS
```

## Package Dependency Graph

```
apps/api ──→ packages/config
         ──→ packages/logger
         ──→ packages/database
         ──→ packages/types
         ──→ packages/validation

apps/web ──→ (standalone, env-based API URL)

apps/worker ──→ packages/config
            ──→ packages/logger

services/provider-agent ──→ (standalone Go module)
```

## Security Model

- Environment variables validated at startup
- No hardcoded secrets
- Parameterized database queries (Prisma)
- Consistent error responses (no internal leaks)
- Request ID tracing
- CORS with explicit origins
