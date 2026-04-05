#!/bin/bash
# HeadlessOS — Dev VM Management Script
# Uses Lima to run a real Ubuntu VM with Docker pre-installed
#
# Usage:
#   ./dev/vm.sh start    — Create & start the VM (first run provisions ~3min)
#   ./dev/vm.sh stop     — Stop the VM
#   ./dev/vm.sh restart  — Restart the VM
#   ./dev/vm.sh ssh      — SSH into the VM as testuser
#   ./dev/vm.sh status   — Show VM status
#   ./dev/vm.sh destroy  — Delete the VM completely
#
# SSH from HeadlessOS app:
#   Host: 127.0.0.1, Port: 2222, User: testuser, Pass: testpass

set -e

VM_NAME="headlessos-dev"
YAML_PATH="$(dirname "$0")/headlessos-dev.yaml"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

check_lima() {
  if ! command -v limactl &>/dev/null; then
    echo -e "${RED}Lima not installed.${NC} Install with: brew install lima"
    exit 1
  fi
}

vm_exists() {
  limactl list --json 2>/dev/null | grep -q "\"name\":\"$VM_NAME\"" 2>/dev/null
}

vm_status() {
  limactl list --json 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    data = json.loads(line)
    if data.get('name') == '$VM_NAME':
        print(data.get('status', 'Unknown'))
        sys.exit(0)
print('NotFound')
" 2>/dev/null || echo "Unknown"
}

case "${1:-help}" in
  start)
    check_lima
    # Check if port 2222 is already in use (e.g., by Docker dev container)
    if lsof -ti:2222 &>/dev/null; then
      echo -e "${YELLOW}Warning: Port 2222 is already in use.${NC}"
      echo "If the Docker dev container is running, stop it first:"
      echo "  cd dev && docker compose down"
      echo ""
      read -p "Continue anyway? (y/N) " -n 1 -r
      echo
      [[ $REPLY =~ ^[Yy]$ ]] || exit 1
    fi

    if vm_exists; then
      STATUS=$(vm_status)
      if [ "$STATUS" = "Running" ]; then
        echo -e "${GREEN}VM '$VM_NAME' is already running.${NC}"
        echo "SSH: ssh -p 2222 testuser@127.0.0.1  (password: testpass)"
      else
        echo "Starting VM '$VM_NAME'..."
        limactl start "$VM_NAME"
        echo -e "${GREEN}VM started!${NC}"
        echo "SSH: ssh -p 2222 testuser@127.0.0.1  (password: testpass)"
      fi
    else
      echo "Creating VM '$VM_NAME' from $YAML_PATH..."
      echo "This will take ~3 minutes on first run (downloads Ubuntu + installs Docker)."
      echo ""
      limactl create --name="$VM_NAME" "$YAML_PATH"
      limactl start "$VM_NAME"
      echo ""
      echo -e "${GREEN}=== VM Ready! ===${NC}"
      echo "SSH:  ssh -p 2222 testuser@127.0.0.1  (password: testpass)"
      echo "User: testuser / testpass"
      echo "Root: root / rootpass"
      echo ""
      echo "Add to HeadlessOS:"
      echo "  curl -X POST http://localhost:3001/api/servers \\"
      echo "    -H 'Content-Type: application/json' \\"
      echo "    -d '{\"name\":\"Local Ubuntu Dev\",\"host\":\"127.0.0.1\",\"port\":2222,\"username\":\"testuser\",\"authMethod\":\"password\",\"password\":\"testpass\"}'"
    fi
    ;;

  stop)
    check_lima
    if vm_exists; then
      echo "Stopping VM '$VM_NAME'..."
      limactl stop "$VM_NAME"
      echo -e "${GREEN}VM stopped.${NC}"
    else
      echo "VM '$VM_NAME' does not exist."
    fi
    ;;

  restart)
    check_lima
    if vm_exists; then
      echo "Restarting VM '$VM_NAME'..."
      limactl stop "$VM_NAME" 2>/dev/null || true
      limactl start "$VM_NAME"
      echo -e "${GREEN}VM restarted.${NC}"
    else
      echo "VM '$VM_NAME' does not exist. Run: $0 start"
    fi
    ;;

  ssh)
    check_lima
    echo "Connecting as testuser (password: testpass)..."
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 testuser@127.0.0.1
    ;;

  status)
    check_lima
    if vm_exists; then
      STATUS=$(vm_status)
      echo -e "VM '$VM_NAME': ${GREEN}$STATUS${NC}"
      if [ "$STATUS" = "Running" ]; then
        echo "SSH: ssh -p 2222 testuser@127.0.0.1"
        echo ""
        echo "Docker inside VM:"
        limactl shell "$VM_NAME" -- sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null || true
      fi
    else
      echo "VM '$VM_NAME' does not exist. Run: $0 start"
    fi
    ;;

  destroy)
    check_lima
    if vm_exists; then
      read -p "Delete VM '$VM_NAME' and all its data? (y/N) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        limactl stop "$VM_NAME" 2>/dev/null || true
        limactl delete "$VM_NAME"
        echo -e "${GREEN}VM deleted.${NC}"
      fi
    else
      echo "VM '$VM_NAME' does not exist."
    fi
    ;;

  *)
    echo "HeadlessOS Dev VM Manager (Lima)"
    echo ""
    echo "Usage: $0 {start|stop|restart|ssh|status|destroy}"
    echo ""
    echo "Commands:"
    echo "  start    — Create & start the VM (first run ~3min)"
    echo "  stop     — Stop the VM (preserves data)"
    echo "  restart  — Restart the VM"
    echo "  ssh      — SSH into VM as testuser"
    echo "  status   — Show VM status & running containers"
    echo "  destroy  — Delete the VM completely"
    ;;
esac
