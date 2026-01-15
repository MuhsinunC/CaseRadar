// Legacy OpenAI/Ollama direct access (for backwards compatibility)
export {
  generateEmbedding,
  generateEmbeddings,
  generateEmbeddingsBatched,
  cosineSimilarity,
  formatEmbeddingForPgvector,
  getModelInfo,
  checkEmbeddingService,
} from './openai';

// Resilient client (recommended for production use)
export {
  ResilientEmbeddingClient,
  getResilientClient,
  generateResilientEmbedding,
  generateResilientEmbeddings,
  generateResilientEmbeddingsLarge,
  getEmbeddingHealth,
  getEmbeddingMetrics,
  formatEmbeddingForPgvector as formatForPgvector,
} from './resilient-client';

export { complaintEmbedder } from './complaint-embedder';

// Scalable embedding service client
export {
  ScalableEmbeddingClient,
  getScalableClient,
  generateScalableEmbedding,
  generateScalableEmbeddings,
  cosineSimilarity as scalableCosineSimilarity,
  formatEmbeddingForPgvector as scalableFormatForPgvector,
} from './scalable-client';

export type {
  EmbedResponse,
  BatchEmbedResponse,
  AsyncJobResponse,
  JobStatusResponse,
  QueueStatus,
  HealthStatus,
} from './scalable-client';
