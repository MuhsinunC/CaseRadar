# CaseRadar Authentication Documentation

## Overview

CaseRadar uses [Clerk](https://clerk.com) for authentication and organization management. The system implements multi-tenant authentication with role-based access control (RBAC).

## Architecture Overview

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["Browser"]
        ClerkJS["Clerk.js SDK"]
    end

    subgraph NextJS["Next.js Application"]
        Middleware["Clerk Middleware"]
        Pages["Page Components"]
        APIRoutes["API Routes"]
    end

    subgraph Auth["Auth Layer"]
        GetCurrentUser["getCurrentUser()"]
        AuthMiddleware["Auth Middleware"]
        UserSync["User Sync"]
    end

    subgraph External["External Services"]
        ClerkAPI["Clerk API"]
        ClerkDashboard["Clerk Dashboard"]
    end

    subgraph Database["Database"]
        Users["Users Table"]
        Orgs["Organizations Table"]
    end

    Browser --> ClerkJS
    ClerkJS --> ClerkAPI
    Browser --> Middleware
    Middleware --> Pages
    Middleware --> APIRoutes

    Pages --> GetCurrentUser
    APIRoutes --> GetCurrentUser
    GetCurrentUser --> Users

    ClerkAPI -->|Webhooks| UserSync
    UserSync --> Users
    UserSync --> Orgs
```

---

## Authentication Flow

### Sign-In Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Clerk as Clerk.js
    participant ClerkAPI as Clerk API
    participant Middleware
    participant App as Next.js App

    User->>Browser: Navigate to /sign-in
    Browser->>App: GET /sign-in
    App-->>Browser: Sign-in page with Clerk UI
    Browser->>Clerk: Initialize sign-in form

    User->>Clerk: Enter credentials
    Clerk->>ClerkAPI: Authenticate

    alt Success
        ClerkAPI-->>Clerk: Session token
        Clerk-->>Browser: Set session cookie
        Browser->>Middleware: Navigate to /dashboard
        Middleware->>Middleware: Validate session
        Middleware-->>App: Forward authenticated request
        App-->>Browser: Dashboard page
    else Failure
        ClerkAPI-->>Clerk: Error response
        Clerk-->>Browser: Display error
    end
```

### Sign-Up Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Clerk as Clerk.js
    participant ClerkAPI as Clerk API
    participant Webhook as /api/webhooks/clerk
    participant Database as PostgreSQL

    User->>Browser: Navigate to /sign-up
    Browser->>Clerk: Display sign-up form

    User->>Clerk: Enter email, password
    Clerk->>ClerkAPI: Create user
    ClerkAPI-->>Clerk: User created

    ClerkAPI->>Webhook: user.created webhook
    Webhook->>Database: Upsert User record

    Clerk-->>Browser: Redirect to dashboard
```

---

## Middleware Configuration

**File:** `src/middleware.ts`

```mermaid
flowchart TD
    A[Incoming Request] --> B{Is Public Route?}
    B -->|Yes| C[Pass Through]
    B -->|No| D{Has userId?}
    D -->|No| E[Redirect to /sign-in]
    D -->|Yes| F[Forward to Route]

    subgraph PublicRoutes["Public Routes"]
        P1["/"]
        P2["/sign-in(.*)"]
        P3["/sign-up(.*)"]
        P4["/api/webhooks(.*)"]
        P5["/api/health"]
    end

    subgraph ProtectedRoutes["Protected Routes"]
        R1["/dashboard(.*)"]
        R2["/complaints(.*)"]
        R3["/patterns(.*)"]
        R4["/generator(.*)"]
        R5["/settings(.*)"]
    end
```

**Route Matchers:**

```typescript
// Public routes - no auth required
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
]);

// Org routes - require organization membership
const isOrgRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/complaints(.*)',
  '/patterns(.*)',
  '/generator(.*)',
  '/settings(.*)',
  '/admin(.*)',
  '/api/complaints(.*)',
  '/api/patterns(.*)',
  '/api/generator(.*)',
]);
```

**Matcher Config:**
```typescript
export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

---

## Auth Utilities

### getCurrentUser()

**File:** `src/lib/auth/auth-middleware.ts`

**Purpose:** Retrieves authenticated user with database info.

```mermaid
sequenceDiagram
    participant Route as API Route
    participant GetUser as getCurrentUser()
    participant ClerkAuth as Clerk auth()
    participant Prisma
    participant DB as PostgreSQL

    Route->>GetUser: getCurrentUser()
    GetUser->>ClerkAuth: auth()
    ClerkAuth-->>GetUser: { userId: string | null }

    alt No userId
        GetUser-->>Route: null
    else Has userId
        GetUser->>Prisma: findUnique({ clerkUserId })
        Prisma->>DB: SELECT user JOIN organization
        DB-->>Prisma: User + Organization
        Prisma-->>GetUser: User record
        GetUser-->>Route: AuthenticatedUser
    end
```

