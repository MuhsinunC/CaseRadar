# CaseRadar

AI-powered SaaS platform for law firms to monitor NHTSA vehicle complaints, identify class action patterns, and generate legal complaints.

## Features

- **Real-Time Monitoring**: Continuously monitor NHTSA complaint database for new filings
- **AI Pattern Detection**: Semantic clustering identifies similar complaints across vehicles, components, and time periods
- **Auto-Generate Complaints**: Generate court-ready class action complaints with proper legal structure
- **Multi-Tenant**: Full RBAC and organization support for law firms
- **Enterprise Ready**: SOC 2 compliant vendors, audit logging, and security best practices

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, shadcn/ui, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL with pgvector (Supabase)
- **Auth**: Clerk
- **Billing**: Stripe
- **AI**: OpenAI (embeddings), Claude (complaint generation)
- **Hosting**: Vercel + Railway

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for local development)
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/caseradar.git
   cd caseradar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Start the database:
   ```bash
   docker compose up -d postgres
   ```

5. Run database migrations:
   ```bash
   npm run db:push
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000)

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run E2E tests
- `npm run db:studio` - Open Prisma Studio

## Project Structure

```
caseradar/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   └── ui/          # shadcn/ui components
│   ├── lib/             # Utility functions
│   └── test/            # Test utilities
├── prisma/              # Database schema
├── e2e/                 # Playwright E2E tests
├── docs/                # Project documentation
└── docker/              # Docker configuration
```

## Documentation

- [Architecture Plan](./docs/PLAN_v2.md)
- [Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md)
- [Test Strategy](./docs/TEST_STRATEGY.md)
- [Research Documents](./docs/research/)

## License

Proprietary - All rights reserved.
