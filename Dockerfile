FROM --platform=linux/amd64 node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:20-alpine AS native
WORKDIR /tmp
RUN apk add --no-cache python3 make g++ && \
    npm install better-sqlite3@12.6.2 --build-from-source

FROM --platform=linux/amd64 node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Litestream
RUN apk add --no-cache ca-certificates wget && \
    wget -q https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz -O /tmp/litestream.tar.gz && \
    tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin && \
    rm /tmp/litestream.tar.gz

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/migrations ./src/migrations

# Copy natively built better-sqlite3 binary
COPY --from=native /tmp/node_modules/better-sqlite3/build/Release/better_sqlite3.node ./node_modules/better-sqlite3/build/Release/better_sqlite3.node

# Copy deployment config
COPY litestream.yml /etc/litestream.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
