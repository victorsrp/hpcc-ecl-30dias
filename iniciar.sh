#!/usr/bin/env bash
# ECL 30 Dias - Mac e Linux. Uso: bash iniciar.sh
set -e
cd "$(dirname "$0")"

echo
echo "  ============================================"
echo "    ECL 30 DIAS  -  ninguém vem te salvar."
echo "  ============================================"
echo

command -v node >/dev/null || { echo "  Falta o Node.js. Instale a versão LTS em https://nodejs.org e rode de novo."; exit 1; }
command -v docker >/dev/null || { echo "  Falta o Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1; }

# 1) Docker Desktop
if ! docker info >/dev/null 2>&1; then
  echo "  Ligando o Docker Desktop..."
  (command -v open >/dev/null && open -a Docker) || systemctl --user start docker-desktop 2>/dev/null || true
fi

# 2) Cluster HPCC instalado? (só na primeira vez por máquina)
echo "  Esperando o Kubernetes do Docker..."
until kubectl --context docker-desktop get --raw /healthz >/dev/null 2>&1; do sleep 5; done
if ! kubectl --context docker-desktop get svc eclwatch >/dev/null 2>&1; then
  echo "  Não encontrei o cluster HPCC. Instalando agora (só na primeira vez)..."
  bash ferramentas/instalar-cluster.sh
fi

# 3) Espera o ECL Watch
echo "  Esperando o cluster HPCC (de 1 a 3 minutos; na primeira instalação, mais)..."
until curl -s -m 4 -o /dev/null http://127.0.0.1:8010/; do sleep 5; done
echo "  Cluster no ar: http://localhost:8010"

# 4) Dados de treino (só na primeira vez)
if [ ! -f .preparado ]; then
  echo "  Carregando os dados de treino no cluster..."
  node ferramentas/preparar.mjs && echo ok > .preparado
fi

# 5) Plataforma
URL=http://localhost:3030
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true ) >/dev/null 2>&1 &
node servidor.mjs
