# VERIDEX — Environment Configuration Specification

**Document Version:** 1.0.0  
**Release Target:** v0.9.7  

---

## 1. Overview

This document specifies the complete configuration matrix for the VERIDEX platform across all operational environments (`development`, `staging`, `production`).

Configuration is loaded through environment variables adhering to the Twelve-Factor App methodology.

---

## 2. Backend Environment Variables (FastAPI)

All backend configuration variables are declared in `backend/app/common/config.py` using `pydantic-settings`. Prefix: `VERIDEX_`.

| Variable Name | Type | Default Value | Production Requirement | Description |
|---|---|---|---|---|
| `VERIDEX_APP_NAME` | `string` | `"Veridex"` | Optional | Display name of the platform service. |
| `VERIDEX_APP_VERSION` | `string` | `"0.1.0"` | Optional | Application version. |
| `VERIDEX_ENVIRONMENT` | `string` | `"development"` | **Mandatory** (`production`) | Active environment runtime mode (`development`, `staging`, `production`). |
| `VERIDEX_DEBUG` | `boolean` | `false` | **Must be `false`** | Debug flag. Rejects startup if `true` in production (`SEC-05`). |
| `VERIDEX_LOG_LEVEL` | `string` | `"INFO"` | Recommended `"INFO"` or `"WARN"` | Log verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`). |
| `VERIDEX_HOST` | `string` | `"0.0.0.0"` | Standard container bind | Network interface for FastAPI Uvicorn binding. |
| `VERIDEX_PORT` | `integer` | `8000` | Standard internal port | HTTP port for FastAPI server. |
| `VERIDEX_DATABASE_URL` | `string` | `"postgresql+asyncpg://..."` | **Mandatory** | Asynchronous PostgreSQL connection string. |
| `VERIDEX_DATABASE_ECHO` | `boolean` | `false` | **Must be `false`** | Echo SQL statements to console. |
| `VERIDEX_DATABASE_POOL_SIZE`| `integer` | `10` | Tune for concurrency (e.g. 20) | SQLAlchemy connection pool base size. |
| `VERIDEX_DATABASE_MAX_OVERFLOW` | `integer` | `20` | Tune for burst load (e.g. 40) | SQLAlchemy pool maximum overflow connections. |
| `VERIDEX_REDIS_URL` | `string` | `"redis://localhost:6379/0"` | **Mandatory** | Redis connection URI for caching and distributed locks. |
| `VERIDEX_SECRET_KEY` | `string` | `"CHANGE-ME..."` | **Mandatory (>= 32 chars)** | Secret key used for JWT token signing. Enforced by `SEC-05`. |
| `VERIDEX_JWT_ALGORITHM` | `string` | `"HS256"` | Standard `"HS256"` | Cryptographic algorithm for JWT verification. |
| `VERIDEX_ACCESS_TOKEN_EXPIRE_MINUTES` | `integer` | `30` | Recommended `30` | Access token lifespan in minutes. |
| `VERIDEX_REFRESH_TOKEN_EXPIRE_MINUTES` | `integer` | `10080` (7 days) | Recommended `10080` | Refresh token lifespan in minutes. |
| `VERIDEX_AI_PROVIDER` | `string` | `"mock"` | Set to `"openai"` or cloud | AI Provider engine (`mock`, `openai`). |
| `VERIDEX_OPENAI_API_KEY`| `string` | `""` | Required if openai provider | API key for OpenAI model requests. |
| `VERIDEX_OTEL_ENABLED` | `boolean` | `true` | Recommended `true` | Flag to enable OpenTelemetry instrumentation. |
| `VERIDEX_OTEL_EXPORTER_ENDPOINT` | `string` | `"http://localhost:4317"` | Required if OTLP active | OTLP gRPC collector destination. |
| `VERIDEX_CORS_ORIGINS` | `JSON array` | `["http://localhost:3000"]` | **Mandatory strict list** | JSON list of allowed origins. No wildcards in production. |

---

## 3. Frontend Environment Variables (Next.js & BFF)

| Variable Name | Scope | Production Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Client & Server | `"https://veridex.company.com"` | Publicly accessible base URL for client-side API requests. |
| `FASTAPI_BACKEND_URL` | **Server-side BFF only** | `"http://backend:8000"` | Internal container network URL used by Node.js BFF proxy (`SEC-02`). |
| `NODE_ENV` | Server-side | `"production"` | Node.js runtime environment mode. |
| `PORT` | Container binding | `3000` | HTTP port for Next.js server. |

---

## 4. Production Security Hardening Requirements

1. **Deterministic Secret Keys**:
   Generate production secrets using a cryptographically secure pseudo-random generator:
   ```bash
   openssl rand -hex 32
   ```
2. **Container Isolation**:
   Do not expose PostgreSQL (`5432`) or Redis (`6379`) to public network interfaces. Only port `443` (via reverse proxy) and internal container ports should be accessible.
3. **Strict Content Security Policy (CSP)**:
   The Next.js frontend enforces modern HTTP security headers including `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and strict `SameSite=Strict` cookies.
