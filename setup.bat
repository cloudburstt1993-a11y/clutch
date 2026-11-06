@echo off
cd /d "%~dp0"
title Clutch setup
echo Installing what Clutch needs to run from source...
python --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3.12 or 3.13 from python.org and tick "Add python.exe to PATH".
  pause & exit /b 1
)
python -m pip install --upgrade pip
python -m pip install --upgrade -r requirements.txt
if errorlevel 1 ( echo. & echo Install failed - see the errors above. & pause & exit /b 1 )
echo.
echo Done. If a ViGEmBus driver installer popped up, finish it.
echo Run run_app.bat to open Clutch, or build_installer.bat to make an installer.
pause
