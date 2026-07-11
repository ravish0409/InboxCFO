# --- Stage 1: build the Vite bundle ---------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site. The app talks to the backend via relative /api paths, so no
# backend URL needs baking in here — nginx proxies /api at runtime (see nginx.conf.template).
COPY . .
RUN npm run build

# --- Stage 2: serve with nginx --------------------------------------------------------
FROM nginx:1.27-alpine

# nginx substitutes ${BACKEND_ORIGIN} from the environment into the config at container
# start (via its built-in envsubst on *.template files in this dir).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Where nginx proxies /api. Override to point the SPA at any backend (compose sets this
# to the backend service; for a split deploy set it to your API's public URL).
ENV BACKEND_ORIGIN=http://backend:8787

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
