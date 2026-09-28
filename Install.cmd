@echo off
title Install School Dashboard
cd /d "%~dp0"

echo.
echo  School Dashboard setup
echo  ----------------------
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

echo  Installing. This can take a few minutes the first time...
echo.
call npm install --no-fund --no-audit
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
