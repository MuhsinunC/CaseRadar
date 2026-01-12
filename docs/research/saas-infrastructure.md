# SaaS Infrastructure Research

## Summary

CaseRadar requires enterprise-grade SaaS infrastructure including authentication, billing, database, and hosting. This document evaluates options and provides recommendations.

---

## 1. Authentication Solutions

### Options Comparison

| Feature | Clerk | Auth0 | NextAuth.js | Supabase Auth |
|---------|-------|-------|-------------|---------------|
| **Pricing** | $0.02/MAU after 10K | Custom (expensive) | Free (self-hosted) | Free tier, then usage |
| **Setup Time** | Hours | Days-Weeks | Days | Hours |
| **MFA** | Built-in | Built-in | Manual | Built-in |
| **SSO/SAML** | Business tier | Enterprise | Manual | Pro tier |
| **Organizations** | Built-in | Built-in | Manual | Limited |
| **RBAC** | Built-in | Built-in | Manual | Limited |
| **React/Next.js** | Excellent | Good | Excellent | Good |
| **Compliance** | SOC 2 Type II | SOC 2, HIPAA, etc | Self-managed | SOC 2 |

### Pricing Analysis

**For 1,000 MAU (MVP)**:
- Clerk: ~$20/month (Free tier covers first 10K)
- Auth0: ~$240/month (Professional)
- NextAuth.js: $0 + hosting
- Supabase: Free tier

**For 10,000 MAU (Growth)**:
- Clerk: ~$200/month
- Auth0: $1,000+ (requires negotiation)
- NextAuth.js: $0 + hosting
- Supabase: ~$25/month (Pro)

### Key Considerations

**Clerk Pros**:
- Best developer experience
- Built-in organization/tenant management
- Modern UI components
- Sub-millisecond JWT validation
- Active development

**Clerk Cons**:
- Vendor lock-in
- Less mature than Auth0
- Limited enterprise features vs Auth0

**NextAuth.js Pros**:
- Free, open-source
- Full control
- No vendor lock-in

**NextAuth.js Cons**:
- Project stability concerns (original maintainer left)
- Manual MFA/RBAC implementation
- More development time

### Recommendation

**Primary**: **Clerk**
- Fastest time-to-market
- Built-in organizations (multi-tenancy)
- Built-in RBAC
- Predictable pricing
- Excellent Next.js integration

**Alternative**: **Supabase Auth** (if using Supabase for database)
- Cost-effective
- Integrated with Supabase ecosystem

---

## 2. Billing Solutions

### Options Comparison

| Feature | Stripe Billing | Paddle | LemonSqueezy |
|---------|---------------|--------|--------------|
| **Base Fee** | 2.9% + $0.30 | 5% + $0.50 | 5% + $0.50 |
| **Subscription Fee** | +0.7% | Included | Included |
| **MoR (Tax Handling)** | No (DIY) | Yes | Yes |
| **Chargebacks** | Your responsibility | Handled | Handled |
| **Best For** | Custom needs | Mid-large SaaS | Indie/small |
| **Developer Experience** | Excellent | Good | Excellent |

### Merchant of Record (MoR) Explained

**Without MoR (Stripe)**:
- You are the legal seller
- You handle sales tax collection/remittance globally
- You manage chargebacks and disputes
- You need compliance expertise

**With MoR (Paddle/LemonSqueezy)**:
- They are the legal seller
- They handle all tax compliance
- They manage chargebacks
- Higher fee but less complexity

### Cost Analysis

**$100K ARR scenario**:
- Stripe: ~$3,600/year (2.9% + 0.3% + 0.7%)
- Paddle: ~$5,500/year (5% + $0.50)
- LemonSqueezy: ~$5,500/year (5% + $0.50)

**Hidden costs with Stripe**:
- Tax compliance software: $500-2000/year
- Accounting time: Variable
- Chargeback fees: $15 each

### Recommendation

