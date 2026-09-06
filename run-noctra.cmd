@echo off
setlocal
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\pnpm-bin;C:\Program Files\nodejs;%PATH%"
"%LOCALAPPDATA%\pnpm-bin\pnpm.cmd" --dir apps\desktop dev
