-- Initialize CaseRadar Database
-- This script runs when the PostgreSQL container is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create a read-only user for analytics (optional)
-- CREATE USER caseradar_readonly WITH PASSWORD 'readonly_password';
-- GRANT CONNECT ON DATABASE caseradar TO caseradar_readonly;
-- GRANT USAGE ON SCHEMA public TO caseradar_readonly;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO caseradar_readonly;

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'CaseRadar database initialized successfully with pgvector extension';
END $$;
