@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" "http://localhost:8000/"
  py -3 -m http.server 8000
  goto :end
)
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" "http://localhost:8000/"
  python -m http.server 8000
  goto :end
)
echo Python is not installed. Open index.html directly, or install Python 3 and run again.
pause
:end
