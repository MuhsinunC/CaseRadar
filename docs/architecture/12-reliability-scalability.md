# CaseRadar Reliability & Scalability Documentation

## Overview

This document details resilience patterns, failure handling, and scalability architecture for CaseRadar. As a legal technology platform, reliability is paramount - system failures can impact active legal proceedings.

---

## Reliability Architecture

### System Reliability Goals

| Metric | Target | Measurement Period |
|--------|--------|-------------------|
| Availability | 99.9% | Monthly |
| Mean Time to Recovery (MTTR) | < 30 minutes | Per incident |
| Mean Time Between Failures (MTBF) | > 720 hours | Rolling |
| Error Rate | < 0.1% | Hourly |

### External Service Dependencies

```mermaid
graph TB
    subgraph Critical["Critical Dependencies"]
        Clerk["Clerk Auth<br/>Auth required for all protected routes"]
        Supabase["Supabase PostgreSQL<br/>All data storage"]
    end

    subgraph Important["Important Dependencies"]
        OpenAI["OpenAI API<br/>Embedding generation"]
        Anthropic["Anthropic API<br/>Document generation"]
    end

    subgraph Optional["Optional Dependencies"]
        Stripe["Stripe<br/>Billing (degraded mode possible)"]
        Sentry["Sentry<br/>Error monitoring only"]
        NHTSA["NHTSA API<br/>Data sync only"]
    end

    CaseRadar["CaseRadar"] --> Critical
    CaseRadar --> Important
    CaseRadar --> Optional
```

---

## Circuit Breaker Pattern

### Circuit Breaker States

```mermaid
stateDiagram-v2
    [*] --> Closed: Initial state
    Closed --> Open: Failure threshold exceeded
    Open --> HalfOpen: Timeout elapsed
    HalfOpen --> Closed: Success
    HalfOpen --> Open: Failure

    note right of Closed
        Normal operation
        All requests pass through
    end note

    note right of Open
        Circuit tripped
        Requests fail fast
        No external calls
    end note

    note right of HalfOpen
        Testing recovery
        Limited requests allowed
        Monitor success rate
    end note
```

### Circuit Breaker Configuration

| Service | Failure Threshold | Timeout | Half-Open Requests |
|---------|-------------------|---------|-------------------|
| OpenAI API | 5 failures in 60s | 30s | 3 |
| Anthropic API | 5 failures in 60s | 30s | 3 |
| NHTSA API | 10 failures in 300s | 60s | 5 |
| Stripe API | 3 failures in 60s | 30s | 2 |

### Implementation Pattern

```typescript
interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;  // milliseconds
  monitoringWindow: number;  // milliseconds
}

const CIRCUIT_BREAKER_CONFIGS: Record<string, CircuitBreakerConfig> = {
  openai: {
    name: 'openai',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    monitoringWindow: 60000,
  },
  anthropic: {
    name: 'anthropic',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    monitoringWindow: 60000,
  },
  nhtsa: {
    name: 'nhtsa',
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 60000,
    monitoringWindow: 300000,
  },
};
```

### Circuit Breaker Flow

```mermaid
sequenceDiagram
    participant Client
    participant CB as Circuit Breaker
    participant Service as External Service

    alt Circuit Closed
        Client->>CB: Request
        CB->>Service: Forward request
        Service-->>CB: Response
        CB-->>Client: Response
        CB->>CB: Update success count
    else Circuit Open
        Client->>CB: Request
        CB-->>Client: Fail fast (503)
        Note over CB: No external call made
    else Circuit Half-Open
        Client->>CB: Request
        CB->>Service: Test request
        alt Success
            Service-->>CB: Success
            CB->>CB: Close circuit
            CB-->>Client: Response
        else Failure
            Service-->>CB: Failure
            CB->>CB: Re-open circuit
            CB-->>Client: Error
        end
    end
```

---

## Retry Logic

### Retry Strategy

```mermaid
flowchart TD
    Request["API Request"] --> Attempt["Attempt 1"]
    Attempt -->|Success| Done["Return Response"]
    Attempt -->|Failure| Retry1{"Retry?"}

    Retry1 -->|"Attempt < Max"| Wait1["Wait: 1s"]
    Wait1 --> Attempt2["Attempt 2"]
    Attempt2 -->|Success| Done
    Attempt2 -->|Failure| Retry2{"Retry?"}

    Retry2 -->|"Attempt < Max"| Wait2["Wait: 2s"]
    Wait2 --> Attempt3["Attempt 3"]
    Attempt3 -->|Success| Done
    Attempt3 -->|Failure| Retry3{"Retry?"}

    Retry3 -->|"Attempt < Max"| Wait3["Wait: 4s"]
    Wait3 --> Final["Final Attempt"]
    Final -->|Success| Done
    Final -->|Failure| Fail["Return Error"]

    Retry1 -->|"Max reached"| Fail
    Retry2 -->|"Max reached"| Fail
    Retry3 -->|"Max reached"| Fail
```

