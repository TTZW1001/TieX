@echo off
setlocal
cd /d "%~dp0"

title TieX - Build Package

echo ========================================
echo   TieX - Build Package
echo ========================================
echo.

if /i "%~1"=="--check" (
    echo [OK] Batch script is readable by cmd.exe.
    exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Please install Node.js 18 or later.
    echo         https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found. Please check your Node.js installation.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] node_modules was not found. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo [1/3] Type checking...
call npm run typecheck
if errorlevel 1 (
    echo.
    echo [ERROR] Type checking failed.
    pause
    exit /b 1
)
echo [OK] Type checking passed.
echo.

echo [2/3] Running frontend build...
call npx vite build
if errorlevel 1 (
    echo.
    echo [ERROR] Vite build failed.
    pause
    exit /b 1
)
echo [OK] Frontend build completed.
echo.

echo [3/3] Packaging with electron-builder...
call npx electron-builder
if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)
echo.

echo ========================================
echo   Build completed.
echo   Installer directory: release\
echo ========================================
echo.

if exist "release\*.exe" (
    dir "release\*.exe"
) else (
    echo [WARN] No installer exe was found in release\.
)

echo.
pause
endlocal
