export { nhtsaClient } from './client';
export { nhtsaSyncService } from './sync';
export {
  transformSODARecord,
  transformSODARecords,
  transformAPIRecord,
  transformAPIRecords,
  calculateSeverityScore,
  validateComplaint,
} from './transformer';
export type {
  NHTSAComplaintRaw,
  NHTSAProduct,
  NHTSAApiResponse,
  ComplaintsByVehicleParams,
  SODAQueryParams,
  SODAComplaintRecord,
  TransformedComplaint,
  SyncStatus,
  VINDecodeResult,
} from './types';
