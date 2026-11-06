@echo off
cd /d "%~dp0"
title Clutch - input test
echo Live view of what your controller sends (IN) and what your profile turns it into (OUT).
echo Nothing is sent to games in this mode. Ctrl+C to stop.
echo.
python clutch.py --list
python clutch.py --test --no-panel --no-crosshair %*
pause
