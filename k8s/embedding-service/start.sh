#!/bin/bash
# Start the CaseRadar embedding service on Kubernetes
# This starts the minikube cluster and port-forwards the embedding service

set -e

PROFILE="caseradar"
NAMESPACE="embedding"
SERVICE="embedding-service"
LOCAL_PORT=8090
TARGET_PORT=80

echo "Starting CaseRadar Kubernetes cluster..."

# Start minikube if not running
if ! minikube status -p $PROFILE | grep -q "Running"; then
    echo "Starting minikube profile: $PROFILE"
    minikube start -p $PROFILE
fi

# Wait for pods to be ready
echo "Waiting for embedding service pods..."
kubectl wait --for=condition=ready pod -l app=$SERVICE -n $NAMESPACE --timeout=300s

# Check pod status
echo ""
echo "Pod status:"
kubectl get pods -n $NAMESPACE

# Check HPA status
echo ""
echo "HPA status:"
kubectl get hpa -n $NAMESPACE

# Port forward
echo ""
echo "Starting port-forward on localhost:$LOCAL_PORT"
echo "The embedding service will be available at: http://localhost:$LOCAL_PORT"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:$LOCAL_PORT/embed -H 'Content-Type: application/json' -d '{\"text\": \"hello world\"}'"
echo ""
echo "Press Ctrl+C to stop port-forwarding"

kubectl port-forward -n $NAMESPACE svc/$SERVICE $LOCAL_PORT:$TARGET_PORT
