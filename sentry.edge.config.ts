/**
 * Sentry Edge Configuration
 * This file configures the initialization of Sentry for Edge runtime.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Performance Monitoring (lower rate for edge)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // Debug mode in development
    debug: process.env.NODE_ENV === 'development',
  });
}
