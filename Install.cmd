@echo off
title Install School Dashboard
cd /d "%~dp0"

echo.
echo  School Dashboard setup
echo  ----------------------
echo  Running this again does a clean reinstall. Your saved settings are kept.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js isn't installed. Get the LTS version from https://nodejs.org
  echo  then double-click Install.cmd again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\stop-dashboard.ps1"
if exist ".next" rmdir /s /q ".next"

echo  Installing. This can take a few minutes...
echo.
rem npm ci starts from an empty node_modules and installs the exact versions in package-lock.json.
call npm ci --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo  Install failed. See the messages above.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\create-shortcut.ps1"

echo.
echo  Done! Opening the dashboard now. Next time, use the School Dashboard icon on your desktop.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher\start-dashboard.ps1"
timeout /t 5 >nul