### Retry Configuration

| Operation | Max Retries | Base Delay | Max Delay | Jitter |
|-----------|-------------|------------|-----------|--------|
| OpenAI Embedding | 3 | 1s | 8s | ±500ms |
| Anthropic Generation | 3 | 2s | 16s | ±1s |
| NHTSA Fetch | 5 | 5s | 60s | ±2s |
| Database Query | 2 | 100ms | 1s | ±50ms |
| Webhook Delivery | 5 | 1s | 32s | ±500ms |

### Retryable vs Non-Retryable Errors

| Retryable (Transient) | Non-Retryable (Permanent) |
|----------------------|--------------------------|
| 429 Rate Limited | 400 Bad Request |
| 500 Internal Server Error | 401 Unauthorized |
| 502 Bad Gateway | 403 Forbidden |
| 503 Service Unavailable | 404 Not Found |
| 504 Gateway Timeout | 422 Validation Error |
| Network timeout | Invalid API key |
| Connection refused | Insufficient funds |

### Exponential Backoff Implementation

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryableError(error) || attempt === config.maxRetries) {
        throw error;
      }

      const delay = calculateBackoff(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError!;
}

function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  const jitter = (Math.random() - 0.5) * 2 * config.jitter;
  return cappedDelay + jitter;
}
```

---

## Graceful Degradation

### Degradation Levels

```mermaid
graph TB
    subgraph Level0["Level 0: Full Operation"]
        All["All features available"]
    end

    subgraph Level1["Level 1: AI Degraded"]
        Search["Search: Keyword fallback"]
        Gen["Generation: Unavailable"]
        Core["Core features: Available"]
    end

    subgraph Level2["Level 2: External Degraded"]
        Auth["Auth: Read-only mode"]
        Billing["Billing: Cached status"]
        Data["Data: Stale acceptable"]
    end

    subgraph Level3["Level 3: Read-Only"]
        View["View existing data"]
        NoWrite["No new data"]
        NoAuth["Limited auth"]
    end

    Level0 -->|"AI services down"| Level1
    Level1 -->|"External services down"| Level2
    Level2 -->|"Database issues"| Level3
```

### Fallback Strategies

| Service | Primary | Fallback | User Experience |
|---------|---------|----------|-----------------|
| OpenAI Embeddings | Vector search | Keyword search | Slower, less accurate |
| Anthropic Claude | AI generation | Manual drafting | Feature unavailable |
| NHTSA API | Live sync | Cached data | Data may be stale |
| Stripe | Live billing | Cached status | Delayed updates |
| Clerk | JWT validation | Session cache | Brief window |

### Degradation Implementation

```mermaid
flowchart TD
    Request["User Request"] --> Check["Check Service Health"]

    Check --> OpenAI{"OpenAI Available?"}
    OpenAI -->|Yes| VectorSearch["Vector Search"]
    OpenAI -->|No| KeywordSearch["Keyword Fallback"]

    VectorSearch --> Results["Return Results"]
    KeywordSearch --> Results

    Check --> Claude{"Claude Available?"}
    Claude -->|Yes| Generate["AI Generation"]
    Claude -->|No| Unavailable["Show Unavailable Message"]

    Generate --> Document["Return Document"]
    Unavailable --> Manual["Offer Manual Drafting"]
```

---

## Timeout Configuration

### Timeout Values

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| Database query (simple) | 5s | Should be <100ms normally |
| Database query (complex) | 30s | Aggregations, joins |
| OpenAI embedding | 30s | Batch processing |
| Anthropic generation | 120s | Long document generation |
| NHTSA API fetch | 60s | External API latency |
| PDF generation | 30s | Complex documents |
| Health check | 5s | Quick status only |
| Total request | 300s | Vercel Pro limit |

### Timeout Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as API Route
    participant DB as Database
    participant AI as AI Service

    Client->>API: Request (total timeout: 300s)

    par Database with timeout
        API->>DB: Query (timeout: 5s)
        DB-->>API: Results
    and AI with timeout
        API->>AI: Generate (timeout: 120s)
        AI-->>API: Content
    end

    API-->>Client: Combined response

    Note over Client,AI: If any timeout exceeded,<br/>return partial results or error
```

---

## Health Check Architecture

### Health Check Endpoints

| Endpoint | Purpose | Frequency | Timeout |
|----------|---------|-----------|---------|
| `/api/health` | Basic liveness | 30s | 5s |
| `/api/health/db` | Database connectivity | 60s | 10s |
| `/api/health/services` | External dependencies | 300s | 30s |
| `/api/health/deep` | Full system check | 600s | 60s |

