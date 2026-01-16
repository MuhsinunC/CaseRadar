ultrathink:

# CPU Fallback Optimization Loop

## Mission
Benchmark and optimize the CPU fallback for the embedding service, then wire it up to the product.

## Context
- GPU (Mac MPS) achieves 1848 texts/sec - this is the primary path
- CPU fallback needed when GPU is unavailable
- Two architectures to compare:
  1. Kubernetes multi-pod (load balanced)
  2. Single server multi-process (uvicorn/gunicorn workers)
- The winner becomes the CPU fallback
- Must integrate with the product seamlessly

## Key Files
- Implementation plan: `.claude/cpu-fallback-implementation-plan.md`
- Progress tracking: `.claude/cpu-fallback-progress.md`
- Benchmark results: `.claude/cpu-fallback-benchmarks.md`
- Embedding service: `services/embedding-service/main.py`
- K8s configs: `k8s/embedding-service/`
- Scalable client: `src/lib/embeddings/scalable-client.ts`

## TDD Approach
1. Write tests FIRST
2. Run tests to verify they fail
3. Implement the feature
4. Run tests to verify they pass
5. Document results

## Tasks (Execute in Order)

### Task 1: Setup Progress Tracking
- Create `.claude/cpu-fallback-progress.md` with checklist
- Create `.claude/cpu-fallback-benchmarks.md` for results
- Mark this task complete when done

### Task 2: Benchmark K8s Multi-Pod Architecture
- Ensure minikube is running (12 CPUs, 60GB RAM)
- Scale to 1, 2, 4, 8 pods
- Run benchmark for each: 5000 texts, measure throughput
- Test EMBEDDING_WORKERS=2 per pod
- Record all results in benchmarks file
- Update progress checklist

### Task 3: Benchmark Single Server Multi-Process
- Create script: `scripts/start-cpu-embedding.sh`
- Test uvicorn with 2, 4, 8 workers
- Run same benchmark: 5000 texts each
- Record all results in benchmarks file
- Update progress checklist

### Task 4: Compare and Select Winner
- Analyze benchmark results
- Consider: throughput, memory, complexity
- Document decision and rationale
- Update implementation plan with winner

### Task 5: Implement Auto-Detection Logic
- GPU detection already exists (MPS > CUDA > CPU)
- Add CPU architecture auto-start
- Add EMBEDDING_ARCHITECTURE env var override
- Test all paths work correctly

### Task 6: Write Integration Tests
- Test GPU path (if available)
- Test CPU fallback path
- Test auto-detection logic
- Test client connectivity
- All tests must pass

### Task 7: Wire Up to Product
- Find where product requests embeddings
- Update to use embedding service client
- Add configuration for service URL
- Test with real product data

### Task 8: End-to-End Validation
- Start embedding service
- Run product with embedding service
- Verify embeddings are generated correctly
- Test full pipeline works

### Task 9: Documentation and Cleanup
- Update README with embedding service docs
- Document final architecture choice
- Clean up temporary/debug files
- Commit all changes with descriptive message
- Push to remote

## Completion Criteria
The loop is complete when:
1. K8s and single-server benchmarks are documented
2. Best CPU architecture is selected and justified
3. Auto-detection logic works (GPU > CPU fallback)
4. Product is wired up and tested
5. All tests pass
6. Documentation is complete
7. Changes are committed and pushed

## Progress Check
After each task:
1. Update `.claude/cpu-fallback-progress.md`
2. Mark completed tasks with [x]
3. Document any blockers or issues
4. Continue to next task

## Important Notes
- Always use fp32 precision (NOT fp16) for quality
- GPU batch size 100 is optimal
- CPU batch size may differ - test and find optimal
- Memory: ~1GB per worker/pod
- Do NOT sacrifice embedding quality for speed
