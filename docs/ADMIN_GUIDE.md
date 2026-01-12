# CaseRadar Administrator Guide

This guide is for organization administrators who manage CaseRadar deployments, users, and configurations.

## Table of Contents

1. [Organization Setup](#organization-setup)
2. [User Management](#user-management)
3. [Role-Based Access Control](#role-based-access-control)
4. [Billing and Subscriptions](#billing-and-subscriptions)
5. [Security Configuration](#security-configuration)
6. [Data Management](#data-management)
7. [Integrations](#integrations)
8. [Monitoring and Analytics](#monitoring-and-analytics)
9. [Troubleshooting](#troubleshooting)

---

## Organization Setup

### Initial Configuration

After your organization is created:

1. **Complete Organization Profile**
   - Navigate to **Settings** > **Organization**
   - Enter organization name, address, and contact information
   - Upload organization logo (displayed in generated documents)
   - Set default jurisdiction and court preferences

2. **Configure Default Settings**
   - Default document templates
   - Default alert preferences
   - Search result limits
   - Data retention policies

3. **Set Up Domains**
   - Add allowed email domains for user sign-up
   - Configure SSO if using enterprise authentication

### Organization Hierarchy

```
Organization
├── Departments (optional grouping)
│   ├── Users
│   └── Shared Resources
├── Global Settings
├── Billing Account
└── Audit Logs
```

---

## User Management

### Inviting Users

1. Navigate to **Settings** > **Members**
2. Click **Invite Member**
3. Enter email address(es)
4. Select role (see [Roles](#role-based-access-control))
5. Click **Send Invitations**

Invitations expire after 7 days. Resend if needed.

### Managing Users

| Action | Steps |
|--------|-------|
| View User | Click user name in Members list |
| Edit Role | User page > Edit > Change role |
| Disable | User page > Actions > Disable |
| Remove | User page > Actions > Remove from Organization |

### User Status

| Status | Description |
|--------|-------------|
| Active | Full access based on role |
| Invited | Invitation sent, not yet accepted |
| Disabled | Account suspended, no access |
| Pending | Email verification required |

### Bulk Operations

For enterprise organizations:

1. **Bulk Invite**: Upload CSV with emails and roles
2. **Bulk Update**: Select multiple users, apply changes
3. **Bulk Export**: Download user list as CSV

---

## Role-Based Access Control

### Built-in Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| Owner | Full control | All permissions, billing, danger zone |
| Admin | Organization management | User management, settings, no billing |
| Manager | Team lead capabilities | View all user activity, manage team |
| Member | Standard user | Full feature access, personal data only |
| Viewer | Read-only access | Search and view only, no exports |

### Permission Matrix

| Permission | Owner | Admin | Manager | Member | Viewer |
|------------|-------|-------|---------|--------|--------|
| Search complaints | Yes | Yes | Yes | Yes | Yes |
| Generate documents | Yes | Yes | Yes | Yes | No |
| Create alerts | Yes | Yes | Yes | Yes | No |
| Export data | Yes | Yes | Yes | Yes | No |
| View all user activity | Yes | Yes | Yes | No | No |
| Manage users | Yes | Yes | No | No | No |
| Organization settings | Yes | Yes | No | No | No |
| Billing management | Yes | No | No | No | No |
| Delete organization | Yes | No | No | No | No |

### Custom Roles (Enterprise)

Enterprise organizations can create custom roles:

1. Navigate to **Settings** > **Roles**
2. Click **Create Role**
3. Name the role
4. Select permissions
5. Save

### Department Permissions

Organize users into departments with shared resources:

```
Department: Litigation Team
├── Members: 5 attorneys
├── Shared Searches: Team saved searches
├── Shared Alerts: Team notification settings
└── Shared Templates: Team document templates
```

---

## Billing and Subscriptions

### Viewing Current Plan

Navigate to **Settings** > **Billing** to see:

- Current plan and pricing
- Billing cycle dates
- Usage statistics
- Payment method

### Subscription Tiers

| Feature | Professional | Enterprise |
|---------|-------------|------------|
| Users | Up to 10 | Unlimited |
| Searches | Unlimited | Unlimited |
| Document Generation | Yes | Yes |
| API Access | Yes | Yes |
| Custom Templates | 5 | Unlimited |
| SSO/SAML | No | Yes |
| Dedicated Support | No | Yes |
| SLA | 99.5% | 99.9% |
| Price | $99/user/mo | Custom |

### Usage Tracking

Monitor organization usage:

| Metric | Description |
|--------|-------------|
| Active Users | Users who logged in this month |
| Searches | Total search queries |
| Documents | Generated documents |
| API Calls | External API requests |
| Storage | Document storage used |

### Invoices and Payments

- **View Invoices**: Billing > Invoice History
- **Download**: Click invoice for PDF
- **Update Payment**: Billing > Payment Method
- **Cancel**: Contact support (data retention: 30 days)

---

## Security Configuration

### Authentication Settings

#### Password Requirements

Configure at **Settings** > **Security**:

- Minimum length (default: 12)
- Require special characters
- Require numbers
- Password expiration (optional)

#### Multi-Factor Authentication

| Setting | Description |
|---------|-------------|
| Optional | Users can enable MFA |
| Required for Admins | Admins must use MFA |
| Required for All | All users must use MFA |

#### SSO Configuration (Enterprise)

1. Navigate to **Settings** > **Security** > **SSO**
2. Select provider (Okta, Azure AD, Google Workspace)
3. Enter SSO configuration:
   - Entity ID
   - SSO URL
   - Certificate
4. Test connection
5. Enable SSO

### Session Management

| Setting | Default | Range |
|---------|---------|-------|
| Session Timeout | 24 hours | 1-168 hours |
| Concurrent Sessions | 3 | 1-10 |
| Remember Device | 30 days | 1-90 days |

### IP Restrictions (Enterprise)

Restrict access by IP:

1. **Settings** > **Security** > **IP Allowlist**
2. Add allowed IP addresses or CIDR ranges
3. Enable enforcement

### Audit Logging

All actions are logged:

| Event Type | Examples |
|------------|----------|
| Authentication | Login, logout, MFA events |
| User Management | Invites, role changes, removals |
| Data Access | Searches, exports, document generation |
| Settings | Configuration changes |
| Security | Permission changes, IP blocks |

Access logs: **Settings** > **Audit Log**

Filter by:
- User
- Event type
- Date range
- IP address

Export logs for compliance (CSV/JSON).

---

## Data Management

### Data Retention

Configure retention policies:

| Data Type | Default | Configurable |
|-----------|---------|--------------|
| Search History | 90 days | 30-365 days |
| Generated Documents | Indefinite | 30 days - Indefinite |
| Audit Logs | 1 year | 90 days - 7 years |
| User Activity | 90 days | 30-365 days |

### Data Export

Export organization data:

1. **Settings** > **Data** > **Export**
2. Select data types:
   - User accounts
   - Saved searches
   - Generated documents
   - Audit logs
3. Choose format (JSON/CSV)
4. Initiate export
5. Download when ready (link sent via email)

### Data Deletion

Request data deletion:

1. **Settings** > **Data** > **Delete Data**
2. Select scope:
   - Specific user data
   - Inactive user data
   - All organization data
3. Confirm deletion
4. Data removed within 30 days

### Backup and Recovery

- **Automated Backups**: Daily, retained 30 days
- **Point-in-Time Recovery**: Contact support
- **Self-Service Export**: Available anytime

---

## Integrations

### API Access

Enable API access for your organization:

1. **Settings** > **Integrations** > **API**
2. Generate API key
3. Set rate limits per key
4. Configure allowed endpoints

API documentation: [API Reference](./API.md)

### Webhooks

Configure webhooks for real-time events:

1. **Settings** > **Integrations** > **Webhooks**
2. Add endpoint URL
3. Select events:
   - `pattern.detected`
   - `alert.triggered`
   - `document.generated`
   - `user.invited`
4. Set secret for verification
5. Test webhook

### Third-Party Integrations

| Integration | Description | Setup |
|-------------|-------------|-------|
| Slack | Alert notifications | OAuth connection |
| Microsoft Teams | Alert notifications | Webhook URL |
| Clio | Case management sync | API credentials |
| Salesforce | CRM integration | OAuth connection |
| Zapier | Workflow automation | API key |

---

## Monitoring and Analytics

### Organization Dashboard

Admin dashboard shows:

- Active users (daily/weekly/monthly)
- Search volume
- Document generation
- Alert activity
- Top patterns viewed

### Usage Reports

Generate reports at **Analytics** > **Reports**:

| Report | Description |
|--------|-------------|
| User Activity | Per-user search and document stats |
| Feature Usage | Which features are most used |
| Pattern Engagement | Most viewed/shared patterns |
| ROI Metrics | Documents generated, time saved |

### Health Monitoring

System status available at:

- Status page: status.caseradar.com
- Health endpoints: `/api/health`, `/api/health/db`
- Incident notifications: Subscribe via status page

---

## Troubleshooting

### Common Issues

#### User Can't Log In

1. Check user status (active/disabled)
2. Verify email is correct
3. Check if MFA is required but not set up
4. Review IP restrictions
5. Check for SSO configuration issues

#### Missing Features

1. Verify subscription tier includes feature
2. Check user role permissions
3. Review organization settings

#### Slow Performance

1. Check system status page
2. Review search complexity (simplify filters)
3. Contact support if persistent

#### Document Generation Fails

1. Check subscription includes feature
2. Verify all required fields are populated
3. Review pattern has sufficient data
4. Check template configuration

### Getting Support

#### Support Channels

| Tier | Email | Chat | Phone | Response Time |
|------|-------|------|-------|---------------|
| Professional | Yes | Yes | No | 24 hours |
| Enterprise | Yes | Yes | Yes | 4 hours |

#### Contact Information

- **Email**: support@caseradar.com
- **Enterprise Hotline**: 1-800-CASE-RAD
- **Emergency**: emergency@caseradar.com

#### Escalation Path

1. Support ticket via email/chat
2. Support manager review
3. Engineering escalation
4. Executive escalation (enterprise)

### Maintenance Windows

- **Planned Maintenance**: Sundays 2-4 AM EST
- **Notification**: 72 hours advance notice
- **Emergency**: As needed, immediate notification

---

## Compliance

### Available Certifications

- SOC 2 Type II
- GDPR Compliant
- CCPA Compliant

### Compliance Reports

Request compliance documentation:

1. **Settings** > **Security** > **Compliance**
2. Select report type
3. Accept NDA (if required)
4. Download report

### Data Processing Agreement

Enterprise customers can request a DPA:

1. Contact legal@caseradar.com
2. Provide organization details
3. Review and sign DPA
4. Receive countersigned copy

---

## Contact

- **Sales**: sales@caseradar.com
- **Support**: support@caseradar.com
- **Security**: security@caseradar.com
- **Legal**: legal@caseradar.com
