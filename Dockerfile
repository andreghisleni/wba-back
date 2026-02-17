# --- Fase 1: Build ---
FROM oven/bun AS build

WORKDIR /app

# Instalar OpenSSL para o Prisma
RUN apt-get update -y && apt-get install -y openssl

# Fazer cache da instalação de pacotes
COPY package.json bun.lock tsconfig.json prisma.config.ts ./
COPY ./prisma ./prisma

RUN bun install

# GERAR o Prisma Client (Não precisa de DATABASE_URL real aqui, não tente conectar ao banco)
# RUN bun db:g

# Copiar o resto do código
COPY ./src ./src

ENV NODE_ENV=production

# Compilar o binário
RUN bun build ./src/http/index.ts \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile server


# --- Fase 2: Runtime (Produção) ---
# Usar o Bun slim em vez do Debian puro para podermos rodar o Prisma CLI no startup
FROM oven/bun:slim

WORKDIR /app

# Instalar dependências de sistema necessárias para o Prisma em produção
RUN apt-get update -y && \
    apt-get install -y \
    openssl \
    ca-certificates \
    libgcc-s1 \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

# Copiar o binário compilado do estágio de build
COPY --from=build /app/server ./server

# Copiar a pasta prisma (essencial para rodar as migrations na inicialização)
COPY --from=build /app/prisma ./prisma

ENV NODE_ENV=production

EXPOSE 3000

# O PULO DO GATO:
# Primeiro ele roda a migration (já dentro da rede interna do Easypanel)
# Se der sucesso (&&), ele inicia o seu servidor compilado.
CMD ["sh", "-c", "bun db:m:d && ./server"]