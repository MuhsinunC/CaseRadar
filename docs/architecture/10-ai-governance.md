# CaseRadar AI Governance Documentation

## Overview

CaseRadar uses AI for two critical functions:
1. **Semantic embeddings** (OpenAI) - Vector representations for similarity search
2. **Legal document generation** (Anthropic Claude) - Drafting formal complaints

This document establishes governance, risk mitigation, and quality controls for AI systems in a legal technology context.

---

## AI System Architecture

```mermaid
graph TB
    subgraph Input["Input Layer"]
        Complaints["NHTSA Complaints"]
        Patterns["Detected Patterns"]
        UserContext["User Context"]
    end

    subgraph AIServices["AI Services"]
        subgraph Embeddings["Embedding Pipeline"]
            OpenAI["OpenAI text-embedding-3-small"]
            VectorDB["pgvector Storage"]
        end

        subgraph Generation["Generation Pipeline"]
            Claude["Claude claude-sonnet-4-20250514"]
            Templates["Prompt Templates"]
            Validation["Output Validation"]
        end
    end

    subgraph Output["Output Layer"]
        SimilaritySearch["Similarity Search Results"]
        Clusters["Complaint Clusters"]
        LegalDocs["Legal Document Drafts"]
    end

    subgraph Governance["Governance Layer"]
        Versioning["Model & Prompt Versioning"]
        Monitoring["Output Monitoring"]
        HumanReview["Human-in-the-Loop"]
        AuditLog["AI Audit Trail"]
    end

    Complaints --> OpenAI
    OpenAI --> VectorDB
    VectorDB --> SimilaritySearch
    VectorDB --> Clusters

    Patterns --> Templates
    UserContext --> Templates
    Templates --> Claude
    Claude --> Validation
    Validation --> LegalDocs

    AIServices --> Governance
```

---

## Model Inventory

### Active Models

| Model | Provider | Version | Purpose | Last Updated |
|-------|----------|---------|---------|--------------|
| `text-embedding-3-small` | OpenAI | 3-small | Complaint embeddings | 2024-01 |
| `claude-sonnet-4-20250514` | Anthropic | claude-sonnet-4-20250514 | Legal document generation | 2024-12 |

### Model Selection Rationale

```mermaid
graph TD
    subgraph Embedding["Embedding Model Selection"]
        E1["text-embedding-3-small"]
        E1a["1536 dimensions"]
        E1b["Cost: $0.02/1M tokens"]
        E1c["Quality: Sufficient for clustering"]
        E1d["Latency: <100ms"]
    end

    subgraph Generation["Generation Model Selection"]
        G1["Claude claude-sonnet-4-20250514"]
        G1a["Best-in-class legal reasoning"]
        G1b["Lower hallucination rate"]
        G1c["Constitutional AI safety"]
        G1d["200K context window"]
    end
```

**Decision Record: Why Claude claude-sonnet-4-20250514 for Legal Generation**
- Superior performance on legal reasoning benchmarks
- Constitutional AI reduces harmful outputs
- Better instruction following for structured documents
- Lower hallucination rate on factual claims
- Cost-effective for document-length outputs

---

## Hallucination Mitigation

### Risk Assessment

```mermaid
graph TB
    subgraph HighRisk["High Risk (Legal Impact)"]
        Facts["Factual Claims"]
        Citations["Legal Citations"]
        Stats["Statistics/Numbers"]
        Dates["Dates/Timelines"]
    end

    subgraph MediumRisk["Medium Risk"]
        Analysis["Pattern Analysis"]
        Severity["Severity Assessment"]
        Recommendations["Recommendations"]
    end

    subgraph LowRisk["Lower Risk"]
        Formatting["Document Formatting"]
        Boilerplate["Legal Boilerplate"]
        Structure["Section Structure"]
    end
```

### Mitigation Strategies

| Risk | Mitigation | Implementation |
|------|------------|----------------|
| **Fabricated facts** | Ground in source data | Include complaint IDs in prompts |
| **Invented citations** | No citation generation | Explicitly instruct not to cite cases |
| **Wrong statistics** | Computed externally | Pass pre-calculated stats to AI |
| **False claims** | Human review required | DRAFT → Review → FINALIZE workflow |
| **Inconsistent analysis** | Deterministic clustering | AI only summarizes, not analyzes |

### Prompt Engineering for Accuracy

