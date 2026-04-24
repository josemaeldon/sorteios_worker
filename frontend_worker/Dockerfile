# =====================================================
# BINGO SYSTEM - Frontend Docker Image
# Suporta modo Lovable Cloud (VITE_SUPABASE_URL) e modo Selfhosted (VITE_API_BASE_URL)
# =====================================================

# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copiar arquivos de dependências do frontend worker
COPY package*.json ./
COPY bun.lockb ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build com placeholders para substituição em runtime (via docker-entrypoint.sh)
ENV VITE_SUPABASE_URL=__VITE_SUPABASE_URL__
ENV VITE_SUPABASE_ANON_KEY=__VITE_SUPABASE_ANON_KEY__
ENV VITE_SUPABASE_PUBLISHABLE_KEY=__VITE_SUPABASE_PUBLISHABLE_KEY__
ENV VITE_SUPABASE_PROJECT_ID=__VITE_SUPABASE_PROJECT_ID__
ENV VITE_API_BASE_URL=__VITE_API_BASE_URL__
ENV VITE_BASIC_AUTH_USER=__VITE_BASIC_AUTH_USER__
ENV VITE_BASIC_AUTH_PASS=__VITE_BASIC_AUTH_PASS__

# Build da aplicação
RUN npm run build

# Production stage
FROM nginx:alpine

# Instalar utilitários (sed já existe; curl para healthcheck)
RUN apk add --no-cache curl

# Copiar configuração do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar arquivos buildados
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar script de entrypoint (injeção de env em runtime)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expor porta 80
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

