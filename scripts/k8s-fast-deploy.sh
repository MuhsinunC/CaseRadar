#!/bin/bash
# FAST K8s redeploy script - targets <10 seconds
# Usage: ./scripts/k8s-fast-deploy.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== FAST DEPLOY (target: <10s) ==="
start=$(date +%s.%N)

# Step 1: Build directly in minikube (fast with cache)
echo "Building image..."
eval $(minikube docker-env)
docker build -t caseradar/embedding-service:latest "$PROJECT_ROOT/services/embedding-service" -q

# Step 2: Apply config (no wait)
echo "Applying config..."
kubectl apply -f "$PROJECT_ROOT/k8s/embedding-service/" > /dev/null 2>&1

# Step 3: Restart pods (no wait for rollout)
echo "Restarting pods..."
kubectl rollout restart deployment/embedding-service -n embedding > /dev/null 2>&1

end=$(date +%s.%N)
elapsed=$(echo "$end - $start" | bc)

echo ""
echo "=== DEPLOY TRIGGERED in ${elapsed}s ==="
echo "Pods are restarting in background. Check with: kubectl get pods -n embedding"
echo ""
echo "Tip: Wait ~15s for pods to be ready, or just keep iterating!"
