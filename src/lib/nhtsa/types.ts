/**
 * NHTSA API Response Types
 * Based on the ODI (Office of Defects Investigation) Complaints API
 */

/**
 * Raw complaint data from NHTSA API
 */
export interface NHTSAComplaintRaw {
  odiNumber: string;
  manufacturer: string;
  crash: string; // "Yes" | "No"
  fire: string; // "Yes" | "No"
  numberOfInjured: number;
  numberOfDeaths: number;
  dateOfIncident: string | null;
  dateComplaintFiled: string | null;
  vin: string | null;
  components: string;
  summary: string;
  products: NHTSAProduct[];
}

/**
 * Product/vehicle info in NHTSA response
 */
export interface NHTSAProduct {
  type: string;
  manufacturer: string;
  make: string;
  model: string;
  year: number;
}

/**
 * NHTSA API response wrapper
 */
export interface NHTSAApiResponse {
  count: number;
  message: string;
  results: NHTSAComplaintRaw[];
}

/**
 * Parameters for complaints by vehicle endpoint
 */
export interface ComplaintsByVehicleParams {
  make: string;
  model: string;
  modelYear: number;
}

/**
 * Parameters for SODA API queries
 */
export interface SODAQueryParams {
  $select?: string;
  $where?: string;
  $order?: string;
  $limit?: number;
  $offset?: number;
}

/**
 * SODA API response item (flat file format)
 */
export interface SODAComplaintRecord {
  cmplid: string;
  odino: string;
  mfr_name: string;
  maketxt: string;
  modeltxt: string;
  yeartxt: string;
  crash: string;
  fire: string;
  injured: string;
  deaths: string;
  compdesc: string;
  cdescr: string;
  faildate: string;
  datea: string;
  ldate?: string;
  vin?: string;
  miles?: string;
  city?: string;
  state?: string;
  cmpl_type?: string;
  prod_type?: string;
  medical_attn?: string;
  vehicles_towed_yn?: string;
}

/**
 * Transformed complaint data ready for database insertion
 */
export interface TransformedComplaint {
  nhtsaId: string;
  odiNumber: string;
  manufacturer: string;
  make: string;
  model: string;
  year: number;
  component: string;
  description: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
  failDate: Date | null;
  dateAdded: Date;
}

/**
 * Sync job status
 */
export interface SyncStatus {
  lastSyncDate: Date | null;
  totalComplaints: number;
  newComplaints: number;
  errors: string[];
  inProgress: boolean;
}

/**
 * VIN decoder response
 */
export interface VINDecodeResult {
  vin: string;
  make: string;
  model: string;
  year: number;
  manufacturer: string;
  vehicleType: string;
  bodyClass: string;
  engineInfo: string | null;
}

// ============================================
// NHTSA Recalls Types
// ============================================

/**
 * Raw recall data from NHTSA API
 * Based on: GET https://api.nhtsa.gov/recalls/recallsByVehicle
 */
export interface NHTSARecallRaw {
  Manufacturer: string;
  NHTSACampaignNumber: string;
  ReportReceivedDate: string;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  Notes: string;
  ModelYear: string;
  Make: string;
  Model: string;
  ParkIt: boolean; // True if vehicle should not be driven
  ParkOutSide: boolean; // True if vehicle should be parked outside
}

/**
 * NHTSA Recalls API response wrapper
 */
export interface NHTSARecallsApiResponse {
  Count: number;
  Message: string;
  results: NHTSARecallRaw[];
}

/**
 * Transformed recall data ready for database insertion
 */
export interface TransformedRecall {
  nhtsaCampaignNumber: string;
  manufacturer: string;
  make: string;
  model: string;
  year: number;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  notes: string | null;
  reportReceivedDate: Date;
  parkIt: boolean;
  parkOutside: boolean;
}

/**
 * Parameters for recalls by vehicle endpoint
 */
export interface RecallsByVehicleParams {
  make: string;
  model: string;
  modelYear: number;
}

/**
 * Recall sync status
 */
export interface RecallSyncStatus {
  lastSyncDate: Date | null;
  totalRecalls: number;
  newRecalls: number;
  errors: string[];
  inProgress: boolean;
}
