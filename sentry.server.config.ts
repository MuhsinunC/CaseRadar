/**
 * Sentry Server Configuration
 * This file configures the initialization of Sentry on the server side.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Debug mode in development
    debug: process.env.NODE_ENV === 'development',

    // Ignore common non-critical errors
    ignoreErrors: [
      // Network errors
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      // Database connection errors (handled separately)
      'PrismaClientKnownRequestError',
    ],

    // Sanitize sensitive data before sending
    beforeSend(event) {
      // Remove sensitive environment variables from context
      if (event.contexts?.runtime) {
        delete event.contexts.runtime;
      }

      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }

      // Remove sensitive data from extras
      if (event.extra) {
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key'];
        for (const key of sensitiveKeys) {
          if (key in event.extra) {
            event.extra[key] = '[REDACTED]';
          }
        }
      }

      return event;
    },

    // Server-specific integrations
    integrations: [
      // Capture unhandled promise rejections
      Sentry.onUnhandledRejectionIntegration(),
    ],
  });
}
