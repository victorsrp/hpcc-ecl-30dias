#!/usr/bin/env bash
# Instala o cluster HPCC 10.8.2 no Kubernetes do Docker Desktop (só uma vez por máquina).
# Pré-requisitos: Docker Desktop com Kubernetes ligado e o Helm instalado.
set -e
cd "$(dirname "$0")/.."

command -v kubectl >/dev/null || { echo "  Não achei o kubectl. Ligue o Kubernetes no Docker Desktop: Settings > Kubernetes > Enable Kubernetes."; exit 1; }
command -v helm >/dev/null || { echo "  Falta o Helm. Mac: brew install helm | Linux: https://helm.sh/docs/intro/install/"; exit 1; }

kubectl config use-context docker-desktop >/dev/null 2>&1 || true
kubectl get --raw /healthz >/dev/null 2>&1 || { echo "  O Kubernetes não respondeu. Abra o Docker Desktop, espere o Kubernetes ficar verde e rode de novo."; exit 1; }

if helm status mycluster >/dev/null 2>&1; then
  echo "  O cluster HPCC (mycluster) já está instalado. Nada a fazer."
  exit 0
fi

echo "  Baixando os charts oficiais da HPCC Systems..."
helm repo add hpcc https://hpcc-systems.github.io/helm-chart/ >/dev/null 2>&1 || true
helm repo update hpcc

echo "  Criando os volumes de dados..."
helm install localfile hpcc/hpcc-localfile --version 0.1.0 --set common.hostpath=/hpccdata

echo "  Instalando o HPCC 10.8.2 (o download das imagens leva de 5 a 15 minutos)..."
helm install mycluster hpcc/hpcc --version 10.8.2 -f ferramentas/cluster/valores-localfile.yaml

echo "  Pronto. Os serviços vão subindo sozinhos; o iniciar.sh espera o ECL Watch (http://localhost:8010) responder."
