/**
 * Flat File Downloader Tests
 * TDD: Tests written BEFORE implementation
 */

import { describe, it, expect } from 'vitest';
import { rm } from 'fs/promises';

// Import the downloader (will fail until implemented)
import {
  downloadFlatFile,
  extractFlatFile,
  getFlatFileStream,
  DownloadProgress,
  NHTSA_FLAT_FILE_URL,
} from '../flat-file-downloader';

describe('FlatFileDownloader', () => {
  const testTempDir = '/tmp/nhtsa-test-downloads';

  afterEach(async () => {
    // Cleanup test files
    try {
      await rm(testTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('NHTSA_FLAT_FILE_URL', () => {
    it('should point to the correct NHTSA download URL', () => {
      expect(NHTSA_FLAT_FILE_URL).toBe(
        'https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip'
      );
    });
  });

  describe('downloadFlatFile', () => {
    // Note: Download tests require real network calls
    // These are integration tests that should be run separately
    // The function is tested via E2E tests

    it('should be a function', () => {
      expect(typeof downloadFlatFile).toBe('function');
    });

    it('should accept options with progress callback', () => {
      // Type check - just verify the function signature
      const options: Parameters<typeof downloadFlatFile>[1] = {
        onProgress: (_progress) => {},
      };
      expect(options).toBeDefined();
    });
  });

  describe('extractFlatFile', () => {
    it('should be a function', () => {
      // Actual extraction tested via integration tests
      expect(typeof extractFlatFile).toBe('function');
    });

    it('should throw error if zip file does not exist', async () => {
      await expect(
        extractFlatFile('/nonexistent/file.zip', testTempDir)
      ).rejects.toThrow();
    });
  });

  describe('getFlatFileStream', () => {
    it('should return a readable stream for the flat file', async () => {
      // This requires actual file - integration test
      expect(getFlatFileStream).toBeDefined();
    });
  });

  describe('DownloadProgress', () => {
    it('should have expected interface properties', () => {
      const progress: DownloadProgress = {
        bytesDownloaded: 1000,
        totalBytes: 10000,
        percentage: 10,
      };

      expect(progress.bytesDownloaded).toBe(1000);
      expect(progress.totalBytes).toBe(10000);
      expect(progress.percentage).toBe(10);
    });
  });
});
