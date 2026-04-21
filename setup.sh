#!/usr/bin/env bash
# NadaBramha — One-command setup (macOS / Linux)
# Usage: chmod +x setup.sh && ./setup.sh

set -e

echo ""
echo "  NadaBramha Setup"
echo "  ================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [x] Node.js not found. Install it from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | tr -d 'v')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "  [x] Node.js $NODE_VERSION is too old. NadaBramha needs v18+."
    exit 1
fi
echo "  [ok] Node.js v$NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "  [x] npm not found."
    exit 1
fi
echo "  [ok] npm $(npm -v)"

# Install dependencies
echo ""
echo "  Installing dependencies..."
npm install --loglevel=error
echo "  [ok] Dependencies installed"

# Build frontend
echo ""
echo "  Building frontend..."
npx vite build
echo "  [ok] Frontend built"

# Start
echo ""
echo "  Starting NadaBramha..."
echo ""
echo "  Open http://localhost:3901 in your browser"
echo ""

npm run dev
