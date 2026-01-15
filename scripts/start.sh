#!/bin/bash
#
# CaseRadar Platform Start Script (Kubernetes)
# Starts all services: PostgreSQL, Redis, Embedding Service, and Next.js
#
# Usage:
#   ./scripts/start.sh              # Start everything
#   ./scripts/start.sh --no-web     # Start backend only (no Next.js)
#   ./scripts/start.sh --dev        # Start with local Next.js dev server (not containerized)
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
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
START_WEB=true
DEV_MODE=false
for arg in "$@"; do
    case $arg in
        --no-web)
            START_WEB=false
            ;;
        --dev)
            DEV_MODE=true
            ;;
    esac
done

echo ""
echo "=========================================="
echo "  CaseRadar Platform Startup (Kubernetes)"
echo "=========================================="
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker Desktop."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker is not running. Please start Docker Desktop."
    exit 1
fi

if ! command -v minikube &> /dev/null; then
    log_error "minikube is not installed. Install with: brew install minikube"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed. Install with: brew install kubectl"
    exit 1
fi

log_success "Prerequisites OK"

# Step 1: Start minikube cluster
echo ""
log_info "Starting Kubernetes cluster..."

if ! minikube status -p caseradar 2>/dev/null | grep -q "Running"; then
    log_info "Starting minikube profile: caseradar"
    minikube start -p caseradar --memory=6g --cpus=4 --driver=docker

    # Enable metrics-server for HPA
    minikube addons enable metrics-server -p caseradar
fi

# Set kubectl context
kubectl config use-context caseradar

log_success "Kubernetes cluster running"

# Step 2: Create namespaces
echo ""
log_info "Creating namespaces..."
kubectl apply -f k8s/postgres/namespace.yaml 2>/dev/null || true
kubectl apply -f k8s/redis/namespace.yaml 2>/dev/null || true
kubectl apply -f k8s/embedding-service/namespace.yaml 2>/dev/null || kubectl create namespace embedding 2>/dev/null || true
kubectl apply -f k8s/web/namespace.yaml 2>/dev/null || true

log_success "Namespaces created"

# Step 3: Deploy PostgreSQL
echo ""
log_info "Deploying PostgreSQL..."
kubectl apply -f k8s/postgres/

# Wait for PostgreSQL to be ready
log_info "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n database --timeout=120s
log_success "PostgreSQL is ready"

# Step 4: Deploy Redis
echo ""
log_info "Deploying Redis..."
kubectl apply -f k8s/redis/

# Wait for Redis to be ready
log_info "Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis -n cache --timeout=60s
log_success "Redis is ready"

# Step 5: Deploy Embedding Service
echo ""
log_info "Deploying Embedding Service..."

# Build and load image if not present
if ! minikube image ls -p caseradar 2>/dev/null | grep -q "caseradar/embedding-service"; then
    log_info "Building embedding service image..."
    docker build -t caseradar/embedding-service:latest services/embedding-service/
    minikube image load caseradar/embedding-service:latest -p caseradar
fi

kubectl apply -f k8s/embedding-service/

# Wait for at least one embedding pod to be ready
log_info "Waiting for embedding service to load model (this may take 2-3 minutes)..."
kubectl wait --for=condition=ready pod -l app=embedding-service -n embedding --timeout=300s
log_success "Embedding Service is ready"

# Step 6: Run database migrations
echo ""
log_info "Running database migrations..."

# Port-forward PostgreSQL temporarily for migrations
kubectl port-forward -n database svc/postgres 5432:5432 &
PG_PF_PID=$!
sleep 3

# Run Prisma migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/caseradar" npx prisma db push --skip-generate 2>/dev/null || log_warn "Migration may have already been applied"

# Kill port-forward
kill $PG_PF_PID 2>/dev/null || true

log_success "Database migrations complete"

# Step 7: Deploy Next.js (if not dev mode)
if [ "$START_WEB" = true ] && [ "$DEV_MODE" = false ]; then
    echo ""
    log_info "Deploying Next.js app..."

    # Build and load image if not present or outdated
    log_info "Building Next.js app image (this may take a few minutes)..."
    docker build -t caseradar/web:latest .
    minikube image load caseradar/web:latest -p caseradar

    # Update secrets from .env file if it exists
    if [ -f .env ]; then
        log_info "Loading secrets from .env file..."
        # This is a simplified approach - in production use proper secret management
    fi

    kubectl apply -f k8s/web/

    # Wait for web pods to be ready
    log_info "Waiting for Next.js pods..."
    kubectl wait --for=condition=ready pod -l app=caseradar -n web --timeout=120s
    log_success "Next.js app is ready"
fi

# Step 8: Start port-forwards
echo ""
log_info "Starting port-forwards..."

# Kill any existing port-forwards
pkill -f "kubectl port-forward" 2>/dev/null || true
sleep 1

# Start port-forwards in background
kubectl port-forward -n database svc/postgres 5432:5432 &> /dev/null &
kubectl port-forward -n cache svc/redis 6379:6379 &> /dev/null &
kubectl port-forward -n embedding svc/embedding-service 8090:80 &> /dev/null &

if [ "$START_WEB" = true ] && [ "$DEV_MODE" = false ]; then
    kubectl port-forward -n web svc/caseradar 3000:80 &> /dev/null &
fi

sleep 2
log_success "Port-forwards active"

# Final output
echo ""
echo "=========================================="
echo "  Platform Ready!"
echo "=========================================="
echo ""
echo "  Services:"
echo "    Frontend:    http://localhost:3000"
echo "    Embeddings:  http://localhost:8090"
echo "    PostgreSQL:  localhost:5432"
echo "    Redis:       localhost:6379"
echo ""
echo "  Kubernetes:"
echo "    kubectl get pods -A"
echo "    kubectl get hpa -A"
echo ""

if [ "$DEV_MODE" = true ]; then
    echo "  Dev mode: Starting local Next.js server..."
    echo "  Press Ctrl+C to stop"
    echo ""
    npm run dev
else
    echo "  Stop with: ./scripts/stop.sh"
    echo ""
fi
