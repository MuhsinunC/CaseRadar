# CaseRadar - Research Agenda

This document outlines all research that must be completed before detailed implementation planning.

---

## 1. NHTSA API & Data Research

**Output**: `docs/research/nhtsa-api.md`

### Questions to Answer

#### API Capabilities
- [ ] What endpoints are available for complaint data?
- [ ] Is authentication required? What type?
- [ ] What are the rate limits?
- [ ] Is there pagination? How does it work?
- [ ] Can we query by date range, vehicle make/model, complaint type?

#### Data Schema
- [ ] What fields are available in complaint records?
- [ ] What is the data format (JSON, XML, CSV)?
- [ ] Are there nested objects or flat records?
- [ ] What fields are useful for pattern detection?
  - Vehicle make, model, year
  - Complaint description (text)
  - Incident date
  - Crash indicator
  - Injuries/deaths count
  - Component involved

#### Data Volume
- [ ] How many total complaints exist?
- [ ] What is the daily/weekly ingest rate of new complaints?
- [ ] How far back does historical data go?
- [ ] Is there a bulk download option?

#### Data Quality
- [ ] Are there missing fields commonly?
- [ ] How is text data formatted (clean or needs preprocessing)?
- [ ] Are there duplicate records?

### Research Methods
1. Fetch and analyze NHTSA API documentation
2. Make sample API calls to understand response structure
3. Document sample responses

---

## 2. Semantic Analysis Tools Research

**Output**: `docs/research/analysis-tools.md`

### Questions to Answer

#### Embedding Models
- [ ] OpenAI embeddings: cost per token, latency, quality?
- [ ] Open-source alternatives (sentence-transformers, etc.)?
- [ ] Tradeoffs: cost vs quality vs speed?
- [ ] Which performs best for automotive complaint text?

#### Clustering Approaches
- [ ] K-means vs HDBSCAN vs other algorithms?
- [ ] How to determine optimal cluster count?
- [ ] How to handle new complaints (incremental clustering)?

#### MLOps Platforms
- [ ] Weights & Biases: what does it actually do?
- [ ] Hugging Face: model hosting, inference endpoints?
- [ ] LangChain: useful for this use case?
- [ ] Do we need MLOps at all, or is it overkill?

#### Vector Databases
- [ ] pgvector (PostgreSQL extension) - good enough?
- [ ] Pinecone, Weaviate, Qdrant - when to use?
- [ ] Cost and scaling considerations?

#### Trend Detection
- [ ] Time-series analysis libraries?
- [ ] Statistical methods for anomaly detection?
- [ ] How to detect "increasing complaint frequency"?

### Research Methods
1. Web search for comparisons
2. Read documentation for each tool
3. Look for case studies in similar domains

---

## 3. Legal Complaint Format Research

**Output**: `docs/research/legal-complaints.md`

### Questions to Answer

#### Federal Class Action Complaints
- [ ] What is the structure of a federal class action complaint?
- [ ] What sections are required?
  - Caption
  - Jurisdiction
  - Parties
  - Factual allegations
  - Class allegations
  - Causes of action
  - Prayer for relief
- [ ] What is the typical length?
- [ ] What formatting is required (margins, fonts, etc.)?

#### Legal Language
- [ ] What legal terms/phrases are standard?
- [ ] How are citations formatted?
- [ ] What evidence needs to be referenced?

#### Examples
- [ ] Find 3-5 real class action complaints for vehicle defects
- [ ] Analyze their structure and content
- [ ] Identify patterns that can be templated

#### Automation Considerations
- [ ] What parts can be fully automated?
- [ ] What requires human review?
- [ ] How to handle case-specific customization?

### Research Methods
1. Search for public class action complaints online
2. Look for legal templates and guides
3. Web search for "class action complaint structure"

---

## 4. SaaS Infrastructure Research

**Output**: `docs/research/saas-infrastructure.md`

### Questions to Answer

#### Authentication Solutions
- [ ] **Clerk**: pricing, features, Next.js integration?
- [ ] **Auth0**: pricing, features, complexity?
- [ ] **Supabase Auth**: tied to Supabase DB?
- [ ] **NextAuth/Auth.js**: self-hosted, flexibility?
- [ ] Which supports: SSO, MFA, org management, RBAC?

#### Billing Solutions
- [ ] **Stripe**: Checkout, Billing Portal, pricing?
- [ ] **Paddle**: handling sales tax automatically?
- [ ] **LemonSqueezy**: simpler alternative?
- [ ] How to implement usage-based billing?
- [ ] How to handle trials and upgrades?

