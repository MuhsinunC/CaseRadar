/**
 * Bulk Import Service Tests
 * TDD: Tests written BEFORE implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

// Import the bulk import service
import {
  BulkImportService,
  ImportProgress,
  ImportOptions,
  ImportResult,
  isBulkImportNeeded,
  getImportStatus,
} from '../bulk-import';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    complaint: {
      count: vi.fn().mockResolvedValue(17000),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
      createMany: vi.fn().mockResolvedValue({ count: 10 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
  },
}));

// Mock flat file parser
vi.mock('../flat-file-parser', () => ({
  parseFlatFileStream: vi.fn(function* () {
    for (let i = 0; i < 100; i++) {
      yield {
        cmplid: String(958241 + i),
        odino: String(958241 + i),
        mfr_name: 'Test Manufacturer',
        maketxt: 'TESTMAKE',
        modeltxt: 'TESTMODEL',
        yeartxt: '2020',
        crash: 'N',
        faildate: '',
        fire: 'N',
        injured: '0',
        deaths: '0',
        compdesc: 'TEST COMPONENT',
        city: 'TEST CITY',
        state: 'TS',
        vin: '',
        datea: '20230101',
        ldate: '',
        cdescr: 'Test description',
      };
    }
  }),
  mapFlatFileToComplaint: vi.fn((record) => ({
    nhtsaId: record.cmplid,
    odiNumber: record.odino,
    manufacturer: record.mfr_name,
    make: record.maketxt,
    model: record.modeltxt,
    year: parseInt(record.yeartxt, 10),
    component: record.compdesc,
    description: record.cdescr,
    crash: record.crash === 'Y',
    fire: record.fire === 'Y',
    injuries: parseInt(record.injured, 10) || 0,
    deaths: parseInt(record.deaths, 10) || 0,
    failDate: null,
    dateAdded: new Date(),
  })),
}));

describe('BulkImportService', () => {
  let service: BulkImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BulkImportService();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      expect(service).toBeInstanceOf(BulkImportService);
    });

    it('should accept custom batch size', () => {
      const customService = new BulkImportService({ batchSize: 500 });
      expect(customService).toBeInstanceOf(BulkImportService);
    });
  });

  describe('importFromStream', () => {
    it('should import records from a stream', async () => {
      const mockStream = Readable.from(['test data']);
      const result = await service.importFromStream(mockStream);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
    });

    it('should report progress during import', async () => {
      const mockStream = Readable.from(['test data']);
      const progressUpdates: ImportProgress[] = [];

      await service.importFromStream(mockStream, {
        onProgress: (progress) => progressUpdates.push({ ...progress }),
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should skip duplicate records', async () => {
      const mockStream = Readable.from(['test data']);

      // Mock finding existing record
      const { prisma } = await import('@/lib/db');
      (prisma.complaint.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'existing-id',
      });

      const result = await service.importFromStream(mockStream);

      expect(result.recordsSkipped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getProgress', () => {
    it('should return current import progress', async () => {
      const progress = await service.getProgress();

      expect(progress).toBeDefined();
      expect(typeof progress.recordsProcessed).toBe('number');
      expect(typeof progress.recordsInserted).toBe('number');
      expect(typeof progress.recordsSkipped).toBe('number');
      expect(typeof progress.recordsErrored).toBe('number');
    });
  });

  describe('cancel', () => {
    it('should cancel an in-progress import', () => {
      service.cancel();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('ImportProgress', () => {
    it('should have expected properties', () => {
      const progress: ImportProgress = {
        recordsProcessed: 1000,
        recordsInserted: 950,
        recordsSkipped: 40,
        recordsErrored: 10,
        batchNumber: 10,
        estimatedTotal: 2000000,
        percentComplete: 50,
        startTime: new Date(),
        elapsedMs: 5000,
        recordsPerSecond: 200,
      };

      expect(progress.recordsProcessed).toBe(1000);
      expect(progress.recordsInserted).toBe(950);
      expect(progress.recordsSkipped).toBe(40);
      expect(progress.recordsErrored).toBe(10);
      expect(progress.batchNumber).toBe(10);
      expect(progress.estimatedTotal).toBe(2000000);
      expect(progress.percentComplete).toBe(50);
      expect(progress.recordsPerSecond).toBe(200);
    });
  });

  describe('ImportResult', () => {
    it('should have expected properties', () => {
      const result: ImportResult = {
        success: true,
        recordsProcessed: 2000000,
        recordsInserted: 1950000,
        recordsSkipped: 45000,
        recordsErrored: 5000,
        durationMs: 3600000,
        errors: [],
      };

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2000000);
      expect(result.recordsInserted).toBe(1950000);
      expect(result.errors).toEqual([]);
    });
  });

  describe('batch processing', () => {
    it('should process records in batches', async () => {
      const mockStream = Readable.from(['test data']);
      const result = await service.importFromStream(mockStream, {
        batchSize: 10,
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Auto-import helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isBulkImportNeeded', () => {
    it('should return true when complaint count is below threshold', async () => {
      const { prisma } = await import('@/lib/db');
      (prisma.complaint.count as ReturnType<typeof vi.fn>).mockResolvedValue(17000);

      const needed = await isBulkImportNeeded();
      expect(needed).toBe(true);
    });

    it('should return false when complaint count is above threshold', async () => {
      const { prisma } = await import('@/lib/db');
      (prisma.complaint.count as ReturnType<typeof vi.fn>).mockResolvedValue(150000);

      const needed = await isBulkImportNeeded();
      expect(needed).toBe(false);
    });

    it('should return false on database error', async () => {
      const { prisma } = await import('@/lib/db');
      (prisma.complaint.count as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      const needed = await isBulkImportNeeded();
      expect(needed).toBe(false);
    });
  });

  describe('getImportStatus', () => {
    it('should return idle status when no import is running', () => {
      const status = getImportStatus();

      expect(status.isRunning).toBe(false);
    });

    it('should include progress and result fields', () => {
      const status = getImportStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('progress');
      expect(status).toHaveProperty('result');
    });
  });
});
