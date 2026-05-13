#!/bin/sh
set -e

# =====================================================
# BINGO SYSTEM - Docker Entrypoint (Selfhosted)
# Supports both modes:
# 1. Supabase mode (VITE_SUPABASE_URL defined)
# 2. Selfhosted mode (VITE_API_BASE_URL defined)
# =====================================================

echo "============================================="
echo "BINGO SYSTEM - Inicializando..."
echo "============================================="

# Check mode
# Aceita chave do backend como VITE_SUPABASE_PUBLISHABLE_KEY (preferido) ou VITE_SUPABASE_ANON_KEY (legado)
SUPABASE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"
API_BASE_URL="${VITE_API_BASE_URL:-${VITE_API_URL:-}}"
API_BACKEND_HOST="${VITE_API_BACKEND_HOST:-backend:3001}"

if [ -n "$API_BASE_URL" ]; then
  echo "Modo: SELFHOSTED (PostgreSQL direto)"
  echo ""
  echo "Configuração detectada:"
  echo "  - API_BASE_URL: $API_BASE_URL"
  echo "  - BASIC_AUTH: ${VITE_BASIC_AUTH_USER:+(configurado)}"
  echo ""

  # Inject backend host into nginx proxy config
  sed -i \
    -e "s|__API_BACKEND_HOST__|${API_BACKEND_HOST}|g" \
    /etc/nginx/conf.d/default.conf

  # Replace placeholder values in JS files for selfhosted mode
  find /usr/share/nginx/html -type f -name "*.js" -exec sed -i \
    -e "s|__VITE_SUPABASE_URL__|${VITE_SUPABASE_URL:-}|g" \
    -e "s|__VITE_SUPABASE_ANON_KEY__|${VITE_SUPABASE_ANON_KEY:-}|g" \
    -e "s|__VITE_SUPABASE_PUBLISHABLE_KEY__|${SUPABASE_KEY}|g" \
    -e "s|__VITE_SUPABASE_PROJECT_ID__|${VITE_SUPABASE_PROJECT_ID:-}|g" \
    -e "s|__VITE_API_BASE_URL__|${API_BASE_URL}|g" \
    -e "s|__API_BACKEND_HOST__|${API_BACKEND_HOST}|g" \
    -e "s|__VITE_BASIC_AUTH_USER__|${VITE_BASIC_AUTH_USER:-}|g" \
    -e "s|__VITE_BASIC_AUTH_PASS__|${VITE_BASIC_AUTH_PASS:-}|g" \
    {} \;

elif [ -n "$VITE_SUPABASE_URL" ]; then
  echo "Modo: SUPABASE"
  echo ""
  echo "Configuração detectada:"
  echo "  - SUPABASE_URL: $VITE_SUPABASE_URL"
  echo "  - PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID:-local}"
  echo ""

  sed -i \
    -e "s|__API_BACKEND_HOST__|${API_BACKEND_HOST}|g" \
    /etc/nginx/conf.d/default.conf

  # Verificar variáveis obrigatórias
  if [ -z "$SUPABASE_KEY" ]; then
    echo "ERRO: Defina VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY)!"
    exit 1
  fi

  # Replace placeholder values in JS files for Supabase mode
  find /usr/share/nginx/html -type f -name "*.js" -exec sed -i \
    -e "s|__VITE_SUPABASE_URL__|${VITE_SUPABASE_URL}|g" \
    -e "s|__VITE_SUPABASE_ANON_KEY__|${VITE_SUPABASE_ANON_KEY:-}|g" \
    -e "s|__VITE_SUPABASE_PUBLISHABLE_KEY__|${SUPABASE_KEY}|g" \
    -e "s|__VITE_SUPABASE_PROJECT_ID__|${VITE_SUPABASE_PROJECT_ID:-local}|g" \
    -e "s|__VITE_API_BASE_URL__||g" \
    -e "s|__API_BACKEND_HOST__|${API_BACKEND_HOST}|g" \
    -e "s|__VITE_BASIC_AUTH_USER__||g" \
    -e "s|__VITE_BASIC_AUTH_PASS__||g" \
    {} \;
else
  echo "ERRO: Configure VITE_API_BASE_URL (ou legado VITE_API_URL) para selfhosted, ou VITE_SUPABASE_URL para Supabase!"
  exit 1
fi

echo "Variáveis injetadas com sucesso!"
echo ""
echo "============================================="
echo "Iniciando Nginx..."
echo "============================================="

# Start nginx
exec nginx -g 'daemon off;'
