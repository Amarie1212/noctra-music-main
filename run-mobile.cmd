@echo off
setlocal
title NOCTRA Mobile Preview

echo ========================================================
echo   NOCTRA Mobile Dev / PWA Server
echo ========================================================
echo.
echo Server akan berjalan di jaringan lokal.
echo Anda bisa membuka URL yang tampil di HP Android Anda
echo (pastikan HP dan PC berada di jaringan Wi-Fi yang sama).
echo.
echo Di Chrome Android, ketuk menu titik tiga (:) lalu pilih
echo "Install app" atau "Tambahkan ke Layar Utama".
echo.
echo Tekan Ctrl+C untuk menghentikan server.
echo ========================================================
echo.

set "PNPM_CMD=%LOCALAPPDATA%\pnpm-bin\pnpm.cmd"
if not exist "%PNPM_CMD%" set "PNPM_CMD=pnpm"

"%PNPM_CMD%" --dir apps/mobile dev --host

pause

