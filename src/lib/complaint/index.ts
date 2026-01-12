/**
 * Legal Complaint Generator Module
 *
 * Exports for generating legal class action complaint documents
 */

// Types
export type {
  ComplaintData,
  GeneratedComplaint,
  ComplaintSections,
  ComplaintMetadata,
  ValidationResult,
  CauseOfAction,
  ReliefType,
  CauseOfActionTemplate,
  PDFOptions,
  PDFDocument,
  PDFResult,
  FormattedPDF,
  PDFPage,
  TemplateVariables,
} from './types';

// Complaint generation
export {
  generateComplaint,
  generateIntroduction,
  generateFactualAllegations,
  generateClassDefinition,
  validateComplaintData,
} from './complaint-generator';

// PDF export
export {
  generatePDF,
  createPDFDocument,
  formatForPDF,
  downloadPDF,
  generatePDFBase64,
} from './pdf-export';

// API helpers
export { generateComplaintDocument } from './api-helpers';
