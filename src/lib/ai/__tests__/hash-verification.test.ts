/**
 * Content Hash Verification Tests
 * P2-5 Implementation - TDD
 *
 * Tests for verifying integrity of AI-generated content using SHA-256 hashes.
 */

import { describe, it, expect } from 'vitest';
import {
  generateContentHash,
  verifyContentHash,
  ContentIntegrityError,
} from '../hash-verification';

describe('Content Hash Verification', () => {
  describe('generateContentHash', () => {
    it('should generate SHA-256 hash of content', () => {
      const content = { title: 'Test', body: 'Content' };
      const hash = generateContentHash(content);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate consistent hash for same content', () => {
      const content = { title: 'Test', body: 'Content' };

      const hash1 = generateContentHash(content);
      const hash2 = generateContentHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', () => {
      const content1 = { title: 'Test1' };
      const content2 = { title: 'Test2' };

      expect(generateContentHash(content1)).not.toBe(
        generateContentHash(content2)
      );
    });

    it('should be order-independent for object keys', () => {
      const content1 = { a: 1, b: 2 };
      const content2 = { b: 2, a: 1 };

      expect(generateContentHash(content1)).toBe(generateContentHash(content2));
    });

    it('should handle nested objects', () => {
      const content = {
        outer: {
          inner: {
            value: 'test',
          },
        },
      };

      const hash = generateContentHash(content);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle arrays', () => {
      const content = { items: [1, 2, 3] };
      const hash = generateContentHash(content);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hash for different array order', () => {
      const content1 = { items: [1, 2, 3] };
      const content2 = { items: [3, 2, 1] };

      // Arrays are order-sensitive, so hashes should differ
      expect(generateContentHash(content1)).not.toBe(
        generateContentHash(content2)
      );
    });

    it('should handle string content', () => {
      const content = 'Plain string content';
      const hash = generateContentHash(content);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty object', () => {
      const hash = generateContentHash({});
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle null values', () => {
      const content = { value: null };
      const hash = generateContentHash(content);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifyContentHash', () => {
    it('should return true for matching content and hash', () => {
      const content = { title: 'Test' };
      const hash = generateContentHash(content);

      expect(verifyContentHash(content, hash)).toBe(true);
    });

    it('should return false for mismatched content', () => {
      const originalContent = { title: 'Test' };
      const hash = generateContentHash(originalContent);

      const tamperedContent = { title: 'Tampered' };

      expect(verifyContentHash(tamperedContent, hash)).toBe(false);
    });

    it('should return false for invalid hash format', () => {
      const content = { title: 'Test' };
      expect(verifyContentHash(content, 'invalid_hash')).toBe(false);
    });

    it('should throw ContentIntegrityError when verification fails with strict mode', () => {
      const content = { title: 'Test' };
      const wrongHash = 'invalid_hash';

      expect(() => {
        verifyContentHash(content, wrongHash, { strict: true });
      }).toThrow(ContentIntegrityError);
    });

    it('should not throw in non-strict mode', () => {
      const content = { title: 'Test' };
      const wrongHash = 'invalid_hash';

      expect(() => {
        verifyContentHash(content, wrongHash);
      }).not.toThrow();
    });

    it('should work with nested content', () => {
      const content = {
        complaint: {
          title: 'Product Issue',
          body: 'The product broke',
          metadata: {
            category: 'defect',
          },
        },
      };

      const hash = generateContentHash(content);
      expect(verifyContentHash(content, hash)).toBe(true);

      const tampered = { ...content, complaint: { ...content.complaint, title: 'Changed' } };
      expect(verifyContentHash(tampered, hash)).toBe(false);
    });

    it('should handle key order changes in verification', () => {
      const original = { a: 1, b: 2 };
      const hash = generateContentHash(original);

      const reordered = { b: 2, a: 1 };
      expect(verifyContentHash(reordered, hash)).toBe(true);
    });
  });

  describe('ContentIntegrityError', () => {
    it('should have correct error name', () => {
      const error = new ContentIntegrityError('Test message');
      expect(error.name).toBe('ContentIntegrityError');
    });

    it('should include expected and actual hash', () => {
      const error = new ContentIntegrityError('Test', {
        expectedHash: 'abc123',
        actualHash: 'def456',
      });

      expect(error.expectedHash).toBe('abc123');
      expect(error.actualHash).toBe('def456');
    });

    it('should be instance of Error', () => {
      const error = new ContentIntegrityError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
