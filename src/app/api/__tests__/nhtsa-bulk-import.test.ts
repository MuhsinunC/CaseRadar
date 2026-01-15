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

// Mock bulk import functions
const mockGetImportStatus = vi.fn();
const mockRunBulkImport = vi.fn();
const mockIsBulkImportNeeded = vi.fn();

vi.mock('@/lib/nhtsa/bulk-import', () => ({
  getImportStatus: () => mockGetImportStatus(),
  runBulkImport: () => mockRunBulkImport(),
  isBulkImportNeeded: () => mockIsBulkImportNeeded(),
}));

describe('NHTSA Bulk Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockGetImportStatus.mockReturnValue({
      isRunning: false,
      progress: null,
      result: null,
    });
    mockIsBulkImportNeeded.mockResolvedValue(true);
    mockRunBulkImport.mockResolvedValue({
      success: true,
      recordsProcessed: 100,
      recordsInserted: 95,
      recordsSkipped: 3,
      recordsErrored: 2,
      durationMs: 1000,
      errors: [],
    });
  });

  describe('GET /api/nhtsa/bulk-import', () => {
    it('should return idle status when no import is running', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('idle');
      expect(data.importNeeded).toBe(true);
    });

    it('should return running status when import is in progress', async () => {
      mockGetImportStatus.mockReturnValue({
        isRunning: true,
        progress: {
          recordsProcessed: 50,
          recordsInserted: 48,
          percentComplete: 2,
        },
        result: null,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('running');
      expect(data.progress).toBeDefined();
    });

    it('should require authentication', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const response = await GET();
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/nhtsa/bulk-import', () => {
    it('should start a bulk import when needed', async () => {
      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('running');
    });

    it('should reject when import not needed and force not set', async () => {
      mockIsBulkImportNeeded.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.message).toContain('sufficient');
    });

    it('should allow force import when database has sufficient data', async () => {
      mockIsBulkImportNeeded.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject when import already in progress', async () => {
      mockGetImportStatus.mockReturnValue({
        isRunning: true,
        progress: { recordsProcessed: 100 },
        result: null,
      });

      const request = new NextRequest('http://localhost/api/nhtsa/bulk-import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(409);
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
    it('should return message when no import is running', async () => {
      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.message).toContain('No import in progress');
    });

    it('should inform cancellation not supported', async () => {
      mockGetImportStatus.mockReturnValue({
        isRunning: true,
        progress: { recordsProcessed: 100 },
        result: null,
      });

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('not supported');
    });

    it('should require authentication', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const response = await DELETE();
      expect(response.status).toBe(401);
    });
  });
});