**Return Type:**
```typescript
interface AuthenticatedUser {
  id: string;               // Database user ID
  clerkUserId: string;      // Clerk user ID
  email: string;
  role: Role;               // ADMIN | ANALYST | VIEWER
  organizationId: string;   // Database org ID
  organization: {
    id: string;
    clerkOrgId: string;     // Clerk org ID
    name: string;
    plan: Plan;             // FREE | BASIC | PRO | ENTERPRISE
  };
}
```

---

### Higher-Order Functions

#### withAuth

**Purpose:** Wraps handler with authentication check.

```mermaid
flowchart TD
    A[Request] --> B{userId exists?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D[Create AuthContext]
    D --> E[Call Handler]
    E --> F[Return Response]
```

```typescript
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
    const authResult = await auth();
    if (!authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(request, { auth: authContext });
  };
}
```

#### withRole

**Purpose:** Requires specific role(s) for access.

```mermaid
flowchart TD
    A[Request] --> B{userId exists?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D[Fetch User from DB]
    D --> E{User exists?}
    E -->|No| F[401 User not found]
    E -->|Yes| G{Has required role?}
    G -->|No| H[403 Forbidden]
    G -->|Yes| I[Call Handler]
```

#### withOrganization

**Purpose:** Requires organization membership.

```mermaid
flowchart TD
    A[Request] --> B{userId exists?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D{orgId exists?}
    D -->|No| E[403 Organization required]
    D -->|Yes| F[Call Handler]
```

---

## Role-Based Access Control

### Role Hierarchy

```mermaid
graph TD
    subgraph Roles["User Roles"]
        ADMIN["ADMIN<br/>Full Access"]
        ANALYST["ANALYST<br/>Create/Edit"]
        VIEWER["VIEWER<br/>Read-Only"]
    end

    ADMIN --> ANALYST
    ANALYST --> VIEWER
```

### Permission Matrix

| Resource | Action | ADMIN | ANALYST | VIEWER |
|----------|--------|-------|---------|--------|
| Complaints | read | ✅ | ✅ | ✅ |
| Complaints | search | ✅ | ✅ | ✅ |
| Patterns | read | ✅ | ✅ | ✅ |
| Patterns | create | ✅ | ✅ | ❌ |
| Patterns | update | ✅ | ✅ | ❌ |
| Patterns | delete | ✅ | ❌ | ❌ |
| Generated Complaints | read | ✅ | ✅ | ✅ |
| Generated Complaints | create | ✅ | ✅ | ❌ |
| Generated Complaints | update | ✅ | ✅ | ❌ |
| Generated Complaints | delete | ✅ | ✅ | ❌ |
| Users | read | ✅ | ✅ | ❌ |
| Users | manage | ✅ | ❌ | ❌ |
| Organization | read | ✅ | ✅ | ✅ |
| Organization | manage | ✅ | ❌ | ❌ |

### Permission Check Function

```typescript
export function hasPermission(
  user: AuthenticatedUser,
  action: string,
  resource: string
): boolean {
  const permissions: Record<Role, Record<string, string[]>> = {
    ADMIN: { '*': ['*'] },  // Wildcard access
    ANALYST: {
      complaints: ['read', 'search'],
      patterns: ['read', 'create', 'update'],
      generated_complaints: ['read', 'create', 'update', 'delete'],
      users: ['read'],
      organizations: ['read'],
    },
    VIEWER: {
      complaints: ['read', 'search'],
      patterns: ['read'],
      generated_complaints: ['read'],
      organizations: ['read'],
    },
  };
  // ... permission check logic
}
```

---

## Webhook Handlers

### Clerk Webhooks

**File:** `src/app/api/webhooks/clerk/route.ts`

```mermaid
sequenceDiagram
    participant Clerk as Clerk API
    participant Route as /api/webhooks/clerk
    participant Svix as Svix Verification
    participant Handler as processClerkWebhook
    participant DB as PostgreSQL

    Clerk->>Route: POST webhook
    Note over Clerk,Route: Headers: svix-id, svix-timestamp, svix-signature

    Route->>Svix: Verify signature
    alt Invalid
        Svix-->>Route: Verification failed
        Route-->>Clerk: 400 Invalid signature
    else Valid
        Svix-->>Route: Verified payload
        Route->>Handler: Process event

        alt user.created
            Handler->>DB: Upsert user
        else user.updated
            Handler->>DB: Update user email
        else user.deleted
            Handler->>DB: Delete user
        else organization.created
            Handler->>DB: Create organization
        else organization.updated
            Handler->>DB: Update organization
        else organizationMembership.created
            Handler->>DB: Add user to org
        end

        Handler-->>Route: Success
        Route-->>Clerk: { received: true }
    end
```

### Supported Webhook Events

| Event | Action |
|-------|--------|
| `user.created` | Create user record if org exists |
| `user.updated` | Update user email |
| `user.deleted` | Delete user record |
| `organization.created` | Create organization with FREE plan |
| `organization.updated` | Update organization name |
| `organizationMembership.created` | Add user to org with mapped role |
| `organizationMembership.deleted` | Log (no database action) |

### Role Mapping