```mermaid
flowchart TD
    subgraph Constraints["Prompt Constraints"]
        C1["Do not invent facts"]
        C2["Do not cite cases"]
        C3["Use only provided data"]
        C4["Flag uncertainty"]
    end

    subgraph Structure["Structured Output"]
        S1["JSON schema enforcement"]
        S2["Required field validation"]
        S3["Length limits per section"]
    end

    subgraph Review["Review Signals"]
        R1["Confidence indicators"]
        R2["Source references"]
        R3["Uncertainty markers"]
    end

    Constraints --> Prompt["Final Prompt"]
    Structure --> Prompt
    Review --> Prompt
```

### Example Prompt Template

```typescript
const LEGAL_COMPLAINT_PROMPT = `
You are a legal document assistant helping attorneys draft NHTSA vehicle defect complaints.

CRITICAL RULES:
1. ONLY use information from the provided complaint data
2. DO NOT cite any court cases or legal precedents
3. DO NOT invent any facts, statistics, or dates
4. If uncertain about something, mark it with [VERIFY]
5. Use the exact complaint counts and statistics provided

INPUT DATA:
- Pattern ID: {patternId}
- Vehicle: {make} {model} ({yearRange})
- Total Complaints: {complaintCount} (exact count)
- Injuries: {injuryCount} (exact count)
- Deaths: {deathCount} (exact count)
- Common Components: {components}
- Sample Complaints: {sampleComplaints}

OUTPUT REQUIREMENTS:
- Generate sections in JSON format
- Each section must be complete and professional
- Reference specific complaint IDs when possible
- Mark any assumptions with [ASSUMPTION]

Generate a formal complaint document with the following sections:
{sectionInstructions}
`;
```

---

## Human-in-the-Loop Workflow

### Document Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Draft: AI Generation
    Draft --> Review: Attorney Review
    Review --> Draft: Revisions Needed
    Review --> Finalized: Approved
    Finalized --> Filed: Court Filing
    Filed --> [*]

    note right of Draft
        AI-generated content
        May contain errors
        NOT for external use
    end note

    note right of Finalized
        Attorney-approved
        Legally binding
        Hash-verified
    end note
```

### Review Checklist

```mermaid
flowchart TD
    Doc["AI-Generated Draft"] --> Check1["Facts verified against source?"]
    Check1 -->|No| Revise1["Mark for revision"]
    Check1 -->|Yes| Check2["Statistics accurate?"]
    Check2 -->|No| Revise2["Recalculate"]
    Check2 -->|Yes| Check3["No fabricated citations?"]
    Check3 -->|No| Revise3["Remove citations"]
    Check3 -->|Yes| Check4["Legal language appropriate?"]
    Check4 -->|No| Revise4["Legal review"]
    Check4 -->|Yes| Check5["Client confidentiality maintained?"]
    Check5 -->|No| Revise5["Redact information"]
    Check5 -->|Yes| Approve["Approve for Finalization"]
```

### Required Attestations

Before finalizing any AI-generated document, the reviewing attorney must attest:

| Attestation | Description | Required |
|-------------|-------------|----------|
| **Factual accuracy** | All facts verified against source complaints | Yes |
| **Statistical accuracy** | All numbers match calculated values | Yes |
| **No hallucinations** | No fabricated information present | Yes |
| **Legal appropriateness** | Language suitable for legal filing | Yes |
| **Client authorization** | Client approved filing | Yes |

---

## Embedding Pipeline Governance

### Embedding Generation Flow

```mermaid
sequenceDiagram
    participant Cron as Cron Job
    participant Service as Embedding Service
    participant OpenAI as OpenAI API
    participant DB as Database
    participant Monitor as Monitoring

    Cron->>Service: Process new complaints
    Service->>DB: Get complaints without embeddings

    loop For each batch (100 complaints)
        Service->>OpenAI: Generate embeddings
        OpenAI-->>Service: Embedding vectors
        Service->>Service: Validate dimensions (1536)
        Service->>Service: Validate L2 norm
        Service->>DB: Store embeddings
        Service->>Monitor: Log batch metrics
    end

    Service->>Monitor: Log completion stats
```

### Embedding Quality Assurance

| Check | Threshold | Action on Failure |
|-------|-----------|-------------------|
| Dimension count | Exactly 1536 | Reject, retry |
| L2 norm | 0.9 - 1.1 | Flag for review |
| Null/zero vectors | 0% | Reject, alert |
| Generation time | < 5s per batch | Alert, investigate |
| API errors | < 1% | Retry with backoff |

### Embedding Drift Detection

```mermaid
flowchart TD
    subgraph Baseline["Baseline Metrics"]
        B1["Reference corpus embeddings"]
        B2["Known-similar pairs"]
        B3["Known-different pairs"]
    end

    subgraph Monitor["Drift Monitoring"]
        M1["Daily similarity score distribution"]
        M2["Clustering stability check"]
        M3["New vs old embedding comparison"]
    end

    subgraph Alert["Alert Conditions"]
        A1["Mean similarity shift > 5%"]
        A2["Cluster membership change > 10%"]
        A3["Model version change detected"]
    end

    Baseline --> Monitor
    Monitor --> Alert
    Alert -->|"Triggered"| Review["Manual Review Required"]
