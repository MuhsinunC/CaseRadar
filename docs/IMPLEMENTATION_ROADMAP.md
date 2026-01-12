# CaseRadar - Implementation Roadmap

## Overview

This document provides an ordered list of implementation tasks with dependencies and TDD requirements. Tasks are organized by phase and must be completed in order.

---

## Task Legend

| Symbol | Meaning |
|--------|---------|
| 🧪 | TDD Required - Write tests first |
| 🔗 | Has dependencies |
| ⚡ | Quick task |
| 📦 | Configuration/setup |
| 🎨 | UI component |
| 🔌 | API/integration |
| 🤖 | ML/AI related |

**Complexity Scale**: S (hours) | M (1-2 days) | L (3-5 days) | XL (1+ week)

---

## Phase 4: Project Scaffolding

### 4.1 Initialize Project

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 4.1.1 | 📦 Create Next.js 15 project with TypeScript | S | - | - |
| 4.1.2 | 📦 Configure ESLint + Prettier | S | - | 4.1.1 |
| 4.1.3 | 📦 Set up Tailwind CSS | S | - | 4.1.1 |
| 4.1.4 | 📦 Install shadcn/ui CLI and base components | S | - | 4.1.3 |
| 4.1.5 | 📦 Configure path aliases (@/) | S | - | 4.1.1 |

### 4.2 Testing Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 4.2.1 | 📦 Install and configure Vitest | S | - | 4.1.1 |
| 4.2.2 | 📦 Install React Testing Library | S | - | 4.2.1 |
| 4.2.3 | 📦 Install Playwright | S | - | 4.1.1 |
| 4.2.4 | 📦 Create test utilities and helpers | S | - | 4.2.1 |
| 4.2.5 | ⚡ Write first smoke test to verify setup | S | 🧪 | 4.2.1 |

### 4.3 Database Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 4.3.1 | 📦 Create Supabase project | S | - | - |
| 4.3.2 | 📦 Install Prisma | S | - | 4.1.1 |
| 4.3.3 | 📦 Configure Prisma with Supabase | S | - | 4.3.1, 4.3.2 |
| 4.3.4 | 📦 Enable pgvector extension | S | - | 4.3.1 |
| 4.3.5 | ⚡ Verify database connection | S | 🧪 | 4.3.3 |

### 4.4 DevOps Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 4.4.1 | 📦 Create .env.example | S | - | 4.3.3 |
| 4.4.2 | 📦 Set up Docker Compose for local dev | M | - | 4.3.1 |
| 4.4.3 | 📦 Create GitHub Actions CI workflow | M | - | 4.2.1 |
| 4.4.4 | 📦 Configure Vercel project | S | - | 4.1.1 |
| 4.4.5 | 📦 Set up Railway project for workers | S | - | - |

**Phase 4 Output**: Scaffolded project with working tests, linting, and CI.

---

## Phase 5: Database & Models

### 5.1 Core Models

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 5.1.1 | 🧪 Write tests for Organization model | S | 🧪 | 4.3.3 |
| 5.1.2 | 🔗 Implement Organization model + migration | S | - | 5.1.1 |
| 5.1.3 | 🧪 Write tests for User model | S | 🧪 | 5.1.2 |
| 5.1.4 | 🔗 Implement User model + migration | S | - | 5.1.3 |
| 5.1.5 | 🧪 Write tests for Complaint model | M | 🧪 | 5.1.4 |
| 5.1.6 | 🔗 Implement Complaint model + migration | M | - | 5.1.5 |

### 5.2 Pattern & Analysis Models

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 5.2.1 | 🧪 Write tests for Pattern model | S | 🧪 | 5.1.6 |
| 5.2.2 | 🔗 Implement Pattern model + migration | S | - | 5.2.1 |
| 5.2.3 | 🧪 Write tests for GeneratedComplaint model | S | 🧪 | 5.2.2 |
| 5.2.4 | 🔗 Implement GeneratedComplaint model + migration | S | - | 5.2.3 |

### 5.3 Supporting Models

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 5.3.1 | 🧪 Write tests for Subscription model | S | 🧪 | 5.1.2 |
| 5.3.2 | 🔗 Implement Subscription model + migration | S | - | 5.3.1 |
| 5.3.3 | 🧪 Write tests for AuditLog model | S | 🧪 | 5.1.4 |
| 5.3.4 | 🔗 Implement AuditLog model + migration | S | - | 5.3.3 |

