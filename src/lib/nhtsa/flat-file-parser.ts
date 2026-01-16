/**
 * NHTSA Flat File Parser
 * Parses the FLAT_CMPL.txt file from NHTSA
 * Format: Tab-delimited with 20+ fields per record
 */

import { Readable } from 'stream';
import { createInterface } from 'readline';
import { TransformedComplaint } from './types';

/**
 * Column indices for the NHTSA flat file format
 * These match the order of fields in FLAT_CMPL.txt
 * Based on official NHTSA data dictionary: https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt
 */
export const FLAT_FILE_COLUMNS = {
  CMPLID: 0,      // Unique complaint ID (CHAR 9)
  ODINO: 1,       // Internal reference number (CHAR 9)
  MFR_NAME: 2,    // Manufacturer name (CHAR 40)
  MAKETXT: 3,     // Vehicle make (CHAR 25)
  MODELTXT: 4,    // Vehicle model (CHAR 256)
  YEARTXT: 5,     // Model year (CHAR 4)
  CRASH: 6,       // Crash indicator (Y/N)
  FAILDATE: 7,    // Date of failure (YYYYMMDD)
  FIRE: 8,        // Fire indicator (Y/N)
  INJURED: 9,     // Number injured
  DEATHS: 10,     // Number of deaths
  COMPDESC: 11,   // Component description (CHAR 128)
  CITY: 12,       // City (CHAR 30)
  STATE: 13,      // State code (CHAR 2)
  VIN: 14,        // Partial VIN (CHAR 11)
  DATEA: 15,      // Date added (YYYYMMDD)
  LDATE: 16,      // Last update date (YYYYMMDD)
  MILES: 17,      // Vehicle mileage (NUMBER 7)
  OCCURENCES: 18, // Occurrence count (NUMBER 4)
  CDESCR: 19,     // Complaint description (CHAR 2048)
} as const;

/**
 * Minimum number of fields required for a valid record
 * Must have at least 20 fields to include CDESCR at index 19
 */
const MIN_FIELDS = 20;

/**
 * Flat file record type (raw parsed data)
 */
export interface FlatFileRecord {
  cmplid: string;
  odino: string;
  mfr_name: string;
  maketxt: string;
  modeltxt: string;
  yeartxt: string;
  crash: string;
  faildate: string;
  fire: string;
  injured: string;
  deaths: string;
  compdesc: string;
  city: string;
  state: string;
  vin: string;
  datea: string;
  ldate: string;
  miles: string;
  occurences: string;
  cdescr: string;
}

/**
 * Progress callback options
 */
export interface ParseOptions {
  onProgress?: (processed: number, errors: number) => void;
  progressInterval?: number; // Report progress every N records
}

/**
 * Parse a single tab-delimited line from the flat file
 * @param line - Raw line from the flat file
 * @returns Parsed record or null if invalid
 */
export function parseFlatFileLine(line: string): FlatFileRecord | null {
  if (!line || line.trim().length === 0) {
    return null;
  }

  const fields = line.split('\t');

  // Must have at least MIN_FIELDS
  if (fields.length < MIN_FIELDS) {
    return null;
  }

  // Extract and trim all fields using correct column indices
  const cmplid = fields[FLAT_FILE_COLUMNS.CMPLID]?.trim() || '';
  const odino = fields[FLAT_FILE_COLUMNS.ODINO]?.trim() || '';
  return {
    cmplid,
    odino: odino || cmplid, // Use ODINO field, fallback to CMPLID if empty
    mfr_name: fields[FLAT_FILE_COLUMNS.MFR_NAME]?.trim() || '',
    maketxt: fields[FLAT_FILE_COLUMNS.MAKETXT]?.trim() || '',
    modeltxt: fields[FLAT_FILE_COLUMNS.MODELTXT]?.trim() || '',
    yeartxt: fields[FLAT_FILE_COLUMNS.YEARTXT]?.trim() || '',
    crash: fields[FLAT_FILE_COLUMNS.CRASH]?.trim() || '',
    faildate: fields[FLAT_FILE_COLUMNS.FAILDATE]?.trim() || '',
    fire: fields[FLAT_FILE_COLUMNS.FIRE]?.trim() || '',
    injured: fields[FLAT_FILE_COLUMNS.INJURED]?.trim() || '',
    deaths: fields[FLAT_FILE_COLUMNS.DEATHS]?.trim() || '',
    compdesc: fields[FLAT_FILE_COLUMNS.COMPDESC]?.trim() || '',
    city: fields[FLAT_FILE_COLUMNS.CITY]?.trim() || '',
    state: fields[FLAT_FILE_COLUMNS.STATE]?.trim() || '',
    vin: fields[FLAT_FILE_COLUMNS.VIN]?.trim() || '',
    datea: fields[FLAT_FILE_COLUMNS.DATEA]?.trim() || '',
    ldate: fields[FLAT_FILE_COLUMNS.LDATE]?.trim() || '',
    miles: fields[FLAT_FILE_COLUMNS.MILES]?.trim() || '',
    occurences: fields[FLAT_FILE_COLUMNS.OCCURENCES]?.trim() || '',
    cdescr: fields[FLAT_FILE_COLUMNS.CDESCR]?.trim() || '',
  };
}

