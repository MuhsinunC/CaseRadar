/**
 * API Helper Functions for Complaint Generation
 * Provides simpler interfaces for API route usage
 */

import { generateComplaint } from './complaint-generator';
import type { ComplaintData, GeneratedComplaint } from './types';

/**
 * Pattern information for document generation
 */
interface PatternInfo {
  name: string;
  make: string;
  model: string;
  yearRange: string;
  severity: number;
  complaintCount: number;
}

/**
 * Complaint sample for document generation
 */
interface ComplaintSample {
  id: string;
  summary?: string;
  description?: string;
  make?: string;
  model?: string;
  year?: number;
  deaths?: number;
  injuries?: number;
}

/**
 * Simplified input for generating complaint documents from patterns
 */
interface GenerateComplaintDocumentInput {
  pattern: PatternInfo;
  complaints: ComplaintSample[];
  plaintiffInfo?: {
    name?: string;
    state?: string;
    city?: string;
  };
  court?: string;
  defendant?: string;
}

/**
 * Simplified complaint document output for API use
 */
interface SimpleComplaintDocument {
  title: string;
  content: {
    sections: Array<{
      heading: string;
      content: string;
    }>;
    allegations: string[];
    prayerForRelief: string[];
  };
  metadata: {
    generatedAt: Date;
    patternName: string;
    vehicle: string;
  };
}

/**
 * Generate a complaint document from pattern data (simplified API interface)
 * This is a wrapper around the full generateComplaint function for API route use
 */
export async function generateComplaintDocument(
  input: GenerateComplaintDocumentInput
): Promise<SimpleComplaintDocument> {
  const { pattern, complaints, plaintiffInfo, court, defendant } = input;

  // Parse year range
  const [yearStart, yearEnd] = parseYearRange(pattern.yearRange);

  // Extract representative complaints
  const representativeComplaints = complaints
    .slice(0, 5)
    .map((c) => c.summary || c.description || '')
    .filter((s) => s.length > 0);

  // Count severity metrics from complaints
  const injuryCount = complaints.reduce((sum, c) => sum + (c.injuries || 0), 0);
  const deathCount = complaints.reduce((sum, c) => sum + (c.deaths || 0), 0);

  // Build ComplaintData for full generator
  const complaintData: ComplaintData = {
    // Court
    courtName: court || 'United States District Court',

    // Plaintiff
    plaintiffName: plaintiffInfo?.name || '[PLAINTIFF NAME]',
    plaintiffState: plaintiffInfo?.state || '[STATE]',
    plaintiffCity: plaintiffInfo?.city || '[CITY]',
    vehiclePurchaseDate: '[PURCHASE DATE]',
    dealerName: '[DEALER NAME]',

    // Defendant
    defendantName: defendant || `${pattern.make} Motor Corporation`,
    defendantStateOfIncorp: 'Delaware',
    defendantHQ: '[HEADQUARTERS ADDRESS]',

    // Vehicle/Defect
    vehicleMake: pattern.make,
    vehicleModel: pattern.model,
    vehicleYearStart: yearStart,
    vehicleYearEnd: yearEnd,
    defectComponent: extractComponentFromName(pattern.name),
    defectDescription: pattern.name,
    failureMode: generateFailureMode(pattern.name),
    consequences: generateConsequences(pattern.severity),

    // NHTSA Data
    totalComplaints: pattern.complaintCount,
    crashComplaints: Math.floor(pattern.complaintCount * 0.3),
    fireComplaints: Math.floor(pattern.complaintCount * 0.05),
    injuryCount,
    deathCount,
    representativeComplaints,

    // Class Definition
    classDefinition: `All persons in the United States who purchased or leased a ${pattern.make} ${pattern.model} vehicle from model years ${yearStart} to ${yearEnd}.`,
    estimatedClassSize: estimateClassSize(pattern.complaintCount),

    // Legal Claims
    causesOfAction: ['NEGLIGENCE', 'STRICT_LIABILITY', 'BREACH_WARRANTY'],
    reliefRequested: ['CLASS_CERTIFICATION', 'COMPENSATORY_DAMAGES', 'ATTORNEYS_FEES'],

    // Attorney
    firmName: '[LAW FIRM NAME]',
    attorneyName: '[ATTORNEY NAME]',
    barNumber: '[BAR NUMBER]',
    firmAddress: '[FIRM ADDRESS]',
    firmPhone: '[PHONE]',
    firmEmail: '[EMAIL]',

    // Pattern tracking
    patternId: undefined,
  };

  // Generate full complaint
  const generated = await generateComplaint(complaintData);

  // Generate title from pattern data
  const title = `Class Action Complaint: ${pattern.make} ${pattern.model} ${pattern.name}`;

  // Convert to simpler format for API response
  return {
    title,
    content: {
      sections: [
        { heading: 'Caption', content: generated.sections.caption },
        { heading: 'Introduction', content: generated.sections.introduction },
        { heading: 'Jurisdiction and Venue', content: generated.sections.jurisdiction },
        { heading: 'Parties', content: generated.sections.parties },
        { heading: 'Factual Allegations', content: generated.sections.factualAllegations },
        { heading: 'Class Action Allegations', content: generated.sections.classAllegations },
        { heading: 'Causes of Action', content: generated.sections.causesOfAction },
        { heading: 'Prayer for Relief', content: generated.sections.prayerForRelief },
        { heading: 'Jury Demand', content: generated.sections.juryDemand },
      ],
      allegations: extractAllegations(generated.sections.factualAllegations),
      prayerForRelief: extractReliefItems(generated.sections.prayerForRelief),
    },
    metadata: {
      generatedAt: generated.metadata.generatedAt,
      patternName: pattern.name,
      vehicle: `${pattern.make} ${pattern.model} (${pattern.yearRange})`,
    },
  };
}

