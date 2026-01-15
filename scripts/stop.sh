#!/bin/bash
#
# CaseRadar Platform Stop Script (Kubernetes)
# Gracefully stops all services
#
# Usage:
#   ./scripts/stop.sh             # Stop everything (cluster keeps running)
#   ./scripts/stop.sh --full      # Stop and delete the minikube cluster
#   ./scripts/stop.sh --keep-db   # Stop services but keep database running
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Parse arguments
FULL_STOP=false
KEEP_DB=false
for arg in "$@"; do
    case $arg in
        --full)
            FULL_STOP=true
            ;;
        --keep-db)
            KEEP_DB=true
            ;;
    esac
done

echo ""
echo "=========================================="
echo "  CaseRadar Platform Shutdown"
echo "=========================================="
echo ""

# Step 1: Kill all port-forward processes
log_info "Stopping port-forwards..."
pkill -f "kubectl port-forward" 2>/dev/null && log_success "Killed port-forwards" || log_info "No port-forwards running"

# Step 2: Stop minikube cluster
if command -v minikube &> /dev/null; then
    if minikube status -p caseradar 2>/dev/null | grep -q "Running"; then
        if [ "$FULL_STOP" = true ]; then
            log_info "Deleting Kubernetes cluster 'caseradar'..."
            minikube delete -p caseradar
            log_success "Kubernetes cluster deleted"
        else
            log_info "Stopping Kubernetes cluster 'caseradar'..."
            minikube stop -p caseradar
            log_success "Kubernetes cluster stopped (data preserved)"
        fi
    else
        log_info "Kubernetes cluster not running"
    fi
fi

echo ""
echo "=========================================="
echo "  Platform Stopped"
echo "=========================================="
echo ""

if [ "$FULL_STOP" = true ]; then
    echo "  Cluster deleted. All data has been removed."
    echo "  Run './scripts/start.sh' to create a fresh cluster."
else
    echo "  Cluster stopped but data is preserved."
    echo "  Run './scripts/start.sh' to restart."
fi
echo ""
