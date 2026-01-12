ultrathink:
# CaseRadar - Full SaaS Build

You are building **CaseRadar**, a comprehensive, enterprise-grade SaaS platform for law firms specializing in class action lawsuits. This platform monitors NHTSA vehicle complaint data, identifies patterns using semantic analysis, and auto-generates formal legal complaints.

## Project Overview

**Product Name**: CaseRadar

**Business Purpose**: Law firms pay subscription access to:
1. Monitor NHTSA vehicle complaint data in real-time
2. Identify patterns/anomalies indicating potential class action opportunities (e.g., 2020+ Lexus RX airbag deployment failures causing deaths, 2010-2014 Jeep Wrangler mirror defects)
3. Auto-generate formal legal complaints ready for court submission

**Data Sources**:
- https://www.nhtsa.gov/recalls?keywords=repair%2C+lemon%2C+recur%2C+safety%2C+crash%2C+accident&productType=vehicle&allKeywords=false
- https://www.nhtsa.gov/nhtsa-datasets-and-apis

---

## EXECUTION PHASES

You MUST complete these phases IN ORDER. Do not skip phases. Each phase has explicit completion criteria.

---

### PHASE 0: ORIENTATION & STATE ASSESSMENT
**Iteration Check**: At the START of every iteration, do this:

1. Check for `RALPH_STATE.md` in project root
2. If exists: Read it to understand current phase, progress, blockers
3. If not exists: Create it with Phase 0 as current
4. Update `RALPH_STATE.md` at END of every iteration with:
   - Current phase
   - Completed tasks
   - Next tasks
   - Any blockers or decisions needed
   - Iteration count

---

### PHASE 1: INITIAL SKELETON PLAN
**Goal**: Create a high-level project plan that will be refined after research.

**Tasks**:
1. Create `docs/PLAN_v1.md` with:
   - High-level architecture overview (data ingestion → analysis → complaint generation → SaaS delivery)
   - Preliminary tech stack considerations
   - Major milestones identified
   - Known unknowns requiring research
   - Risk assessment

2. Create `docs/RESEARCH_AGENDA.md` identifying what needs to be researched:
   - NHTSA API capabilities and rate limits
   - Semantic analysis tools/platforms (Weights & Biases, etc.)
   - NLP/ML libraries for pattern detection
   - Legal complaint format requirements
   - SaaS infrastructure best practices (auth, billing, RBAC)
   - Compliance requirements (data privacy, legal tech regulations)
   - Modern frontend/backend frameworks for enterprise apps

**Completion Criteria**:
- [ ] `docs/PLAN_v1.md` exists with all sections
- [ ] `docs/RESEARCH_AGENDA.md` exists with categorized research questions
- [ ] `RALPH_STATE.md` updated with Phase 1 complete

---

### PHASE 2: DEEP RESEARCH
**Goal**: Investigate all unknowns and document findings.

**Tasks**:
1. **NHTSA Data Research** → `docs/research/nhtsa-api.md`
   - Fetch and analyze API documentation
   - Understand data schema, endpoints, rate limits
   - Identify data fields relevant to pattern detection
   - Document sample API responses

2. **Semantic Analysis Tools Research** → `docs/research/analysis-tools.md`
   - Research: Weights & Biases, Hugging Face, LangChain, custom ML solutions
   - Evaluate: ease of integration, cost, scalability, features
   - Determine: build vs buy vs hybrid approach
   - Document recommendations with rationale

3. **Legal Complaint Format Research** → `docs/research/legal-complaints.md`
   - Research federal class action complaint structures
   - Find templates and examples online
   - Document required sections, formatting, legal language
   - Create complaint template schema

4. **SaaS Infrastructure Research** → `docs/research/saas-infrastructure.md`
   - Auth solutions (Auth0, Clerk, Supabase Auth, custom)
   - Billing (Stripe, Paddle, LemonSqueezy)
   - Database (PostgreSQL, Supabase, PlanetScale)
   - Hosting (Vercel, AWS, GCP)
   - RBAC patterns and implementations

5. **Tech Stack Research** → `docs/research/tech-stack.md`
   - Frontend: Next.js, React, Vue, Svelte
   - Backend: Node.js, Python FastAPI, Go
   - Real-time: WebSockets, SSE, Polling
   - Search/Analytics: Elasticsearch, Typesense, custom
   - Document final stack decision with rationale

