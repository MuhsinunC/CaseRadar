/**
 * Complaint Generator
 * Generates legal class action complaint documents using templates and Claude AI
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ComplaintData,
  GeneratedComplaint,
  ComplaintSections,
  ValidationResult,
  CauseOfAction,
  ReliefType,
  CauseOfActionTemplate,
} from './types';

// Re-export types for convenience
export type { ComplaintData, GeneratedComplaint, ValidationResult, CauseOfAction, ReliefType };

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const COMPLAINT_VERSION = '1.0.0';

/**
 * Validate complaint data before generation
 */
export function validateComplaintData(data: ComplaintData): ValidationResult {
  const errors: string[] = [];

  // Required string fields
  const requiredStrings: (keyof ComplaintData)[] = [
    'courtName',
    'plaintiffName',
    'plaintiffState',
    'plaintiffCity',
    'vehiclePurchaseDate',
    'dealerName',
    'defendantName',
    'defendantStateOfIncorp',
    'defendantHQ',
    'vehicleMake',
    'vehicleModel',
    'defectComponent',
    'defectDescription',
    'failureMode',
    'consequences',
    'classDefinition',
    'estimatedClassSize',
    'firmName',
    'attorneyName',
    'barNumber',
    'firmAddress',
    'firmPhone',
    'firmEmail',
  ];

  for (const field of requiredStrings) {
    const value = data[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      errors.push(`${field} is required`);
    }
  }

  // Validate year range
  if (data.vehicleYearStart > data.vehicleYearEnd) {
    errors.push('vehicleYearStart must be before or equal to vehicleYearEnd');
  }

  // Validate counts are non-negative
  const countFields: (keyof ComplaintData)[] = [
    'totalComplaints',
    'crashComplaints',
    'fireComplaints',
    'injuryCount',
    'deathCount',
  ];

  for (const field of countFields) {
    const value = data[field] as number;
    if (value < 0) {
      errors.push(`${field} must be non-negative`);
    }
  }

  // Validate causes of action
  if (!data.causesOfAction || data.causesOfAction.length === 0) {
    errors.push('At least one cause of action is required');
  }

  // Validate relief requested
  if (!data.reliefRequested || data.reliefRequested.length === 0) {
    errors.push('At least one type of relief must be requested');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generate the caption section
 */
function generateCaption(data: ComplaintData): string {
  const caseNumberLine = data.caseNumber
    ? `Case No. ${data.caseNumber}`
    : 'Case No. ____________';

  return `${data.courtName}

─────────────────────────────────────────
${data.plaintiffName.toUpperCase()}, individually and on    )
behalf of all others similarly situated, )
                                         )   ${caseNumberLine}
              Plaintiff,                 )
                                         )   CLASS ACTION COMPLAINT
         v.                              )
                                         )   JURY TRIAL DEMANDED
${data.defendantName.toUpperCase()},                        )
                                         )
              Defendant.                 )
─────────────────────────────────────────`;
}

/**
 * Generate introduction section using Claude AI
 */
export async function generateIntroduction(data: ComplaintData): Promise<string> {
  const prompt = `You are a legal writing assistant helping draft a class action complaint introduction. Generate a professional, formal legal introduction (2-3 paragraphs) for a class action complaint with the following facts:

Vehicle: ${data.vehicleYearStart}-${data.vehicleYearEnd} ${data.vehicleMake} ${data.vehicleModel}
Defective Component: ${data.defectComponent}
Defect Description: ${data.defectDescription}
Failure Mode: ${data.failureMode}
Consequences: ${data.consequences}
Total NHTSA Complaints: ${data.totalComplaints}
Crashes: ${data.crashComplaints}
Fires: ${data.fireComplaints}
Injuries: ${data.injuryCount}
Deaths: ${data.deathCount}
Defendant: ${data.defendantName}

The introduction should:
1. State this is a class action on behalf of purchasers/lessees
2. Briefly describe the defect and its dangers
3. Allege the defendant knew or should have known of the defect
4. State the harm caused to plaintiffs

Use numbered paragraphs starting with 1. Write in formal legal style. Do not include any preamble or explanation - just the introduction paragraphs.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    // Fallback to template-based introduction if API fails
    console.error('Claude API error, using template fallback:', error);
    return generateIntroductionTemplate(data);
  }
}

/**
 * Template-based introduction fallback
 */
function generateIntroductionTemplate(data: ComplaintData): string {
  return `1. This is a class action brought on behalf of all persons who purchased or
leased ${data.vehicleYearStart}-${data.vehicleYearEnd} ${data.vehicleMake} ${data.vehicleModel} vehicles equipped with ${data.defectComponent}
that is defective and prone to ${data.failureMode}.

2. Defendant ${data.defendantName} knew or should have known of this defect through
consumer complaints, warranty claims, and internal testing, yet failed to
disclose the defect to consumers or remedy it in a timely manner.

3. As a result of this defect, Plaintiff and Class Members have suffered
damages including diminished vehicle value, out-of-pocket repair costs, and
in some cases, personal injury and property damage. According to NHTSA records,
this defect has resulted in ${data.crashComplaints} crashes, ${data.fireComplaints} fires, ${data.injuryCount} injuries,
and ${data.deathCount} fatalities.`;
}

/**
 * Generate jurisdiction and venue section
 */
function generateJurisdiction(data: ComplaintData): string {
  const paragraphNum = 4;
  return `JURISDICTION AND VENUE

${paragraphNum}. This Court has subject matter jurisdiction pursuant to the Class Action
Fairness Act, 28 U.S.C. § 1332(d)(2), because: (a) there are 100 or more
Class Members; (b) the aggregate amount in controversy exceeds $5,000,000,
exclusive of interest and costs; and (c) at least one Class Member is a
citizen of a state different from Defendant.

${paragraphNum + 1}. This Court has personal jurisdiction over Defendant because Defendant
conducts substantial business in this District, and the acts giving rise
to this Complaint occurred in this District.

${paragraphNum + 2}. Venue is proper in this District pursuant to 28 U.S.C. § 1391(b)(2)
because a substantial part of the events giving rise to Plaintiff's claims
occurred in this District.`;
}

/**
 * Generate parties section
 */
function generateParties(data: ComplaintData): string {
  const paragraphNum = 7;
  return `PARTIES

${paragraphNum}. Plaintiff ${data.plaintiffName} is a citizen of ${data.plaintiffState}, residing in
${data.plaintiffCity}, ${data.plaintiffState}. Plaintiff purchased a ${data.vehicleYearStart}-${data.vehicleYearEnd} ${data.vehicleMake}
${data.vehicleModel} on or about ${data.vehiclePurchaseDate} from ${data.dealerName}. Plaintiff's
vehicle is equipped with the defective ${data.defectComponent}.

${paragraphNum + 1}. Defendant ${data.defendantName} is a ${data.defendantStateOfIncorp} corporation
with its principal place of business in ${data.defendantHQ}. Defendant designs,
manufactures, markets, distributes, and sells vehicles throughout the
United States, including in this District.`;
}

/**
 * Generate factual allegations section using Claude AI
 */
export async function generateFactualAllegations(data: ComplaintData): Promise<string> {
  const complaintsExcerpt = data.representativeComplaints
    .slice(0, 3)
    .map((c, i) => `    ${String.fromCharCode(97 + i)}. "${c}"`)
    .join('\n\n');

  const prompt = `You are a legal writing assistant helping draft the factual allegations section of a class action complaint. Generate the factual allegations for a vehicle defect case with the following facts:

Vehicle: ${data.vehicleYearStart}-${data.vehicleYearEnd} ${data.vehicleMake} ${data.vehicleModel}
Defective Component: ${data.defectComponent}
Defect Description: ${data.defectDescription}
Failure Mode: ${data.failureMode}
Consequences: ${data.consequences}

NHTSA Complaint Statistics:
- Total complaints: ${data.totalComplaints}
- Crashes: ${data.crashComplaints}
- Fires: ${data.fireComplaints}
- Injuries: ${data.injuryCount}
- Deaths: ${data.deathCount}

Representative consumer complaints:
${complaintsExcerpt}

The factual allegations should:
1. Describe the defect in detail (THE DEFECT section)
2. Allege defendant's knowledge through multiple sources (DEFENDANT'S KNOWLEDGE section)
3. Present the NHTSA statistics with exact numbers (CONSUMER COMPLAINTS AND HARM section)
4. Include representative complaint excerpts

Use numbered paragraphs starting with 9. Write in formal legal style. Include the exact statistics provided. Do not include any preamble or explanation - just the factual allegations section.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Claude API error, using template fallback:', error);
    return generateFactualAllegationsTemplate(data);
  }
}

