/**
 * Data Residency Configuration
 * P3-3 Implementation
 *
 * Provides region configuration for data residency requirements,
 * organization settings, and compliance validation.
 */

/**
 * Region codes
 */
export type RegionCode = 'US' | 'EU' | 'UK';

/**
 * Compliance certification types
 */
export type ComplianceCertification = 'SOC2' | 'GDPR' | 'UK-GDPR' | 'HIPAA';

/**
 * Region configuration
 */
export interface RegionConfig {
  name: string;
  vercelRegion: string;
  supabaseRegion: string;
  compliant: ComplianceCertification[];
}

/**
 * Region definitions
 */
export const REGIONS: Record<RegionCode, RegionConfig> = {
  US: {
    name: 'United States',
    vercelRegion: 'iad1',
    supabaseRegion: 'us-east-1',
    compliant: ['SOC2'],
  },
  EU: {
    name: 'European Union',
    vercelRegion: 'fra1',
    supabaseRegion: 'eu-central-1',
    compliant: ['SOC2', 'GDPR'],
  },
  UK: {
    name: 'United Kingdom',
    vercelRegion: 'lhr1',
    supabaseRegion: 'eu-west-2',
    compliant: ['SOC2', 'UK-GDPR'],
  },
};

/**
 * In-memory storage for organization regions
 */
const organizationRegions = new Map<string, RegionCode>();

/**
 * Clear region store (for testing)
 */
export function clearRegionStore(): void {
  organizationRegions.clear();
}

/**
 * Get organization region setting
 *
 * @param organizationId - Organization ID
 * @returns Region code (defaults to US)
 */
export async function getOrganizationRegion(
  organizationId: string
): Promise<RegionCode> {
  return organizationRegions.get(organizationId) || 'US';
}

/**
 * Set organization region
 *
 * @param organizationId - Organization ID
 * @param region - Region code
 */
export async function setOrganizationRegion(
  organizationId: string,
  region: RegionCode
): Promise<void> {
  if (!REGIONS[region]) {
    throw new Error(`Invalid region code: ${region}`);
  }

  organizationRegions.set(organizationId, region);
}

/**
 * Compliance validation result
 */
export interface ComplianceValidationResult {
  compliant: boolean;
  region: RegionCode;
  required: ComplianceCertification[];
  available: ComplianceCertification[];
  missing: ComplianceCertification[];
}

/**
 * Validate region compliance against required certifications
 *
 * @param region - Region code
 * @param required - Required certifications
 * @returns Compliance validation result
 */
export function validateRegionCompliance(
  region: RegionCode,
  required: ComplianceCertification[]
): ComplianceValidationResult {
  const regionConfig = REGIONS[region];

  if (!regionConfig) {
    return {
      compliant: false,
      region,
      required,
      available: [],
      missing: required,
    };
  }

  const available = regionConfig.compliant;
  const missing = required.filter((cert) => !available.includes(cert));

  return {
    compliant: missing.length === 0,
    region,
    required,
    available,
    missing,
  };
}

/**
 * Get full region configuration
 *
 * @param region - Region code
 * @returns Region configuration or undefined
 */
export function getRegionConfig(region: RegionCode): RegionConfig | undefined {
  return REGIONS[region];
}

/**
 * Get all available regions
 *
 * @returns Array of region codes
 */
export function getAvailableRegions(): RegionCode[] {
  return Object.keys(REGIONS) as RegionCode[];
}

/**
 * Get regions matching compliance requirements
 *
 * @param required - Required certifications
 * @returns Array of compliant region codes
 */
export function getCompliantRegions(
  required: ComplianceCertification[]
): RegionCode[] {
  return getAvailableRegions().filter((region) => {
    const result = validateRegionCompliance(region, required);
    return result.compliant;
  });
}

/**
 * Check if region migration is valid
 *
 * @param fromRegion - Source region
 * @param toRegion - Target region
 * @returns Migration validity
 */
export function validateRegionMigration(
  fromRegion: RegionCode,
  toRegion: RegionCode
): {
  valid: boolean;
  reason?: string;
} {
  if (!REGIONS[fromRegion] || !REGIONS[toRegion]) {
    return { valid: false, reason: 'Invalid region code' };
  }

  // Data can always flow from less restrictive to more restrictive regions
  const fromCompliance = REGIONS[fromRegion].compliant;
  const toCompliance = REGIONS[toRegion].compliant;

  // Check for data sovereignty concerns
  if (fromCompliance.includes('GDPR') && !toCompliance.includes('GDPR')) {
    return {
      valid: false,
      reason: 'Cannot migrate GDPR data to non-GDPR compliant region',
    };
  }

  if (fromCompliance.includes('UK-GDPR') && !toCompliance.includes('UK-GDPR')) {
    return {
      valid: false,
      reason: 'Cannot migrate UK-GDPR data to non-UK-GDPR compliant region',
    };
  }

  return { valid: true };
}
