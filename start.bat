@echo off
setlocal EnableExtensions EnableDelayedExpansion
echo Starting cOrd...
echo.

REM Check for repository updates
if exist ".git" (
    echo Checking for updates...
    git fetch origin >nul 2>nul

    for /f "usebackq tokens=* delims=" %%i in (`git rev-parse HEAD 2^>nul`) do set "LOCAL=%%i"
    for /f "usebackq tokens=* delims=" %%i in (`git rev-parse "@{u}" 2^>nul`) do set "REMOTE=%%i"

    if defined REMOTE if /I not "!LOCAL!"=="!REMOTE!" (
        echo Update available! Pulling latest changes...
        for /f "usebackq tokens=* delims=" %%i in (`git branch --show-current 2^>nul`) do set "BRANCH=%%i"
        if not defined BRANCH set "BRANCH=main"
        git pull origin "!BRANCH!" >nul 2>nul
        if errorlevel 1 (
            echo Warning: Could not pull updates. Continuing with current version.
        ) else (
            echo Update successful!
            if exist "dist\" (
                echo Rebuilding after update...
                call npm run build
            )
        )
    ) else (
        echo Already up to date.
    )
    echo.
)

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