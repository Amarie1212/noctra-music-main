@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo ===================================================
echo   NOCTRA Desktop Builder (Zero-Touch Drive C)
echo ===================================================

:: Set all temp and cache directories to Drive W (project directory)
set "ROOT=%~dp0"
set "TEMP=%ROOT%.build-cache\temp"
set "TMP=%ROOT%.build-cache\temp"
set "ELECTRON_BUILDER_CACHE=%ROOT%.build-cache\electron-builder"
set "ELECTRON_CACHE=%ROOT%.build-cache\electron"
set "npm_config_cache=%ROOT%.build-cache\npm"

:: Ensure cache directories exist
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%ELECTRON_BUILDER_CACHE%" mkdir "%ELECTRON_BUILDER_CACHE%"
if not exist "%ELECTRON_CACHE%" mkdir "%ELECTRON_CACHE%"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"

:: Add pnpm and node to PATH
set "PATH=%LOCALAPPDATA%\pnpm-bin;C:\Program Files\nodejs;C:\nvm4w\nodejs;%PATH%"

echo [1/2] Bundling Electron and Renderer...
call "%LOCALAPPDATA%\pnpm-bin\pnpm.cmd" --dir apps\desktop build:bundle
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Bundling failed with code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo [2/2] Packaging Normal Installer...
call "%LOCALAPPDATA%\pnpm-bin\pnpm.cmd" --dir apps\desktop exec electron-builder --publish never
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed with code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

:: Clean temporary staging files
del /q /s /f "%TEMP%\*" >nul 2>&1

echo ===================================================
echo [SUCCESS] Build completed!
echo File installer berada di: release\NOCTRA-Setup.exe
echo ===================================================
pause