/**
 * Parse a stream of flat file lines into records
 * Uses async generator for memory-efficient processing
 * @param stream - Readable stream of file content
 * @param options - Parse options including progress callback
 */
export async function* parseFlatFileStream(
  stream: Readable,
  options: ParseOptions = {}
): AsyncGenerator<FlatFileRecord> {
  const { onProgress, progressInterval = 1000 } = options;

  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let processed = 0;
  let errors = 0;

  for await (const line of rl) {
    const record = parseFlatFileLine(line);

    if (record) {
      processed++;
      yield record;
    } else if (line.trim().length > 0) {
      // Count non-empty lines that failed to parse as errors
      errors++;
    }

    // Report progress
    if (onProgress && processed % progressInterval === 0) {
      onProgress(processed, errors);
    }
  }

  // Final progress report
  if (onProgress) {
    onProgress(processed, errors);
  }
}

/**
 * Parse NHTSA date format (YYYYMMDD) to Date object
 * @param dateStr - Date string in YYYYMMDD format
 * @returns Date object or null if invalid
 */
function parseNHTSADate(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 8) {
    return null;
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(dateStr.substring(6, 8), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  const date = new Date(year, month, day);

  // Validate the date is reasonable (1900-2100)
  if (date.getFullYear() < 1900 || date.getFullYear() > 2100) {
    return null;
  }

  return date;
}

/**
 * Parse year string to number
 * @param yearStr - Year string
 * @returns Year as number or null if invalid
 */
function parseYear(yearStr: string): number | null {
  const year = parseInt(yearStr, 10);

  if (isNaN(year)) {
    return null;
  }

  // Valid year range for vehicles
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 2) {
    return null;
  }

  return year;
}

/**
 * Validation result for a complaint record
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate a transformed complaint for data quality
 * Returns validation result with specific error messages
 * @param complaint - Transformed complaint to validate
 * @returns Validation result with isValid flag and error messages
 */
export function validateComplaint(complaint: TransformedComplaint): ValidationResult {
  const errors: string[] = [];

  // Year validation: must be present and valid
  if (complaint.year === null || complaint.year === undefined) {
    errors.push('Missing or invalid year');
  }

  // Description validation: must be meaningful text (not just numbers)
  if (!complaint.description || complaint.description.trim().length < 20) {
    errors.push('Description too short (must be at least 20 characters)');
  } else if (/^\d+$/.test(complaint.description.trim())) {
    errors.push('Description appears to be numeric only (likely mileage, not a complaint)');
  }

  // Component validation: must not be "0" or empty
  if (!complaint.component || complaint.component === '0' || complaint.component.trim().length < 2) {
    errors.push('Missing or invalid component');
  }

  // Make/Model validation: must be present
  if (!complaint.make || complaint.make.trim().length < 2) {
    errors.push('Missing or invalid make');
  }
  if (!complaint.model || complaint.model.trim().length < 1) {
    errors.push('Missing or invalid model');
  }

  // Manufacturer validation: should not be numeric-only (indicates bad column mapping)
  if (complaint.manufacturer && /^\d+$/.test(complaint.manufacturer.trim())) {
    errors.push('Manufacturer appears to be numeric ID instead of name');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a complaint passes minimum quality thresholds
 * Quick validation for filtering during import
 */
export function isQualityComplaint(complaint: TransformedComplaint): boolean {
  return (
    complaint.year !== null &&
    complaint.year !== undefined &&
    complaint.description !== null &&
    complaint.description.length >= 20 &&
    !/^\d+$/.test(complaint.description.trim()) &&
    complaint.component !== null &&
    complaint.component !== '0' &&
    complaint.component.length >= 2
  );
}

/**
 * Map a flat file record to our TransformedComplaint format
 * @param record - Raw flat file record
 * @returns Transformed complaint ready for database insertion
 */
export function mapFlatFileToComplaint(record: FlatFileRecord): TransformedComplaint {
  return {
    nhtsaId: record.cmplid,
    odiNumber: record.odino || record.cmplid, // Use cmplid as fallback
    manufacturer: record.mfr_name,
    make: record.maketxt,
    model: record.modeltxt,
    year: parseYear(record.yeartxt),
    component: record.compdesc,
    description: record.cdescr,
    crash: record.crash.toUpperCase() === 'Y',
    fire: record.fire.toUpperCase() === 'Y',
    injuries: parseInt(record.injured, 10) || 0,
    deaths: parseInt(record.deaths, 10) || 0,
    failDate: parseNHTSADate(record.faildate),
    dateAdded: parseNHTSADate(record.datea) || new Date(),
  };
}

export default {
  parseFlatFileLine,
  parseFlatFileStream,
  mapFlatFileToComplaint,
  FLAT_FILE_COLUMNS,
};
