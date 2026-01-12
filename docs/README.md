# CaseRadar

Enterprise SaaS platform for law firms specializing in class action lawsuits. CaseRadar monitors NHTSA vehicle complaint data, identifies patterns using semantic analysis, and generates formal legal complaints.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/caseradar.git
cd caseradar

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Set up the database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

### Environment Variables

Required environment variables:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/caseradar"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."

# OpenAI (for embeddings)
OPENAI_API_KEY="sk-..."
```

See `.env.example` for all available configuration options.

## Features

### Core Capabilities

- **NHTSA Data Monitoring**: Automated sync with NHTSA complaint database
- **Pattern Detection**: AI-powered clustering of similar complaints
- **Trend Analysis**: Statistical detection of emerging vehicle issues
- **Legal Document Generation**: Auto-generate formal complaints from patterns
- **Alert System**: Real-time notifications for high-priority patterns

### User Tiers

| Feature | Free | Professional | Enterprise |
|---------|------|--------------|------------|
| Complaint searches | 100/mo | Unlimited | Unlimited |
| Saved searches | 5 | 50 | Unlimited |
| Pattern alerts | 3 | 25 | Unlimited |
| Document generation | No | Yes | Yes |
| API access | No | Yes | Yes |
| Custom integrations | No | No | Yes |
| Priority support | No | No | Yes |

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── complaints/       # Complaint-related components
│   ├── patterns/         # Pattern analysis components
│   └── documents/        # Document generation components
├── lib/                   # Core business logic
│   ├── analysis/         # Pattern & trend analysis
│   ├── nhtsa/            # NHTSA API integration
│   ├── documents/        # Document generation
│   └── security/         # Security utilities
├── hooks/                # Custom React hooks
└── types/                # TypeScript type definitions
```

## Documentation

- [User Guide](./USER_GUIDE.md) - End-user documentation
- [Admin Guide](./ADMIN_GUIDE.md) - Administrator documentation
- [API Reference](./API.md) - API documentation
- [Security](./SECURITY.md) - Security architecture
- [Operations](./OPERATIONS.md) - Deployment and monitoring

## Development

### Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run typecheck

# Format code
npm run format
```

### Database Management

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# Run migrations
npx prisma migrate dev

# Open Prisma Studio
npx prisma studio
```

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Configure environment variables
3. Deploy

The project includes `vercel.json` with:
- Security headers
- Cron jobs for data sync
- Optimized settings

### Docker

```bash
docker build -t caseradar .
docker run -p 3000:3000 --env-file .env caseradar
```

## API Overview

### Authentication

All API endpoints require authentication via Clerk. Include the session token in requests:

```bash
curl -H "Authorization: Bearer <token>" \
  https://your-domain.com/api/complaints
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/complaints` | GET | Search complaints |
| `/api/complaints/[id]` | GET | Get complaint details |
| `/api/patterns` | GET | List detected patterns |
| `/api/patterns/[id]` | GET | Get pattern details |
| `/api/documents` | POST | Generate legal document |
| `/api/alerts` | GET | List user alerts |

See [API Reference](./API.md) for complete documentation.

## Support

- **Documentation**: See the `docs/` directory
- **Issues**: Report bugs via GitHub Issues
- **Enterprise Support**: Contact support@caseradar.com

## License

Proprietary - All rights reserved.

## Contributing

This is a proprietary project. Contributions are welcome from authorized team members only.
