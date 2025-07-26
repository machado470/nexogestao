#!/bin/bash

check_file() {
  if [ -f "$1" ]; then
    echo "✅ $1 encontrado"
  else
    echo "❌ $1 NÃO encontrado – criando..."
    touch "$1"
  fi
}

echo "🔍 Verificação de arquivos e dependências..."

check_file ".env"
check_file ".env.example"
check_file "README.md"
check_file "package.json"
check_file "src/index.js"
check_file "src/App.tsx"
check_file "src/main.tsx"
check_file "routes/index.js"

# Corrige o package.json sem duplicar
jq '.' package.json > temp.json && mv temp.json package.json

echo "✅ Script de verificação executado com sucesso."
