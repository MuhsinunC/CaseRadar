# CaseRadar Security Architecture

This document outlines the security measures implemented in CaseRadar to protect user data, prevent attacks, and ensure compliance.

## Table of Contents

1. [Security Headers](#security-headers)
2. [Input Sanitization](#input-sanitization)
3. [Authentication & Authorization](#authentication--authorization)
4. [Audit Logging](#audit-logging)
5. [Data Protection](#data-protection)
6. [API Security](#api-security)
7. [Infrastructure Security](#infrastructure-security)

---

## Security Headers

CaseRadar implements comprehensive HTTP security headers to protect against common web vulnerabilities.

### Headers Applied

| Header | Value | Purpose |
|--------|-------|---------|
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS prefetching privacy leaks |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for 2 years |
| `X-Frame-Options` | `DENY` | Prevents clickjacking attacks |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Permissions-Policy` | `camera=(), microphone=()...` | Restricts browser features |

### Content Security Policy (CSP)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://api.clerk.dev https://api.stripe.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

### Usage

```typescript
import { getSecurityHeaders, getCSPHeader } from '@/lib/security';

// In Next.js middleware or API routes
const headers = getSecurityHeaders();
const csp = getCSPHeader({ production: true });
```

---

## Input Sanitization

All user input is sanitized before processing to prevent injection attacks.

### XSS Prevention

```typescript
import { sanitizeHtml, escapeHtml } from '@/lib/security';

// Remove dangerous HTML
const safe = sanitizeHtml('<script>alert("XSS")</script>Hello');
// Result: "Hello"

// Escape for display
const escaped = escapeHtml('<div onclick="alert(1)">');
// Result: "&lt;div onclick=&quot;alert(1)&quot;&gt;"
```

### SQL Injection Defense

While CaseRadar uses Prisma ORM with parameterized queries (primary defense), we also provide escape functions for defense in depth:

```typescript
import { escapeForSql, sanitizeSearchQuery } from '@/lib/security';

// Escape for SQL (defense in depth)
const safe = escapeForSql("O'Brien; DROP TABLE users;--");
// Result: "O''Brien DROP TABLE users"

// Sanitize search queries
const query = sanitizeSearchQuery('search<script>alert(1)</script>');
// Result: "searchalert1"
```

### Input Validation

```typescript
import { validateInput } from '@/lib/security';

validateInput('test@example.com', 'email');     // true
validateInput('550e8400-e29b-41d4-a716-446655440000', 'uuid'); // true
validateInput('https://example.com', 'url');    // true
validateInput('2024-01-15', 'date');            // true
validateInput('abc123', 'alphanumeric');        // true
```

### File Upload Protection

```typescript
import { sanitizeFilename } from '@/lib/security';

// Prevent path traversal
const safe = sanitizeFilename('../../../etc/passwd');
// Result: "etcpasswd"
```

---

## Authentication & Authorization

CaseRadar uses Clerk for authentication with a custom RBAC layer.

### Authentication Flow

1. **User Login**: Handled by Clerk's secure authentication
2. **Session Management**: Clerk manages sessions with secure cookies
3. **Webhook Sync**: User/org data synced via Svix-verified webhooks

### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `ADMIN` | Full access - manage users, billing, settings |
| `ANALYST` | Create/edit patterns, generate complaints |
| `VIEWER` | Read-only access to dashboards and reports |

### Multi-Tenant Isolation

All data is scoped by `organizationId`:

```typescript
// Every query includes tenant isolation
const complaints = await prisma.complaint.findMany({
  where: {
    organizationId: currentOrg.id, // Tenant isolation
    // ... other filters
  }
});
```

### Middleware Protection

```typescript
import { withAuth, withRole, withOrganization } from '@/lib/auth';

// Protect API routes
export const GET = withAuth(
  withOrganization(
    withRole(['ADMIN', 'ANALYST'], async (req, ctx) => {
      // Route handler
    })
  )
);
```

---

## Audit Logging

CaseRadar maintains a comprehensive audit trail for compliance and security monitoring.

### Logged Events

| Category | Events |
|----------|--------|
| **Authentication** | LOGIN, LOGOUT, LOGIN_FAILED |
| **Data Access** | READ, EXPORT |
| **Data Modification** | CREATE, UPDATE, DELETE |
| **Admin Actions** | PERMISSION_CHANGE, IMPORT |

### Audit Log Structure

```typescript
interface AuditLogEntry {
  userId: string | null;
  organizationId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
```

### Sensitive Data Filtering

Audit logs automatically redact sensitive fields:

```typescript
import { filterSensitiveData } from '@/lib/security';

const data = { email: 'user@example.com', password: 'secret123' };
const filtered = filterSensitiveData(data);
// Result: { email: 'user@example.com', password: '[REDACTED]' }
```

### Usage

```typescript
import { createAuditLog, logAuthEvent, logDataAccess } from '@/lib/security';

// Log authentication
await logAuthEvent('LOGIN', userId, { method: 'oauth' }, ipAddress);

// Log data access
await logDataAccess(userId, orgId, 'COMPLAINT', complaintId);

// Log data modification
await createAuditLog({
  userId,
  organizationId,
  action: 'UPDATE',
  resource: 'PATTERN',
  resourceId: patternId,
  metadata: { field: 'severity', oldValue: 'medium', newValue: 'high' }
});
```

---

## Data Protection

### Encryption

- **In Transit**: TLS 1.3 enforced via HSTS
- **At Rest**: Database encryption via Supabase
- **Vectors**: Complaint embeddings stored in pgvector

### Data Retention

- Audit logs: 90 days (configurable per plan)
- Generated complaints: Until user deletion
- NHTSA data: Synchronized with source

### GDPR/CCPA Compliance

- Data export functionality for user requests
- Account deletion cascades all user data
- Consent management via organization settings

---

## API Security

### Rate Limiting

| Endpoint Category | Limit |
|-------------------|-------|
| Authentication | 5/minute |
| Search queries | 60/minute |
| Complaint generation | 10/minute |
| Data export | 5/hour |

### Request Validation

All API endpoints validate:

1. **Authentication**: Valid session token
2. **Authorization**: Role-based permissions
3. **Tenant**: Organization membership
4. **Input**: Schema validation with Zod

### Error Handling

Security-sensitive errors return generic messages:

```typescript
// ❌ Don't expose internal details
return new Response('User not found in database', { status: 404 });

// ✅ Generic error response
return new Response('Not found', { status: 404 });
```

---

## Infrastructure Security

### Hosting (Vercel)

- DDoS protection
- Edge network with global CDN
- Automatic HTTPS certificates
- Preview deployments isolated

### Database (Supabase)

- SOC 2 Type 2 certified
- Row Level Security (RLS)
- Encrypted backups
- Network isolation

### Secrets Management

- Environment variables via Vercel
- API keys rotated quarterly
- Webhook secrets verified with Svix

---

## Security Testing

### Automated Tests

- **Unit Tests**: 68 security-specific tests
- **E2E Tests**: 132 browser tests including accessibility
- **Static Analysis**: ESLint security rules

### Test Coverage

```bash
# Run security tests
npm test -- --run src/lib/security/__tests__/

# Run all tests
npm test
```

### Manual Review Checklist

- [ ] SQL injection vectors
- [ ] XSS via user input
- [ ] CSRF protection
- [ ] Authentication bypass
- [ ] Authorization escalation
- [ ] Sensitive data exposure
- [ ] Rate limit bypass

---

## Incident Response

### Security Contact

Report vulnerabilities to: security@caseradar.com

### Response SLA

| Severity | Initial Response | Resolution Target |
|----------|-----------------|-------------------|
| Critical | 4 hours | 24 hours |
| High | 24 hours | 7 days |
| Medium | 72 hours | 30 days |
| Low | 1 week | 90 days |

---

## Compliance

### Standards

- OWASP Top 10 mitigations
- WCAG 2.1 Level AA accessibility
- SOC 2 Type 2 (via infrastructure)

### Audits

- Quarterly dependency audits
- Annual penetration testing
- Continuous monitoring via Vercel

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial security architecture |
