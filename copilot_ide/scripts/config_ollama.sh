#!/bin/bash
export OLLAMA_MODELS="/mnt/d/ollama_models"
export OLLAMA_HOST="0.0.0.0:11434"

# Ensure no old process is running
pkill -f "ollama serve" || true
systemctl stop ollama 2>/dev/null || true

echo "Starting ollama server manually..."
nohup ollama serve > /tmp/ollama_serve.log 2>&1 &
sleep 5

echo "Pulling model..."
ollama pull codellama:7b-instruct