6. **Compliance Research** → `docs/research/compliance.md`
   - Data privacy (GDPR, CCPA considerations)
   - Legal tech regulations
   - Security best practices for legal data

**Completion Criteria**:
- [ ] All 6 research documents created with substantive findings
- [ ] Each document has clear recommendations/decisions
- [ ] `RALPH_STATE.md` updated with Phase 2 complete

---

### PHASE 3: COMPREHENSIVE PLAN v2
**Goal**: Create detailed implementation plan based on research findings.

**Tasks**:
1. Create `docs/PLAN_v2.md` with:
   - Final architecture diagram (describe in text/ASCII)
   - Chosen tech stack with justification
   - Database schema design
   - API design (REST/GraphQL endpoints)
   - Data pipeline architecture
   - ML/Analysis pipeline architecture
   - Frontend component hierarchy
   - Security architecture
   - Deployment architecture

2. Create `docs/IMPLEMENTATION_ROADMAP.md` with:
   - Ordered list of implementation tasks
   - Dependencies between tasks
   - Estimated complexity (S/M/L/XL)
   - TDD approach for each component

3. Create `docs/TEST_STRATEGY.md` with:
   - Unit test approach
   - Integration test approach
   - E2E/Browser automation test approach
   - Test coverage targets (>80%)
   - CI/CD pipeline design

**Completion Criteria**:
- [ ] `docs/PLAN_v2.md` is comprehensive and actionable
- [ ] `docs/IMPLEMENTATION_ROADMAP.md` has clear task ordering
- [ ] `docs/TEST_STRATEGY.md` defines TDD workflow
- [ ] `RALPH_STATE.md` updated with Phase 3 complete

---

### PHASE 4: PROJECT SCAFFOLDING
**Goal**: Set up project structure, tooling, CI/CD.

**Tasks**:
1. Initialize project structure based on chosen tech stack
2. Set up package.json / pyproject.toml / go.mod as appropriate
3. Configure TypeScript/linting/formatting
4. Set up test framework (Jest, Vitest, Pytest, etc.)
5. Create initial CI/CD configuration (GitHub Actions)
6. Set up database migrations framework
7. Create `.env.example` with required environment variables
8. Set up Docker/docker-compose for local development

**TDD Requirement**: Write tests for build/lint/format commands that verify tooling works.

**Completion Criteria**:
- [ ] Project scaffolding complete
- [ ] `npm test` / `pytest` / equivalent runs (even if no tests yet)
- [ ] Linting passes
- [ ] Docker setup works
- [ ] `RALPH_STATE.md` updated with Phase 4 complete

---

### PHASE 5: DATABASE & MODELS
**Goal**: Implement database schema and ORM models.

**Tasks**:
1. **Write failing tests first** for all models:
   - Vehicle complaint model
   - Pattern/cluster model
   - Generated complaint model
   - User model
   - Organization/tenant model
   - Subscription model
   - Audit log model

2. Implement database migrations
3. Implement ORM models
4. Implement model validation
5. **Run tests - all must pass**

**Completion Criteria**:
- [ ] All model tests written BEFORE implementation
- [ ] All migrations created and runnable
- [ ] All model tests passing
- [ ] Database can be seeded with test data
- [ ] `RALPH_STATE.md` updated with Phase 5 complete

---

### PHASE 6: NHTSA DATA INGESTION
**Goal**: Build data pipeline to ingest NHTSA complaint data.

**Tasks**:
1. **Write failing tests first**:
   - API client tests (mock responses)
   - Data transformer tests
   - Database insertion tests
   - Scheduler/cron tests

2. Implement NHTSA API client
3. Implement data transformation layer
4. Implement database insertion with deduplication
5. Implement scheduled ingestion (configurable interval)
6. Implement backfill capability for historical data
7. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] Can fetch live data from NHTSA API
- [ ] Data correctly transformed and stored
- [ ] Deduplication working
- [ ] Scheduler working
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 6 complete

---

### PHASE 7: SEMANTIC ANALYSIS ENGINE
**Goal**: Build pattern detection and trend analysis system.

**Tasks**:
1. **Write failing tests first**:
   - Text embedding tests
   - Clustering algorithm tests
   - Trend detection tests
   - Anomaly detection tests
   - Pattern scoring tests

