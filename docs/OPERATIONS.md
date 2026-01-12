# CaseRadar Operations Guide

This document covers deployment procedures, monitoring, and operational runbooks for CaseRadar.

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Deployment Procedures](#deployment-procedures)
3. [Environment Configuration](#environment-configuration)
4. [Monitoring & Alerting](#monitoring--alerting)
5. [Scheduled Jobs](#scheduled-jobs)
6. [Rollback Procedures](#rollback-procedures)
7. [On-Call Playbook](#on-call-playbook)
8. [Disaster Recovery](#disaster-recovery)

---

## Infrastructure Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE                               │
│                    (DNS + DDoS Protection)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          VERCEL                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Edge      │  │   Node.js   │  │   Static    │             │
│  │  Runtime    │  │   Runtime   │  │   Assets    │             │
│  │ (Middleware)│  │ (API Routes)│  │   (CDN)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
         │                  │                  │
         │                  ▼                  │
         │    ┌─────────────────────────┐     │
         │    │       SUPABASE          │     │
         │    │  ┌─────────────────┐   │     │
         │    │  │   PostgreSQL    │   │     │
         │    │  │   + pgvector    │   │     │
         │    │  └─────────────────┘   │     │
         │    └─────────────────────────┘     │
         │                                     │
         ▼                                     ▼
┌─────────────────┐                 ┌─────────────────┐
│     CLERK       │                 │     STRIPE      │
│  (Auth/Users)   │                 │   (Payments)    │
└─────────────────┘                 └─────────────────┘
```

### Services

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| **Vercel** | Hosting, Edge, Serverless | https://vercel.com/dashboard |
| **Supabase** | Database (PostgreSQL + pgvector) | https://supabase.com/dashboard |
| **Clerk** | Authentication & User Management | https://dashboard.clerk.dev |
| **Stripe** | Billing & Subscriptions | https://dashboard.stripe.com |
| **Sentry** | Error Tracking | https://sentry.io |
| **NHTSA API** | Vehicle Complaint Data | Public API |

---

## Deployment Procedures

### Automatic Deployments

CaseRadar uses Vercel for automatic deployments:

- **Production**: Deploys automatically when `main` branch is updated
- **Preview**: Deploys automatically for all pull requests

### Manual Deployment

To trigger a manual deployment:

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Pre-Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally (`npm test`)
- [ ] Build succeeds locally (`npm run build`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] No critical Sentry errors in staging
- [ ] Database migrations are ready
- [ ] Environment variables are configured
- [ ] Feature flags are set correctly

### Deployment Steps

1. **Create PR with changes**
   ```bash
   git checkout -b feature/my-feature
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

2. **Wait for preview deployment**
   - Vercel automatically creates preview deployment
   - Test changes in preview environment
   - Check preview URL in PR comments

3. **Run database migrations (if needed)**
   ```bash
   # For Supabase
   npx prisma migrate deploy
   ```

4. **Merge to main**
   - Get PR approval
   - Merge PR to `main` branch
   - Vercel automatically deploys to production

5. **Verify production deployment**
   - Check Vercel deployment status
   - Verify critical user flows
   - Monitor Sentry for errors
   - Check logs for anomalies

---

## Environment Configuration

### Production Environment Variables

Configure these in Vercel Dashboard > Project > Settings > Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase connection string | `postgresql://...` |
| `DIRECT_URL` | Direct DB connection (migrations) | `postgresql://...` |
| `CLERK_SECRET_KEY` | Clerk API key | `sk_live_...` |
| `STRIPE_SECRET_KEY` | Stripe API key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing | `whsec_...` |
| `OPENAI_API_KEY` | OpenAI for embeddings | `sk-...` |
| `ANTHROPIC_API_KEY` | Claude for generation | `sk-ant-...` |
| `SENTRY_DSN` | Sentry error tracking | `https://...` |
| `CRON_SECRET` | Cron job authentication | Random string |

### Environment Tiers

| Tier | Branch | URL | Purpose |
|------|--------|-----|---------|
| Production | `main` | caseradar.com | Live users |
| Staging | `staging` | staging.caseradar.com | Pre-prod testing |
| Preview | PR branches | `*.vercel.app` | Feature testing |
| Local | N/A | localhost:3000 | Development |

---

## Monitoring & Alerting

### Key Metrics

Monitor these metrics in Vercel Analytics:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Response Time (P95)** | < 500ms | > 2000ms |
| **Error Rate** | < 0.1% | > 1% |
| **Uptime** | 99.9% | < 99% |
| **Edge Cache Hit Rate** | > 80% | < 50% |

### Sentry Alerts

Configure these alerts in Sentry:

1. **Critical Errors**: Any error with `critical` tag
2. **Error Spike**: > 10 errors in 5 minutes
3. **New Issues**: Any new unique error
4. **Performance Regression**: Transaction P95 > 3000ms

### Health Check Endpoints

```bash
# Application health
curl https://caseradar.com/api/health

# Database health
curl https://caseradar.com/api/health/db

# External services health
curl https://caseradar.com/api/health/services
```

### Dashboard Links

- **Vercel Analytics**: https://vercel.com/analytics
- **Sentry Issues**: https://sentry.io/issues
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Stripe Dashboard**: https://dashboard.stripe.com

---

## Scheduled Jobs

### Cron Jobs

| Job | Schedule | Purpose | Endpoint |
|-----|----------|---------|----------|
| NHTSA Sync | Every 6 hours | Fetch new complaints | `/api/cron/sync-nhtsa` |
| Pattern Analysis | Daily 2 AM | Analyze patterns | `/api/cron/analyze-patterns` |

### Monitoring Cron Jobs

Check cron job status in Vercel Dashboard > Project > Crons.

Expected behavior:
- **NHTSA Sync**: Completes in < 5 minutes, imports 0-1000 complaints
- **Pattern Analysis**: Completes in < 5 minutes, processes all recent complaints

### Manual Cron Trigger

```bash
# Trigger NHTSA sync manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://caseradar.com/api/cron/sync-nhtsa

# Trigger pattern analysis manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://caseradar.com/api/cron/analyze-patterns
```

---

## Rollback Procedures

### Instant Rollback (Vercel)

1. Go to Vercel Dashboard > Project > Deployments
2. Find the last known good deployment
3. Click "..." menu > "Promote to Production"
4. Confirm rollback

### Git Rollback

```bash
# Revert the last commit
git revert HEAD
git push origin main

# Or hard reset to specific commit
git reset --hard <commit-sha>
git push --force origin main  # Use with caution!
```

### Database Rollback

```bash
# List migration history
npx prisma migrate status

# Rollback last migration (creates down migration)
# Note: Prisma doesn't have built-in rollback
# You must create a new migration to undo changes
npx prisma migrate dev --name rollback_xyz
```

### Rollback Decision Matrix

| Severity | Action | Timeline |
|----------|--------|----------|
| P0 - Complete outage | Instant rollback | Immediate |
| P1 - Partial outage | Assess & rollback | < 15 min |
| P2 - Degraded performance | Hot-fix or rollback | < 1 hour |
| P3 - Minor bug | Hot-fix forward | Next release |

---

## On-Call Playbook

### Alert Response

1. **Acknowledge alert** within 5 minutes
2. **Assess severity** using matrix above
3. **Communicate** status in team channel
4. **Investigate** using runbooks below
5. **Remediate** with rollback or hot-fix
6. **Document** incident in post-mortem

### Common Issues

#### High Error Rate

**Symptoms**: Sentry showing spike in errors

**Investigation**:
1. Check Sentry for error details
2. Check Vercel logs for context
3. Check recent deployments

**Resolution**:
- If deployment-related: Rollback
- If external service: Check service status, implement fallback
- If database: Check Supabase health

#### Database Connection Issues

**Symptoms**: `PrismaClientKnownRequestError` in logs

**Investigation**:
1. Check Supabase dashboard for issues
2. Check connection pool status
3. Verify `DATABASE_URL` is correct

**Resolution**:
- Restart Vercel functions (redeploy)
- Check Supabase connection limits
- Scale up database if needed

#### Payment Webhook Failures

**Symptoms**: Stripe webhooks failing

**Investigation**:
1. Check Stripe webhook logs
2. Verify webhook secret is correct
3. Check endpoint is responding

**Resolution**:
- Verify `STRIPE_WEBHOOK_SECRET`
- Check Vercel function logs
- Retry failed webhooks in Stripe

#### Auth Issues

**Symptoms**: Users cannot login

**Investigation**:
1. Check Clerk dashboard for issues
2. Verify API keys are valid
3. Check Clerk status page

**Resolution**:
- Verify `CLERK_SECRET_KEY`
- Check Clerk service status
- Clear user sessions if needed

### Escalation Path

| Level | Contact | When |
|-------|---------|------|
| L1 | On-call engineer | All alerts |
| L2 | Tech lead | P0/P1 incidents |
| L3 | CTO | Extended outages |

---

## Disaster Recovery

### Backup Strategy

| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Database | Continuous | 30 days | Supabase |
| Audit Logs | Daily | 90 days | S3 |
| User Data | On-change | 7 versions | Supabase |

### Recovery Procedures

#### Database Recovery

1. **Point-in-time recovery** (Supabase):
   - Go to Supabase Dashboard > Database > Backups
   - Select recovery point
   - Create new project from backup

2. **Manual restoration**:
   ```bash
   # Download backup
   pg_dump $DATABASE_URL > backup.sql

   # Restore to new database
   psql $NEW_DATABASE_URL < backup.sql
   ```

#### Full System Recovery

1. Create new Vercel project
2. Connect to GitHub repository
3. Configure environment variables
4. Restore database from backup
5. Update DNS to new deployment
6. Verify all integrations

### Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single service failure | < 15 min | 0 |
| Database failure | < 1 hour | < 1 hour |
| Complete infrastructure failure | < 4 hours | < 24 hours |

---

## Appendix

### Useful Commands

```bash
# Check deployment status
vercel ls

# View logs
vercel logs

# Check environment variables
vercel env ls

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

### Contact Information

| Service | Support |
|---------|---------|
| Vercel | support@vercel.com |
| Supabase | support@supabase.io |
| Clerk | support@clerk.dev |
| Stripe | support@stripe.com |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial operations guide |
