# Embedding Service on Kubernetes

This deploys the embedding service to a local Kubernetes cluster with auto-scaling.

## Quick Start

```bash
# Start the cluster and service
./k8s/embedding-service/start.sh

# In another terminal, your app can now use:
# EMBEDDING_SERVICE_URL=http://localhost:8090

# Check status
./k8s/embedding-service/status.sh

# Stop when done
./k8s/embedding-service/stop.sh
```

## Architecture

```
minikube profile: caseradar
│
├── namespace: embedding
│   ├── deployment: embedding-service (2+ pods, auto-scaled)
│   ├── service: embedding-service (ClusterIP)
│   ├── hpa: embedding-service-hpa (scales 1-4 pods based on CPU)
│   └── pvc: model-cache (shared model storage)
│
├── namespace: web           # Reserved for Next.js app
│
└── namespace: database      # Reserved for PostgreSQL
```

## Prerequisites

- Docker Desktop running
- minikube installed: `brew install minikube`
- kubectl installed: `brew install kubectl`

## Initial Setup

Run once to build the image and create the cluster:

```bash
# Build the embedding service image
docker build -t caseradar/embedding-service:latest services/embedding-service/

# Create the minikube cluster (if not exists)
minikube start -p caseradar --memory=6g --cpus=4 --driver=docker

# Enable metrics for HPA
minikube addons enable metrics-server -p caseradar

# Load the image into minikube
minikube image load caseradar/embedding-service:latest -p caseradar

# Create namespaces
kubectl create namespace embedding
kubectl create namespace web
kubectl create namespace database

# Deploy the embedding service
kubectl apply -f k8s/embedding-service/
```

## How HPA Auto-Scaling Works

The Horizontal Pod Autoscaler (HPA) automatically adjusts replicas based on CPU:

- **Target**: 60% CPU utilization
- **Min replicas**: 1 (local) / 2 (production)
- **Max replicas**: 4 (local) / 40 (production)
- **Scale-up**: Adds up to 2 pods every 30 seconds when CPU > 60%
- **Scale-down**: Removes 1 pod every 2 minutes when CPU < 60%

Watch scaling in action:
```bash
# Monitor HPA
kubectl get hpa -n embedding -w

# Generate load to trigger scale-up
for i in {1..100}; do
  curl -X POST http://localhost:8090/embed \
    -H 'Content-Type: application/json' \
    -d '{"text": "test embedding request number '$i'"}' &
done
wait
```

## Shared Model Cache

All pods share a single copy of the ML model via PersistentVolumeClaim:
- First pod downloads the model (~1.5GB)
- Subsequent pods use the cached model
- No disk waste from duplicates

## Commands

```bash
# View pod logs
kubectl logs -n embedding -l app=embedding-service -f

# Describe HPA
kubectl describe hpa -n embedding embedding-service-hpa

# View resource usage
kubectl top pods -n embedding

# Scale manually (temporarily)
kubectl scale deployment -n embedding embedding-service --replicas=3

# View all minikube clusters
minikube profile list

# Switch between clusters
kubectl config use-context caseradar
kubectl config use-context llm-gateway
```

## Production Deployment

For GKE/EKS/AKS, update these files:

1. **hpa.yaml**: Change replicas to 2-40
2. **pvc.yaml**: Add storage class for cloud provider
3. **deployment.yaml**: Add node selectors, tolerations

```yaml
# Production HPA values
minReplicas: 2
maxReplicas: 40
```

## Troubleshooting

**Pods stuck in Pending**
```bash
kubectl describe pod -n embedding <pod-name>
# Check for resource constraints or PVC issues
```

**Model download slow**
- First pod takes 2-3 minutes to download the model
- Subsequent pods should start in 30-60 seconds

**Port 8090 already in use**
```bash
# Kill any existing port-forward
pkill -f "kubectl port-forward.*embedding"
```

**Cluster won't start**
```bash
minikube delete -p caseradar
minikube start -p caseradar --memory=6g --cpus=4 --driver=docker
```