2. Implement text embedding pipeline (vehicle descriptions, complaints)
3. Implement clustering (group similar complaints)
4. Implement trend detection (increasing complaint frequency)
5. Implement anomaly detection (unusual patterns)
6. Implement severity scoring (deaths, injuries, financial impact)
7. Implement pattern persistence and tracking
8. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] Can embed complaint text
- [ ] Can cluster similar complaints
- [ ] Can detect trends over time
- [ ] Can score pattern severity
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 7 complete

---

### PHASE 8: LEGAL COMPLAINT GENERATOR
**Goal**: Auto-generate formal legal complaints from detected patterns.

**Tasks**:
1. **Write failing tests first**:
   - Template rendering tests
   - Data formatting tests
   - Legal citation tests
   - PDF generation tests
   - Complaint validation tests

2. Implement complaint template system
3. Implement data aggregation for complaints
4. Implement legal language generation (LLM-based)
5. Implement PDF generation
6. Implement complaint versioning
7. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] Can generate complaint from pattern data
- [ ] Complaint follows proper legal format
- [ ] PDF generation working
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 8 complete

---

### PHASE 9: AUTHENTICATION & AUTHORIZATION
**Goal**: Implement secure auth with RBAC.

**Tasks**:
1. **Write failing tests first**:
   - Registration tests
   - Login tests
   - Session management tests
   - RBAC permission tests
   - Organization/tenant isolation tests

2. Implement auth provider integration
3. Implement user registration/login
4. Implement session management
5. Implement RBAC (Admin, Analyst, Viewer roles)
6. Implement organization/tenant isolation
7. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] Users can register and login
- [ ] Sessions work correctly
- [ ] RBAC enforced on all endpoints
- [ ] Tenant isolation working
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 9 complete

---

### PHASE 10: BILLING & SUBSCRIPTIONS
**Goal**: Implement subscription billing.

**Tasks**:
1. **Write failing tests first**:
   - Subscription creation tests
   - Payment webhook tests
   - Usage tracking tests
   - Plan enforcement tests

2. Implement Stripe (or chosen provider) integration
3. Implement subscription plans (Basic, Pro, Enterprise)
4. Implement payment webhooks
5. Implement usage tracking and limits
6. Implement subscription management UI
7. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] Can create subscriptions
- [ ] Webhooks handle payment events
- [ ] Plan limits enforced
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 10 complete

---

### PHASE 11: BACKEND API
**Goal**: Build complete REST/GraphQL API.

**Tasks**:
1. **Write failing tests first** for all endpoints:
   - Complaints CRUD
   - Patterns/trends endpoints
   - Generated complaints endpoints
   - User/org management endpoints
   - Analytics endpoints
   - Webhooks

2. Implement all API endpoints
3. Implement request validation
4. Implement rate limiting
5. Implement API documentation (OpenAPI/Swagger)
6. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] All endpoints implemented
- [ ] Validation working
- [ ] Rate limiting working
- [ ] API docs generated
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 11 complete

---

### PHASE 12: FRONTEND IMPLEMENTATION
**Goal**: Build modern, professional SaaS dashboard.

**Tasks**:
1. **Write component tests first**:
   - Dashboard component tests
   - Pattern viewer tests
   - Complaint generator UI tests
   - Settings/admin tests
   - Auth flow tests

2. Implement pages:
   - Landing page
   - Auth pages (login, register, forgot password)
   - Dashboard (overview, metrics)
   - Complaints explorer (search, filter, browse NHTSA data)
   - Pattern detector (view clusters, trends, anomalies)
   - Complaint generator (select pattern → generate complaint)
   - Generated complaints manager
   - Settings (profile, organization, billing)
   - Admin panel (users, roles, audit logs)

3. Implement responsive design
4. Implement dark/light mode
5. Implement real-time updates (WebSocket/SSE)
6. **Run tests - all must pass**

**Completion Criteria**:
- [ ] Tests written before implementation
- [ ] All pages implemented
- [ ] Responsive on mobile/tablet/desktop
- [ ] Dark/light mode working
- [ ] Real-time updates working
- [ ] All tests passing
- [ ] `RALPH_STATE.md` updated with Phase 12 complete

---

### PHASE 13: E2E & BROWSER TESTING
**Goal**: Comprehensive E2E test coverage.

