/**
 * MFA Enforcement Tests
 * P2-3 Implementation - TDD
 *
 * Tests for Multi-Factor Authentication enforcement for admin users.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMFARequired,
  checkMFAStatus,
  MFAStatus,
  MFA_REQUIRED_ROLES,
} from '../mfa';

// Mock Clerk client
const mockGetUser = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: () => ({
    users: {
      getUser: mockGetUser,
    },
  }),
}));

describe('MFA Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MFA_REQUIRED_ROLES', () => {
    it('should export the list of roles requiring MFA', () => {
      expect(Array.isArray(MFA_REQUIRED_ROLES)).toBe(true);
      expect(MFA_REQUIRED_ROLES).toContain('ADMIN');
    });
  });

  describe('isMFARequired', () => {
    it('should require MFA for ADMIN role', () => {
      expect(isMFARequired('ADMIN')).toBe(true);
    });

    it('should not require MFA for ANALYST role', () => {
      expect(isMFARequired('ANALYST')).toBe(false);
    });

    it('should not require MFA for VIEWER role', () => {
      expect(isMFARequired('VIEWER')).toBe(false);
    });

    it('should not require MFA for MEMBER role', () => {
      expect(isMFARequired('MEMBER')).toBe(false);
    });

    it('should handle unknown roles', () => {
      expect(isMFARequired('UNKNOWN')).toBe(false);
    });

    it('should handle empty string role', () => {
      expect(isMFARequired('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isMFARequired('admin')).toBe(false);
      expect(isMFARequired('Admin')).toBe(false);
    });
  });

  describe('checkMFAStatus', () => {
    it('should return enabled: true when user has MFA', async () => {
      mockGetUser.mockResolvedValue({
        id: 'user-123',
        twoFactorEnabled: true,
      });

      const status = await checkMFAStatus('user-123');

      expect(status.enabled).toBe(true);
      expect(status.userId).toBe('user-123');
    });

    it('should return enabled: false when user lacks MFA', async () => {
      mockGetUser.mockResolvedValue({
        id: 'user-123',
        twoFactorEnabled: false,
      });

      const status = await checkMFAStatus('user-123');

      expect(status.enabled).toBe(false);
      expect(status.userId).toBe('user-123');
    });

    it('should handle user not found', async () => {
      mockGetUser.mockRejectedValue(new Error('User not found'));

      const status = await checkMFAStatus('nonexistent-user');

      expect(status.enabled).toBe(false);
      expect(status.error).toBeDefined();
    });

    it('should return false when twoFactorEnabled is undefined', async () => {
      mockGetUser.mockResolvedValue({
        id: 'user-123',
        // twoFactorEnabled not set
      });

      const status = await checkMFAStatus('user-123');

      expect(status.enabled).toBe(false);
    });
  });

  describe('MFAStatus interface', () => {
    it('should have correct structure', () => {
      const status: MFAStatus = {
        userId: 'user-123',
        enabled: true,
      };

      expect(status.userId).toBe('user-123');
      expect(status.enabled).toBe(true);
    });

    it('should allow optional error field', () => {
      const status: MFAStatus = {
        userId: 'user-123',
        enabled: false,
        error: 'User not found',
      };

      expect(status.error).toBe('User not found');
    });
  });
});
