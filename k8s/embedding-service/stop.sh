#!/bin/bash
# Stop the CaseRadar Kubernetes cluster to save resources

PROFILE="caseradar"

echo "Stopping CaseRadar Kubernetes cluster..."

# Kill any port-forward processes
pkill -f "kubectl port-forward.*embedding" 2>/dev/null && echo "Stopped port-forward" || true

# Stop minikube
if minikube status -p $PROFILE 2>/dev/null | grep -q "Running"; then
    echo "Stopping minikube profile: $PROFILE"
    minikube stop -p $PROFILE
    echo "Cluster stopped. Run ./start.sh to restart."
else
    echo "Cluster is not running."
fi
