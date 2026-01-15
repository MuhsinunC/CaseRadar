#!/bin/bash
#
# CaseRadar Platform Status Script (Kubernetes)
# Shows status of all services
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

status_ok() { echo -e "  ${GREEN}●${NC} $1"; }
status_warn() { echo -e "  ${YELLOW}●${NC} $1"; }
status_off() { echo -e "  ${RED}●${NC} $1"; }

echo ""
echo "=========================================="
echo "  CaseRadar Platform Status (Kubernetes)"
echo "=========================================="
echo ""

# Check minikube
echo "Kubernetes Cluster:"
echo "-------------------"

if ! command -v minikube &> /dev/null; then
    status_off "minikube not installed"
    echo ""
    exit 0
fi

if minikube status -p caseradar 2>/dev/null | grep -q "Running"; then
    status_ok "minikube 'caseradar' running"

    # Set context
    kubectl config use-context caseradar &> /dev/null

    echo ""
    echo "Database (PostgreSQL):"
    echo "----------------------"
    PG_PODS=$(kubectl get pods -n database --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$PG_PODS" -gt 0 ]; then
        status_ok "PostgreSQL    $PG_PODS pod(s) running"
        if pgrep -f "kubectl port-forward.*database.*5432" > /dev/null; then
            status_ok "Port-forward  localhost:5432"
        else
            status_warn "Port-forward  not active"
        fi
    else
        status_off "PostgreSQL    not running"
    fi

    echo ""
    echo "Cache (Redis):"
    echo "--------------"
    REDIS_PODS=$(kubectl get pods -n cache --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$REDIS_PODS" -gt 0 ]; then
        status_ok "Redis         $REDIS_PODS pod(s) running"
        if pgrep -f "kubectl port-forward.*cache.*6379" > /dev/null; then
            status_ok "Port-forward  localhost:6379"
        else
            status_warn "Port-forward  not active"
        fi
    else
        status_off "Redis         not running"
    fi

    echo ""
    echo "Embedding Service:"
    echo "------------------"
    EMBED_PODS=$(kubectl get pods -n embedding --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    HPA_CPU=$(kubectl get hpa -n embedding --no-headers 2>/dev/null | awk '{print $3}' | cut -d'/' -f1 || echo "N/A")
    if [ "$EMBED_PODS" -gt 0 ]; then
        status_ok "Embedding     $EMBED_PODS pod(s) running (CPU: $HPA_CPU)"
        if pgrep -f "kubectl port-forward.*embedding.*8090" > /dev/null; then
            status_ok "Port-forward  localhost:8090"
        else
            status_warn "Port-forward  not active"
        fi
    else
        status_off "Embedding     not running"
    fi

    echo ""
    echo "Web App (Next.js):"
    echo "------------------"
    WEB_PODS=$(kubectl get pods -n web --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    WEB_HPA=$(kubectl get hpa -n web --no-headers 2>/dev/null | awk '{print $3}' | cut -d'/' -f1 || echo "N/A")
    if [ "$WEB_PODS" -gt 0 ]; then
        status_ok "Next.js       $WEB_PODS pod(s) running (CPU: $WEB_HPA)"
        if pgrep -f "kubectl port-forward.*web.*3000" > /dev/null; then
            status_ok "Port-forward  localhost:3000"
        else
            status_warn "Port-forward  not active"
        fi
    else
        # Check if local dev server is running
        if pgrep -f "next dev" > /dev/null; then
            status_ok "Next.js       local dev server (npm run dev)"
        else
            status_off "Next.js       not running"
        fi
    fi

    echo ""
    echo "HPA Status:"
    echo "-----------"
    kubectl get hpa -A --no-headers 2>/dev/null | while read ns name ref targets min max replicas age; do
        echo "  $ns/$name: $replicas replicas ($targets)"
    done

else
    status_off "minikube 'caseradar' stopped"
fi

echo ""
echo "Quick Commands:"
echo "---------------"
echo "  Start:       ./scripts/start.sh"
echo "  Start (dev): ./scripts/start.sh --dev"
echo "  Stop:        ./scripts/stop.sh"
echo "  All pods:    kubectl get pods -A"
echo "  Logs:        kubectl logs -n <namespace> -l app=<app> -f"
echo ""
