@echo off
setlocal
title ECL 30 DIAS
cd /d "%~dp0"

echo.
echo  ============================================
echo    ECL 30 DIAS  -  ninguem vem te salvar.
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Falta o Node.js. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

rem 1) Docker Desktop (o cluster HPCC roda no Kubernetes dele)
docker info >nul 2>&1
if errorlevel 1 (
  echo  Ligando o Docker Desktop...
  if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
    start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
  ) else if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo  Nao achei o Docker Desktop. Instale em https://www.docker.com/products/docker-desktop/ e veja o README.
    pause
    exit /b 1
  )
)

rem 2) Cluster HPCC instalado? (so na primeira vez por PC)
echo  Esperando o Kubernetes do Docker...
:k8s
kubectl --context docker-desktop get --raw /healthz >nul 2>&1
if errorlevel 1 (
  timeout /t 5 /nobreak >nul
  goto k8s
)
kubectl --context docker-desktop get svc eclwatch >nul 2>&1
if errorlevel 1 (
  echo  Nao encontrei o cluster HPCC. Instalando agora ^(so na primeira vez^)...
  call ferramentas\instalar-cluster.bat
  if errorlevel 1 ( pause & exit /b 1 )
)

rem 3) Espera o ECL Watch responder
echo  Esperando o cluster HPCC ^(de 1 a 3 minutos depois de ligar o PC; na primeira instalacao, mais^)...
:espera
curl -s -m 4 -o nul http://127.0.0.1:8010/
if errorlevel 1 (
  timeout /t 5 /nobreak >nul
  goto espera
)
echo  Cluster no ar: http://localhost:8010

rem 4) Dados de treino (so na primeira vez)
if not exist ".preparado" (
  echo  Carregando os dados de treino no cluster...
  node ferramentas\preparar.mjs && echo ok> .preparado
)

rem 5) Plataforma
start "" http://localhost:3030
node servidor.mjs
