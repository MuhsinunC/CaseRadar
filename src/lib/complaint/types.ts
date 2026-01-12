/**
 * Legal Complaint Types
 * Type definitions for complaint generation
 */

/**
 * Available causes of action for vehicle defect class actions
 */
export type CauseOfAction =
  | 'NEGLIGENCE'
  | 'STRICT_LIABILITY'
  | 'BREACH_WARRANTY'
  | 'FRAUDULENT_CONCEALMENT'
  | 'CONSUMER_PROTECTION'
  | 'UNJUST_ENRICHMENT';

/**
 * Types of relief that can be requested
 */
export type ReliefType =
  | 'CLASS_CERTIFICATION'
  | 'COMPENSATORY_DAMAGES'
  | 'PUNITIVE_DAMAGES'
  | 'INJUNCTIVE_RELIEF'
  | 'RESTITUTION'
  | 'ATTORNEYS_FEES'
  | 'PREJUDGMENT_INTEREST';

/**
 * Input data required to generate a complaint
 */
export interface ComplaintData {
  // Court Information
  courtName: string;
  caseNumber?: string;

  // Plaintiff Information
  plaintiffName: string;
  plaintiffState: string;
  plaintiffCity: string;
  vehiclePurchaseDate: string;
  dealerName: string;

  // Defendant Information
  defendantName: string;
  defendantStateOfIncorp: string;
  defendantHQ: string;

  // Vehicle/Defect Information
  vehicleMake: string;
  vehicleModel: string;
  vehicleYearStart: number;
  vehicleYearEnd: number;
  defectComponent: string;
  defectDescription: string;
  failureMode: string;
  consequences: string;

  // NHTSA Data (from CaseRadar pattern)
  totalComplaints: number;
  crashComplaints: number;
  fireComplaints: number;
  injuryCount: number;
  deathCount: number;
  representativeComplaints: string[];

  // Class Definition
  classDefinition: string;
  estimatedClassSize: string;

  // Legal Claims
  causesOfAction: CauseOfAction[];
  reliefRequested: ReliefType[];

  // Attorney/Firm Information
  firmName: string;
  attorneyName: string;
  barNumber: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;

  // Optional: Pattern ID for tracking
  patternId?: string;
}

/**
 * Individual sections of a generated complaint
 */
export interface ComplaintSections {
  caption: string;
  introduction: string;
  jurisdiction: string;
  parties: string;
  factualAllegations: string;
  classAllegations: string;
  causesOfAction: string;
  prayerForRelief: string;
  juryDemand: string;
  signature: string;
}

/**
 * Metadata about complaint generation
 */
export interface ComplaintMetadata {
  generatedAt: Date;
  patternId?: string;
  version: string;
}

/**
 * Complete generated complaint document
 */
export interface GeneratedComplaint {
  sections: ComplaintSections;
  disclaimer: string;
  metadata: ComplaintMetadata;
}

/**
 * Result of complaint data validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * PDF generation options
 */
export interface PDFOptions {
  fontSize?: number;
  fontFamily?: string;
  lineSpacing?: number;
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * PDF page content
 */
export interface PDFPage {
  content: string;
  pageNumber: number;
}

/**
 * Formatted content ready for PDF generation
 */
export interface FormattedPDF {
  pages: PDFPage[];
  header: string;
  footer: string;
  includePageNumbers: boolean;
}

/**
 * Generated PDF document
 */
export interface PDFDocument {
  buffer: ArrayBuffer;
  pageSize: { width: number; height: number };
  options: Required<PDFOptions>;
  metadata: {
    title: string;
    author: string;
    subject: string;
    createdAt: Date;
  };
}

/**
 * Result of PDF generation
 */
export interface PDFResult {
  filename: string;
  blob: Blob;
  size: number;
}

/**
 * Template for a cause of action
 */
export interface CauseOfActionTemplate {
  type: CauseOfAction;
  title: string;
  elements: string[];
  template: string;
}

/**
 * Template variables for string interpolation
 */
export interface TemplateVariables {
  [key: string]: string | number | string[] | undefined;
}
