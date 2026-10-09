#!/usr/bin/env bash
# Executar uma vez na VM Oracle (Ubuntu 22.04/24.04, Ampere A1): instala Docker e libera 80/443.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# As imagens Ubuntu da Oracle trazem iptables com REJECT para tudo alem da porta 22.
for porta in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$porta" -m state --state NEW -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$porta" -m state --state NEW -j ACCEPT
  fi
done
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save

# Swap evita OOM durante o build do Maven em VMs pequenas.
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

mkdir -p ~/pibic
echo "VM pronta. Saia e entre de novo no SSH para usar docker sem sudo."
