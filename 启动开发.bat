@echo off
chcp 65001 >nul 2>&1
title TieX - 开发模式启动

echo ========================================
echo   TieX - AI 智能体工作台
echo   开发模式启动
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

:: 重新编译原生模块以匹配 Electron 的 Node.js 版本
echo [准备] 重新编译 better-sqlite3 以匹配 Electron...
set npm_config_runtime=electron
set npm_config_target=29.4.6
set npm_config_disturl=https://electronjs.org/headers
cd node_modules\better-sqlite3
call npx node-gyp rebuild --release >nul 2>&1
cd ..\..\
echo.

echo [启动] 正在启动开发服务器...
echo.
call npm run dev