### 5.4 Database Utilities

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 5.4.1 | 🔗 Create seed script with test data | M | - | 5.3.4 |
| 5.4.2 | 🔗 Set up Row-Level Security policies | M | - | 5.1.4 |
| 5.4.3 | 🔗 Create database indexes | S | - | 5.1.6 |
| 5.4.4 | ⚡ Verify all migrations run cleanly | S | 🧪 | 5.4.1 |

**Phase 5 Output**: Complete database schema with passing model tests.

---

## Phase 6: NHTSA Data Ingestion

### 6.1 API Client

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 6.1.1 | 🧪 Write tests for NHTSA API client (mocked) | M | 🧪 | 5.1.6 |
| 6.1.2 | 🔌 Implement NHTSA SODA API client | M | - | 6.1.1 |
| 6.1.3 | 🧪 Write tests for data transformer | S | 🧪 | 6.1.2 |
| 6.1.4 | 🔗 Implement complaint data transformer | S | - | 6.1.3 |

### 6.2 Data Pipeline

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 6.2.1 | 🧪 Write tests for deduplication logic | S | 🧪 | 6.1.4 |
| 6.2.2 | 🔗 Implement upsert with deduplication | S | - | 6.2.1 |
| 6.2.3 | 🧪 Write tests for batch insert | S | 🧪 | 6.2.2 |
| 6.2.4 | 🔗 Implement efficient batch insert | M | - | 6.2.3 |

### 6.3 Scheduling

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 6.3.1 | 📦 Set up Railway cron job | S | - | 4.4.5 |
| 6.3.2 | 🧪 Write tests for sync job | M | 🧪 | 6.2.4 |
| 6.3.3 | 🔌 Implement daily sync job | M | - | 6.3.2 |
| 6.3.4 | 🔌 Implement backfill command | L | - | 6.2.4 |

### 6.4 Embeddings

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 6.4.1 | 🧪 Write tests for embedding service (mocked) | S | 🧪 | 6.2.4 |
| 6.4.2 | 🤖 Implement OpenAI embedding client | S | - | 6.4.1 |
| 6.4.3 | 🤖 Implement batch embedding pipeline | M | - | 6.4.2 |
| 6.4.4 | 🔗 Integrate embeddings into sync job | M | - | 6.3.3, 6.4.3 |

**Phase 6 Output**: Working NHTSA data pipeline with embeddings.

---

## Phase 7: Semantic Analysis Engine

### 7.1 Clustering

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 7.1.1 | 🧪 Write tests for UMAP reduction | M | 🧪 | 6.4.4 |
| 7.1.2 | 🤖 Implement UMAP dimensionality reduction | M | - | 7.1.1 |
| 7.1.3 | 🧪 Write tests for HDBSCAN clustering | M | 🧪 | 7.1.2 |
| 7.1.4 | 🤖 Implement HDBSCAN clustering | M | - | 7.1.3 |
| 7.1.5 | 🔗 Create clustering pipeline job | L | - | 7.1.4 |

### 7.2 Trend Detection

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 7.2.1 | 🧪 Write tests for trend calculations | M | 🧪 | 5.2.2 |
| 7.2.2 | 🤖 Implement rolling statistics | M | - | 7.2.1 |
| 7.2.3 | 🤖 Implement spike detection (Z-score) | S | - | 7.2.2 |
| 7.2.4 | 🤖 Implement linear trend regression | S | - | 7.2.2 |

### 7.3 Scoring

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 7.3.1 | 🧪 Write tests for severity scoring | S | 🧪 | 7.2.4 |
| 7.3.2 | 🤖 Implement severity score calculation | S | - | 7.3.1 |
| 7.3.3 | 🔗 Create pattern statistics aggregation | M | - | 7.1.5 |
| 7.3.4 | 🔗 Schedule analysis pipeline | S | - | 7.3.3 |

**Phase 7 Output**: Working pattern detection and scoring system.

---

## Phase 8: Legal Complaint Generator

### 8.1 Template System

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 8.1.1 | 🧪 Write tests for template rendering | M | 🧪 | 5.2.4 |
| 8.1.2 | 🔗 Create complaint template schema | M | - | 8.1.1 |
| 8.1.3 | 🔗 Implement template sections | L | - | 8.1.2 |

