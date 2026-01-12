/**
 * Complaint Generator Tests
 * Tests for generating legal complaint documents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateComplaint,
  generateIntroduction,
  generateFactualAllegations,
  generateClassDefinition,
  validateComplaintData,
  type ComplaintData,
  type GeneratedComplaint,
  type CauseOfAction,
  type ReliefType,
} from '../complaint-generator';

// Mock Claude API
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockImplementation((params: { messages: { content: string }[] }) => {
    // Generate different responses based on the prompt content
    const prompt = params.messages?.[0]?.content || '';

    if (prompt.includes('introduction')) {
      return Promise.resolve({
        content: [
          {
            type: 'text',
            text: `1. This is a class action brought on behalf of all persons who purchased vehicles with the defective component.

2. Defendant knew or should have known of this defect through consumer complaints and internal testing.

3. As a result of this defect, Plaintiff and Class Members have suffered damages.`,
          },
        ],
      });
    }

    if (prompt.includes('factual allegations')) {
      return Promise.resolve({
        content: [
          {
            type: 'text',
            text: `FACTUAL ALLEGATIONS

THE DEFECT

9. The vehicles are equipped with a defective component.

CONSUMER COMPLAINTS AND HARM

14. NHTSA complaint data reveals a pattern of failures:
    a. Total complaints: 547
    b. Complaints involving crashes: 45
    c. Reported injuries: 28`,
          },
        ],
      });
    }

    return Promise.resolve({
      content: [{ type: 'text', text: 'Generated legal text content.' }],
    });
  });

  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    pattern: {
      findUnique: vi.fn(),
    },
    complaint: {
      findMany: vi.fn(),
    },
  },
}));

const mockComplaintData: ComplaintData = {
  // Court
  courtName: 'UNITED STATES DISTRICT COURT NORTHERN DISTRICT OF CALIFORNIA',
  caseNumber: undefined,

  // Parties
  plaintiffName: 'John Doe',
  plaintiffState: 'California',
  plaintiffCity: 'San Francisco',
  vehiclePurchaseDate: '2022-03-15',
  dealerName: 'Bay Area Motors',

  defendantName: 'Acme Automotive Corporation',
  defendantStateOfIncorp: 'Delaware',
  defendantHQ: 'Detroit, Michigan',

  // Vehicle/Defect
  vehicleMake: 'Acme',
  vehicleModel: 'Sedan X',
  vehicleYearStart: 2020,
  vehicleYearEnd: 2023,
  defectComponent: 'Electronic Power Steering System',
  defectDescription: 'The electronic power steering system contains a defective control module that can fail unexpectedly.',
  failureMode: 'sudden loss of power steering assist',
  consequences: 'loss of vehicle control, particularly at low speeds during parking maneuvers',

  // NHTSA Data
  totalComplaints: 547,
  crashComplaints: 45,
  fireComplaints: 3,
  injuryCount: 28,
  deathCount: 2,
  representativeComplaints: [
    'While driving at low speed, the power steering suddenly failed without warning, making it extremely difficult to control the vehicle.',
    'Power steering went out completely while parking. Nearly hit a pedestrian trying to turn the wheel.',
    'Third time my steering has failed. Dealer says nothing is wrong but it keeps happening.',
  ],

  // Class Definition
  classDefinition: 'All persons who purchased or leased a 2020-2023 Acme Sedan X vehicle in the United States equipped with the Electronic Power Steering System.',
  estimatedClassSize: 'tens of thousands',

  // Legal
  causesOfAction: ['NEGLIGENCE', 'STRICT_LIABILITY', 'BREACH_WARRANTY', 'FRAUDULENT_CONCEALMENT'],
  reliefRequested: ['CLASS_CERTIFICATION', 'COMPENSATORY_DAMAGES', 'PUNITIVE_DAMAGES', 'INJUNCTIVE_RELIEF', 'ATTORNEYS_FEES'],

  // Firm
  firmName: 'Smith & Associates LLP',
  attorneyName: 'Jane Smith',
  barNumber: 'CA 123456',
  firmAddress: '100 Market Street, Suite 500, San Francisco, CA 94102',
  firmPhone: '(415) 555-1234',
  firmEmail: 'jsmith@smithlaw.com',
};

describe('Complaint Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateComplaintData', () => {
    it('should validate complete complaint data', () => {
      const result = validateComplaintData(mockComplaintData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject data missing required fields', () => {
      const incompleteData = {
        ...mockComplaintData,
        plaintiffName: '',
        defendantName: '',
      };

      const result = validateComplaintData(incompleteData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('plaintiffName is required');
      expect(result.errors).toContain('defendantName is required');
    });

    it('should validate year range', () => {
      const badYears = {
        ...mockComplaintData,
        vehicleYearStart: 2025,
        vehicleYearEnd: 2020,
      };

      const result = validateComplaintData(badYears);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('vehicleYearStart must be before or equal to vehicleYearEnd');
    });

    it('should require at least one cause of action', () => {
      const noCauses = {
        ...mockComplaintData,
        causesOfAction: [],
      };

      const result = validateComplaintData(noCauses);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one cause of action is required');
    });

    it('should validate complaint counts are non-negative', () => {
      const negativeCounts = {
        ...mockComplaintData,
        totalComplaints: -10,
      };

      const result = validateComplaintData(negativeCounts);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('totalComplaints must be non-negative');
    });
  });

  describe('generateIntroduction', () => {
    it('should generate introduction section', async () => {
      const introduction = await generateIntroduction(mockComplaintData);

      expect(introduction).toBeDefined();
      expect(typeof introduction).toBe('string');
      expect(introduction.length).toBeGreaterThan(0);
    });

    it('should include key details in introduction', async () => {
      const introduction = await generateIntroduction(mockComplaintData);

      // The introduction should mention key facts
      expect(introduction.toLowerCase()).toContain('class action');
    });
  });

  describe('generateFactualAllegations', () => {
    it('should generate factual allegations section', async () => {
      const allegations = await generateFactualAllegations(mockComplaintData);

      expect(allegations).toBeDefined();
      expect(typeof allegations).toBe('string');
      expect(allegations.length).toBeGreaterThan(0);
    });

    it('should include NHTSA statistics', async () => {
      const allegations = await generateFactualAllegations(mockComplaintData);

      // The allegations should reference complaint data
      expect(allegations).toContain('547'); // total complaints
    });
  });

  describe('generateClassDefinition', () => {
    it('should generate class allegations section', () => {
      const classAllegations = generateClassDefinition(mockComplaintData);

      expect(classAllegations).toBeDefined();
      expect(classAllegations).toContain(mockComplaintData.classDefinition);
      expect(classAllegations).toContain('tens of thousands');
    });

    it('should include Rule 23 requirements', () => {
      const classAllegations = generateClassDefinition(mockComplaintData);

      expect(classAllegations).toContain('numerosity');
      expect(classAllegations).toContain('commonality');
      expect(classAllegations).toContain('typicality');
      expect(classAllegations).toContain('adequacy');
    });
  });

  describe('generateComplaint', () => {
    it('should generate complete complaint document', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint).toBeDefined();
      expect(complaint.sections).toBeDefined();
      expect(complaint.sections.caption).toBeDefined();
      expect(complaint.sections.introduction).toBeDefined();
      expect(complaint.sections.jurisdiction).toBeDefined();
      expect(complaint.sections.parties).toBeDefined();
      expect(complaint.sections.factualAllegations).toBeDefined();
      expect(complaint.sections.classAllegations).toBeDefined();
      expect(complaint.sections.causesOfAction).toBeDefined();
      expect(complaint.sections.prayerForRelief).toBeDefined();
      expect(complaint.sections.juryDemand).toBeDefined();
      expect(complaint.sections.signature).toBeDefined();
    });

    it('should include draft disclaimer', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint.disclaimer).toContain('DRAFT');
      expect(complaint.disclaimer).toContain('ATTORNEY REVIEW');
    });

    it('should generate correct caption format', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint.sections.caption).toContain('UNITED STATES DISTRICT COURT');
      expect(complaint.sections.caption).toContain('JOHN DOE'); // Caption uses uppercase
      expect(complaint.sections.caption).toContain('ACME AUTOMOTIVE CORPORATION');
      expect(complaint.sections.caption).toContain('CLASS ACTION COMPLAINT');
    });

    it('should include all selected causes of action', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint.sections.causesOfAction).toContain('NEGLIGENCE');
      expect(complaint.sections.causesOfAction).toContain('STRICT');
      expect(complaint.sections.causesOfAction).toContain('WARRANTY');
      expect(complaint.sections.causesOfAction).toContain('FRAUDULENT');
    });

    it('should include all requested relief', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint.sections.prayerForRelief).toContain('class');
      expect(complaint.sections.prayerForRelief).toContain('compensatory');
      expect(complaint.sections.prayerForRelief).toContain('punitive');
      expect(complaint.sections.prayerForRelief).toContain('injunctive');
    });

    it('should include attorney information in signature', async () => {
      const complaint = await generateComplaint(mockComplaintData);

      expect(complaint.sections.signature).toContain('SMITH & ASSOCIATES LLP'); // Signature uses uppercase firm name
      expect(complaint.sections.signature).toContain('Jane Smith');
      expect(complaint.sections.signature).toContain('CA 123456');
    });

    it('should track generation metadata', async () => {
      const dataWithPatternId = { ...mockComplaintData, patternId: 'pattern-123' };
      const complaint = await generateComplaint(dataWithPatternId);

      expect(complaint.metadata).toBeDefined();
      expect(complaint.metadata.generatedAt).toBeInstanceOf(Date);
      expect(complaint.metadata.patternId).toBe('pattern-123');
      expect(complaint.metadata.version).toBeDefined();
    });

    it('should throw error for invalid data', async () => {
      const invalidData = {
        ...mockComplaintData,
        plaintiffName: '',
      };

      await expect(generateComplaint(invalidData)).rejects.toThrow('Invalid complaint data');
    });
  });
});

describe('Cause of Action Templates', () => {
  it('should generate negligence count', async () => {
    const dataWithNegligence: ComplaintData = {
      ...mockComplaintData,
      causesOfAction: ['NEGLIGENCE'],
    };

    const complaint = await generateComplaint(dataWithNegligence);

    expect(complaint.sections.causesOfAction).toContain('NEGLIGENCE');
    expect(complaint.sections.causesOfAction).toContain('duty');
    expect(complaint.sections.causesOfAction).toContain('breach');
  });

  it('should generate strict liability count', async () => {
    const dataWithStrictLiability: ComplaintData = {
      ...mockComplaintData,
      causesOfAction: ['STRICT_LIABILITY'],
    };

    const complaint = await generateComplaint(dataWithStrictLiability);

    expect(complaint.sections.causesOfAction).toContain('STRICT');
    expect(complaint.sections.causesOfAction).toContain('defect');
  });

  it('should generate breach of warranty count', async () => {
    const dataWithWarranty: ComplaintData = {
      ...mockComplaintData,
      causesOfAction: ['BREACH_WARRANTY'],
    };

    const complaint = await generateComplaint(dataWithWarranty);

    expect(complaint.sections.causesOfAction).toContain('WARRANTY');
    expect(complaint.sections.causesOfAction).toContain('merchantable');
  });

  it('should generate fraudulent concealment count', async () => {
    const dataWithFraud: ComplaintData = {
      ...mockComplaintData,
      causesOfAction: ['FRAUDULENT_CONCEALMENT'],
    };

    const complaint = await generateComplaint(dataWithFraud);

    expect(complaint.sections.causesOfAction).toContain('FRAUDULENT');
    expect(complaint.sections.causesOfAction).toContain('disclose');
  });
});
