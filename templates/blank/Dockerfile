# syntax = docker/dockerfile:1

# Production Dockerfile for a FrogBot app using Next.js.
# Based on the Next.js with-docker example.
#
# - Detects your package manager from the lockfile you commit (npm, pnpm, or
#   yarn) -- the template ships no lockfile of its own.
# - Builds with Next.js standalone output (enabled via NEXT_OUTPUT below), so
#   the final image contains only the traced server -- no package manager and
#   no full node_modules -- and starts with plain `node server.js`.

ARG NODE_VERSION=22.17.0
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app


# Install dependencies only when needed
FROM base AS deps

# Packages needed to compile native modules (libsql, sharp) in case prebuilt
# binaries are unavailable for your platform
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* bun.lock* bun.lockb* ./
RUN \
  if [ -f yarn.lock ]; then corepack enable yarn && yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  elif [ -f bun.lock ] || [ -f bun.lockb ]; then echo "This Dockerfile does not support Bun yet. Generate an npm, pnpm, or yarn lockfile to build with Docker." && exit 1; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with standalone output (see next.config.mjs)
ENV NEXT_OUTPUT="standalone"

# Isolate build-time database access to a throwaway file so no local
# database is baked into the image, and satisfy config validation with a
# placeholder secret. Real values are provided as env vars at runtime.
ENV DATABASE_URL="file:/tmp/build.db"
ENV FROGBOT_SECRET="build-time-placeholder"

# `prebuild` generates the FrogBot import map, then `next build` compiles
RUN \
  if [ -f yarn.lock ]; then corepack enable yarn && yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Production image: copy the traced standalone output and run it with node
FROM base AS runner
ENV NODE_ENV="production"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT="3000" HOSTNAME="0.0.0.0"

# server.js is created by `next build` from the standalone output
CMD ["node", "server.js"]
