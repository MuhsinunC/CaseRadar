# Compliance Research

## Summary

CaseRadar handles NHTSA complaint data (public government data) and serves law firms. This document outlines compliance requirements and implementation strategies.

---

## 1. Data Classification

### Data Types in CaseRadar

| Data Type | Classification | Source | Sensitivity |
|-----------|---------------|--------|-------------|
| NHTSA Complaints | Public | Government API | Low |
| User Accounts | PII | User registration | Medium |
| Organization Data | Business | Customer input | Medium |
| Billing Data | Financial | Stripe (not stored) | High (handled by Stripe) |
| Generated Complaints | Legal | System generated | Medium |
| Audit Logs | Internal | System | Low |

### Key Observation

**NHTSA data is public government data** - This significantly reduces compliance burden compared to handling sensitive personal data like medical records.

However, we still collect:
- User emails, names (PII)
- Organization details
- Usage patterns

---

## 2. Applicable Regulations

### Definitely Applies

| Regulation | Why | Requirements |
|------------|-----|--------------|
| **CCPA/CPRA** | California users | Privacy policy, opt-out rights, data deletion |
| **State Privacy Laws** | US customers | 20+ states have laws in 2025 |
| **PCI DSS** | Payment processing | Handled by Stripe (we don't store cards) |

### Likely Applies (as we grow)

| Regulation | Trigger | Requirements |
|------------|---------|--------------|
| **GDPR** | EU users/customers | Consent, DPA, data portability |
| **SOC 2** | Enterprise customers | Security audit, controls |

### Probably Not Applicable (for now)

| Regulation | Why Not |
|------------|---------|
| **HIPAA** | No healthcare data |
| **FERPA** | No education data |
| **GLBA** | No financial data (handled by Stripe) |

---

## 3. Privacy Requirements

### Privacy Policy Requirements

Must disclose:
- What data we collect
- How we use it
- Who we share it with
- Data retention periods
- User rights (access, deletion, correction)
- Contact information

### Data Subject Rights (CCPA/GDPR)

| Right | Implementation |
|-------|----------------|
| **Right to Know** | Data export feature |
| **Right to Delete** | Account deletion (cascade) |
| **Right to Opt-Out** | Marketing preferences |
| **Right to Correct** | Profile editing |
| **Right to Portability** | JSON/CSV export |

### Implementation

```typescript
// API endpoints for data rights
app.get('/api/user/data-export', async (req, res) => {
  // Export all user data as JSON
  const userData = await exportUserData(req.userId);
  res.json(userData);
});

app.delete('/api/user/account', async (req, res) => {
  // Delete user and associated data
  await deleteUserAccount(req.userId);
  res.json({ success: true });
});
```

---

## 4. Security Requirements

### Minimum Security Controls

| Control | Implementation |
|---------|----------------|
| **Encryption in Transit** | HTTPS everywhere (Vercel default) |
| **Encryption at Rest** | Supabase default (AES-256) |
| **Authentication** | Clerk (MFA available) |
| **Authorization** | RBAC, Row-Level Security |
| **Audit Logging** | All sensitive actions logged |
| **Input Validation** | Zod schemas on all inputs |
| **Rate Limiting** | Vercel + custom middleware |
| **Dependency Scanning** | GitHub Dependabot |

### Security Headers

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  }
];
```

---

## 5. SOC 2 Readiness

### SOC 2 Trust Principles

| Principle | CaseRadar Implementation |
|-----------|-------------------------|
| **Security** | Clerk auth, RLS, encryption, audit logs |
| **Availability** | Vercel/Supabase SLAs, monitoring |
| **Processing Integrity** | Input validation, test coverage |
| **Confidentiality** | Tenant isolation, RBAC |
| **Privacy** | Privacy policy, data rights |

### SOC 2 Requirements (for future)

**MVP**: Not required
**Growth**: Consider SOC 2 Type 1 when targeting enterprise
**Scale**: SOC 2 Type 2 required for large law firms

### Vendor SOC 2 Compliance

| Vendor | SOC 2 Status |
|--------|--------------|
| Vercel | SOC 2 Type 2 |
| Supabase | SOC 2 Type 2 |
| Clerk | SOC 2 Type 2 |
| Stripe | SOC 2 Type 2, PCI DSS |
| OpenAI | SOC 2 Type 2 |

**Good news**: All our vendors are SOC 2 compliant.

---

## 6. Legal Tech Specific Considerations

### ABA Model Rule 1.6 (Confidentiality)

Law firms must protect client information. CaseRadar helps by:
- Not storing law firm client data
- Generating complaints from public data only
- Tenant isolation between law firms
- Audit logging

### Disclaimer Requirements

Generated complaints must include:
```
DISCLAIMER: This document was generated by CaseRadar using publicly
available NHTSA complaint data and AI assistance. This is a draft
for attorney review only. The generating attorney is responsible for
verifying accuracy, conducting independent legal research, and
ensuring compliance with all applicable rules of professional conduct.
```

### No Attorney-Client Relationship

Terms of Service must clarify:
- CaseRadar is a tool, not legal advice
- No attorney-client relationship with CaseRadar
- Attorneys responsible for all filed documents

---

## 7. Data Retention

### Retention Periods

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| NHTSA Complaints | Indefinite | Public data, core product |
| User Accounts | Until deletion requested | Required for service |
| Audit Logs | 7 years | Legal/compliance |
| Generated Complaints | Until user deletes | User content |
| Analytics | 2 years | Business insights |
| Session Data | 30 days | Security |

### Implementation

```sql
-- Automated cleanup job
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete sessions older than 30 days
  DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days';

  -- Archive audit logs older than 7 years
  -- (move to cold storage, not delete)
