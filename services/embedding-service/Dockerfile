# Scalable Embedding Service Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Model loads at runtime from shared PVC (not baked into image)
# This keeps image small and allows single model cache across all pods

# Copy application code
COPY main.py .
COPY tests/ ./tests/

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Environment for worker configuration
# For K8s: use 1 worker per pod, scale with HPA (default)
# For single-node: set EMBEDDING_WORKERS to 2-8
ENV EMBEDDING_WORKERS=1

# Run the service with configurable workers
# Using python main.py allows dynamic worker configuration
CMD ["python", "main.py"]
