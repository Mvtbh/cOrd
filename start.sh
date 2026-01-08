#!/bin/bash

# Check for repository updates
if [ -d ".git" ]; then
    echo "Checking for updates..."
    git fetch origin 2>/dev/null
    
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse @{u} 2>/dev/null)
    
    if [ "$LOCAL" != "$REMOTE" ] && [ -n "$REMOTE" ]; then
        echo "Update available! Pulling latest changes..."
        git pull origin $(git branch --show-current) 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "Update successful!"
            # Rebuild if dist exists (TypeScript project)
            if [ -d "dist" ]; then
                echo "Rebuilding after update..."
                npm run build
            fi
        else
            echo "Warning: Could not pull updates. Continuing with current version."
        fi
    else
        echo "Already up to date."
    fi
    echo ""
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed!"
    echo "Installing Node.js..."
    
    # Detect package manager and install Node.js
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian|linuxmint|pop)
                echo "Detected Debian/Ubuntu-based Distro"
                curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                sudo apt-get install -y nodejs
                ;;
            fedora|rhel|centos|rocky|almalinux)
                echo "Detected Red Hat-based Distro"
                curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
                sudo dnf install -y nodejs
                ;;
            arch|manjaro)
                echo "Detected Arch-based Distro"
                sudo pacman -S --noconfirm nodejs npm
                ;;
            opensuse*|sles)
                echo "Detected openSUSE Distro"
                sudo zypper install -y nodejs18
                ;;
            *)
                echo "Unknown distribution. Please install Node.js 18+ manually from https://nodejs.org/"
                exit 1
                ;;
        esac
    else
        echo "Could not detect OS. Please install Node.js 18+ manually from https://nodejs.org/"
        exit 1
    fi
    
    # Verify installation
    if ! command -v node &> /dev/null; then
        echo "Failed to install Node.js. Please install it manually from https://nodejs.org/"
        exit 1
    fi
    
    echo "Node.js installed successfully!"
    echo ""
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

if [ ! -d "dist" ]; then
    echo "Building TypeScript..."
    npm run build
    echo ""
fi

if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please create a .env file with your configuration."
    echo "Check README.md for setup instructions."
    exit 1
fi

echo "Starting bot..."
node dist/index.js