# syntax=docker/dockerfile:1
# 🏗️ Stage 1️⃣: Build
# --platform=$BUILDPLATFORM: this stage emits only static files (Vite SPA +
# Astro landing), nothing arch-specific — so multi-arch builds run the heavy
# JS build once natively instead of emulating it under QEMU per target arch.
# The production nginx stage stays flag-less so it builds per target arch.
FROM --platform=$BUILDPLATFORM node:25.9.0 AS build-stage

WORKDIR /app

# Deployment configuration (API origin, analytics keys, CSP hosts) enters at
# container start via the entrypoint's runtime env — it is NOT baked here.
# Build args carry only build-identity values. The Sentry source-map upload
# token is mounted as a BuildKit secret and is never an ARG or ENV value.
ARG VITE_SENTRY_RELEASE=
ARG VITE_APP_COMMIT_HASH=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy package files for workspaces
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/landing/package*.json ./packages/landing/

# Install dependencies
RUN npm ci

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY packages/landing ./packages/landing

# Build frontend SPA
WORKDIR /app/packages/frontend
# Allow constrained self-hosting builders to raise V8's heap only for this
# build step. Leaving the arg empty preserves Node's default elsewhere.
ARG FRONTEND_BUILD_NODE_OPTIONS=
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    set -eu; \
    { \
      printf '%s\n' \
        "VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE" \
        "VITE_APP_COMMIT_HASH=$VITE_APP_COMMIT_HASH" \
        "SENTRY_ORG=$SENTRY_ORG" \
        "SENTRY_PROJECT=$SENTRY_PROJECT"; \
      if [ -f /run/secrets/sentry_auth_token ]; then \
        printf 'SENTRY_AUTH_TOKEN='; \
        cat /run/secrets/sentry_auth_token; \
        printf '\n'; \
      fi; \
    } > /app/.env.production; \
    NODE_OPTIONS="$FRONTEND_BUILD_NODE_OPTIONS" npm run build; \
    rm -f /app/.env.production

# Build Astro landing
WORKDIR /app/packages/landing
RUN npm run build

# 🚀 Stage 2️⃣: Production
FROM nginx:1.27-alpine AS production-stage

# The Sentry release is the only baked runtime fallback: it must match the
# source maps CI uploaded while building this exact image, so it ships inside
# the image instead of being supplied per deployment. Everything else the
# entrypoint reads comes purely from the container's runtime env.
ARG VITE_SENTRY_RELEASE=
ENV DEFAULT_SENTRY_RELEASE=$VITE_SENTRY_RELEASE

# envsubst (gettext) renders CSP placeholders into nginx.conf at container start.
RUN apk add --no-cache gettext

# Create app directories with proper permissions
RUN mkdir -p /app /landing /etc/nginx/includes /etc/nginx/templates \
    && touch /etc/nginx/nginx.conf \
    && chown nginx:nginx /app /landing /etc/nginx/includes /etc/nginx/nginx.conf

# Copy built assets
COPY --from=build-stage --chown=nginx:nginx /app/packages/frontend/dist /app
COPY --from=build-stage --chown=nginx:nginx /app/packages/landing/dist /landing

# nginx.conf is a template here: the entrypoint envsubst's the CSP placeholders
# with the effective runtime values before nginx reads it.
COPY --chown=nginx:nginx packages/frontend/nginx.conf /etc/nginx/templates/nginx.conf.template

COPY self-hosting/frontend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use non-root user
USER nginx

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