**Primary**: **Stripe Billing**
- Industry standard
- Excellent documentation
- Powerful API
- Lower fees at scale
- Customer portal built-in

**Why not MoR (Paddle/LemonSqueezy)**:
- Law firms (our customers) may prefer invoicing
- Enterprise customers expect traditional billing
- More control over customer relationships
- Can add MoR later if global expansion needed

**Tax Compliance**: Use **Stripe Tax** or **TaxJar** for sales tax automation.

---

## 3. Database Solutions

### Options Comparison

| Feature | Supabase | Neon | Railway | Render | AWS RDS |
|---------|----------|------|---------|--------|---------|
| **Pricing** | Free tier, $25/mo Pro | Free tier, $19/mo+ | Usage-based | $7/mo+ | $15/mo+ |
| **pgvector** | Yes | Yes | Custom | Limited | Yes |
| **Connection Pooling** | Built-in | Built-in | Manual | Built-in | Manual |
| **Branching** | Yes | Yes | No | No | No |
| **Scale-to-Zero** | No | Yes | No | No | No |
| **Realtime** | Built-in | No | No | No | No |
| **SOC 2** | Yes | Yes | No | No | Yes |

### Feature Requirements for CaseRadar

| Requirement | Priority | Notes |
|-------------|----------|-------|
| pgvector support | Critical | For embeddings |
| Connection pooling | High | For serverless |
| Backups | High | Point-in-time recovery |
| SOC 2 compliance | Medium | For enterprise customers |
| Database branching | Low | Nice for dev workflow |

### Storage Estimates

- Complaints table: ~1M rows × 5KB = ~5GB
- Embeddings: ~1M rows × 6KB (1536 floats) = ~6GB
- Users/Orgs/Patterns: ~100MB
- **Total estimated**: ~15-20GB

### Recommendation

**Primary**: **Supabase**
- PostgreSQL with pgvector built-in
- Built-in connection pooling (Supavisor)
- Generous free tier (500MB)
- SOC 2 compliant
- Built-in auth (backup option)
- Realtime subscriptions (useful for dashboard)
- Good ecosystem integration

**Pro Plan** ($25/month):
- 8GB database
- 100GB bandwidth
- Suitable for MVP through early growth

**Alternative**: **Neon**
- If scale-to-zero important for cost
- Better for variable workloads
- Simpler (just PostgreSQL, no extras)

---

## 4. Hosting Solutions

### Options Comparison

| Feature | Vercel | Railway | Render | AWS | Fly.io |
|---------|--------|---------|--------|-----|--------|
| **Frontend** | Excellent | Good | Good | Manual | Manual |
| **Backend** | Serverless only | Containers | Containers | Any | Containers |
| **Pricing** | Free tier, usage | Usage-based | $7/service | Complex | Usage-based |
| **Edge Functions** | Yes | No | No | Lambda@Edge | No |
| **Simplicity** | Very High | High | High | Low | Medium |
| **Scale** | Auto | Manual | Auto | Manual | Auto |

### CaseRadar Requirements

| Component | Type | Hosting Need |
|-----------|------|--------------|
| Next.js Frontend | SSR/Static | Edge-optimized |
| API Routes | Serverless | Low-latency |
| Background Jobs | Long-running | Container |
| Scheduled Tasks | Cron | Reliable scheduler |

### Recommendation

**Primary Architecture**:

