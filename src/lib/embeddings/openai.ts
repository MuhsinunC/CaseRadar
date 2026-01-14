/**
 * Embeddings Service (OpenAI-compatible)
 * Supports both local Ollama and OpenAI API via environment variables
 *
 * Configure via environment variables:
 * - EMBEDDING_PROVIDER: 'ollama' (default) or 'openai'
 * - EMBEDDING_API_URL: Base URL (default: http://localhost:11434/v1 for Ollama)
 * - EMBEDDING_API_KEY: API key (optional for Ollama, required for OpenAI)
 * - EMBEDDING_MODEL: Model name (default: nomic-embed-text for Ollama)
 */

// Provider and model configuration
const PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';
const API_URL = process.env.EMBEDDING_API_URL || (PROVIDER === 'openai'
  ? 'https://api.openai.com/v1'
  : 'http://localhost:11434/v1');
const API_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
const MODEL = process.env.EMBEDDING_MODEL || (PROVIDER === 'openai'
  ? 'text-embedding-3-small'
  : 'nomic-embed-text');

// Model dimensions
const MODEL_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'text-embedding-ada-002': 1536,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'all-minilm': 384,
  'qwen3-embedding': 1024,
};

const EMBEDDING_DIMENSIONS = MODEL_DIMENSIONS[MODEL] || 768;
const MAX_TOKENS = 8191;
const MAX_BATCH_SIZE = 100;

/**
 * Truncate text to fit within token limits
 */
function truncateText(text: string, maxChars: number = MAX_TOKENS * 4): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.substring(0, maxChars) + '...';
}

/**
 * Clean and prepare text for embedding
 */
function prepareText(text: string): string {
  return truncateText(
    text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
  );
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = prepareText(text);

  if (!cleanText) {
    throw new Error('Empty text provided for embedding');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${API_URL}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      input: cleanText,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // OpenAI format: { data: [{ embedding: [...] }] }
  if (data.data && Array.isArray(data.data) && data.data[0]?.embedding) {
    return data.data[0].embedding;
  }

  // Ollama native format: { embedding: [...] }
  if (data.embedding) {
    return data.embedding;
  }

  throw new Error('Unexpected embedding response format');
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
  }

  const cleanTexts = texts.map(prepareText).filter(Boolean);

  if (cleanTexts.length === 0) {
    throw new Error('No valid texts after cleaning');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${API_URL}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      input: cleanTexts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // OpenAI format
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }

  throw new Error('Unexpected batch embedding response format');
}

/**
 * Generate embeddings in batches with rate limiting
 */
export async function generateEmbeddingsBatched(
  texts: string[],
  batchSize: number = MAX_BATCH_SIZE,
  delayMs: number = 100
): Promise<{ embeddings: number[][]; errors: string[] }> {
  const embeddings: number[][] = [];
  const errors: string[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const batchEmbeddings = await generateEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Batch ${Math.floor(i / batchSize)} failed: ${message}`);
      embeddings.push(...batch.map(() => []));
    }

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { embeddings, errors };
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Format embedding for PostgreSQL pgvector
 */
export function formatEmbeddingForPgvector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Get embedding model info
 */
export function getModelInfo() {
  return {
    provider: PROVIDER,
    model: MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    maxTokens: MAX_TOKENS,
    maxBatchSize: MAX_BATCH_SIZE,
    apiUrl: API_URL,
  };
}

/**
 * Check if the embedding service is available
 */
export async function checkEmbeddingService(): Promise<boolean> {
  try {
    const result = await generateEmbedding('test connection');
    return result.length > 0;
  } catch {
    return false;
  }
}
