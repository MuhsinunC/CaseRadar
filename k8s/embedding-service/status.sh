#!/bin/bash
# Check status of CaseRadar Kubernetes embedding service

PROFILE="caseradar"
NAMESPACE="embedding"

echo "=== Minikube Status ==="
minikube status -p $PROFILE 2>/dev/null || echo "Cluster not found or not running"

if minikube status -p $PROFILE 2>/dev/null | grep -q "Running"; then
    echo ""
    echo "=== Namespaces ==="
    kubectl get namespaces

    echo ""
    echo "=== Embedding Service Pods ==="
    kubectl get pods -n $NAMESPACE

    echo ""
    echo "=== HPA (Auto-scaling) ==="
    kubectl get hpa -n $NAMESPACE

    echo ""
    echo "=== Resource Usage ==="
    kubectl top pods -n $NAMESPACE 2>/dev/null || echo "(metrics may take a minute to populate)"

    echo ""
    echo "=== Services ==="
    kubectl get svc -n $NAMESPACE
fi
