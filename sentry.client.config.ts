/**
 * Sentry Client Configuration
 * This file configures the initialization of Sentry on the client side.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Debug mode in development
    debug: process.env.NODE_ENV === 'development',

    // Ignore common non-critical errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Network errors
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      // Third-party scripts
      'Script error',
      // Clerk-related
      'ClerkJS',
    ],

    // Filter out non-essential breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      // Filter out console logs in production
      if (
        process.env.NODE_ENV === 'production' &&
        breadcrumb.category === 'console'
      ) {
        return null;
      }
      return breadcrumb;
    },

    // Sanitize sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Remove sensitive query params
      if (event.request?.query_string) {
        const params = new URLSearchParams(event.request.query_string);
        params.delete('token');
        params.delete('api_key');
        event.request.query_string = params.toString();
      }

      return event;
    },

    integrations: [
      Sentry.replayIntegration({
        // Mask all text in session replays
        maskAllText: true,
        // Block all media in session replays
        blockAllMedia: true,
      }),
    ],
  });
}
