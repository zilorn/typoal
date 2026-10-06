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
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:42731/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:42732/api/health || exit 1
CMD ["/app/typoal"]
