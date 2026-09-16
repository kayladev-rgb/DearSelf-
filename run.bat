@echo off
cd /d "%~dp0"
where python >nul 2>&1 && goto py
where py >nul 2>&1 && goto py2
echo Python is required for local PWA testing.
pause
exit /b 1
:py
start "" "http://localhost:8000"
python -m http.server 8000 --bind 127.0.0.1
exit /b
:py2
start "" "http://localhost:8000"
py -m http.server 8000 --bind 127.0.0.1
exit /b
