#!/usr/bin/env bash
# ==============================================================================
# Archon Cloud VM Automated Setup Script (Ubuntu 22.04 / 24.04 LTS)
# Configures swap, installs Docker Engine + Compose, sets up firewall rules.
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🚀 Archon Cloud VM Provisioning Started"
echo "=========================================================="

# 1. Require root or sudo privileges
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run with sudo or as root."
   echo "👉 Please run: sudo bash $0"
   exit 1
fi

TARGET_USER="${SUDO_USER:-$USER}"

# 2. Configure 4GB Swap Space if not present (prevents OOM during build/download)
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
if [[ "$SWAP_TOTAL" -lt 2000 ]]; then
    echo "⚙️ Configuring 4GB swap space to ensure smooth Docker builds..."
    if [[ ! -f /swapfile ]]; then
        fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        echo "✅ 4GB swap space created and enabled."
    else
        echo "ℹ️ /swapfile already exists. Skipping swap creation."
    fi
else
    echo "✅ Sufficient swap already allocated (${SWAP_TOTAL} MB)."
fi

# 3. Update system and install essential tools
echo "📦 Updating package repositories..."
apt-get update -y
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    ufw \
    git \
    htop

# 4. Install Docker Engine and Docker Compose (if not present)
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker Engine from official repository..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker
    echo "✅ Docker Engine installed successfully."
else
    echo "✅ Docker already installed ($(docker --version))."
fi

# 5. Add user to docker group
if [[ -n "$TARGET_USER" ]] && id "$TARGET_USER" &>/dev/null; then
    usermod -aG docker "$TARGET_USER" || true
    echo "✅ User '$TARGET_USER' added to the docker group."
fi

# 6. Configure UFW Firewall
echo "🛡️ Configuring UFW firewall rules..."
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP / Caddy'
ufw allow 443/tcp comment 'HTTPS / Caddy'
ufw allow 3000/tcp comment 'Archon UI'
ufw allow 8000/tcp comment 'Archon Orchestrator Gateway'
ufw allow 8004/tcp comment 'ArcGen Service'
ufw --force enable
echo "✅ UFW firewall active and configured."

echo "=========================================================="
echo "🎉 VM Setup Complete!"
echo "=========================================================="
echo "Next steps:"
echo "1. Log out and log back in (or run 'newgrp docker') so group permissions apply."
echo "2. Navigate to your Archon copilot_ide directory:"
echo "   cd copilot_ide"
echo "3. Copy the production environment template:"
echo "   cp .env.production.example .env"
echo "4. Add your API keys (e.g. GROQ_API_KEY) in .env:"
echo "   nano .env"
echo "5. Launch the stack:"
echo "   docker compose -f docker-compose.prod.yml up -d --build"
echo "=========================================================="