### Health Check Flow

```mermaid
flowchart TD
    subgraph Liveness["/api/health - Liveness"]
        L1["Check: Process running"]
        L2["Response: { status: 'ok' }"]
    end

    subgraph Readiness["/api/health/db - Readiness"]
        R1["Check: Database SELECT 1"]
        R2["Check: Connection pool"]
        R3["Response: { status, latency }"]
    end

    subgraph Dependencies["/api/health/services"]
        D1["Check: Clerk API"]
        D2["Check: OpenAI API"]
        D3["Check: Anthropic API"]
        D4["Response: { services: [...] }"]
    end

    subgraph Deep["/api/health/deep"]
        E1["All above checks"]
        E2["Check: Write capability"]
        E3["Check: Queue health"]
        E4["Response: Full report"]
    end
```

### Health Check Response Format

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "version": "1.2.3",
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 12,
      "connections": {
        "active": 5,
        "idle": 15,
        "max": 20
      }
    },
    "services": {
      "clerk": { "status": "healthy", "latency": 45 },
      "openai": { "status": "healthy", "latency": 120 },
      "anthropic": { "status": "healthy", "latency": 200 },
      "stripe": { "status": "degraded", "error": "rate_limited" }
    }
  },
  "degraded": false
}
```

---

## Scalability Architecture

### Scaling Strategy

```mermaid
graph TB
    subgraph Horizontal["Horizontal Scaling (Auto)"]
        Vercel["Vercel Serverless<br/>Auto-scales to demand"]
        Edge["Edge Functions<br/>Global distribution"]
    end

    subgraph Vertical["Vertical Scaling (Manual)"]
        DB["Database<br/>Supabase plan upgrade"]
        Pool["Connection Pool<br/>Increase limits"]
    end

    subgraph Caching["Caching Layer"]
        Static["Static Assets<br/>CDN cache"]
        API["API Responses<br/>Edge cache"]
        Query["Query Results<br/>In-memory cache"]
    end

    Traffic["Incoming Traffic"] --> Horizontal
    Horizontal --> Caching
    Caching --> Vertical
```

### Capacity Planning

#### Current Limits

| Resource | Current Limit | Scaling Path |
|----------|---------------|--------------|
| Serverless functions | Unlimited (Vercel Pro) | N/A |
| Database connections | 60 (Supabase Pro) | Upgrade to 200 |
| OpenAI rate limit | 3500 RPM | Request increase |
| Anthropic rate limit | 1000 RPM | Request increase |
| Storage | 8GB (Supabase Pro) | Upgrade to 100GB |

#### Projected Capacity

| Users | Requests/min | DB Connections | AI Calls/day | Storage/month |
|-------|--------------|----------------|--------------|---------------|
| 100 | 50 | 10 | 500 | 100MB |
| 500 | 250 | 25 | 2,500 | 500MB |
| 1,000 | 500 | 50 | 5,000 | 1GB |
| 5,000 | 2,500 | 100 | 25,000 | 5GB |
| 10,000 | 5,000 | 200 | 50,000 | 10GB |

### Database Scaling

```mermaid
graph TB
    subgraph Current["Current Architecture"]
        Single["Single PostgreSQL"]
        PgBouncer["PgBouncer Pool"]
    end

    subgraph Future["Scaling Path"]
        ReadReplica["Read Replicas"]
        Sharding["Tenant Sharding"]
        Archive["Cold Storage Archive"]
    end

    Single --> ReadReplica
    ReadReplica --> Sharding
    PgBouncer --> Archive
```

#### Database Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Connection usage | > 80% | Add read replica |
| Query latency p99 | > 500ms | Index optimization |
| Storage usage | > 70% | Archive old data |
| CPU usage | > 70% | Upgrade plan |

---

## Caching Strategy

### Cache Layers

```mermaid
graph LR
    subgraph Client["Client Layer"]
        Browser["Browser Cache"]
        SW["Service Worker"]
    end

    subgraph Edge["Edge Layer"]
        CDN["Vercel CDN"]
        EdgeCache["Edge Cache"]
    end

    subgraph App["Application Layer"]
        Memory["In-Memory Cache"]
        Redis["Redis (future)"]
    end

    subgraph Data["Data Layer"]
        PG["PostgreSQL"]
        PGCache["Query Cache"]
    end

    Client --> Edge
    Edge --> App
    App --> Data
