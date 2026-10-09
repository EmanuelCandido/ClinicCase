#!/usr/bin/env bash
# Envia o codigo para a VM e (re)sobe os containers. Uso, a partir de SistemaAPI_PIBIC:
#   VM=ubuntu@<ip> ./deploy/publicar.sh
set -euo pipefail
: "${VM:?Informe VM=usuario@ip}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/oracle_pibic}"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$VM")

raiz="$(cd "$(dirname "$0")/.." && pwd)"
pacote="$(mktemp -d)/pibic.tar.gz"
tar -czf "$pacote" -C "$raiz" \
  --exclude='Sistema_Crud_API_PIBIC/target' --exclude='*/.idea' --exclude='deploy/.env' \
  Sistema_Crud_API_PIBIC deploy

scp -i "$CHAVE" "$pacote" "$VM:~/pibic.tar.gz"
"${SSH[@]}" 'set -e
  mkdir -p ~/pibic && tar -xzf ~/pibic.tar.gz -C ~/pibic && rm ~/pibic.tar.gz
  test -f ~/pibic/deploy/.env || { echo "Falta ~/pibic/deploy/.env na VM"; exit 1; }
  cd ~/pibic/deploy && docker compose up -d --build && docker compose ps'
