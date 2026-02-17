FROM oven/bun AS build

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Cache packages installation
COPY package.json bun.lock tsconfig.json prisma.config.ts ./
RUN bun install

COPY ./prisma ./prisma

# --- O TRUQUE ACONTECE AQUI ---
# 1. Recebe a URL EXTERNA do Easypanel durante o build
ARG EXTERNAL_DB_URL
# 2. Define ela temporariamente como DATABASE_URL para o Prisma
ENV DATABASE_URL=$EXTERNAL_DB_URL

# 3. Gera o client e roda a migration usando a rede externa
# RUN bun db:g
RUN bun db:m:d
# ------------------------------

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build ./src/http/index.ts \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile server

FROM debian:bullseye-slim

WORKDIR /app

# Install required system libraries for Prisma
RUN apt-get update -y && \
    apt-get install -y \
    openssl \
    ca-certificates \
    libgcc-s1 \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000