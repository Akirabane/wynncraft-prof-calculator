@echo off
title Calculateur Professions Wynncraft
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERREUR] Node.js n'est pas installe.
  echo  Telecharge-le ici : https://nodejs.org  ^(version 22 ou plus recente^)
  echo.
  pause
  exit /b 1
)

echo.
echo  Demarrage du serveur...
echo  Le navigateur va s'ouvrir sur http://localhost:3000
echo  ^(Garde cette fenetre ouverte. Ferme-la pour arreter le serveur.^)
echo.

start "" http://localhost:3000
node --experimental-sqlite server.js

echo.
echo  Le serveur s'est arrete.
pause
