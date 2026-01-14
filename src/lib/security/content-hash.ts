/**
 * Content Hashing Utility
 *
 * Provides SHA-256 hashing for document integrity verification.
 * Used for generated complaints to detect tampering.
 */

import { createHash } from 'crypto';

/**
 * Generate SHA-256 hash of content
 */
export function generateContentHash(content: unknown): string {
  const serialized = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 0); // Deterministic JSON serialization

  return createHash('sha256')
    .update(serialized, 'utf8')
    .digest('hex');
}

/**
 * Verify content against stored hash
 */
export function verifyContentHash(content: unknown, expectedHash: string): boolean {
  const actualHash = generateContentHash(content);
  return actualHash === expectedHash;
}

/**
 * Generate hash with timestamp for audit trail
 */
export function generateTimestampedHash(content: unknown): {
  hash: string;
  timestamp: string;
  algorithm: string;
} {
  return {
    hash: generateContentHash(content),
    timestamp: new Date().toISOString(),
    algorithm: 'SHA-256',
  };
}