### 8.2 LLM Integration

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 8.2.1 | 🧪 Write tests for Claude client (mocked) | S | 🧪 | 8.1.3 |
| 8.2.2 | 🤖 Implement Claude API client | S | - | 8.2.1 |
| 8.2.3 | 🤖 Create factual allegations prompt | M | - | 8.2.2 |
| 8.2.4 | 🤖 Create introduction generation prompt | S | - | 8.2.2 |
| 8.2.5 | 🔗 Implement complaint data aggregation | M | - | 8.1.3 |

### 8.3 PDF Generation

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 8.3.1 | 🧪 Write tests for PDF generation | M | 🧪 | 8.2.5 |
| 8.3.2 | 🎨 Create PDF complaint components | L | - | 8.3.1 |
| 8.3.3 | 🔗 Implement PDF renderer | M | - | 8.3.2 |
| 8.3.4 | 🔗 Implement Supabase Storage upload | S | - | 8.3.3 |

**Phase 8 Output**: Working complaint generation with PDF output.

---

## Phase 9: Authentication & Authorization

### 9.1 Clerk Integration

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 9.1.1 | 📦 Set up Clerk project | S | - | - |
| 9.1.2 | 📦 Install Clerk Next.js SDK | S | - | 9.1.1 |
| 9.1.3 | 🧪 Write tests for auth middleware | M | 🧪 | 9.1.2 |
| 9.1.4 | 🔌 Implement auth middleware | M | - | 9.1.3 |
| 9.1.5 | 🔌 Implement Clerk webhooks | M | - | 9.1.4 |

### 9.2 Organization Support

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 9.2.1 | 🧪 Write tests for org sync | S | 🧪 | 9.1.5 |
| 9.2.2 | 🔗 Sync Clerk orgs to database | M | - | 9.2.1 |
| 9.2.3 | 🔗 Sync Clerk users to database | M | - | 9.2.2 |

### 9.3 RBAC

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 9.3.1 | 🧪 Write tests for permission checks | M | 🧪 | 9.2.3 |
| 9.3.2 | 🔗 Implement RBAC utilities | M | - | 9.3.1 |
| 9.3.3 | 🔗 Create permission guard HOC | S | - | 9.3.2 |

**Phase 9 Output**: Working auth with multi-tenancy and RBAC.

---

## Phase 10: Billing & Subscriptions

### 10.1 Stripe Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 10.1.1 | 📦 Set up Stripe account and products | S | - | - |
| 10.1.2 | 📦 Install Stripe SDK | S | - | 10.1.1 |
| 10.1.3 | 🧪 Write tests for checkout flow | M | 🧪 | 10.1.2 |
| 10.1.4 | 🔌 Implement checkout session creation | M | - | 10.1.3 |

### 10.2 Webhooks

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 10.2.1 | 🧪 Write tests for webhook handlers | M | 🧪 | 10.1.4 |
| 10.2.2 | 🔌 Implement subscription.created handler | S | - | 10.2.1 |
| 10.2.3 | 🔌 Implement subscription.updated handler | S | - | 10.2.2 |
| 10.2.4 | 🔌 Implement subscription.deleted handler | S | - | 10.2.3 |
| 10.2.5 | 🔌 Implement invoice.paid handler | S | - | 10.2.4 |

### 10.3 Plan Enforcement

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 10.3.1 | 🧪 Write tests for plan limits | S | 🧪 | 10.2.5 |
| 10.3.2 | 🔗 Implement plan limit checking | M | - | 10.3.1 |
| 10.3.3 | 🔌 Implement billing portal | S | - | 10.3.2 |

**Phase 10 Output**: Working Stripe billing integration.

---

## Phase 11: Backend API

### 11.1 Complaints API

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 11.1.1 | 🧪 Write tests for complaints endpoints | M | 🧪 | 9.1.4 |
| 11.1.2 | 🔌 Implement GET /api/complaints | M | - | 11.1.1 |
| 11.1.3 | 🔌 Implement GET /api/complaints/:id | S | - | 11.1.2 |
| 11.1.4 | 🔌 Implement GET /api/complaints/search | M | - | 11.1.3 |

### 11.2 Patterns API

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 11.2.1 | 🧪 Write tests for patterns endpoints | M | 🧪 | 11.1.4 |
| 11.2.2 | 🔌 Implement GET /api/patterns | M | - | 11.2.1 |
| 11.2.3 | 🔌 Implement GET /api/patterns/:id | S | - | 11.2.2 |
| 11.2.4 | 🔌 Implement POST /api/patterns/:id/generate | L | - | 11.2.3, 8.3.4 |

