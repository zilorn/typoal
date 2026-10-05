FROM node:24-alpine AS web-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=42731 API_URL=http://api:42732
COPY --from=web-build --chown=node:node /app/.output ./.output
USER node
EXPOSE 42731
# Probe often while starting so the container is marked healthy as soon as the
# server answers, and keep a long start period so a busy host cannot mark it
# unhealthy before the first successful check. See the api healthcheck below.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --start-interval=3s --retries=8 CMD node -e "fetch('http://127.0.0.1:42731/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]

FROM golang:1.26-alpine AS api-build
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /typoal ./cmd/blog

FROM alpine:3.23 AS api
RUN apk add --no-cache ca-certificates && addgroup -S typoal && adduser -S -G typoal typoal && mkdir /data && chown typoal:typoal /data
WORKDIR /app
COPY --from=api-build /typoal /app/typoal
ENV API_ADDR=0.0.0.0:42732 DATABASE_PATH=/data/blog.db
USER typoal
EXPOSE 42732
# The api seeds the database and password on first start, and a `compose up
# --build` leaves the host busy, so probes can time out for a while. Failures
# during the start period do not count, and probing every few seconds means
# `depends_on: service_healthy` releases the web service as soon as the api is
# actually ready instead of waiting a full 30s interval.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --start-interval=3s --retries=8 CMD wget -q -O /dev/null http://127.0.0.1:42732/api/health || exit 1
CMD ["/app/typoal"]
