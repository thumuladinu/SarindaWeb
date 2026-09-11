#!/bin/bash

# Chamika Rice Mill Release Helper Script
# Usage: ./release_mill.sh [version] [release_message]

# 1. Basic argument check
if [ -z "$1" ]; then
  echo "Error: Version argument is missing."
  echo "Usage: ./release_mill.sh <version> \"<release notes>\""
  echo "Example: ./release_mill.sh 1.0.0 \"Initial release of Chamika Rice Mill Desktop\""
  exit 1
fi

VERSION=$1
NOTES=${2:-"Maintenance release v$VERSION"}

echo "🚀 Starting Release Process for Chamika Rice Mill Desktop v$VERSION..."

# 2. Setup PATH & Node Environment (Force Node 22)
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 2>/dev/null || true
GH_CMD=$(which gh || echo "/opt/homebrew/bin/gh")

# 3. Update package.json version
echo "📝 Updating package.json version to $VERSION..."
npm version $VERSION --no-git-tag-version --allow-same-version

# 4. Build Windows Installer
echo "🔨 Building Windows Installer (this may take a while)..."
npm run dist:win

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting release."
    exit 1
fi

# 5. Check if build artifacts exist
EXE_FILE="./release/Chamika-Mill-Setup-$VERSION.exe"
BLOCKMAP_FILE="./release/Chamika-Mill-Setup-$VERSION.exe.blockmap"
LATEST_YML="./release/latest.yml"

if [ ! -f "$EXE_FILE" ]; then
    echo "❌ Error: Installer file not found at $EXE_FILE"
    exit 1
fi

# 6. Upload to GitHub Releases
echo "☁️ Uploading to GitHub releases..."
$GH_CMD release delete v$VERSION -y -R thumuladinu/chamika-mill-releases 2>/dev/null || true

$GH_CMD release create v$VERSION "$EXE_FILE" "$LATEST_YML" "$BLOCKMAP_FILE" \
    -R thumuladinu/chamika-mill-releases \
    --title "v$VERSION" \
    --notes "$NOTES"

if [ $? -eq 0 ]; then
    echo "✅ Release v$VERSION successful!"
    echo "Download link: https://github.com/thumuladinu/chamika-mill-releases/releases/tag/v$VERSION"
else
    echo "❌ GitHub release failed."
    exit 1
fi
