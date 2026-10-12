#!/bin/bash
set -e

echo "Installing required dependencies (zstd)..."
apt-get update -y
apt-get install -y zstd

echo "Downloading Ollama installer..."
curl -fsSL https://ollama.com/install.sh -o /tmp/install_ollama_local.sh
chmod +x /tmp/install_ollama_local.sh

echo "Running Ollama installer..."
/tmp/install_ollama_local.sh

echo "Configuring Ollama to use D drive for storage..."
mkdir -p /mnt/d/ollama_models

if ! grep -q "OLLAMA_MODELS" ~/.bashrc; then
    echo 'export OLLAMA_MODELS="/mnt/d/ollama_models"' >> ~/.bashrc
    echo 'export OLLAMA_HOST="0.0.0.0:11434"' >> ~/.bashrc
fi

export OLLAMA_MODELS="/mnt/d/ollama_models"
export OLLAMA_HOST="0.0.0.0:11434"

echo "Starting Ollama server in background..."
# Stop existing service if it exists
systemctl stop ollama 2>/dev/null || true
pkill -f ollama || true

# Start ollama manually with custom path
OLLAMA_MODELS="/mnt/d/ollama_models" OLLAMA_HOST="0.0.0.0:11434" ollama serve > /tmp/ollama.log 2>&1 &
sleep 10

echo "Pulling codellama:7b-instruct model (this might take a few minutes)..."
OLLAMA_MODELS="/mnt/d/ollama_models" OLLAMA_HOST="0.0.0.0:11434" ollama pull codellama:7b-instruct

echo "Installation complete! Models are stored in /mnt/d/ollama_models."
