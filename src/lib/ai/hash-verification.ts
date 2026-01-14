/**
 * Content Hash Verification
 * P2-5 Implementation
 *
 * Provides utilities for generating and verifying SHA-256 hashes
 * of AI-generated content to detect tampering.
 */

import crypto from 'crypto';

/**
 * Options for content verification
 */
export interface VerifyOptions {
  /** If true, throws ContentIntegrityError on verification failure */
  strict?: boolean;
}

/**
 * Error thrown when content integrity verification fails
 */
export class ContentIntegrityError extends Error {
  public readonly expectedHash?: string;
  public readonly actualHash?: string;

  constructor(
    message: string,
    options?: {
      expectedHash?: string;
      actualHash?: string;
    }
  ) {
    super(message);
    this.name = 'ContentIntegrityError';
    this.expectedHash = options?.expectedHash;
    this.actualHash = options?.actualHash;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContentIntegrityError);
    }
  }
}

/**
 * Recursively sort object keys for consistent hashing
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted;
}

/**
 * Generate a SHA-256 hash of content
 *
 * Objects are sorted by key to ensure consistent hashing regardless
 * of property order.
 *
 * @param content - Content to hash (object, string, etc.)
 * @returns 64-character hex string (SHA-256)
 */
export function generateContentHash(content: unknown): string {
  // Sort object keys for consistent hashing
  const normalizedContent = sortObjectKeys(content);

  // Convert to JSON string
  const jsonString = JSON.stringify(normalizedContent);

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Verify that content matches a given hash
 *
 * @param content - Content to verify
 * @param expectedHash - Expected SHA-256 hash
 * @param options - Verification options
 * @returns True if content matches hash
 * @throws ContentIntegrityError if strict mode enabled and verification fails
 */
export function verifyContentHash(
  content: unknown,
  expectedHash: string,
  options?: VerifyOptions
): boolean {
  const actualHash = generateContentHash(content);
  const isValid = actualHash === expectedHash;

  if (!isValid && options?.strict) {
    throw new ContentIntegrityError(
      `Content integrity verification failed. Hash mismatch detected.`,
      {
        expectedHash,
        actualHash,
      }
    );
  }

  return isValid;
}

/**
 * Generate hash and return both content and hash for storage
 *
 * @param content - Content to hash
 * @returns Object with content and contentHash
 */
export function withContentHash<T>(content: T): {
  content: T;
  contentHash: string;
} {
  return {
    content,
    contentHash: generateContentHash(content),
  };
}

/**
 * Verify content on retrieval from database
 *
 * Useful as a helper for post-query verification.
 *
 * @param record - Record with content and contentHash fields
 * @param options - Verification options
 * @returns True if content is valid
 */
export function verifyRecordIntegrity<
  T extends { content: unknown; contentHash: string }
>(record: T, options?: VerifyOptions): boolean {
  return verifyContentHash(record.content, record.contentHash, options);
}
