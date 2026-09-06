@echo off
setlocal
cd /d "%~dp0"
echo Running workspace debug build:
echo %CD%\release\win-unpacked\NOCTRA.exe
echo.
"%CD%\release\win-unpacked\NOCTRA.exe"
echo.
echo Process exited with code %ERRORLEVEL%
pause
