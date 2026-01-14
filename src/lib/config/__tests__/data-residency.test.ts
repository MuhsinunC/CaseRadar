/**
 * Data Residency Configuration Tests
 * P3-3 Implementation - TDD
 *
 * Tests for region configuration, organization settings, and compliance validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOrganizationRegion,
  setOrganizationRegion,
  validateRegionCompliance,
  getRegionConfig,
  REGIONS,
  RegionCode,
  clearRegionStore,
} from '../data-residency';

describe('Data Residency', () => {
  beforeEach(() => {
    clearRegionStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearRegionStore();
  });

  describe('Region Definitions', () => {
    it('should define US region', () => {
      expect(REGIONS.US).toBeDefined();
      expect(REGIONS.US.name).toBe('United States');
    });

    it('should define EU region', () => {
      expect(REGIONS.EU).toBeDefined();
      expect(REGIONS.EU.name).toBe('European Union');
    });

    it('should define UK region', () => {
      expect(REGIONS.UK).toBeDefined();
      expect(REGIONS.UK.name).toBe('United Kingdom');
    });

    it('should include Vercel region for US', () => {
      expect(REGIONS.US.vercelRegion).toBe('iad1');
    });

    it('should include Vercel region for EU', () => {
      expect(REGIONS.EU.vercelRegion).toBe('fra1');
    });

    it('should include Vercel region for UK', () => {
      expect(REGIONS.UK.vercelRegion).toBe('lhr1');
    });

    it('should include Supabase region for US', () => {
      expect(REGIONS.US.supabaseRegion).toBe('us-east-1');
    });

    it('should include Supabase region for EU', () => {
      expect(REGIONS.EU.supabaseRegion).toBe('eu-central-1');
    });

    it('should include Supabase region for UK', () => {
      expect(REGIONS.UK.supabaseRegion).toBe('eu-west-2');
    });

    it('should define compliance certifications for each region', () => {
      expect(REGIONS.US.compliant).toContain('SOC2');
      expect(REGIONS.EU.compliant).toContain('GDPR');
      expect(REGIONS.UK.compliant).toContain('UK-GDPR');
    });
  });

  describe('getOrganizationRegion', () => {
    it('should return organization region setting', async () => {
      await setOrganizationRegion('org-123', 'EU');

      const region = await getOrganizationRegion('org-123');
      expect(Object.keys(REGIONS)).toContain(region);
      expect(region).toBe('EU');
    });

    it('should default to US if not set', async () => {
      const region = await getOrganizationRegion('org-no-region');
      expect(region).toBe('US');
    });

    it('should return consistent region for same org', async () => {
      await setOrganizationRegion('org-consistent', 'UK');

      const region1 = await getOrganizationRegion('org-consistent');
      const region2 = await getOrganizationRegion('org-consistent');

      expect(region1).toBe(region2);
    });
  });

  describe('setOrganizationRegion', () => {
    it('should set organization region', async () => {
      await setOrganizationRegion('org-new', 'EU');

      const region = await getOrganizationRegion('org-new');
      expect(region).toBe('EU');
    });

    it('should overwrite existing region', async () => {
      await setOrganizationRegion('org-change', 'US');
      await setOrganizationRegion('org-change', 'UK');

      const region = await getOrganizationRegion('org-change');
      expect(region).toBe('UK');
    });

    it('should validate region code', async () => {
      await expect(
        setOrganizationRegion('org-invalid', 'INVALID' as RegionCode)
      ).rejects.toThrow();
    });
  });

  describe('validateRegionCompliance', () => {
    it('should validate GDPR compliance for EU region', () => {
      const result = validateRegionCompliance('EU', ['GDPR']);
      expect(result.compliant).toBe(true);
    });

    it('should fail GDPR compliance for US region', () => {
      const result = validateRegionCompliance('US', ['GDPR']);
      expect(result.compliant).toBe(false);
    });

    it('should validate SOC2 for all regions', () => {
      const usResult = validateRegionCompliance('US', ['SOC2']);
      const euResult = validateRegionCompliance('EU', ['SOC2']);
      const ukResult = validateRegionCompliance('UK', ['SOC2']);

      expect(usResult.compliant).toBe(true);
      expect(euResult.compliant).toBe(true);
      expect(ukResult.compliant).toBe(true);
    });

    it('should validate UK-GDPR for UK region', () => {
      const result = validateRegionCompliance('UK', ['UK-GDPR']);
      expect(result.compliant).toBe(true);
    });

    it('should fail UK-GDPR for other regions', () => {
      const usResult = validateRegionCompliance('US', ['UK-GDPR']);
      const euResult = validateRegionCompliance('EU', ['UK-GDPR']);

      expect(usResult.compliant).toBe(false);
      expect(euResult.compliant).toBe(false);
    });

    it('should require all requested certifications', () => {
      const result = validateRegionCompliance('US', ['SOC2', 'GDPR']);
      expect(result.compliant).toBe(false);
      expect(result.missing).toContain('GDPR');
    });

    it('should return missing certifications', () => {
      const result = validateRegionCompliance('US', ['GDPR', 'HIPAA']);
      expect(result.missing).toContain('GDPR');
      expect(result.missing).toContain('HIPAA');
    });
  });

  describe('getRegionConfig', () => {
    it('should return full region configuration', () => {
      const config = getRegionConfig('EU');

      expect(config).toMatchObject({
        name: 'European Union',
        vercelRegion: 'fra1',
        supabaseRegion: 'eu-central-1',
        compliant: expect.arrayContaining(['GDPR']),
      });
    });

    it('should return undefined for invalid region', () => {
      const config = getRegionConfig('INVALID' as RegionCode);
      expect(config).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty compliance requirements', () => {
      const result = validateRegionCompliance('US', []);
      expect(result.compliant).toBe(true);
    });

    it('should handle concurrent region updates', async () => {
      const updates = [
        setOrganizationRegion('org-concurrent', 'US'),
        setOrganizationRegion('org-concurrent', 'EU'),
        setOrganizationRegion('org-concurrent', 'UK'),
      ];

      await Promise.all(updates);

      const region = await getOrganizationRegion('org-concurrent');
      expect(['US', 'EU', 'UK']).toContain(region);
    });
  });
});
