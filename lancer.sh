#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "[ERREUR] Node.js n'est pas installé. Installe-le depuis https://nodejs.org (v22+)"
  exit 1
fi
echo "Démarrage du serveur sur http://localhost:3000 (Ctrl+C pour arrêter)"
( sleep 1; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) ) &
node --experimental-sqlite server.js