```

---

## Clustering Reproducibility

### Deterministic Clustering Requirements

For legal defensibility, pattern detection must be reproducible:

| Requirement | Implementation |
|-------------|----------------|
| **Same input → same output** | Fixed random seed |
| **Versioned algorithm** | Algorithm version stored with pattern |
| **Audit trail** | All clustering runs logged |
| **Parameter documentation** | Threshold values documented |

### Clustering Parameters

```typescript
// Clustering configuration - versioned
const CLUSTERING_CONFIG_V1 = {
  version: '1.0.0',
  algorithm: 'greedy-centroid',
  similarityThreshold: 0.85,
  minClusterSize: 3,
  maxClusterSize: 1000,
  randomSeed: 42,  // Fixed for reproducibility
};
```

### Clustering Audit Log

```mermaid
erDiagram
    ClusteringRun {
        string id PK
        string configVersion "1.0.0"
        json configSnapshot "Full config"
        int inputComplaintCount
        int outputClusterCount
        float avgClusterSize
        float avgSimilarity
        datetime executedAt
        int durationMs
    }

    Pattern {
        string id PK
        string clusteringRunId FK
        json complaintIds "Source complaints"
        float centroidSimilarity
    }

    ClusteringRun ||--o{ Pattern : "produces"
```

---

## AI Output Validation

### Validation Pipeline

```mermaid
flowchart TD
    AIOutput["AI-Generated Content"] --> Schema["JSON Schema Validation"]
    Schema -->|"Invalid"| Reject1["Reject: Schema Error"]
    Schema -->|"Valid"| Length["Length Validation"]
    Length -->|"Too Long"| Truncate["Truncate + Warn"]
    Length -->|"Valid"| Content["Content Validation"]
    Content --> PII["PII Detection"]
    PII -->|"PII Found"| Redact["Redact + Log"]
    PII -->|"Clean"| Harmful["Harmful Content Check"]
    Harmful -->|"Flagged"| Reject2["Reject: Content Policy"]
    Harmful -->|"Clean"| Store["Store as Draft"]
```

### Validation Rules

| Rule | Check | Action |
|------|-------|--------|
| **Schema compliance** | JSON matches expected structure | Reject if invalid |
| **Section length** | Each section < 10,000 chars | Truncate with warning |
| **PII detection** | Scan for SSN, phone, email patterns | Redact and log |
| **Harmful content** | Check for inappropriate language | Reject and alert |
| **Completeness** | All required sections present | Flag missing sections |

### PII Detection Patterns

```typescript
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,           // SSN
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,   // Phone
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
];

function detectPII(content: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const pattern of PII_PATTERNS) {
    const found = content.match(pattern);
    if (found) {
      matches.push({ pattern: pattern.source, value: '[REDACTED]' });
    }
  }
  return matches;
}
```

---

## Model Versioning & Rollback

### Version Tracking

```mermaid
graph TB
    subgraph Models["Model Versions"]
        M1["Embedding: text-embedding-3-small"]
        M2["Generation: claude-sonnet-4-20250514"]
    end

    subgraph Prompts["Prompt Versions"]
        P1["complaint-generator-v1.2"]
        P2["summary-generator-v1.0"]
    end

    subgraph Config["Config Versions"]
        C1["clustering-config-v1.0"]
        C2["validation-rules-v1.1"]
    end

    subgraph Storage["Version Storage"]
        DB["Database: AIVersion table"]
        Git["Git: prompt templates"]
    end

    Models --> Storage
    Prompts --> Storage
    Config --> Storage
