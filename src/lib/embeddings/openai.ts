/**
 * OpenAI Embeddings Service
 * Generates vector embeddings for complaint text using OpenAI's text-embedding-3-small model
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_TOKENS = 8191;
const MAX_BATCH_SIZE = 100;

/**
 * Truncate text to fit within token limits
 * Rough estimate: 1 token ≈ 4 characters
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
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII characters
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

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleanText,
  });

  return response.data[0].embedding;
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

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleanTexts,
  });

  return response.data.map((d) => d.embedding);
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
      // Add placeholder embeddings for failed batch
      embeddings.push(...batch.map(() => []));
    }

    // Rate limiting
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
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    maxTokens: MAX_TOKENS,
    maxBatchSize: MAX_BATCH_SIZE,
  };
}
