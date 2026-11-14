@echo off
rem Instala o cluster HPCC 10.8.2 no Kubernetes do Docker Desktop (so uma vez por PC).
rem Pre-requisitos: Docker Desktop com Kubernetes ligado e o Helm instalado.
setlocal
cd /d "%~dp0\.."

where kubectl >nul 2>nul
if errorlevel 1 (
  echo  Nao achei o kubectl. Ligue o Kubernetes no Docker Desktop: Settings ^> Kubernetes ^> Enable Kubernetes.
  exit /b 1
)
where helm >nul 2>nul
if errorlevel 1 (
  echo  Falta o Helm. Instale com:  winget install Helm.Helm   ^(depois feche e abra o terminal^)
  exit /b 1
)

kubectl config use-context docker-desktop >nul 2>nul
kubectl get --raw /healthz >nul 2>nul
if errorlevel 1 (
  echo  O Kubernetes do Docker Desktop nao respondeu. Abra o Docker Desktop, espere o Kubernetes ficar verde e rode de novo.
  exit /b 1
)

helm status mycluster >nul 2>nul
if not errorlevel 1 (
  echo  O cluster HPCC ^(mycluster^) ja esta instalado. Nada a fazer.
  exit /b 0
)

echo  Baixando os charts oficiais da HPCC Systems...
helm repo add hpcc https://hpcc-systems.github.io/helm-chart/ >nul 2>nul
helm repo update hpcc
if errorlevel 1 exit /b 1

echo  Criando os volumes de dados...
helm install localfile hpcc/hpcc-localfile --version 0.1.0 --set common.hostpath=/hpccdata
if errorlevel 1 exit /b 1

echo  Instalando o HPCC 10.8.2 ^(o download das imagens leva de 5 a 15 minutos^)...
helm install mycluster hpcc/hpcc --version 10.8.2 -f ferramentas\cluster\valores-localfile.yaml
if errorlevel 1 exit /b 1

echo  Pronto. Os servicos vao subindo sozinhos; o iniciar.bat espera o ECL Watch ^(http://localhost:8010^) responder.
