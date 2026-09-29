# Veridex Frontend Dockerfile
# Multi-stage build for Next.js

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============================================
# Stage 3: Runner
# ============================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Security: run as non-root
RUN addgroup --system --gid 1001 veridex && \
    adduser --system --uid 1001 veridex

COPY --from=builder /app/public ./public
COPY --from=builder --chown=veridex:veridex /app/.next/standalone ./
COPY --from=builder --chown=veridex:veridex /app/.next/static ./.next/static

USER veridex

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
