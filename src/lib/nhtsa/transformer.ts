/**
 * NHTSA Data Transformer
 * Converts raw NHTSA API data to our database model format
 */

import {
  NHTSAComplaintRaw,
  SODAComplaintRecord,
  TransformedComplaint,
} from './types';

/**
 * Parse NHTSA date string (YYYYMMDD) to Date object
 */
function parseNHTSADate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.length !== 8) {
    return null;
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
  const day = parseInt(dateStr.substring(6, 8), 10);

  const date = new Date(year, month, day);

  // Validate the date
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Parse boolean from Y/N or Yes/No string
 */
function parseBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === 'Y' || normalized === 'YES';
}

/**
 * Parse integer from string with fallback to 0
 */
function parseInteger(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalize text: trim, handle nulls, and standardize whitespace
 */
function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\r\n/g, '\n');
}

/**
 * Extract primary component from component description
 * NHTSA format: "CATEGORY:SUBCATEGORY:PART"
 */
function extractComponent(compDesc: string): string {
  if (!compDesc) return 'UNKNOWN';

  // Take the first part before colon, or entire string
  const parts = compDesc.split(':');
  return normalizeText(parts[0]) || 'UNKNOWN';
}

/**
 * Transform SODA API record to our database format
 */
export function transformSODARecord(record: SODAComplaintRecord): TransformedComplaint {
  // Parse dateAdded - required field
  const dateAdded = parseNHTSADate(record.datea);
  if (!dateAdded) {
    throw new Error(`Invalid date for complaint ${record.cmplid}: ${record.datea}`);
  }

  return {
    nhtsaId: record.cmplid,
    odiNumber: record.odino || '',
    manufacturer: normalizeText(record.mfr_name),
    make: normalizeText(record.maketxt).toUpperCase(),
    model: normalizeText(record.modeltxt),
    year: parseInteger(record.yeartxt),
    component: extractComponent(record.compdesc),
    description: normalizeText(record.cdescr),
    crash: parseBoolean(record.crash),
    fire: parseBoolean(record.fire),
    injuries: parseInteger(record.injured),
    deaths: parseInteger(record.deaths),
    failDate: parseNHTSADate(record.faildate),
    dateAdded,
  };
}

/**
 * Transform API response record to our database format
 */
export function transformAPIRecord(record: NHTSAComplaintRaw): TransformedComplaint | null {
  // API response format is different, needs different handling
  const product = record.products?.[0];

  if (!product) {
    console.warn(`Complaint ${record.odiNumber} has no product info`);
    return null;
  }

  // Parse date from complaint filed date or incident date
  const dateStr = record.dateComplaintFiled || record.dateOfIncident;
  const dateAdded = dateStr ? new Date(dateStr) : new Date();

  if (isNaN(dateAdded.getTime())) {
    console.warn(`Invalid date for complaint ${record.odiNumber}`);
    return null;
  }

  return {
    nhtsaId: record.odiNumber, // Using odiNumber as primary key from API
    odiNumber: record.odiNumber,
    manufacturer: normalizeText(record.manufacturer),
    make: normalizeText(product.make).toUpperCase(),
    model: normalizeText(product.model),
    year: product.year,
    component: extractComponent(record.components),
    description: normalizeText(record.summary),
    crash: parseBoolean(record.crash),
    fire: parseBoolean(record.fire),
    injuries: parseInteger(record.numberOfInjured),
    deaths: parseInteger(record.numberOfDeaths),
    failDate: record.dateOfIncident ? new Date(record.dateOfIncident) : null,
    dateAdded,
  };
}

/**
 * Batch transform SODA records with error handling
 */
export function transformSODARecords(
  records: SODAComplaintRecord[]
): { transformed: TransformedComplaint[]; errors: string[] } {
  const transformed: TransformedComplaint[] = [];
  const errors: string[] = [];

  for (const record of records) {
    try {
      const result = transformSODARecord(record);
      transformed.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to transform ${record.cmplid}: ${message}`);
    }
  }

  return { transformed, errors };
}

/**
 * Batch transform API response records with error handling
 */
export function transformAPIRecords(
  records: NHTSAComplaintRaw[]
): { transformed: TransformedComplaint[]; errors: string[] } {
  const transformed: TransformedComplaint[] = [];
  const errors: string[] = [];

  for (const record of records) {
    try {
      const result = transformAPIRecord(record);
      if (result) {
        transformed.push(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to transform ${record.odiNumber}: ${message}`);
    }
  }

  return { transformed, errors };
}

/**
 * Validate transformed complaint data
 */
export function validateComplaint(complaint: TransformedComplaint): string[] {
  const errors: string[] = [];

  if (!complaint.nhtsaId) {
    errors.push('Missing nhtsaId');
  }
  if (!complaint.make) {
    errors.push('Missing make');
  }
  if (!complaint.model) {
    errors.push('Missing model');
  }
  if (!complaint.year || complaint.year < 1900 || complaint.year > 2100) {
    errors.push(`Invalid year: ${complaint.year}`);
  }
  if (!complaint.component) {
    errors.push('Missing component');
  }
  if (!complaint.description) {
    errors.push('Missing description');
  }
  if (!complaint.dateAdded) {
    errors.push('Missing dateAdded');
  }

  return errors;
}

/**
 * Calculate severity score for a complaint
 * Higher score = more severe
 */
export function calculateSeverityScore(complaint: TransformedComplaint): number {
  let score = 0;

  // Base score for having a complaint
  score += 10;

  // Crash involvement
  if (complaint.crash) {
    score += 30;
  }

  // Fire involvement
  if (complaint.fire) {
    score += 40;
  }

  // Injuries
  if (complaint.injuries > 0) {
    score += 20 + Math.min(complaint.injuries * 10, 50);
  }

  // Deaths (most severe)
  if (complaint.deaths > 0) {
    score += 50 + Math.min(complaint.deaths * 25, 100);
  }

  return Math.min(score, 200); // Cap at 200
}
