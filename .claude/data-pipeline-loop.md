ultrathink: This is a Ralph loop for implementing the unified data pipeline.

## Goal
Implement a single-function orchestration system that processes the entire data pipeline from NHTSA complaint ingestion through to lead generation.

## Reference
See docs/architecture/unified-data-pipeline-plan.md for full architecture, API specs, and test suites.

## Completion Criteria
The pipeline is complete when:
1. All unit tests pass
2. All integration tests pass
3. E2E tests pass
4. processPipeline() handles full flow
5. Cron automation is working
6. 100% embedding coverage achieved
7. Leads are generated from patterns

## Current Iteration Task
Follow the implementation steps in docs/architecture/unified-data-pipeline-plan.md.
Run tests after each change. Document results in iteration notes.

## Test Commands
- Unit tests: `npm test -- src/lib/pipeline/__tests__/unified-pipeline.test.ts`
- Integration tests: `npm test -- src/lib/pipeline/__tests__/pipeline-integration.test.ts`
- E2E tests: `npm test -- src/lib/pipeline/__tests__/pipeline-e2e.test.ts`
- All pipeline tests: `npm test -- src/lib/pipeline`

## Key File
The main implementation file is: `src/lib/pipeline/unified-pipeline.ts`