```

### AIVersion Schema

```mermaid
erDiagram
    AIVersion {
        string id PK
        string componentType "MODEL|PROMPT|CONFIG"
        string componentName "text-embedding-3-small"
        string version "3-small"
        json configuration "Full config snapshot"
        datetime activatedAt
        datetime deprecatedAt "nullable"
        string deprecationReason "nullable"
    }

    GeneratedComplaint {
        string id PK
        string embeddingVersion FK
        string generationModelVersion FK
        string promptVersion FK
    }

    AIVersion ||--o{ GeneratedComplaint : "used_by"
```

### Rollback Procedure

```mermaid
flowchart TD
    Issue["Quality Issue Detected"] --> Assess["Assess Impact"]
    Assess --> Decide{"Rollback Needed?"}

    Decide -->|"Yes"| Pause["Pause AI Generation"]
    Pause --> Switch["Switch to Previous Version"]
    Switch --> Verify["Verify Output Quality"]
    Verify --> Resume["Resume Generation"]
    Resume --> PostMortem["Post-Mortem Analysis"]

    Decide -->|"No"| Monitor["Enhanced Monitoring"]
    Monitor --> Fix["Fix Forward"]
```

---

## Cost Management

### AI Cost Tracking

| Service | Unit | Cost | Monthly Budget |
|---------|------|------|----------------|
| OpenAI Embeddings | 1M tokens | $0.02 | $50 |
| Claude Generation | 1M input tokens | $3.00 | $200 |
| Claude Generation | 1M output tokens | $15.00 | $300 |

### Cost Controls

```mermaid
flowchart TD
    Request["AI Request"] --> Budget["Check Budget"]
    Budget -->|"Under Limit"| Process["Process Request"]
    Budget -->|"At 80%"| Warn["Warn Admin"]
    Budget -->|"At 100%"| Block["Block Non-Critical"]

    Warn --> Process
    Block --> Critical{"Is Critical?"}
    Critical -->|"Yes"| Override["Admin Override"]
    Critical -->|"No"| Queue["Queue for Later"]
    Override --> Process
```

### Rate Limiting by Plan

| Plan | Embedding Requests/Day | Generation Requests/Day |
|------|------------------------|------------------------|
| FREE | 100 | 5 |
| BASIC | 1,000 | 50 |
| PRO | 10,000 | 200 |
| ENTERPRISE | Unlimited | Unlimited |

---

## AI Incident Response

### AI-Specific Incidents

| Incident Type | Severity | Response |
|---------------|----------|----------|
| Hallucinated content in finalized doc | P0 | Immediate recall, client notification |
| Embedding quality degradation | P1 | Pause clustering, investigate |
| Model API outage | P2 | Graceful degradation, user notification |
| Cost overrun | P2 | Throttle requests, alert admin |
| Prompt injection attempt | P1 | Block request, security review |

### Hallucination Incident Response

```mermaid
flowchart TD
    Detect["Hallucination Detected"] --> Classify["Classify Severity"]

    Classify -->|"Finalized Doc"| P0["P0: Critical"]
    Classify -->|"Draft Only"| P2["P2: Medium"]

    P0 --> Recall["Recall Document"]
    Recall --> Notify["Notify Client"]
    Notify --> Review["Legal Review"]
    Review --> Remediate["Issue Corrected Version"]
    Remediate --> RootCause["Root Cause Analysis"]

    P2 --> Flag["Flag for Review"]
    Flag --> Fix["Fix in Draft"]
    Fix --> Log["Log Incident"]
```

---

## Compliance & Ethics

### AI Ethics Principles

1. **Transparency** - Users know when content is AI-generated
2. **Accuracy** - AI must not fabricate information
3. **Accountability** - Human review required for legal documents
4. **Fairness** - AI must not introduce bias into legal analysis
5. **Privacy** - AI must not expose confidential information

### AI Disclosure

All AI-generated documents include disclosure:

```
NOTICE: This document was drafted with AI assistance using CaseRadar's
legal document generation system (Claude claude-sonnet-4-20250514). The content has been
reviewed and approved by [Attorney Name] on [Date]. AI was used to
structure and draft the document based on verified complaint data; all
facts and statistics have been independently verified.
```

### Bias Monitoring

| Check | Frequency | Method |
|-------|-----------|--------|
| Clustering fairness | Weekly | Statistical parity across manufacturers |
| Generation consistency | Per request | Same input → similar output |
| Severity scoring fairness | Monthly | Calibration across vehicle types |

---

## AI Governance Checklist

### Before Production
- [ ] Model selection documented with rationale
- [ ] Hallucination mitigation strategies implemented
- [ ] Human-in-the-loop workflow defined
- [ ] Output validation pipeline active
- [ ] Version tracking configured
- [ ] Cost controls in place

### Ongoing Operations
- [ ] Weekly output quality review
- [ ] Monthly drift detection check
- [ ] Quarterly model evaluation
- [ ] Annual ethics review

---

**Previous:** [09-security-compliance.md](./09-security-compliance.md) - Security & Compliance
**Next:** [11-operational-runbooks.md](./11-operational-runbooks.md) - Operational Runbooks
