# ─── ForgeKeep Discord Bot — Fly.io image ────────
# Multi-stage: the build stage carries pnpm and the full workspace; the runtime
# stage carries only what the bot needs to execute.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ─── Dependencies ────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy only manifests first so this layer caches until a dependency actually
# changes — source edits then don't trigger a full reinstall.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# --ignore-scripts: @guild/db's postinstall runs `prisma generate`, which needs
# the schema — not copied yet. Generation happens explicitly below.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .

# Generate the Prisma client against the real schema.
RUN pnpm --filter @guild/db exec prisma generate

# Typecheck as a build gate: a type error should fail the image, not the deploy.
RUN pnpm --filter @guild/bot exec tsc --noEmit

# ─── Runtime ─────────────────────────────────────
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged. The node image ships a `node` user; use it rather than root.
COPY --from=build --chown=node:node /app /app
USER node

# The bot is a gateway client — it exposes no ports and serves no traffic.
# Health is "is the process alive", which Fly derives from the process itself.
CMD ["pnpm", "--filter", "@guild/bot", "start"]