### 11.3 Generated Complaints API

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 11.3.1 | 🧪 Write tests for generated endpoints | M | 🧪 | 11.2.4 |
| 11.3.2 | 🔌 Implement CRUD for generated complaints | M | - | 11.3.1 |
| 11.3.3 | 🔌 Implement PDF download endpoint | S | - | 11.3.2 |

### 11.4 Organization API

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 11.4.1 | 🧪 Write tests for org endpoints | M | 🧪 | 9.3.3 |
| 11.4.2 | 🔌 Implement org management endpoints | M | - | 11.4.1 |
| 11.4.3 | 🔌 Implement user management endpoints | M | - | 11.4.2 |

### 11.5 API Documentation

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 11.5.1 | 📦 Set up OpenAPI/Swagger | S | - | 11.4.3 |
| 11.5.2 | 🔗 Document all endpoints | M | - | 11.5.1 |

**Phase 11 Output**: Complete REST API with documentation.

---

## Phase 12: Frontend Implementation

### 12.1 Layout & Navigation

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.1.1 | 🧪 Write tests for layout components | S | 🧪 | 4.2.2 |
| 12.1.2 | 🎨 Implement dashboard layout shell | M | - | 12.1.1 |
| 12.1.3 | 🎨 Implement sidebar navigation | M | - | 12.1.2 |
| 12.1.4 | 🎨 Implement header with user menu | S | - | 12.1.3 |

### 12.2 Marketing Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.2.1 | 🎨 Implement landing page | L | - | 12.1.2 |
| 12.2.2 | 🎨 Implement pricing page | M | - | 12.2.1 |
| 12.2.3 | 🎨 Implement auth pages (Clerk) | S | - | 9.1.2 |

### 12.3 Dashboard Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.3.1 | 🧪 Write tests for dashboard components | M | 🧪 | 12.1.4 |
| 12.3.2 | 🎨 Implement dashboard home | L | - | 12.3.1 |
| 12.3.3 | 🎨 Implement complaints list page | L | - | 11.1.4 |
| 12.3.4 | 🎨 Implement complaint detail page | M | - | 12.3.3 |

### 12.4 Patterns Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.4.1 | 🧪 Write tests for pattern components | M | 🧪 | 12.3.4 |
| 12.4.2 | 🎨 Implement patterns list page | L | - | 12.4.1 |
| 12.4.3 | 🎨 Implement pattern detail page | L | - | 12.4.2 |
| 12.4.4 | 🎨 Implement trend charts | M | - | 12.4.3 |

### 12.5 Generator Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.5.1 | 🧪 Write tests for generator components | M | 🧪 | 12.4.4 |
| 12.5.2 | 🎨 Implement complaint generator page | L | - | 12.5.1 |
| 12.5.3 | 🎨 Implement complaint preview | M | - | 12.5.2 |
| 12.5.4 | 🎨 Implement generated complaints list | M | - | 12.5.3 |

### 12.6 Settings Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.6.1 | 🎨 Implement settings layout | S | - | 12.1.4 |
| 12.6.2 | 🎨 Implement organization settings | M | - | 12.6.1 |
| 12.6.3 | 🎨 Implement team management | M | - | 12.6.2 |
| 12.6.4 | 🎨 Implement billing page | M | - | 10.3.3 |

### 12.7 Admin Pages

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 12.7.1 | 🎨 Implement admin users page | M | - | 9.3.3 |
| 12.7.2 | 🎨 Implement audit log viewer | M | - | 12.7.1 |

**Phase 12 Output**: Complete frontend application.

---

## Phase 13: E2E Testing

### 13.1 Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 13.1.1 | 📦 Configure Playwright for E2E | S | - | 4.2.3 |
| 13.1.2 | 📦 Set up test fixtures | M | - | 13.1.1 |

### 13.2 Critical Flows

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 13.2.1 | 🧪 Write auth flow E2E tests | M | 🧪 | 12.2.3 |
| 13.2.2 | 🧪 Write complaints browsing E2E tests | M | 🧪 | 12.3.4 |
| 13.2.3 | 🧪 Write pattern viewing E2E tests | M | 🧪 | 12.4.4 |
| 13.2.4 | 🧪 Write complaint generation E2E tests | L | 🧪 | 12.5.4 |
| 13.2.5 | 🧪 Write billing flow E2E tests | M | 🧪 | 12.6.4 |

