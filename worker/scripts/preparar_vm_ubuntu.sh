#!/usr/bin/env bash
# Prepara uma VM Ubuntu dedicada ao Worker Graalyst.
#
# O script e idempotente: pode ser executado novamente depois de uma falha.
# Ele nao copia segredos, nao inicia o Worker e nao abre portas da aplicacao.

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute com sudo: sudo bash scripts/preparar_vm_ubuntu.sh" >&2
  exit 1
fi

usuario_operador="${SUDO_USER:-ubuntu}"
swap_gb="${SWAP_GB:-4}"

if ! id "${usuario_operador}" >/dev/null 2>&1; then
  echo "Usuario operador inexistente: ${usuario_operador}" >&2
  exit 1
fi

if ! [[ "${swap_gb}" =~ ^[2-8]$ ]]; then
  echo "SWAP_GB deve ser um inteiro entre 2 e 8." >&2
  exit 1
fi

echo "[1/6] Configurando fuso horario"
timedatectl set-timezone America/Sao_Paulo

echo "[2/6] Configurando ${swap_gb} GB de swap"
if [[ ! -f /swapfile ]]; then
  if ! fallocate -l "${swap_gb}G" /swapfile; then
    dd if=/dev/zero of=/swapfile bs=1M count="$((swap_gb * 1024))" status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
fi

chmod 600 /swapfile
if ! swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
  swapon /swapfile
fi
if ! grep -Fq '/swapfile none swap sw 0 0' /etc/fstab; then
  printf '%s\n' '/swapfile none swap sw 0 0' >>/etc/fstab
fi
printf '%s\n' 'vm.swappiness=20' >/etc/sysctl.d/99-graalyst-worker.conf
sysctl --system >/dev/null

echo "[3/6] Atualizando indice e instalando dependencias basicas"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw unattended-upgrades

echo "[4/6] Configurando repositorio oficial do Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# shellcheck disable=SC1091
. /etc/os-release
codinome_ubuntu="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
arquitetura="$(dpkg --print-architecture)"
printf '%s\n' \
  'Types: deb' \
  'URIs: https://download.docker.com/linux/ubuntu' \
  "Suites: ${codinome_ubuntu}" \
  'Components: stable' \
  "Architectures: ${arquitetura}" \
  'Signed-By: /etc/apt/keyrings/docker.asc' \
  >/etc/apt/sources.list.d/docker.sources

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker "${usuario_operador}"

echo "[5/6] Fechando entrada e mantendo somente SSH"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw --force enable
systemctl enable --now unattended-upgrades

echo "[6/6] Verificacao"
docker --version
docker compose version
free -h
df -h /
ufw status verbose

echo "Preparacao concluida. Abra uma nova sessao SSH antes de usar Docker sem sudo."
