#!/bin/bash

ROOT="src"
COMPONENTES=("components" "components/PDV")
PAGINAS=("pages" "pages/Auth.tsx" "pages/Dashboard.tsx")
ROTAS=("routes/index.tsx")
ESTILO=("App.css" "index.css")
ARQUIVOS_BASE=("App.tsx" "main.tsx")

echo -e "\n📁 Pastas e arquivos esperados:\n"

for path in "${COMPONENTES[@]}" "${PAGINAS[@]}" "${ROTAS[@]}" "${ESTILO[@]}" "${ARQUIVOS_BASE[@]}"; do
  if [ -e "$ROOT/$path" ]; then
    echo "✅ Existe: $ROOT/$path"
  else
    echo "❌ Faltando: $ROOT/$path"
  fi
done

echo -e "\n✔️ Verificação concluída.\n"
