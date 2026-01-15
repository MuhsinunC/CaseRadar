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
 * Note: The flat file has no ODINO column - we use CMPLID as odiNumber
 */
export const FLAT_FILE_COLUMNS = {
  CMPLID: 0,      // Unique complaint ID (also used as odiNumber)
  ODINO: 1,       // Index 1 is actually MFR_NAME in the file, but kept for API compatibility
  MFR_NAME: 1,    // Manufacturer name
  MAKETXT: 2,     // Vehicle make
  MODELTXT: 3,    // Vehicle model
  YEARTXT: 4,     // Model year
  CRASH: 5,       // Crash indicator (Y/N)
  FAILDATE: 6,    // Date of failure (YYYYMMDD)
  FIRE: 7,        // Fire indicator (Y/N)
  INJURED: 8,     // Number injured
  DEATHS: 9,      // Number of deaths
  COMPDESC: 10,   // Component description
  CITY: 11,       // City
  STATE: 12,      // State
  VIN: 13,        // Partial VIN
  DATEA: 14,      // Date added (YYYYMMDD)
  LDATE: 15,      // Last update date (YYYYMMDD)
  CDESCR: 17,     // Complaint description (index 16 is empty)
} as const;

/**
 * Minimum number of fields required for a valid record
 */
const MIN_FIELDS = 18;

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

  // Extract and trim all fields
  const cmplid = fields[FLAT_FILE_COLUMNS.CMPLID]?.trim() || '';
  return {
    cmplid,
    odino: cmplid, // NHTSA flat file doesn't have separate ODINO, use CMPLID
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
