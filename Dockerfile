# ── Strategaize Blueprint Plattform — Production Dockerfile ─────────────
# Multi-stage build for minimal image size.
# Production port: 3000 (Coolify maps to 443 via reverse proxy)

# ── Stage 1: Dependencies ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build ─────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY src/ ./src/
COPY public/ ./public/
COPY next.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.mjs ./
COPY components.json ./

# Build Next.js (standalone output)
RUN npm run build

# ── Stage 3: Production ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app (standalone output)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# pdf-parse and mammoth use require() and are not bundled by Next.js standalone
# serverExternalPackages in next.config.ts is the primary fix; COPY is fallback
COPY --from=builder /app/node_modules/pdf-parse/ ./node_modules/pdf-parse/
COPY --from=builder /app/node_modules/mammoth/ ./node_modules/mammoth/

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
