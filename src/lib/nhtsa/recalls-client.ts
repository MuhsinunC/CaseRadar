/**
 * NHTSA Recalls API Client
 * Handles communication with NHTSA recalls API endpoints
 *
 * API Documentation: https://api.nhtsa.gov/
 * Endpoint: GET /recalls/recallsByVehicle?make={make}&model={model}&modelYear={year}
 *
 * Cost: FREE (public API)
 */

import {
  NHTSARecallsApiResponse,
  NHTSARecallRaw,
  RecallsByVehicleParams,
  TransformedRecall,
} from './types';

const NHTSA_API_BASE_URL =
  process.env.NHTSA_API_BASE_URL || 'https://api.nhtsa.gov';

// Throttle delay between requests (ms)
const REQUEST_DELAY = 250;

/**
 * Sleep helper for rate limiting
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse date string from NHTSA API (format: "dd/mm/yyyy")
 */
function parseNHTSADate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  // Handle various date formats from NHTSA
  // Format 1: "dd/mm/yyyy"
  // Format 2: "yyyy-mm-dd"
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  return new Date(dateStr);
}

/**
 * Transform raw NHTSA recall data to our internal format
 */
export function transformRecall(raw: NHTSARecallRaw): TransformedRecall {
  return {
    nhtsaCampaignNumber: raw.NHTSACampaignNumber,
    manufacturer: raw.Manufacturer || '',
    make: raw.Make || '',
    model: raw.Model || '',
    year: parseInt(raw.ModelYear) || 0,
    component: raw.Component || '',
    summary: raw.Summary || '',
    consequence: raw.Consequence || '',
    remedy: raw.Remedy || '',
    notes: raw.Notes || null,
    reportReceivedDate: parseNHTSADate(raw.ReportReceivedDate) || new Date(),
    parkIt: raw.ParkIt || false,
    parkOutside: raw.ParkOutSide || false,
  };
}

/**
 * NHTSA Recalls API Client
 */
export const recallsClient = {
  /**
   * Fetch recalls for a specific vehicle (make/model/year)
   */
  async getRecallsByVehicle(
    params: RecallsByVehicleParams
  ): Promise<NHTSARecallsApiResponse> {
    const { make, model, modelYear } = params;
    const url = `${NHTSA_API_BASE_URL}/recalls/recallsByVehicle?make=${encodeURIComponent(
      make
    )}&model=${encodeURIComponent(model)}&modelYear=${modelYear}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `NHTSA Recalls API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  },

  /**
   * Fetch and transform recalls for a specific vehicle
   */
  async getTransformedRecallsByVehicle(
    params: RecallsByVehicleParams
  ): Promise<TransformedRecall[]> {
    const response = await this.getRecallsByVehicle(params);
    return response.results.map(transformRecall);
  },

  /**
   * Fetch recalls for multiple vehicles (batch operation)
   * Useful for syncing recalls for all vehicles in our database
   */
  async getRecallsForVehicles(
    vehicles: RecallsByVehicleParams[]
  ): Promise<Map<string, TransformedRecall[]>> {
    const results = new Map<string, TransformedRecall[]>();

    for (const vehicle of vehicles) {
      const key = `${vehicle.make}-${vehicle.model}-${vehicle.modelYear}`;
      try {
        const recalls = await this.getTransformedRecallsByVehicle(vehicle);
        results.set(key, recalls);

        // Rate limiting
        await sleep(REQUEST_DELAY);
      } catch (error) {
        console.error(`Failed to fetch recalls for ${key}:`, error);
        results.set(key, []);
      }
    }

    return results;
  },

  /**
   * Get unique vehicles from complaints for recall sync
   * This helps us know which make/model/year combinations to query
   */
  getUniqueVehiclesFromComplaints(
    complaints: Array<{ make: string; model: string; year: number }>
  ): RecallsByVehicleParams[] {
    const seen = new Set<string>();
    const unique: RecallsByVehicleParams[] = [];

    for (const complaint of complaints) {
      const key = `${complaint.make}-${complaint.model}-${complaint.year}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          make: complaint.make,
          model: complaint.model,
          modelYear: complaint.year,
        });
      }
    }

    return unique;
  },

  /**
   * Check if a pattern's vehicle/component combination has any related recalls
   * This is the core cross-reference function for identifying unaddressed defects
   */
  findRelatedRecalls(
    patternMake: string,
    patternModel: string | null,
    patternComponent: string,
    patternYearStart: number | null,
    patternYearEnd: number | null,
    allRecalls: TransformedRecall[]
  ): { recall: TransformedRecall; matchScore: number; matchReason: string }[] {
    const results: { recall: TransformedRecall; matchScore: number; matchReason: string }[] = [];

    for (const recall of allRecalls) {
      let matchScore = 0;
      const matchReasons: string[] = [];

      // Check make match (case-insensitive)
      const makeMatches = recall.make.toUpperCase() === patternMake.toUpperCase();
      if (!makeMatches) continue; // Make must match

      matchScore += 0.3;
      matchReasons.push('make match');

      // Check model match (case-insensitive, partial match allowed)
      if (patternModel) {
        const modelMatches =
          recall.model.toUpperCase() === patternModel.toUpperCase() ||
          recall.model.toUpperCase().includes(patternModel.toUpperCase()) ||
          patternModel.toUpperCase().includes(recall.model.toUpperCase());

        if (modelMatches) {
          matchScore += 0.2;
          matchReasons.push('model match');
        }
      }

      // Check year overlap
      if (patternYearStart && patternYearEnd) {
        const yearInRange =
          recall.year >= patternYearStart && recall.year <= patternYearEnd;
        if (yearInRange) {
          matchScore += 0.2;
          matchReasons.push('year in range');
        }
      }

      // Check component match (fuzzy matching)
      const componentMatches = componentsSimilar(patternComponent, recall.component);
      if (componentMatches) {
        matchScore += 0.3;
        matchReasons.push('component match');
      }

      // Only include if there's meaningful overlap
      if (matchScore >= 0.5) {
        results.push({
          recall,
          matchScore,
          matchReason: matchReasons.join(', '),
        });
      }
    }

    // Sort by match score descending
    return results.sort((a, b) => b.matchScore - a.matchScore);
  },
};

/**
 * Check if two component strings are similar
 * Uses simple keyword matching for MVP
 */
function componentsSimilar(comp1: string, comp2: string): boolean {
  const normalize = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const words1 = new Set(normalize(comp1));
  const words2 = new Set(normalize(comp2));

  // Consider similar if at least 1 significant word matches
  // Filter out common words that don't add meaning
  const commonWords = new Set(['THE', 'AND', 'OR', 'A', 'AN', 'OF', 'IN', 'ON', 'AT', 'TO']);
  const significantOverlap = [...words1].filter(
    (w) => words2.has(w) && !commonWords.has(w)
  ).length;

  return significantOverlap >= 1;
}

export default recallsClient;
