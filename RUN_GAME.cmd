@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required to run Sin City RP.
  pause
  exit /b 1
)

if not exist "node_modules\three\package.json" (
  echo Installing game runtime...
  call npm install
  if errorlevel 1 goto :failed
)

echo Building Sin City RP...
call npm run build
if errorlevel 1 goto :failed

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } }; exit 1" >nul 2>nul
if errorlevel 1 (
  echo Starting the city server...
  start "Sin City RP Server" /min cmd /c "npm run preview -- --port 4173"
  timeout /t 2 /nobreak >nul
)

start "" "http://127.0.0.1:4173"
echo Sin City RP is running at http://127.0.0.1:4173
exit /b 0

:failed
echo The game could not start. Review the error above.
pause
exit /b 1