```
┌────────────────────────────────────────────────────────────────┐
│                         VERCEL                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  Next.js App    │  │  API Routes     │  │  Edge         │  │
│  │  (Frontend)     │  │  (Serverless)   │  │  Middleware   │  │
│  └─────────────────┘  └─────────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                       RAILWAY                                   │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  Background     │  │  Scheduled      │                      │
│  │  Workers        │  │  Jobs (Cron)    │                      │
│  └─────────────────┘  └─────────────────┘                      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  PostgreSQL     │  │  pgvector       │  │  Realtime     │  │
│  │  + Connection   │  │  (embeddings)   │  │  Subscriptions│  │
│  │    Pooling      │  │                 │  │               │  │
│  └─────────────────┘  └─────────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Why this split**:
- **Vercel**: Best for Next.js, automatic previews, edge CDN
- **Railway**: Better for long-running background jobs
- **Supabase**: Best PostgreSQL + pgvector combo

### Cost Estimate (MVP)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Pro | $20 |
| Railway | Usage | ~$5-20 |
| Supabase | Pro | $25 |
| **Total** | | **~$50-65/month** |

---

## 5. RBAC Implementation

### Requirements

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management, billing |
| **Analyst** | View complaints, patterns, generate complaints |
| **Viewer** | View-only access to patterns and reports |

### Implementation Approaches

**Option 1: Clerk Organizations + Custom**
```typescript
// Clerk provides org membership
const { orgRole } = useOrganization();

// Custom RBAC layer
const permissions = {
  admin: ['read', 'write', 'delete', 'manage_users', 'manage_billing'],
  analyst: ['read', 'write', 'generate_complaints'],
  viewer: ['read']
};
```

**Option 2: Database RBAC**
```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER REFERENCES roles(id),
  permission_id INTEGER REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id),
  role_id INTEGER REFERENCES roles(id),
  PRIMARY KEY (user_id, org_id)
);
```

### Recommendation

Use **Clerk Organizations** for membership + **custom database RBAC** for fine-grained permissions.
- Clerk handles: Org creation, invites, membership
- Custom handles: Role assignment, permission checks

---

## 6. Multi-Tenancy

### Approach Options

| Approach | Isolation | Complexity | Cost |
|----------|-----------|------------|------|
| **Shared DB, shared schema** | Low | Low | Low |
| **Shared DB, tenant column** | Medium | Medium | Low |
| **Shared DB, separate schemas** | High | High | Medium |
| **Separate databases** | Highest | Highest | High |

### Recommendation

**Shared DB with tenant column** (Row-Level Security):

```sql
-- Enable RLS
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their org's data
CREATE POLICY tenant_isolation ON complaints
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

Benefits:
- Simple implementation
- Cost-effective (single DB)
- Supabase RLS support
- Good isolation with proper policies

---

## Final Recommendations

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Auth** | Clerk | Best DX, built-in orgs, RBAC |
| **Billing** | Stripe Billing | Industry standard, powerful API |
| **Database** | Supabase (PostgreSQL) | pgvector, realtime, SOC 2 |
| **Frontend Hosting** | Vercel | Best for Next.js |
| **Backend Jobs** | Railway | Long-running processes |

### Monthly Cost Estimate

**MVP (0-1K users)**:
| Service | Cost |
|---------|------|
| Clerk | Free (10K MAU free) |
| Stripe | Transaction fees only |
| Supabase | $25 (Pro) |
| Vercel | Free (Hobby) |
| Railway | ~$5 |
| **Total** | **~$30/month** |

**Growth (1K-10K users)**:
| Service | Cost |
|---------|------|
| Clerk | ~$200 |
| Stripe | Transaction fees |
| Supabase | $25-75 |
| Vercel | $20 |
| Railway | ~$20 |
| **Total** | **~$300/month** |

---

## References

- [Clerk vs Auth0 Comparison](https://clerk.com/articles/clerk-vs-auth0-for-nextjs)
- [Next.js Auth Comparison 2025](https://medium.com/@sagarsangwan/next-js-authentication-showdown-nextauth-free-databases-vs-clerk-vs-auth0-in-2025-e40b3e8b0c45)
- [Stripe vs Paddle vs LemonSqueezy](https://saasfeecalc.com/)
- [PostgreSQL Hosting Comparison 2025](https://seenode.com/blog/top-managed-postgresql-services-compared/)
- [Supabase vs Neon](https://bertomill.medium.com/supabase-vs-neon-the-battle-of-postgresql-titans-418044159d1f)