/**
 * Template-based factual allegations fallback
 */
function generateFactualAllegationsTemplate(data: ComplaintData): string {
  const complaintsExcerpt = data.representativeComplaints
    .slice(0, 3)
    .map((c, i) => `    ${String.fromCharCode(97 + i)}. "${c}"`)
    .join('\n\n');

  return `FACTUAL ALLEGATIONS

THE ${data.defectComponent.toUpperCase()} DEFECT

9. ${data.vehicleMake} ${data.vehicleModel} vehicles manufactured between ${data.vehicleYearStart} and ${data.vehicleYearEnd}
are equipped with ${data.defectComponent} that is defective in design and/or manufacture.

10. The defect causes ${data.failureMode}, which can result in
${data.consequences}.

11. ${data.defectDescription}

DEFENDANT'S KNOWLEDGE OF THE DEFECT

12. Defendant knew or should have known of the ${data.defectComponent} defect through
multiple sources, including but not limited to:

    a. Pre-production testing and design analysis;
    b. Early consumer complaints to Defendant's customer service;
    c. Warranty claims data;
    d. Complaints filed with the National Highway Traffic Safety
       Administration ("NHTSA");
    e. Technical Service Bulletins issued to dealers;
    f. Internal communications and engineering analyses.

13. According to NHTSA records, consumers have filed at least ${data.totalComplaints}
complaints regarding ${data.defectComponent} failures in ${data.vehicleMake} ${data.vehicleModel} vehicles.

CONSUMER COMPLAINTS AND HARM

14. NHTSA complaint data reveals a pattern of ${data.defectComponent} failures in
${data.vehicleMake} ${data.vehicleModel} vehicles:

    a. Total complaints: ${data.totalComplaints}
    b. Complaints involving crashes: ${data.crashComplaints}
    c. Complaints involving fires: ${data.fireComplaints}
    d. Reported injuries: ${data.injuryCount}
    e. Reported fatalities: ${data.deathCount}

15. Representative consumer complaints include:

${complaintsExcerpt}`;
}

