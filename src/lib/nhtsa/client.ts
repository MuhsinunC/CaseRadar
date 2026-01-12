/**
 * NHTSA API Client
 * Handles communication with NHTSA complaints API endpoints
 */

import {
  NHTSAApiResponse,
  ComplaintsByVehicleParams,
  SODAQueryParams,
  SODAComplaintRecord,
} from './types';

const NHTSA_API_BASE_URL =
  process.env.NHTSA_API_BASE_URL || 'https://api.nhtsa.gov';
const SODA_API_BASE_URL = 'https://data.transportation.gov/resource/jhit-z9cc.json';

// Throttle delay between requests (ms)
const REQUEST_DELAY = 250;

/**
 * Sleep helper for rate limiting
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * NHTSA API Client
 */
export const nhtsaClient = {
  /**
   * Fetch complaints for a specific vehicle (make/model/year)
   */
  async getComplaintsByVehicle(
    params: ComplaintsByVehicleParams
  ): Promise<NHTSAApiResponse> {
    const { make, model, modelYear } = params;
    const url = `${NHTSA_API_BASE_URL}/complaints/complaintsByVehicle?make=${encodeURIComponent(
      make
    )}&model=${encodeURIComponent(model)}&modelYear=${modelYear}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `NHTSA API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  },

  /**
   * Fetch complaints using SODA API with SQL-like queries
   * Supports pagination and filtering
   */
  async querySODA(params: SODAQueryParams = {}): Promise<SODAComplaintRecord[]> {
    const queryParams = new URLSearchParams();

    if (params.$select) {
      queryParams.set('$select', params.$select);
    }
    if (params.$where) {
      queryParams.set('$where', params.$where);
    }
    if (params.$order) {
      queryParams.set('$order', params.$order);
    }
    if (params.$limit) {
      queryParams.set('$limit', params.$limit.toString());
    }
    if (params.$offset) {
      queryParams.set('$offset', params.$offset.toString());
    }

    const url = `${SODA_API_BASE_URL}?${queryParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SODA API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Fetch new complaints since a specific date
   */
  async getComplaintsSince(date: Date, limit: number = 1000): Promise<SODAComplaintRecord[]> {
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

    return this.querySODA({
      $where: `datea > '${dateStr}'`,
      $order: 'datea DESC',
      $limit: limit,
    });
  },

  /**
   * Fetch complaints for a date range
   */
  async getComplaintsInRange(
    startDate: Date,
    endDate: Date,
    limit: number = 10000
  ): Promise<SODAComplaintRecord[]> {
    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

    return this.querySODA({
      $where: `datea >= '${startStr}' AND datea <= '${endStr}'`,
      $order: 'datea DESC',
      $limit: limit,
    });
  },

  /**
   * Fetch complaints by make
   */
  async getComplaintsByMake(
    make: string,
    limit: number = 1000
  ): Promise<SODAComplaintRecord[]> {
    return this.querySODA({
      $where: `upper(maketxt) = '${make.toUpperCase()}'`,
      $order: 'datea DESC',
      $limit: limit,
    });
  },

  /**
   * Fetch complaints by component
   */
  async getComplaintsByComponent(
    component: string,
    limit: number = 1000
  ): Promise<SODAComplaintRecord[]> {
    return this.querySODA({
      $where: `upper(compdesc) LIKE '%${component.toUpperCase()}%'`,
      $order: 'datea DESC',
      $limit: limit,
    });
  },

  /**
   * Fetch high-severity complaints (with crashes, fires, injuries, or deaths)
   */
  async getHighSeverityComplaints(limit: number = 500): Promise<SODAComplaintRecord[]> {
    return this.querySODA({
      $where: `crash = 'Y' OR fire = 'Y' OR injured > 0 OR deaths > 0`,
      $order: 'datea DESC',
      $limit: limit,
    });
  },

  /**
   * Get count of complaints matching a query
   */
  async getComplaintCount(where?: string): Promise<number> {
    const params: SODAQueryParams = {
      $select: 'count(*) as count',
    };
    if (where) {
      params.$where = where;
    }

    const response = (await this.querySODA(params)) as unknown as Array<{ count: string }>;
    return parseInt(response[0]?.count || '0', 10);
  },

  /**
   * Get distinct makes
   */
  async getDistinctMakes(): Promise<string[]> {
    const response = await this.querySODA({
      $select: 'DISTINCT maketxt',
      $order: 'maketxt ASC',
      $limit: 1000,
    });
    return response.map((r) => r.maketxt).filter(Boolean);
  },

  /**
   * Paginated fetch helper for large datasets
   */
  async fetchAllPaginated(
    queryFn: (offset: number) => Promise<SODAComplaintRecord[]>,
    pageSize: number = 1000,
    maxPages: number = 100
  ): Promise<SODAComplaintRecord[]> {
    const allRecords: SODAComplaintRecord[] = [];
    let offset = 0;
    let page = 0;

    while (page < maxPages) {
      const records = await queryFn(offset);

      if (records.length === 0) {
        break;
      }

      allRecords.push(...records);
      offset += pageSize;
      page++;

      // Rate limiting
      await sleep(REQUEST_DELAY);
    }

    return allRecords;
  },
};

export default nhtsaClient;
