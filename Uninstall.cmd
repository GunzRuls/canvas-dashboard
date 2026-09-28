@echo off
title Uninstall School Dashboard
set "HERE=%~dp0"
cd /d "%TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%launcher\uninstall.ps1"
pause
exit