/**
 * Generate class allegations section
 */
export function generateClassDefinition(data: ComplaintData): string {
  return `CLASS ALLEGATIONS

16. Plaintiff brings this action on behalf of himself and all others
similarly situated pursuant to Federal Rules of Civil Procedure 23(a),
23(b)(2), and 23(b)(3).

17. The proposed Class is defined as:

    ${data.classDefinition}

18. Excluded from the Class are: (a) Defendant and its officers, directors,
and employees; (b) any entity in which Defendant has a controlling interest;
(c) the judge(s) assigned to this case; and (d) the legal representatives,
heirs, successors, and assigns of any such excluded person.

NUMEROSITY (Rule 23(a)(1)) - numerosity

19. The Class is so numerous that joinder of all members is impracticable.
Upon information and belief, the Class consists of ${data.estimatedClassSize}
of individuals throughout the United States.

COMMONALITY (Rule 23(a)(2)) - commonality

20. There are questions of law and fact common to the Class, including:
    a. Whether the ${data.defectComponent} is defective;
    b. Whether Defendant knew of the defect;
    c. Whether Defendant had a duty to disclose the defect;
    d. Whether Defendant's conduct was negligent;
    e. Whether Class Members are entitled to damages.

TYPICALITY (Rule 23(a)(3)) - typicality

21. Plaintiff's claims are typical of the claims of the Class because
Plaintiff and all Class Members were injured by the same wrongful conduct.

ADEQUACY (Rule 23(a)(4)) - adequacy

22. Plaintiff will fairly and adequately protect the interests of the Class.
Plaintiff has retained counsel experienced in class action litigation.

PREDOMINANCE AND SUPERIORITY (Rule 23(b)(3))

23. Common questions of law and fact predominate over questions affecting
only individual Class Members.

24. A class action is superior to other methods for adjudication because
the prosecution of separate actions would create the risk of inconsistent
judgments and would be inefficient.`;
}

/**
 * Cause of action templates
 */