END;
$$ LANGUAGE plpgsql;
```

---

## 8. Incident Response

### Incident Response Plan (Lightweight)

**Detection**:
- Sentry error monitoring
- Supabase alerts
- Clerk security notifications
- Customer reports

**Response Steps**:
1. Assess severity (P1-P4)
2. Contain the issue
3. Investigate root cause
4. Remediate
5. Notify affected users (if data breach)
6. Document and improve

**Data Breach Notification**:
- CCPA: 72 hours to notify
- GDPR: 72 hours to notify
- Template breach notification ready

---

## 9. Third-Party Risk

### Subprocessors

| Service | Purpose | Data Access | DPA Status |
|---------|---------|-------------|------------|
| Vercel | Hosting | Request logs | Available |
| Supabase | Database | All data | Available |
| Clerk | Auth | User data | Available |
| Stripe | Billing | Billing info | Available |
| OpenAI | Embeddings | Complaint text | Available |
| Anthropic | LLM | Pattern data | Available |
| Resend | Email | User emails | Available |
| Sentry | Errors | Error context | Available |

### DPA (Data Processing Agreement)

Enterprise customers will require:
- List of subprocessors
- DPAs with each
- Geographic locations
- Security certifications

**Action**: Collect DPAs from all vendors before enterprise sales.

---

## 10. Implementation Checklist

### MVP Launch

- [ ] Privacy Policy page
- [ ] Terms of Service page
- [ ] Cookie consent banner (basic)
- [ ] HTTPS everywhere
- [ ] Data export endpoint
- [ ] Account deletion endpoint
- [ ] Audit logging for sensitive actions
- [ ] Security headers
- [ ] Input validation
- [ ] Rate limiting

### Growth Phase

- [ ] Full CCPA compliance
- [ ] GDPR compliance (if EU customers)
- [ ] SOC 2 Type 1 readiness
- [ ] Penetration testing
- [ ] Security questionnaire responses
- [ ] DPA for enterprise customers
- [ ] Subprocessor list published

### Enterprise Phase

- [ ] SOC 2 Type 2 audit
- [ ] Annual penetration testing
- [ ] Bug bounty program
- [ ] ISO 27001 (optional)
- [ ] Dedicated security team

---

## 11. Cost Considerations

### Compliance Costs

| Item | MVP | Growth | Enterprise |
|------|-----|--------|------------|
| Legal review | $2-5K | $5-10K | $20K+ |
| Privacy policy | Free (templates) | $1-2K (lawyer) | Included |
| SOC 2 Type 1 | - | $20-50K | - |
| SOC 2 Type 2 | - | - | $30-80K/year |
| Pen testing | - | $5-15K | $10-30K |
| Compliance tools | Free | $500/month | $2K/month |

### Recommendation

**MVP**: Self-service templates, basic controls (~$2K legal review)
**Growth**: SOC 2 readiness, pen test ($30-50K investment)
**Enterprise**: Full compliance program (budget $100K+/year)

---

## Summary

### CaseRadar Compliance Profile

| Factor | Status |
|--------|--------|
| Data sensitivity | Low-Medium (public NHTSA + user PII) |
| Regulatory burden | Medium (CCPA + state laws) |
| Enterprise readiness | MVP: Basic, Growth: SOC 2 needed |
| Vendor compliance | All vendors SOC 2 compliant |

### Key Actions

1. **Launch**: Privacy policy, ToS, basic security
2. **6 months**: CCPA compliance, audit logs
3. **12 months**: SOC 2 Type 1 if enterprise sales
4. **24 months**: SOC 2 Type 2, pen testing

---

## References

- [SaaS Privacy Compliance 2025](https://secureprivacy.ai/blog/saas-privacy-compliance-requirements-2025-guide)
- [Law Firm Data Security Guide](https://www.clio.com/blog/data-security-law-firms/)
- [SOC 2 Compliance Guide](https://sprinto.com/blog/compliance-standards/)
- [GDPR for SaaS 2025](https://www.feroot.com/blog/gdpr-saas-compliance-2025/)
- [CCPA Requirements](https://oag.ca.gov/privacy/ccpa)
