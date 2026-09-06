@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
node noctra-dev.cjs
exit /b %ERRORLEVEL%
