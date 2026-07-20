@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing the Sin City RP desktop runtime...
  call npm install
  if errorlevel 1 goto :failed
)

call npm run electron
exit /b %errorlevel%

:failed
echo The desktop game could not start. Review the error above.
pause
exit /b 1