/**
 * Parse year range string (e.g., "2020-2023") into start and end years
 */
function parseYearRange(yearRange: string): [number, number] {
  if (!yearRange) {
    const currentYear = new Date().getFullYear();
    return [currentYear - 3, currentYear];
  }

  const match = yearRange.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2])];
  }

  const singleYear = yearRange.match(/(\d{4})/);
  if (singleYear) {
    const year = parseInt(singleYear[1]);
    return [year, year];
  }

  const currentYear = new Date().getFullYear();
  return [currentYear - 3, currentYear];
}

/**
 * Extract component from pattern name
 */
function extractComponentFromName(name: string): string {
  const components = [
    'airbag', 'brake', 'steering', 'transmission', 'engine', 'fuel',
    'electrical', 'suspension', 'tire', 'seatbelt', 'accelerator',
  ];

  const lowerName = name.toLowerCase();
  for (const component of components) {
    if (lowerName.includes(component)) {
      return component.charAt(0).toUpperCase() + component.slice(1) + ' System';
    }
  }

  return 'Safety System';
}

/**
 * Generate failure mode description
 */
function generateFailureMode(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('airbag')) {
    return 'Airbags failing to deploy during crashes or deploying unexpectedly during normal vehicle operation';
  }
  if (lowerName.includes('brake')) {
    return 'Brake system experiencing unexpected failure, loss of braking power, or reduced stopping capability';
  }
  if (lowerName.includes('steering')) {
    return 'Steering system losing responsiveness or experiencing sudden loss of control';
  }
  if (lowerName.includes('transmission')) {
    return 'Transmission slipping, jerking, or failing to properly engage gears';
  }
  if (lowerName.includes('engine')) {
    return 'Engine stalling, losing power, or failing during vehicle operation';
  }

  return 'Component failure resulting in loss of vehicle control or safety system malfunction';
}

/**
 * Generate consequence description based on severity
 */
function generateConsequences(severity: number): string {
  if (severity >= 9) {
    return 'Serious injuries, deaths, and significant property damage, posing an extreme danger to vehicle occupants and the public';
  }
  if (severity >= 7) {
    return 'Significant injuries and property damage, creating substantial risk to vehicle occupants';
  }
  if (severity >= 5) {
    return 'Potential for injury and property damage, representing a material safety concern';
  }

  return 'Risk of injury and property damage requiring attention';
}

/**
 * Estimate class size based on complaint count
 */
function estimateClassSize(complaintCount: number): string {
  const multiplier = 100; // Assume 100x complaints represent actual affected vehicles
  const estimated = complaintCount * multiplier;

  if (estimated >= 1000000) {
    return `Millions of vehicles nationwide`;
  }
  if (estimated >= 100000) {
    return `Hundreds of thousands of vehicles nationwide`;
  }
  if (estimated >= 10000) {
    return `Tens of thousands of vehicles nationwide`;
  }

  return `Thousands of vehicles nationwide`;
}

/**
 * Extract allegations from factual allegations section
 */
function extractAllegations(factualAllegations: string): string[] {
  const lines = factualAllegations.split('\n');
  const allegations: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for numbered items or paragraphs
    if (trimmed.match(/^\d+\.|^[A-Z]/) && trimmed.length > 20) {
      allegations.push(trimmed.replace(/^\d+\.\s*/, ''));
    }
  }

  return allegations.slice(0, 10); // Return up to 10 allegations
}

/**
 * Extract relief items from prayer section
 */
function extractReliefItems(prayerForRelief: string): string[] {
  const lines = prayerForRelief.split('\n');
  const reliefItems: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^\d+\.|^[a-z]\)|^•/) && trimmed.length > 10) {
      reliefItems.push(trimmed.replace(/^\d+\.\s*|^[a-z]\)\s*|^•\s*/, ''));
    }
  }

  return reliefItems.slice(0, 8); // Return up to 8 relief items
}
