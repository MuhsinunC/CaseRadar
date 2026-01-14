/**
 * AI Versioning Tests
 * P1-5 Implementation - TDD
 *
 * Tests for AI model versioning and audit trail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentAIVersion,
  recordAIVersion,
  getVersionForGeneration,
  computePromptHash,
  AIVersionData,
} from '../versioning';
import { prisma } from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    aIVersion: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    generatedComplaint: {
      findUnique: vi.fn(),
    },
  },
}));

describe('AI Versioning', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCurrentAIVersion', () => {
    it('should return current model and prompt versions', async () => {
      const version = await getCurrentAIVersion();

      expect(version).toMatchObject({
        modelVersion: expect.any(String),
        modelProvider: expect.stringMatching(/openai|anthropic/),
        promptVersion: expect.any(String),
        embeddingModel: expect.any(String),
      });
    });

    it('should include prompt hash', async () => {
      const version = await getCurrentAIVersion();

      expect(version.promptHash).toBeDefined();
      expect(version.promptHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return valid model provider', async () => {
      const version = await getCurrentAIVersion();

      expect(['openai', 'anthropic']).toContain(version.modelProvider);
    });
  });

  describe('computePromptHash', () => {
    it('should compute SHA-256 hash of prompt template', () => {
      const hash = computePromptHash('Test prompt template');

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return consistent hashes for same input', () => {
      const hash1 = computePromptHash('Same template');
      const hash2 = computePromptHash('Same template');

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = computePromptHash('Template A');
      const hash2 = computePromptHash('Template B');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('recordAIVersion', () => {
    it('should create version record in database', async () => {
      const mockVersion = {
        id: 'version_1',
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'abc123'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
        parameters: null,
        createdAt: new Date(),
      };

      vi.mocked(prisma.aIVersion.create).mockResolvedValue(mockVersion);

      const versionData: AIVersionData = {
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'abc123'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
      };

      const version = await recordAIVersion(versionData);

      expect(version.id).toBe('version_1');
      expect(prisma.aIVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelVersion: 'claude-3-opus-20240229',
            modelProvider: 'anthropic',
            promptVersion: 'v2.1.0',
            promptHash: versionData.promptHash,
            embeddingModel: 'text-embedding-3-small',
          }),
        })
      );
    });

    it('should store parameters if provided', async () => {
      const mockVersion = {
        id: 'version_2',
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'abc123'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
        parameters: { temperature: 0.7, max_tokens: 4096 },
        createdAt: new Date(),
      };

      vi.mocked(prisma.aIVersion.create).mockResolvedValue(mockVersion);

      const versionData: AIVersionData = {
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'abc123'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
        parameters: { temperature: 0.7, max_tokens: 4096 },
      };

      await recordAIVersion(versionData);

      expect(prisma.aIVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parameters: { temperature: 0.7, max_tokens: 4096 },
          }),
        })
      );
    });

    it('should return the created version with id', async () => {
      const mockVersion = {
        id: 'version_3',
        modelVersion: 'gpt-4-turbo',
        modelProvider: 'openai',
        promptVersion: 'v1.0.0',
        promptHash: 'def456'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
        parameters: null,
        createdAt: new Date(),
      };

      vi.mocked(prisma.aIVersion.create).mockResolvedValue(mockVersion);

      const version = await recordAIVersion({
        modelVersion: 'gpt-4-turbo',
        modelProvider: 'openai',
        promptVersion: 'v1.0.0',
        promptHash: 'def456'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
      });

      expect(version).toMatchObject({
        id: 'version_3',
        modelVersion: 'gpt-4-turbo',
        modelProvider: 'openai',
      });
    });
  });

  describe('getVersionForGeneration', () => {
    it('should return version used for specific generation', async () => {
      const mockGeneration = {
        id: 'generation_1',
        aiVersionId: 'version_1',
        aiVersion: {
          id: 'version_1',
          modelVersion: 'claude-3-opus-20240229',
          modelProvider: 'anthropic',
          promptVersion: 'v2.1.0',
          promptHash: 'abc123'.padEnd(64, '0'),
          embeddingModel: 'text-embedding-3-small',
          parameters: null,
          createdAt: new Date('2024-01-15'),
        },
      };

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue(
        mockGeneration as any
      );

      const version = await getVersionForGeneration('generation_1');

      expect(version).toMatchObject({
        modelVersion: 'claude-3-opus-20240229',
        promptVersion: 'v2.1.0',
        createdAt: expect.any(Date),
      });
    });

    it('should return null if generation not found', async () => {
      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue(null);

      const version = await getVersionForGeneration('non_existent');

      expect(version).toBeNull();
    });

    it('should return null if generation has no version', async () => {
      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue({
        id: 'generation_2',
        aiVersionId: null,
        aiVersion: null,
      } as any);

      const version = await getVersionForGeneration('generation_2');

      expect(version).toBeNull();
    });

    it('should query with include for aiVersion', async () => {
      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue(null);

      await getVersionForGeneration('test_id');

      expect(prisma.generatedComplaint.findUnique).toHaveBeenCalledWith({
        where: { id: 'test_id' },
        include: { aiVersion: true },
      });
    });
  });

  describe('Version Deduplication', () => {
    it('should find existing version with same hash', async () => {
      const existingVersion = {
        id: 'existing_version',
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'samehash'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
        parameters: null,
        createdAt: new Date(),
      };

      vi.mocked(prisma.aIVersion.findFirst).mockResolvedValue(existingVersion);

      const versionData: AIVersionData = {
        modelVersion: 'claude-3-opus-20240229',
        modelProvider: 'anthropic',
        promptVersion: 'v2.1.0',
        promptHash: 'samehash'.padEnd(64, '0'),
        embeddingModel: 'text-embedding-3-small',
      };

      const version = await recordAIVersion(versionData);

      // Should return existing version instead of creating new
      expect(version.id).toBe('existing_version');
      expect(prisma.aIVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw on database error when recording', async () => {
      vi.mocked(prisma.aIVersion.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.aIVersion.create).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        recordAIVersion({
          modelVersion: 'test',
          modelProvider: 'anthropic',
          promptVersion: 'v1',
          promptHash: 'hash'.padEnd(64, '0'),
          embeddingModel: 'test',
        })
      ).rejects.toThrow('Database error');
    });

    it('should throw on database error when fetching', async () => {
      vi.mocked(prisma.generatedComplaint.findUnique).mockRejectedValue(
        new Error('Database error')
      );

      await expect(getVersionForGeneration('test_id')).rejects.toThrow(
        'Database error'
      );
    });
  });
});
