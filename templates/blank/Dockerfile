# syntax = docker/dockerfile:1

# Production Dockerfile for a FrogBot app (Next.js + Payload).
#
# - Runs the FULL build inside Docker (`pnpm build`), so nothing is compiled
#   at container start. No runtime `next build` / generate step is needed.
# - Keeps `typescript` available during the build, then prunes it for the
#   final image. FrogBot does not require TypeScript at runtime.
# - Adds the native/externalized packages Payload's `withPayload` opts out of
#   bundling (libsql, sharp, pino, drizzle-kit, json-schema-to-typescript) as
#   direct dependencies in package.json so pnpm links them at the project
#   root. Do not remove them.

ARG NODE_VERSION=22.17.0
FROM node:${NODE_VERSION}-slim AS base

# Next.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Install pnpm
ARG PNPM_VERSION=10.28.1
RUN npm install -g pnpm@$PNPM_VERSION


# Throw-away build stage to reduce the size of the final image
FROM base AS build

# Install packages needed to build native modules (libsql, sharp)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY . .

# Build application (`prebuild` generates the importmap, then `next build`)
RUN pnpm build

# Remove development dependencies (typescript, etc.) from the final image
RUN pnpm prune --prod


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "pnpm", "run", "start" ]