const CAUSE_OF_ACTION_TEMPLATES: Record<CauseOfAction, CauseOfActionTemplate> = {
  NEGLIGENCE: {
    type: 'NEGLIGENCE',
    title: 'COUNT - NEGLIGENCE',
    elements: ['duty', 'breach', 'causation', 'damages'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. Defendant had a duty to exercise reasonable care in the design,
manufacture, and sale of its vehicles.

{nextParagraph}. Defendant breached this duty by designing, manufacturing, and selling
vehicles with defective {component}.

{nextParagraph}. As a direct and proximate result of Defendant's negligence, Plaintiff
and Class Members have suffered damages.`,
  },
  STRICT_LIABILITY: {
    type: 'STRICT_LIABILITY',
    title: 'COUNT - STRICT PRODUCTS LIABILITY (Design Defect)',
    elements: ['defect', 'unreasonably dangerous', 'foreseeable use', 'causation'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. The {component} in the Class Vehicles is defective in design because
it is prone to {failureMode}.

{nextParagraph}. The defect renders the vehicles unreasonably dangerous.

{nextParagraph}. The Class Vehicles were used in a manner reasonably foreseeable to
Defendant.

{nextParagraph}. The defect was a proximate cause of Plaintiff's and Class Members' damages.`,
  },
  BREACH_WARRANTY: {
    type: 'BREACH_WARRANTY',
    title: 'COUNT - BREACH OF IMPLIED WARRANTY OF MERCHANTABILITY',
    elements: ['implied warranty', 'not merchantable', 'damages'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. Defendant impliedly warranted that the Class Vehicles were merchantable
and fit for their ordinary purpose of safe transportation.

{nextParagraph}. The Class Vehicles are not merchantable because the {component} is
defective and prone to {failureMode}.

{nextParagraph}. As a result, Plaintiff and Class Members have suffered damages.`,
  },
  FRAUDULENT_CONCEALMENT: {
    type: 'FRAUDULENT_CONCEALMENT',
    title: 'COUNT - FRAUDULENT CONCEALMENT',
    elements: ['knowledge', 'duty to disclose', 'concealment', 'reliance', 'damages'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. Defendant knew of the {component} defect but failed to disclose it
to consumers.

{nextParagraph}. Defendant had a duty to disclose the defect because: (a) Defendant had
exclusive knowledge of the defect; (b) the defect was not known or reasonably
discoverable by Plaintiff; and (c) Defendant actively concealed the defect.

{nextParagraph}. Plaintiff and Class Members would not have purchased the vehicles,
or would have paid less, had they known of the defect.

{nextParagraph}. Plaintiff and Class Members are entitled to compensatory and punitive
damages.`,
  },
  CONSUMER_PROTECTION: {
    type: 'CONSUMER_PROTECTION',
    title: 'COUNT - VIOLATION OF STATE CONSUMER PROTECTION ACTS',
    elements: ['unfair practice', 'deception', 'consumer harm'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. Defendant engaged in unfair and deceptive acts and practices by
failing to disclose the {component} defect to consumers.

{nextParagraph}. Defendant's conduct constitutes unfair competition and unfair,
unlawful, and/or fraudulent business practices.

{nextParagraph}. As a result of Defendant's conduct, Plaintiff and Class Members
have suffered ascertainable losses.`,
  },
  UNJUST_ENRICHMENT: {
    type: 'UNJUST_ENRICHMENT',
    title: 'COUNT - UNJUST ENRICHMENT',
    elements: ['benefit conferred', 'retention unjust'],
    template: `{title}

{paragraphNum}. Plaintiff incorporates by reference all preceding paragraphs.

{nextParagraph}. Plaintiff and Class Members conferred a benefit on Defendant by
purchasing or leasing Class Vehicles.

{nextParagraph}. Defendant has been unjustly enriched by retaining the benefits
conferred by Plaintiff and Class Members.

{nextParagraph}. It would be unjust for Defendant to retain these benefits.`,
  },
};

/**
 * Generate causes of action section
 */
function generateCausesOfAction(data: ComplaintData): string {
  let paragraphNum = 25;
  const counts: string[] = [];

  data.causesOfAction.forEach((cause, index) => {
    const template = CAUSE_OF_ACTION_TEMPLATES[cause];
    if (!template) return;

    let text = template.template
      .replace('{title}', `COUNT ${toRoman(index + 1)} - ${template.title.replace('COUNT - ', '')}`)
      .replace('{component}', data.defectComponent)
      .replace('{failureMode}', data.failureMode)
      .replace('{paragraphNum}', String(paragraphNum));

    // Replace {nextParagraph} placeholders
    let nextParagraphNum = paragraphNum + 1;
    while (text.includes('{nextParagraph}')) {
      text = text.replace('{nextParagraph}', String(nextParagraphNum));
      nextParagraphNum++;
    }

    counts.push(text);
    paragraphNum = nextParagraphNum;
  });

  return `CAUSES OF ACTION\n\n${counts.join('\n\n─────────────────────────────────────────\n\n')}`;
}

/**
 * Convert number to Roman numeral
 */
function toRoman(num: number): string {
  const romanNumerals: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let result = '';
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}

/**
 * Relief type to text mapping
 */
const RELIEF_TEXT: Record<ReliefType, string> = {
  CLASS_CERTIFICATION: 'Certify this case as a class action under Rule 23',
  COMPENSATORY_DAMAGES: 'Award compensatory damages to Plaintiff and the Class',
  PUNITIVE_DAMAGES: 'Award punitive damages to Plaintiff and the Class',
  INJUNCTIVE_RELIEF: `Award injunctive relief requiring Defendant to repair or replace
   the defective component`,
  RESTITUTION: 'Award restitution and disgorgement of profits',
  ATTORNEYS_FEES: "Award attorneys' fees and costs",
  PREJUDGMENT_INTEREST: 'Award pre-judgment and post-judgment interest',
};

/**
 * Generate prayer for relief section
 */
function generatePrayerForRelief(data: ComplaintData): string {
  const reliefItems = data.reliefRequested.map((relief, index) => {
    const letter = String.fromCharCode(65 + index);
    return `${letter}. ${RELIEF_TEXT[relief]};`;
  });

  // Add final catch-all relief
  reliefItems.push(
    `${String.fromCharCode(65 + reliefItems.length)}. Grant such other relief as the Court deems just and proper.`
  );

  return `PRAYER FOR RELIEF

WHEREFORE, Plaintiff, on behalf of himself and all others similarly
situated, respectfully requests that this Court:

${reliefItems.join('\n\n')}`;
}

/**
 * Generate jury demand section
 */
function generateJuryDemand(): string {
  return `DEMAND FOR JURY TRIAL

Plaintiff demands a trial by jury on all claims so triable.`;
}

/**
 * Generate signature block
 */
function generateSignature(data: ComplaintData): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `Dated: ${today}

                              Respectfully submitted,

                              ${data.firmName.toUpperCase()}

                              By: _____________________________
                                  ${data.attorneyName}
                                  ${data.barNumber}
                                  ${data.firmAddress}
                                  ${data.firmPhone}
                                  ${data.firmEmail}

                              Attorneys for Plaintiff and the
                              Proposed Class`;
}

/**
 * Generate complete complaint document
 */
export async function generateComplaint(data: ComplaintData): Promise<GeneratedComplaint> {
  // Validate input data
  const validation = validateComplaintData(data);
  if (!validation.isValid) {
    throw new Error(`Invalid complaint data: ${validation.errors.join(', ')}`);
  }

  // Generate all sections
  const [introduction, factualAllegations] = await Promise.all([
    generateIntroduction(data),
    generateFactualAllegations(data),
  ]);

  const sections: ComplaintSections = {
    caption: generateCaption(data),
    introduction,
    jurisdiction: generateJurisdiction(data),
    parties: generateParties(data),
    factualAllegations,
    classAllegations: generateClassDefinition(data),
    causesOfAction: generateCausesOfAction(data),
    prayerForRelief: generatePrayerForRelief(data),
    juryDemand: generateJuryDemand(),
    signature: generateSignature(data),
  };

  const today = new Date().toISOString().split('T')[0];
  const disclaimer = `DRAFT - FOR ATTORNEY REVIEW ONLY
Generated by CaseRadar on ${today}
This document requires legal review before filing.`;

  return {
    sections,
    disclaimer,
    metadata: {
      generatedAt: new Date(),
      patternId: data.patternId,
      version: COMPLAINT_VERSION,
    },
  };
}
