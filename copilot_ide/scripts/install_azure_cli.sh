#!/usr/bin/env bash
# ==============================================================================
# Helper Script: Install Azure CLI across Linux distributions
# Supports: Arch / CachyOS / Manjaro, Ubuntu / Debian, Fedora / RHEL
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "❌ Please run with sudo: sudo bash $0"
   exit 1
fi

echo "🔍 Detecting Linux distribution..."

if command -v pacman &>/dev/null; then
    echo "📦 Arch Linux / CachyOS detected. Installing azure-cli via pacman..."
    pacman -S --noconfirm --needed azure-cli
elif command -v apt-get &>/dev/null; then
    echo "📦 Debian / Ubuntu detected. Installing azure-cli..."
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash
elif command -v dnf &>/dev/null; then
    echo "📦 Fedora / RHEL detected. Installing azure-cli..."
    rpm --import https://packages.microsoft.com/keys/microsoft.asc
    dnf install -y azure-cli
else
    echo "❌ Unsupported package manager. Please install Azure CLI manually: https://aka.ms/installazureclilinux"
    exit 1
fi

echo "=========================================================="
echo "✅ Azure CLI installed successfully!"
echo "👉 Next step: Run 'az login' to authenticate with your student account."
echo "=========================================================="
