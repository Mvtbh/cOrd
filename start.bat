@echo off
echo Starting cOrd...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo After installing, restart this script.
    echo.
    echo Press any key to open the Node.js download page...
    pause >nul
    start https://nodejs.org/en/download/
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

if not exist "dist\" (
    echo Building TypeScript...
    call npm run build
    echo.
)

if not exist ".env" (
    echo Error: .env file not found!
    echo Please create a .env file with your configuration.
    echo Check README.md for setup instructions.
    pause
    exit /b 1
)

echo Starting bot...
node dist/index.js