**Tasks**:
1. Set up Playwright/Cypress
2. Write E2E tests for:
   - Complete user registration → login flow
   - Dashboard navigation
   - Complaint search and filtering
   - Pattern detection viewing
   - Complaint generation flow
   - Billing/subscription flow
   - Admin workflows

3. Set up visual regression testing
4. **All E2E tests must pass**

**Completion Criteria**:
- [ ] E2E framework set up
- [ ] All critical user flows have E2E tests
- [ ] Visual regression baseline established
- [ ] All E2E tests passing
- [ ] `RALPH_STATE.md` updated with Phase 13 complete

---

### PHASE 14: SECURITY HARDENING
**Goal**: Production security audit and hardening.

**Tasks**:
1. **Write security tests**:
   - SQL injection tests
   - XSS tests
   - CSRF tests
   - Auth bypass tests
   - Rate limit bypass tests

2. Implement security headers
3. Implement input sanitization
4. Implement audit logging
5. Create `docs/SECURITY.md` documenting:
   - Security architecture
   - Data encryption (at rest, in transit)
   - Access controls
   - Incident response plan
   - Compliance checklist

6. **All security tests must pass**

**Completion Criteria**:
- [ ] Security tests written and passing
- [ ] Security headers implemented
- [ ] Audit logging working
- [ ] `docs/SECURITY.md` complete
- [ ] `RALPH_STATE.md` updated with Phase 14 complete

---

### PHASE 15: DEPLOYMENT & PRODUCTION READINESS
**Goal**: Deploy production-ready system.

**Tasks**:
1. Set up production infrastructure (chosen cloud provider)
2. Configure production database
3. Set up production environment variables
4. Configure CDN/edge caching
5. Set up monitoring and alerting
6. Set up error tracking (Sentry or equivalent)
7. Set up log aggregation
8. Create deployment documentation
9. Perform load testing
10. Create `docs/OPERATIONS.md` with:
    - Deployment procedures
    - Rollback procedures
    - Monitoring dashboards
    - On-call playbook

**Completion Criteria**:
- [ ] Production deployment working
- [ ] Monitoring active
- [ ] Error tracking active
- [ ] Load testing completed
- [ ] `docs/OPERATIONS.md` complete
- [ ] `RALPH_STATE.md` updated with Phase 15 complete

---

### PHASE 16: FINAL VALIDATION
**Goal**: Complete system validation before handoff.

**Tasks**:
1. Run full test suite (unit, integration, E2E)
2. Verify all features working in production
3. Create `docs/README.md` with:
   - Project overview
   - Quick start guide
   - Architecture overview
   - API documentation link
   - Contributing guide

4. Create `docs/USER_GUIDE.md` for end users
5. Create `docs/ADMIN_GUIDE.md` for administrators
6. Perform final security review
7. Document any known issues in `docs/KNOWN_ISSUES.md`

**Completion Criteria**:
- [ ] All tests passing (>80% coverage)
- [ ] All documentation complete
- [ ] Production system verified working
- [ ] `RALPH_STATE.md` shows Phase 16 complete

---

## COMPLETION SIGNAL

When ALL phases are complete and ALL criteria met:

1. Verify every checkbox in every phase is checked
2. Verify test coverage >80%
3. Verify production deployment working
4. Update `RALPH_STATE.md` with final status
5. Output: <promise>SAAS_COMPLETE</promise>

---

## STUCK PROTOCOL

If stuck on any phase for more than 3 iterations:
1. Document the blocker in `docs/BLOCKERS.md`
2. Document attempted solutions
3. Propose alternative approaches
4. Continue with next phase if possible (mark current as blocked)

If blocked on >3 phases:
1. Create comprehensive `docs/HANDOFF.md` documenting:
   - What was completed
   - What is blocked and why
   - Recommended next steps
2. Output: <promise>SAAS_BLOCKED</promise>

---

## IMPORTANT REMINDERS

- **TDD IS MANDATORY**: Write failing tests BEFORE implementation. No exceptions.
- **Update RALPH_STATE.md every iteration**: This is your persistent memory.
- **Research before building**: Phase 2 findings inform all subsequent phases.
- **Production quality**: This is enterprise software for law firms. No shortcuts.
- **Security first**: Legal data requires highest security standards.


## RALPH LOOP COMMAND:
```bash
/ralph-loop:ralph-loop "$(cat prompts/class-action-saas-build.md)" --completion-promise "SAAS_COMPLETE" --max-iterations 500
```