### 13.3 Visual Regression

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 13.3.1 | 📦 Set up visual regression testing | M | - | 13.2.5 |
| 13.3.2 | 🧪 Create baseline screenshots | M | 🧪 | 13.3.1 |

**Phase 13 Output**: Comprehensive E2E test suite.

---

## Phase 14: Security Hardening

### 14.1 Security Testing

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 14.1.1 | 🧪 Write SQL injection tests | S | 🧪 | 11.5.2 |
| 14.1.2 | 🧪 Write XSS tests | S | 🧪 | 12.5.4 |
| 14.1.3 | 🧪 Write auth bypass tests | M | 🧪 | 9.3.3 |
| 14.1.4 | 🧪 Write rate limit tests | S | 🧪 | 11.5.2 |

### 14.2 Hardening

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 14.2.1 | 📦 Implement security headers | S | - | 14.1.4 |
| 14.2.2 | 🔗 Implement rate limiting | M | - | 14.2.1 |
| 14.2.3 | 🔗 Implement audit logging | M | - | 14.2.2 |
| 14.2.4 | 📄 Create SECURITY.md documentation | M | - | 14.2.3 |

**Phase 14 Output**: Security-hardened application.

---

## Phase 15: Deployment

### 15.1 Production Setup

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 15.1.1 | 📦 Configure production environment | M | - | 14.2.4 |
| 15.1.2 | 📦 Set up production database | S | - | 15.1.1 |
| 15.1.3 | 📦 Configure production secrets | S | - | 15.1.2 |
| 15.1.4 | 🔗 Deploy to Vercel production | S | - | 15.1.3 |
| 15.1.5 | 🔗 Deploy workers to Railway | S | - | 15.1.3 |

### 15.2 Monitoring

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 15.2.1 | 📦 Set up Sentry error tracking | S | - | 15.1.4 |
| 15.2.2 | 📦 Configure alerting | M | - | 15.2.1 |
| 15.2.3 | 📦 Set up uptime monitoring | S | - | 15.2.2 |

### 15.3 Performance

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 15.3.1 | 🔗 Perform load testing | L | - | 15.2.3 |
| 15.3.2 | 🔗 Optimize slow queries | M | - | 15.3.1 |
| 15.3.3 | 📄 Create OPERATIONS.md | M | - | 15.3.2 |

**Phase 15 Output**: Production deployment with monitoring.

---

## Phase 16: Final Validation

### 16.1 Documentation

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 16.1.1 | 📄 Create README.md | M | - | 15.3.3 |
| 16.1.2 | 📄 Create USER_GUIDE.md | L | - | 16.1.1 |
| 16.1.3 | 📄 Create ADMIN_GUIDE.md | M | - | 16.1.2 |

### 16.2 Final Checks

| # | Task | Complexity | TDD | Dependencies |
|---|------|------------|-----|--------------|
| 16.2.1 | ⚡ Run full test suite | S | - | 16.1.3 |
| 16.2.2 | ⚡ Verify test coverage >80% | S | - | 16.2.1 |
| 16.2.3 | ⚡ Verify production functionality | M | - | 16.2.2 |
| 16.2.4 | 📄 Document known issues | S | - | 16.2.3 |

**Phase 16 Output**: Complete, documented, production-ready application.

---

## Summary Statistics

| Phase | Tasks | TDD Required | Est. Complexity |
|-------|-------|--------------|-----------------|
| 4: Scaffolding | 20 | 2 | M |
| 5: Database | 16 | 8 | M |
| 6: Ingestion | 16 | 8 | L |
| 7: Analysis | 12 | 6 | L |
| 8: Generator | 12 | 5 | L |
| 9: Auth | 11 | 5 | M |
| 10: Billing | 11 | 5 | M |
| 11: API | 15 | 6 | L |
| 12: Frontend | 25 | 6 | XL |
| 13: E2E | 8 | 7 | L |
| 14: Security | 8 | 4 | M |
| 15: Deployment | 11 | 0 | L |
| 16: Validation | 7 | 0 | M |
| **Total** | **172** | **62** | - |

**Key Insight**: 62 tasks (36%) require TDD - tests written before implementation.
