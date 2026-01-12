/**
 * Audit Logging Tests
 * Tests for security audit trail functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAuditLog,
  getAuditLogs,
  AuditAction,
  AuditResource,
  formatAuditEntry,
  filterSensitiveData,
  createAuditMiddleware,
  logAuthEvent,
  logDataAccess,
  logDataModification,
} from '../audit-logging';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

describe('Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuditLog', () => {
    it('should create an audit log entry', async () => {
      const mockLog = {
        id: 'log-1',
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'CREATE' as AuditAction,
        resource: 'COMPLAINT' as AuditResource,
        resourceId: 'complaint-1',
        metadata: {},
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
        createdAt: new Date(),
      };

      vi.mocked(prisma.auditLog.create).mockResolvedValue(mockLog);

      const result = await createAuditLog({
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'CREATE',
        resource: 'COMPLAINT',
        resourceId: 'complaint-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'CREATE',
          resource: 'COMPLAINT',
          resourceId: 'complaint-1',
        }),
      });
      expect(result).toEqual(mockLog);
    });

    it('should include timestamp automatically', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await createAuditLog({
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'READ',
        resource: 'PATTERN',
        resourceId: 'pattern-1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdAt: expect.any(Date),
        }),
      });
    });

    it('should store metadata when provided', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await createAuditLog({
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'UPDATE',
        resource: 'USER',
        resourceId: 'user-2',
        metadata: { field: 'role', oldValue: 'viewer', newValue: 'analyst' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { field: 'role', oldValue: 'viewer', newValue: 'analyst' },
        }),
      });
    });

    it('should log authentication events', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await createAuditLog({
        userId: 'user-1',
        organizationId: null,
        action: 'LOGIN',
        resource: 'AUTH',
        resourceId: null,
        ipAddress: '192.168.1.1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'LOGIN',
          resource: 'AUTH',
        }),
      });
    });

    it('should log failed authentication attempts', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await createAuditLog({
        userId: null,
        organizationId: null,
        action: 'LOGIN_FAILED',
        resource: 'AUTH',
        resourceId: null,
        metadata: { email: 'test@example.com', reason: 'invalid_password' },
        ipAddress: '192.168.1.1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with pagination', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'CREATE' },
        { id: 'log-2', action: 'UPDATE' },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs as any);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(10);

      const result = await getAuditLogs({
        organizationId: 'org-1',
        page: 1,
        limit: 10,
      });

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(10);
    });

    it('should filter by user', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      await getAuditLogs({
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
          }),
        })
      );
    });

    it('should filter by action type', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      await getAuditLogs({
        organizationId: 'org-1',
        action: 'DELETE',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'DELETE',
          }),
        })
      );
    });

    it('should filter by resource type', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      await getAuditLogs({
        organizationId: 'org-1',
        resource: 'COMPLAINT',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resource: 'COMPLAINT',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await getAuditLogs({
        organizationId: 'org-1',
        startDate,
        endDate,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });

    it('should order by createdAt descending by default', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      await getAuditLogs({ organizationId: 'org-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('formatAuditEntry', () => {
    it('should format create action', () => {
      const entry = {
        action: 'CREATE' as AuditAction,
        resource: 'COMPLAINT' as AuditResource,
        resourceId: 'complaint-1',
        userId: 'user-1',
        createdAt: new Date('2024-01-15T10:30:00Z'),
      };

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('created');
      expect(formatted).toContain('COMPLAINT');
    });

    it('should format delete action', () => {
      const entry = {
        action: 'DELETE' as AuditAction,
        resource: 'PATTERN' as AuditResource,
        resourceId: 'pattern-1',
        userId: 'user-1',
        createdAt: new Date('2024-01-15T10:30:00Z'),
      };

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('deleted');
      expect(formatted).toContain('PATTERN');
    });

    it('should format login action', () => {
      const entry = {
        action: 'LOGIN' as AuditAction,
        resource: 'AUTH' as AuditResource,
        resourceId: null,
        userId: 'user-1',
        createdAt: new Date('2024-01-15T10:30:00Z'),
      };

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('logged in');
    });
  });

  describe('filterSensitiveData', () => {
    it('should redact password fields', () => {
      const data = { email: 'test@example.com', password: 'secret123' };
      const filtered = filterSensitiveData(data);
      expect(filtered.password).toBe('[REDACTED]');
      expect(filtered.email).toBe('test@example.com');
    });

    it('should redact token fields', () => {
      const data = { token: 'abc123', userId: 'user-1' };
      const filtered = filterSensitiveData(data);
      expect(filtered.token).toBe('[REDACTED]');
    });

    it('should redact API keys', () => {
      const data = { apiKey: 'sk-123456', name: 'Test' };
      const filtered = filterSensitiveData(data);
      expect(filtered.apiKey).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = { user: { password: 'secret' }, name: 'Test' };
      const filtered = filterSensitiveData(data);
      expect(filtered.user.password).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive data', () => {
      const data = { name: 'Test', email: 'test@example.com', role: 'admin' };
      const filtered = filterSensitiveData(data);
      expect(filtered).toEqual(data);
    });
  });

  describe('createAuditMiddleware', () => {
    it('should create a middleware function', () => {
      const middleware = createAuditMiddleware({
        resource: 'COMPLAINT',
        action: 'CREATE',
      });

      expect(typeof middleware).toBe('function');
    });

    it('should create audit log when middleware is called', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const middleware = createAuditMiddleware({
        resource: 'PATTERN',
        action: 'UPDATE',
      });

      await middleware('user-1', 'org-1', 'pattern-1', { test: true });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'UPDATE',
          resource: 'PATTERN',
          resourceId: 'pattern-1',
        }),
      });
    });

    it('should pass request info to audit log', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const middleware = createAuditMiddleware({
        resource: 'USER',
        action: 'DELETE',
      });

      await middleware('user-1', 'org-1', 'user-2', {}, {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Test Browser' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Test Browser',
        }),
      });
    });
  });

  describe('logAuthEvent', () => {
    it('should log LOGIN event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logAuthEvent('LOGIN', 'user-1', { browser: 'Chrome' }, '192.168.1.1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'LOGIN',
          resource: 'AUTH',
          ipAddress: '192.168.1.1',
        }),
      });
    });

    it('should log LOGOUT event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logAuthEvent('LOGOUT', 'user-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'LOGOUT',
          resource: 'AUTH',
        }),
      });
    });

    it('should log LOGIN_FAILED event with null userId', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logAuthEvent('LOGIN_FAILED', null, { email: 'test@example.com' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'LOGIN_FAILED',
          resource: 'AUTH',
        }),
      });
      // The userId may be null or undefined depending on how it's passed through
      const callArgs = vi.mocked(prisma.auditLog.create).mock.calls[0][0];
      expect(callArgs.data.userId).toBeFalsy();
    });
  });

  describe('logDataAccess', () => {
    it('should log READ access by default', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logDataAccess('user-1', 'org-1', 'COMPLAINT', 'complaint-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'READ',
          resource: 'COMPLAINT',
          resourceId: 'complaint-1',
        }),
      });
    });

    it('should log EXPORT access when specified', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logDataAccess('user-1', 'org-1', 'PATTERN', 'pattern-1', 'EXPORT');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'EXPORT',
          resource: 'PATTERN',
        }),
      });
    });
  });

  describe('logDataModification', () => {
    it('should log CREATE action', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logDataModification('user-1', 'org-1', 'COMPLAINT', 'complaint-1', 'CREATE');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          resource: 'COMPLAINT',
        }),
      });
    });

    it('should log UPDATE action with changes', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logDataModification('user-1', 'org-1', 'USER', 'user-2', 'UPDATE', {
        before: { role: 'VIEWER' },
        after: { role: 'ANALYST' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE',
          resource: 'USER',
          metadata: {
            before: { role: 'VIEWER' },
            after: { role: 'ANALYST' },
          },
        }),
      });
    });

    it('should log DELETE action', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logDataModification('user-1', 'org-1', 'PATTERN', 'pattern-1', 'DELETE');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DELETE',
          resource: 'PATTERN',
        }),
      });
    });
  });
});