```mermaid
graph LR
    subgraph ClerkRoles["Clerk Org Roles"]
        OrgAdmin["org:admin"]
        OrgAnalyst["org:analyst"]
        OrgMember["org:member"]
    end

    subgraph DBRoles["Database Roles"]
        ADMIN["ADMIN"]
        ANALYST["ANALYST"]
        VIEWER["VIEWER"]
    end

    OrgAdmin --> ADMIN
    OrgAnalyst --> ANALYST
    OrgMember --> VIEWER
```

```typescript
function mapClerkRoleToDbRole(clerkRole: string): Role {
  switch (clerkRole) {
    case 'org:admin':
      return 'ADMIN';
    case 'org:analyst':
      return 'ANALYST';
    case 'org:member':
    default:
      return 'VIEWER';
  }
}
```

---

## User Sync

### syncUser Function

**File:** `src/lib/auth/user-sync.ts`

```mermaid
sequenceDiagram
    participant Caller
    participant SyncUser as syncUser()
    participant Prisma
    participant DB as PostgreSQL

    Caller->>SyncUser: syncUser({ clerkUserId, email, clerkOrgId, role })
    SyncUser->>Prisma: findUnique(organization by clerkOrgId)
    Prisma-->>SyncUser: Organization or null

    alt Org not found
        SyncUser-->>Caller: Error: Organization not found
    else Org found
        alt useUpsert = true
            SyncUser->>Prisma: upsert(user)
        else
            SyncUser->>Prisma: findUnique(user by clerkUserId)
            alt User exists
                SyncUser->>Prisma: update(user)
            else User doesn't exist
                SyncUser->>Prisma: create(user)
            end
        end
        Prisma-->>SyncUser: User record
        SyncUser-->>Caller: User
    end
```

### syncOrganization Function

```mermaid
sequenceDiagram
    participant Caller
    participant SyncOrg as syncOrganization()
    participant Prisma
    participant DB as PostgreSQL

    Caller->>SyncOrg: syncOrganization({ clerkOrgId, name })
    SyncOrg->>Prisma: findUnique(org by clerkOrgId)

    alt Org exists
        SyncOrg->>Prisma: update({ name })
    else Org doesn't exist
        SyncOrg->>Prisma: create({ clerkOrgId, name, plan: FREE })
    end

    Prisma-->>SyncOrg: Organization
    SyncOrg-->>Caller: Organization
```

---

## Multi-Tenant Isolation

### Tenant Boundary

```mermaid
graph TB
    subgraph TenantA["Organization A"]
        UsersA["Users"]
        PatternsA["Patterns"]
        GeneratedA["Generated Complaints"]
        SubA["Subscription"]
    end

    subgraph TenantB["Organization B"]
        UsersB["Users"]
        PatternsB["Patterns"]
        GeneratedB["Generated Complaints"]
        SubB["Subscription"]
    end

    subgraph Shared["Shared Data"]
        Complaints["NHTSA Complaints"]
        GlobalPatterns["Global Patterns<br/>(organizationId = null)"]
    end

    PatternsA -.->|"references"| Complaints
    PatternsB -.->|"references"| Complaints
    GlobalPatterns -.->|"visible to all"| TenantA
    GlobalPatterns -.->|"visible to all"| TenantB
```

### Isolation Enforcement

Every API route that accesses organization-specific data must:

1. Get current user via `getCurrentUser()`
2. Verify `user.organizationId` exists
3. Include `organizationId` in all queries
4. Verify resource `organizationId` matches user's

```typescript
// Example pattern in API routes
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  // Step 1: Verify user exists
  if (!user?.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Query with tenant filter
  const patterns = await prisma.pattern.findMany({
    where: { organizationId: user.organizationId },  // Tenant isolation
  });

  return NextResponse.json({ patterns });
}
```

---

## Client Components

### ClerkProvider

Wraps the application with Clerk context.

```typescript
// src/app/layout.tsx
<ClerkProvider>
  <html>
    <body>{children}</body>
  </html>
</ClerkProvider>
```

### UserButton

Used in dashboard header for user menu.

```typescript
// src/app/(dashboard)/layout.tsx
import { UserButton } from '@clerk/nextjs';

<UserButton afterSignOutUrl="/" />
```

### Sign-In/Sign-Up Pages

Clerk provides pre-built UI components:

- `/sign-in` - `<SignIn />` component
- `/sign-up` - `<SignUp />` component

---

## Environment Variables

```bash
# Required Clerk Environment Variables
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Optional: Custom URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

---

## Security Considerations

### Webhook Verification

All Clerk webhooks are verified using Svix:

```typescript
const wh = new Webhook(webhookSecret);
const evt = wh.verify(body, {
  'svix-id': svix_id,
  'svix-timestamp': svix_timestamp,
  'svix-signature': svix_signature,
});
```

### Session Management

- Sessions managed by Clerk
- JWT tokens stored as HTTP-only cookies
- Automatic token refresh
- Server-side validation via `auth()` helper

### Data Access

- All database queries scoped to `organizationId`
- Role checks before mutations
- No cross-tenant data leakage

---

**Previous:** [03-frontend-components.md](./03-frontend-components.md) - Frontend Components
**Next:** [05-data-flow.md](./05-data-flow.md) - Data Flow
