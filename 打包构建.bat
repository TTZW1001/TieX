@echo off
chcp 65001 >nul 2>&1
title TieX - 打包构建

echo ========================================
echo   TieX - AI 智能体工作台
echo   打包构建
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
)

echo [步骤 1/3] TypeScript 类型检查...
call npx vue-tsc --noEmit
if %errorlevel% neq 0 (
    echo [错误] 类型检查失败，请修复后再试
    pause
    exit /b 1
)
echo [完成] 类型检查通过
echo.

echo [步骤 2/3] Vite 构建...
call npx vite build
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)
echo [完成] 构建成功
echo.

echo [步骤 3/3] electron-builder 打包（NSIS 安装程序）...
call npx electron-builder
if %errorlevel% neq 0 (
    echo [错误] 打包失败
    pause
    exit /b 1
)
echo.

echo ========================================
echo   打包完成！
echo   安装程序位于: release\ 目录
echo ========================================
echo.
dir release\*.exe 2>nul
echo.
pause
