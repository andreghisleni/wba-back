FROM oven/bun AS build

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock
COPY tsconfig.json tsconfig.json
COPY prisma.config.ts prisma.config.ts

RUN bun install

COPY ./prisma ./prisma

# Declare build args
ARG DATABASE_URL

# Set environment variable for Prisma
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client with correct binary targets
# RUN bun db:g
RUN bun db:m:d

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
# COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000