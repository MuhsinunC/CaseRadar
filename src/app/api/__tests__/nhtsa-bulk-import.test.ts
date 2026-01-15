/**
 * NHTSA Bulk Import API Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from '../nhtsa/bulk-import/route';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@example.com' }),
}));

// Mock bulk import service
vi.mock('@/lib/nhtsa/bulk-import', () => {
  return {
    BulkImportService: class MockBulkImportService {
      importFromStream = vi.fn().mockResolvedValue({
        success: true,
        recordsProcessed: 100,
        recordsInserted: 95,
        recordsSkipped: 3,
        recordsErrored: 2,
        durationMs: 1000,
        errors: [],
      });
      getProgress = vi.fn().mockResolvedValue({
        recordsProcessed: 50,
        recordsInserted: 48,
        recordsSkipped: 1,
        recordsErrored: 1,
        batchNumber: 5,
        estimatedTotal: 2000000,
        percentComplete: 0,
        startTime: new Date(),
        elapsedMs: 500,
        recordsPerSecond: 100,
      });
      cancel = vi.fn();
    },
  };
});

// Mock flat file downloader
vi.mock('@/lib/nhtsa/flat-file-downloader', () => ({
  downloadAndExtract: vi.fn().mockResolvedValue('/tmp/test/FLAT_CMPL.txt'),
  getFlatFileStream: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield 'test data';
    },
  }),
}));


describe('NHTSA Bulk Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/nhtsa/bulk-import', () => {
    it('should return idle status when no import is running', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('idle');
    });

    it('should require authentication', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const response = await GET();
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/nhtsa/bulk-import', () => {
    it('should start a bulk import', async () => {
      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('downloading');
    });

    it('should accept custom batch size', async () => {
      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ batchSize: 500 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should require authentication', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/nhtsa/bulk-import', () => {
    it('should require authentication', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const response = await DELETE();
      expect(response.status).toBe(401);
    });
  });
});
