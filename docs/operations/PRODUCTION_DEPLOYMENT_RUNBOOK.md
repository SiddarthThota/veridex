# VERIDEX — Production Deployment & Operations Runbook

**Document Version:** 1.0.0  
**Release Target:** VERIDEX v0.9.7  
**System Architecture:** Three-tier (FastAPI Gateway, Next.js BFF/UI, PostgreSQL/Redis)  

---

## 1. Overview & System Pre-requisites

VERIDEX is an enterprise-grade AI Agent Governance, Security, Audit & Observability Platform. The production topology consists of:
- **FastAPI Core Engine (`backend`)**: Python 3.13 / FastAPI asynchronous gateway enforcing deterministic governance policies, risk vector calculations, and telemetry.
- **Next.js Web Application & BFF (`frontend`)**: Next.js 16 (React 19) serving the administrative console and server-side Backend-for-Frontend (BFF) proxy handlers.
- **Relational Database (`postgres`)**: PostgreSQL 16+ storing agents, tools, policies, risk profiles, runs, invocations, and approvals.
- **Cache & Telemetry Collector (`redis` & `otel-collector`)**: Redis 7+ and OpenTelemetry Collector Contrib for distributed tracing and Prometheus metric aggregation.

### Minimum System Specifications
- **CPU**: 4 vCPUs (x86_64 or ARM64)
- **Memory**: 8 GB RAM minimum (16 GB recommended for high invocation volume)
- **Disk Storage**: 50 GB SSD (allocated for PostgreSQL persistent data and WAL logs)
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9) or hardened container host

---

## 2. Production Environment Verification

Before executing any deployment, verify all required production secrets and environment variables.

### Mandatory Environment Checks (`SEC-05` Safeguards)
The FastAPI backend enforces hard lifespan validation checks upon startup:
1. **Debug Prohibition**: `VERIDEX_DEBUG` must be set to `"false"`. If `VERIDEX_DEBUG="true"` while `VERIDEX_ENVIRONMENT="production"`, the server immediately halts with `RuntimeError`.
2. **Secret Key Strength**: `VERIDEX_SECRET_KEY` must be at least 32 characters in length and cannot match default development placeholders (e.g., `"CHANGE-ME-IN-PRODUCTION-USE-A-REAL-SECRET-KEY"`, `"dev-secret-key-change-in-production"`).
3. **CORS Origins**: `VERIDEX_CORS_ORIGINS` must list only authorized production frontend domains (e.g. `'["https://veridex.company.com"]'`). Wildcard `*` is strictly prohibited.

---

## 3. Database Migration Procedures

Always apply schema migrations before initiating container deployment:

```bash
# 1. Ensure network connectivity to production PostgreSQL
export VERIDEX_DATABASE_URL="postgresql+asyncpg://veridex_user:<PASSWORD>@<DB_HOST>:5432/veridex"

# 2. Run Alembic upgrade head
cd backend
alembic upgrade head

# 3. Verify current revision
alembic current
```

> [!IMPORTANT]
> Never run automated migrations on live write-traffic without taking a preliminary database snapshot (`pg_dump` or cloud provider volume snapshot).

---

## 4. Container Deployment & Networking Configuration (`SEC-02`)

### Container Networking Boundary
When deploying the frontend and backend in isolated Docker containers:
- **Server-Side BFF Routing**: The Next.js container connects to FastAPI via the internal Docker bridge network (`FASTAPI_BACKEND_URL: "http://backend:8000"`).
- **Client-Side Routing**: The browser connects to the public reverse proxy or BFF endpoint (`NEXT_PUBLIC_API_URL: "https://veridex.company.com"`).

### Standard Docker Compose Deployment

Create a secure production environment file `.env.production`:
```bash
# Application
VERIDEX_ENVIRONMENT="production"
VERIDEX_DEBUG="false"
VERIDEX_SECRET_KEY="<GENERATE-A-SECURE-64-CHARACTER-HEX-OR-BASE64-KEY>"
VERIDEX_CORS_ORIGINS='["https://veridex.company.com"]'

# Database
VERIDEX_DATABASE_URL="postgresql+asyncpg://veridex_prod:<PASSWORD>@postgres:5432/veridex_prod"

# Redis & Telemetry
VERIDEX_REDIS_URL="redis://redis:6379/0"
VERIDEX_OTEL_EXPORTER_ENDPOINT="http://otel-collector:4317"

# Frontend BFF
NEXT_PUBLIC_API_URL="https://veridex.company.com"
FASTAPI_BACKEND_URL="http://backend:8000"
```

Deploy services:
```bash
docker compose --env-file .env.production up -d --build
```

---

## 5. Reverse Proxy & Rate Limiting Guidelines (`SEC-06`)

Deploy NGINX, Cloudflare, or an AWS ALB upstream of the containers for TLS termination and application rate-limiting:

```nginx
# NGINX Rate Limiting Configuration
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;

server {
    listen 443 ssl http2;
    server_name veridex.company.com;

    ssl_certificate /etc/ssl/certs/veridex.crt;
    ssl_certificate_key /etc/ssl/private/veridex.key;

    # Sensitive Auth endpoints (brute-force protection)
    location /api/v1/auth/login {
        limit_req zone=auth_limit burst=10 nodelay;
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js Application & BFF proxy
    location / {
        limit_req zone=api_limit burst=200 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Healthchecks & Verification

Validate operational health across all platform tiers:

```bash
# 1. Backend Liveness & Database Readiness Check
curl -f https://veridex.company.com/api/v1/health

# Expected Response:
# {"status":"healthy","database":"connected","version":"0.1.0"}

# 2. Frontend BFF Health Verification
curl -f https://veridex.company.com/api/bff/health

# 3. OpenTelemetry Collector Health
curl -f http://localhost:8888/metrics
```

---

## 7. Disaster Recovery & Rollback Procedure

If unexpected degradation occurs post-deployment:
1. **Rollback Application Images**:
   ```bash
   docker compose down
   # Pull or restore prior release tag (v0.9.6)
   git checkout v0.9.6
   docker compose --env-file .env.production up -d
   ```
2. **Database Rollback (if schema change was applied)**:
   ```bash
   cd backend
   alembic downgrade -1
   ```
3. **Verify Integrity**:
   Run sanity check `curl -f http://localhost:8000/api/v1/health`.