#### Database Options
- [ ] **PostgreSQL on Railway/Render**: simplicity?
- [ ] **Supabase**: Postgres + extras (auth, storage)?
- [ ] **PlanetScale**: serverless MySQL, branching?
- [ ] **Neon**: serverless Postgres?
- [ ] Connection pooling considerations?

#### Hosting Options
- [ ] **Vercel**: frontend + serverless functions?
- [ ] **Railway**: full-stack, containers?
- [ ] **Render**: similar to Railway?
- [ ] **AWS**: ECS, Lambda, RDS?
- [ ] Cost comparison for expected traffic?

#### RBAC Patterns
- [ ] How to implement role-based access control?
- [ ] Table structure for users, roles, permissions?
- [ ] Best practices for multi-tenant isolation?

### Research Methods
1. Visit pricing pages
2. Read documentation for integration
3. Look for comparison articles

---

## 5. Tech Stack Research

**Output**: `docs/research/tech-stack.md`

### Questions to Answer

#### Frontend Framework
- [ ] **Next.js 14+**: App Router maturity, Server Components?
- [ ] **React + Vite**: simpler, more control?
- [ ] **Vue/Nuxt**: alternative ecosystem?
- [ ] **Svelte/SvelteKit**: performance benefits?

#### UI Component Library
- [ ] **shadcn/ui**: copy-paste components, Tailwind?
- [ ] **Radix UI**: primitive components?
- [ ] **Chakra UI**: full component library?
- [ ] **Mantine**: feature-rich?

#### Backend Framework
- [ ] **Next.js API Routes**: keep it simple, one codebase?
- [ ] **Separate Express/Fastify**: more control?
- [ ] **Python FastAPI**: better for ML integration?
- [ ] **Go**: performance, but learning curve?

#### Real-time Features
- [ ] **WebSockets**: full duplex, complex?
- [ ] **Server-Sent Events (SSE)**: simpler, one-way?
- [ ] **Polling**: simplest, but less efficient?
- [ ] **Pusher/Ably**: managed real-time?

#### Search & Analytics
- [ ] **Full-text search**: PostgreSQL built-in good enough?
- [ ] **Elasticsearch**: powerful but complex?
- [ ] **Typesense**: simpler alternative?
- [ ] **Algolia**: managed, expensive?

### Research Methods
1. Review framework documentation
2. Look for production case studies
3. Consider team expertise and learning curve

---

## 6. Compliance Research

**Output**: `docs/research/compliance.md`

### Questions to Answer

#### Data Privacy
- [ ] Does GDPR apply? (EU users)
- [ ] Does CCPA apply? (California users)
- [ ] What data are we collecting and storing?
- [ ] Data retention policies needed?
- [ ] Right to deletion implementation?

#### Legal Tech Regulations
- [ ] Are there specific regulations for legal technology?
- [ ] Do we need disclaimers about AI-generated content?
- [ ] Liability considerations for generated complaints?

#### Security Standards
- [ ] SOC 2 compliance requirements?
- [ ] Encryption requirements (at rest, in transit)?
- [ ] Access logging and audit trails?
- [ ] Penetration testing requirements?

#### Terms of Service
- [ ] What terms do we need?
- [ ] Privacy policy requirements?
- [ ] Acceptable use policy?

### Research Methods
1. Web search for legal tech compliance
2. Review competitor terms of service
3. Look for industry best practices

---

## Research Prioritization

### Must Complete (Blocking)
1. NHTSA API Research - needed for data ingestion design
2. Legal Complaint Format - needed for generator design
3. Tech Stack Decision - needed for scaffolding

### Should Complete (Important)
4. Auth/Billing Solutions - needed for SaaS features
5. Semantic Analysis Tools - needed for analysis engine

### Nice to Have (Can Refine Later)
6. Compliance Research - important but can start simple

---

## Research Timeline

| Research Area | Priority | Estimated Effort |
|--------------|----------|------------------|
| NHTSA API | Critical | 1 iteration |
| Legal Complaints | Critical | 1 iteration |
| Tech Stack | Critical | 1 iteration |
| SaaS Infrastructure | High | 1 iteration |
| Analysis Tools | High | 1 iteration |
| Compliance | Medium | 1 iteration |

Total: ~6 iterations for comprehensive research

---

## Output Requirements

Each research document must include:
1. **Summary of findings**
2. **Recommendations with rationale**
3. **Tradeoffs considered**
4. **Decision made** (where applicable)
5. **References/sources**
