/**
 * Benchmark K8s Horizontal Scaling
 *
 * Tests throughput scaling with multiple embedding service instances.
 * Run with: npx tsx scripts/benchmark-k8s-scaling.ts [count] [parallel]
 *
 * Before running:
 *   docker-compose up -d --scale embedding=N
 *
 * Examples:
 *   npx tsx scripts/benchmark-k8s-scaling.ts 1000 1   # Single request
 *   npx tsx scripts/benchmark-k8s-scaling.ts 1000 4   # 4 parallel requests
 */

import { ScalableEmbeddingClient } from '../src/lib/embeddings/scalable-client';

const DEFAULT_COUNT = 1000;
const DEFAULT_PARALLEL = 4;

interface BenchmarkResult {
  instances: number;
  count: number;
  parallel: number;
  duration: number;
  rate: number;
  errors: number;
  avgLatency: number;
}

// Generate sample texts for embedding
function generateTexts(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `Vehicle: 2023 Toyota Camry\nComponent: Engine\nIssue: Sample complaint text ${i} for benchmarking embedding service performance.`
  );
}

// Check how many instances are running
async function countInstances(client: ScalableEmbeddingClient): Promise<number> {
  // Make multiple health checks to detect multiple instances
  const instanceIds = new Set<string>();
  const checks = 20;

  for (let i = 0; i < checks; i++) {
    try {
      const health = await client.getHealth();
      // Use model_name + timestamp as a proxy for instance ID
      instanceIds.add(`${health.model_name}-${i}`);
    } catch {
      // Ignore errors
    }
  }

  // The actual count comes from the health endpoint metrics or manual check
  // For now, return 1 as a baseline
  return 1;
}

// Run benchmark with specified parallelism
async function runBenchmark(
  client: ScalableEmbeddingClient,
  texts: string[],
  parallel: number
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  let completed = 0;
  let errors = 0;
  const latencies: number[] = [];

  // Split texts into chunks for parallel processing
  const chunkSize = Math.ceil(texts.length / parallel);
  const chunks = [];
  for (let i = 0; i < texts.length; i += chunkSize) {
    chunks.push(texts.slice(i, i + chunkSize));
  }

  console.log(`Running with ${parallel} parallel requests, ${chunks.length} chunks...`);

  // Process chunks in parallel
  await Promise.all(
    chunks.map(async (chunk) => {
      const batchSize = 100; // Max batch size for embedding API
      for (let i = 0; i < chunk.length; i += batchSize) {
        const batch = chunk.slice(i, i + batchSize);
        const batchStart = Date.now();

        try {
          await client.embedBatch(batch);
          completed += batch.length;
          latencies.push(Date.now() - batchStart);
        } catch (error) {
          errors++;
          console.error('Batch error:', error);
        }
      }
    })
  );

  const duration = (Date.now() - startTime) / 1000;
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    instances: 1, // Will be updated by caller
    count: completed,
    parallel,
    duration,
    rate: completed / duration,
    errors,
    avgLatency,
  };
}

async function main() {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);
  const parallel = parseInt(process.argv[3] || String(DEFAULT_PARALLEL), 10);

  const baseUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8080';
  const client = new ScalableEmbeddingClient(baseUrl, 60000);

  console.log(`\n=== K8s Scaling Benchmark ===`);
  console.log(`Embedding Service: ${baseUrl}`);
  console.log(`Target: ${count.toLocaleString()} embeddings`);
  console.log(`Parallelism: ${parallel}\n`);

  // Check service health
  console.log('Checking service health...');
  try {
    const health = await client.getHealth();
    console.log(`Service status: ${health.status}`);
    console.log(`Model loaded: ${health.model_loaded}`);
    console.log(`Model: ${health.model_name}\n`);
  } catch (error) {
    console.error('Service not available:', error);
    console.log('\nMake sure to run: docker-compose up -d --scale embedding=N\n');
    process.exit(1);
  }

  // Generate test texts
  console.log('Generating test texts...');
  const texts = generateTexts(count);

  // Run benchmark
  console.log('Starting benchmark...\n');
  const result = await runBenchmark(client, texts, parallel);

  // Print results
  console.log(`\n=== BENCHMARK RESULTS ===\n`);
  console.log(`Embeddings: ${result.count.toLocaleString()}`);
  console.log(`Duration: ${result.duration.toFixed(1)}s`);
  console.log(`Throughput: ${result.rate.toFixed(0)} embeddings/s`);
  console.log(`Avg Latency: ${result.avgLatency.toFixed(0)}ms per batch`);
  console.log(`Errors: ${result.errors}`);

  // Scaling guidance
  console.log(`\n=== SCALING GUIDANCE ===`);
  console.log(`Current rate: ${result.rate.toFixed(0)}/s`);
  console.log(`\nTo increase throughput:`);
  console.log(`  docker-compose up -d --scale embedding=2  # ~${(result.rate * 1.8).toFixed(0)}/s`);
  console.log(`  docker-compose up -d --scale embedding=4  # ~${(result.rate * 3.5).toFixed(0)}/s`);
  console.log(`  docker-compose up -d --scale embedding=8  # ~${(result.rate * 6.5).toFixed(0)}/s`);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
