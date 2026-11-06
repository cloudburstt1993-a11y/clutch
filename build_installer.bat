@echo off
setlocal
cd /d "%~dp0"
title Build the Clutch installer
echo ============================================
echo   Building Clutch.exe and Clutch-Setup.exe
echo ============================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3.12 or 3.13 from python.org
  echo and tick "Add python.exe to PATH", then run this again.
  pause & exit /b 1
)
python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)"
if errorlevel 1 (
  echo Heads up: building works best with Python 3.10 - 3.13. Newer versions may fail
  echo to install pywebview. If the next step fails, install Python 3.13 and retry.
  echo.
)

echo [1/3] Installing build tools...
python -m pip install --upgrade pip >nul
python -m pip install --upgrade -r requirements.txt pyinstaller
if errorlevel 1 goto :fail

echo.
echo [2/3] Building Clutch.exe...
python -m PyInstaller --noconfirm --clean Clutch.spec
if errorlevel 1 goto :fail

rem ---- Optional code signing (stops "Windows protected your PC" warnings) ----
rem Make a file called sign.cmd next to this one that signs the file it's given, for example:
rem   @signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a %1
rem (use the full path to signtool.exe if it isn't on PATH). See README "Code signing".
if not exist sign.cmd goto :nosign_exe
echo Signing Clutch.exe...
call sign.cmd "dist\Clutch\Clutch.exe"
if errorlevel 1 goto :signfail
:nosign_exe

echo.
echo [3/3] Building the installer...
call :findiscc
if not defined ISCC (
  echo Inno Setup is not installed - installing it with winget...
  winget install -e --id JRSoftware.InnoSetup --accept-package-agreements --accept-source-agreements
  call :findiscc
)
if not defined ISCC (
  echo.
  echo Couldn't find Inno Setup. Clutch.exe is ready in dist\Clutch\ and you can run it from there.
  echo To get a proper installer, install Inno Setup 6 from jrsoftware.org and run this again.
  pause & exit /b 0
)
for /f "usebackq delims=" %%V in (`python clutch.py --version`) do set "CLUTCH_VER=%%V"
if not defined CLUTCH_VER set "CLUTCH_VER=10.0"
if not exist sign.cmd goto :build_unsigned
"%ISCC%" /DSIGN "/DAppVersion=%CLUTCH_VER%" "/Sclutchsign=$qcmd.exe$q /c $q$q%CD%\sign.cmd$q $f$q" installer.iss
goto :after_iscc
:build_unsigned
"%ISCC%" "/DAppVersion=%CLUTCH_VER%" installer.iss
:after_iscc
if errorlevel 1 goto :fail

echo.
echo Done! Your installer is in the installer_output folder.
start "" "%~dp0installer_output"
pause
exit /b 0

:signfail
echo Signing failed. Check sign.cmd and your certificate.
pause
exit /b 1

:findiscc
set "ISCC="
for %%P in ("%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 6\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe") do (
  if exist %%P set "ISCC=%%~P"
)
exit /b 0

:fail
echo.
echo Something went wrong - scroll up to see the error.
pause
exit /b 1
