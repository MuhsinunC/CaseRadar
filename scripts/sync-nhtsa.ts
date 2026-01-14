#!/usr/bin/env npx tsx
/**
 * NHTSA Data Sync Script
 * Run with: npx tsx scripts/sync-nhtsa.ts
 *
 * Uses the official NHTSA API to fetch complaint data
 */

import { PrismaClient } from '@prisma/client';

const NHTSA_API_BASE_URL = 'https://api.nhtsa.gov';

interface NHTSAComplaint {
  odiNumber: number;
  manufacturer: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  dateOfIncident?: string;
  dateComplaintFiled: string;
  vin?: string;
  components: string;
  summary: string;
  products: Array<{
    type: string;
    productYear: string;
    productMake: string;
    productModel: string;
    manufacturer: string;
  }>;
}

interface NHTSAResponse {
  count: number;
  message: string;
  results: NHTSAComplaint[];
}

const prisma = new PrismaClient();

// Popular vehicles to sync
const vehiclesToSync = [
  { make: 'TESLA', model: 'MODEL 3', years: [2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'TESLA', model: 'MODEL Y', years: [2020, 2021, 2022, 2023, 2024] },
  { make: 'TESLA', model: 'MODEL S', years: [2020, 2021, 2022, 2023, 2024] },
  { make: 'FORD', model: 'F-150', years: [2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'FORD', model: 'BRONCO', years: [2021, 2022, 2023, 2024] },
  { make: 'FORD', model: 'MUSTANG MACH-E', years: [2021, 2022, 2023, 2024] },
  { make: 'TOYOTA', model: 'CAMRY', years: [2018, 2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'TOYOTA', model: 'RAV4', years: [2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'HONDA', model: 'CR-V', years: [2018, 2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'HONDA', model: 'ACCORD', years: [2018, 2019, 2020, 2021, 2022, 2023] },
  { make: 'CHEVROLET', model: 'SILVERADO', years: [2019, 2020, 2021, 2022, 2023, 2024] },
  { make: 'CHEVROLET', model: 'BOLT EV', years: [2019, 2020, 2021, 2022] },
  { make: 'HYUNDAI', model: 'KONA ELECTRIC', years: [2019, 2020, 2021, 2022] },
  { make: 'HYUNDAI', model: 'IONIQ 5', years: [2022, 2023, 2024] },
  { make: 'KIA', model: 'EV6', years: [2022, 2023, 2024] },
  { make: 'RIVIAN', model: 'R1T', years: [2022, 2023, 2024] },
  { make: 'RIVIAN', model: 'R1S', years: [2022, 2023, 2024] },
  { make: 'BMW', model: 'X5', years: [2019, 2020, 2021, 2022, 2023] },
  { make: 'MERCEDES-BENZ', model: 'GLE', years: [2020, 2021, 2022, 2023] },
];

async function fetchComplaintsByVehicle(
  make: string,
  model: string,
  year: number
): Promise<NHTSAComplaint[]> {
  const url = `${NHTSA_API_BASE_URL}/complaints/complaintsByVehicle?make=${encodeURIComponent(
    make
  )}&model=${encodeURIComponent(model)}&modelYear=${year}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
  }

  const data: NHTSAResponse = await response.json();
  return data.results || [];
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function extractComponent(components: string): string {
  if (!components) return 'UNKNOWN';
  const parts = components.split(',');
  return parts[0]?.trim() || 'UNKNOWN';
}

async function syncComplaints() {
  console.log('Starting NHTSA data sync...');
  console.log(`Will sync ${vehiclesToSync.length} vehicle models\n`);

  let totalFetched = 0;
  let totalInserted = 0;
  const errors: string[] = [];

  for (const vehicle of vehiclesToSync) {
    for (const year of vehicle.years) {
      try {
        console.log(`Fetching ${vehicle.make} ${vehicle.model} ${year}...`);
        const complaints = await fetchComplaintsByVehicle(vehicle.make, vehicle.model, year);

        if (complaints.length === 0) {
          console.log(`  No complaints found`);
          continue;
        }

        console.log(`  Found ${complaints.length} complaints`);
        totalFetched += complaints.length;

        // Transform and insert
        const transformed = complaints
          .filter(c => c.products?.[0])
          .map(c => ({
            nhtsaId: c.odiNumber.toString(),
            odiNumber: c.odiNumber.toString(),
            manufacturer: c.manufacturer || '',
            make: c.products[0].productMake.toUpperCase(),
            model: c.products[0].productModel,
            year: parseInt(c.products[0].productYear, 10),
            component: extractComponent(c.components),
            description: c.summary || '',
            crash: c.crash,
            fire: c.fire,
            injuries: c.numberOfInjuries || 0,
            deaths: c.numberOfDeaths || 0,
            failDate: parseDate(c.dateOfIncident),
            dateAdded: parseDate(c.dateComplaintFiled) || new Date(),
          }));

        const result = await prisma.complaint.createMany({
          data: transformed,
          skipDuplicates: true,
        });

        totalInserted += result.count;
        console.log(`  Inserted ${result.count} new complaints`);

        // Rate limiting - be nice to the API
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${vehicle.make} ${vehicle.model} ${year}: ${message}`);
        console.error(`  Error: ${message}`);
      }
    }
  }

  // Get final stats
  const totalComplaints = await prisma.complaint.count();

  // Show top makes
  const topMakes = await prisma.complaint.groupBy({
    by: ['make'],
    _count: true,
    orderBy: { _count: { make: 'desc' } },
    take: 15,
  });

  console.log('\n=== Sync Complete ===');
  console.log(`Total fetched: ${totalFetched}`);
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total in database: ${totalComplaints}`);
  console.log(`Errors: ${errors.length}`);

  console.log('\nTop manufacturers by complaint count:');
  for (const make of topMakes) {
    console.log(`  ${make.make}: ${make._count}`);
  }

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err}`);
    }
  }

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    total: totalComplaints,
    errors,
  };
}

async function main() {
  try {
    await syncComplaints();
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
