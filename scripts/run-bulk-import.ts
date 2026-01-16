#!/usr/bin/env npx tsx
/**
 * Run Bulk Import Script
 *
 * Runs the NHTSA bulk import to populate the database with 2M+ complaints.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/run-bulk-import.ts
 *
 * For K8s (with port-forward active):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/caseradar" npx tsx scripts/run-bulk-import.ts
 */

import { runBulkImport, isBulkImportNeeded, getImportStatus } from '../src/lib/nhtsa/bulk-import';

async function main() {
  console.log('=== NHTSA Bulk Import ===\n');

  // Check database connection
  console.log('Checking database connection...');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    console.log('Usage: DATABASE_URL="postgresql://..." npx tsx scripts/run-bulk-import.ts');
    process.exit(1);
  }

  // Mask password in URL for logging
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
  console.log(`Using database: ${maskedUrl}\n`);

  // Check if import is needed
  console.log('Checking if import is needed...');
  const needed = await isBulkImportNeeded();

  if (!needed) {
    console.log('\nDatabase already has sufficient complaints. Import not needed.');
    console.log('To force a re-import, clear the database first.');
    process.exit(0);
  }

  console.log('\nDatabase is under-populated. Starting bulk import...\n');
  console.log('This will download ~120MB of data and import 2M+ records.');
  console.log('Estimated time: 30-60 minutes\n');

  const startTime = Date.now();

  try {
    const result = await runBulkImport();

    const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n=== Import Complete ===\n');
    console.log(`Records processed:  ${result.recordsProcessed.toLocaleString()}`);
    console.log(`Records inserted:   ${result.recordsInserted.toLocaleString()}`);
    console.log(`Records skipped:    ${result.recordsSkipped.toLocaleString()}`);
    console.log(`Records rejected:   ${result.recordsRejected.toLocaleString()}`);
    console.log(`Records errored:    ${result.recordsErrored.toLocaleString()}`);
    console.log(`Duration:           ${durationMin} minutes`);
    console.log(`Success:            ${result.success ? 'YES' : 'NO'}`);

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  }
}

main();
