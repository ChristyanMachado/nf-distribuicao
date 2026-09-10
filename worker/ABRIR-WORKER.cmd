@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Execute INSTALAR.cmd primeiro.
  pause
  exit /b 1
)
start "" ".venv\Scripts\pythonw.exe" -m operador.app