```

### Cache Configuration

| Resource | Cache Location | TTL | Invalidation |
|----------|---------------|-----|--------------|
| Static assets | CDN | 1 year | Deploy |
| API responses | Edge | 0 (no-store) | N/A |
| User session | Memory | 5 min | Logout |
| Complaint data | Memory | 1 hour | NHTSA sync |
| Pattern data | Memory | 15 min | Analysis run |
| Dashboard stats | Memory | 5 min | Data change |

### Cache-Aside Pattern

```mermaid
sequenceDiagram
    participant App as Application
    participant Cache as Cache Layer
    participant DB as Database

    App->>Cache: Get pattern-123
    alt Cache hit
        Cache-->>App: Return cached data
    else Cache miss
        Cache-->>App: null
        App->>DB: SELECT * FROM Pattern
        DB-->>App: Pattern data
        App->>Cache: Set pattern-123 (TTL: 15min)
        App->>App: Return data
    end
```

---

## Rate Limiting Architecture

### Rate Limit Tiers

```mermaid
graph TB
    subgraph Global["Global Limits"]
        G1["1000 req/min total"]
    end

    subgraph Tenant["Per-Tenant Limits"]
        T1["FREE: 100 req/min"]
        T2["BASIC: 300 req/min"]
        T3["PRO: 500 req/min"]
        T4["ENTERPRISE: 1000 req/min"]
    end

    subgraph User["Per-User Limits"]
        U1["100 req/min"]
    end

    subgraph Endpoint["Per-Endpoint Limits"]
        E1["Search: 60/min"]
        E2["Generate: 10/min"]
        E3["Export: 20/min"]
    end

    Global --> Tenant
    Tenant --> User
    User --> Endpoint
```

### Rate Limit Response

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "limits": {
    "endpoint": "search",
    "limit": 60,
    "remaining": 0,
    "reset": "2024-01-15T12:01:00Z"
  },
  "retryAfter": 45
}
```

### Rate Limit Headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705320060
Retry-After: 45
```

---

## Load Testing Results

### Baseline Performance (Expected)

| Endpoint | Concurrent Users | p50 | p95 | p99 | Error Rate |
|----------|------------------|-----|-----|-----|------------|
| Dashboard | 100 | 200ms | 500ms | 1s | < 0.1% |
| Complaint Search | 50 | 500ms | 1.5s | 3s | < 0.1% |
| Pattern List | 100 | 150ms | 400ms | 800ms | < 0.1% |
| Document Generate | 10 | 10s | 25s | 45s | < 1% |
| PDF Export | 20 | 2s | 5s | 8s | < 0.5% |

### Stress Test Thresholds

| Scenario | Breaking Point | Failure Mode |
|----------|----------------|--------------|
| Concurrent users | ~500 | DB connection exhaustion |
| Requests/second | ~100 | Rate limiting kicks in |
| AI generation concurrent | ~20 | API rate limits |
| Search concurrent | ~50 | Slow response degradation |

---

## Disaster Recovery

### RTO/RPO Targets

| Data Type | RTO | RPO | Method |
|-----------|-----|-----|--------|
| User data | 4 hours | 1 hour | Supabase PITR |
| Complaints | 4 hours | 6 hours | Daily sync |
| Patterns | 4 hours | 1 hour | Supabase PITR |
| Generated docs | 4 hours | 1 hour | Supabase PITR |
| Audit logs | 4 hours | 0 (no loss) | Supabase PITR |

### Recovery Procedures

```mermaid
flowchart TD
    Incident["Data Loss Incident"] --> Assess["Assess Scope"]

    Assess --> Type{"Type?"}

    Type -->|"Partial"| Selective["Selective Restore"]
    Type -->|"Full"| Full["Full Restore"]

    Selective --> PITR["Supabase Point-in-Time"]
    Full --> NewProject["Create New Supabase Project"]
    NewProject --> RestoreBackup["Restore from Backup"]
    RestoreBackup --> UpdateEnv["Update Connection Strings"]
    UpdateEnv --> Verify["Verify Data Integrity"]

    PITR --> Verify
    Verify --> Resume["Resume Operations"]
```

---

## Reliability Checklist

### Pre-Production
- [ ] Circuit breakers configured for all external APIs
- [ ] Retry logic with exponential backoff
- [ ] Timeout values set for all operations
- [ ] Health check endpoints implemented
- [ ] Graceful degradation paths defined

### Monitoring
- [ ] Error rate alerts configured
- [ ] Latency alerts configured
- [ ] Circuit breaker state alerts
- [ ] Database connection alerts
- [ ] External service status monitoring

### Documentation
- [ ] Runbooks for all failure scenarios
- [ ] Escalation paths defined
- [ ] Recovery procedures tested
- [ ] Capacity limits documented
- [ ] Scaling triggers defined

---

**Previous:** [11-operational-runbooks.md](./11-operational-runbooks.md) - Operational Runbooks
**Index:** [00-overview.md](./00-overview.md) - System Overview
