/**
 * Next.js Middleware
 * Clerk authentication middleware for protecting routes
 *
 * Uses Clerk's official middleware with custom URL configuration
 * to fix redirect issues in K8s where req.url has 0.0.0.0
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Get the app URL for proper redirects (fixes 0.0.0.0 issue in K8s)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// E2E Testing mode - bypass all auth (set via NEXT_PUBLIC_ so it's available in edge runtime)
const IS_E2E_TESTING = process.env.NEXT_PUBLIC_E2E_TESTING === 'true';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/api/webhooks',
  '/api/health',
  '/api/cron',
];

/**
 * Check if a path is a public route
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );
}

/**
 * Check if Clerk is properly configured at runtime
 */
function isClerkConfigured(): boolean {
  const clerkSecret = process.env.CLERK_SECRET_KEY || '';
  return clerkSecret.length > 0 && !clerkSecret.includes('REPLACE_ME');
}

/**
 * Main middleware function
 * Checks Clerk configuration at runtime and either bypasses auth or uses Clerk
 */
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Debug: Add response header to show middleware is running
  const response = NextResponse.next();
  response.headers.set('X-Middleware-Run', 'true');
  response.headers.set('X-Clerk-Configured', String(isClerkConfigured()));
  response.headers.set('X-E2E-Testing', String(IS_E2E_TESTING));

  // E2E Testing bypass - skip all auth checks
  if (IS_E2E_TESTING) {
    console.warn('[MIDDLEWARE] E2E Testing mode - bypassing auth');
    response.headers.set('X-Auth-Bypass', 'e2e-testing');
    return response;
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return response;
  }

  // Skip static files
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return response;
  }

  // Check if Clerk is configured at runtime
  if (!isClerkConfigured()) {
    console.warn('[MIDDLEWARE] Clerk not configured - bypassing auth for development');
    response.headers.set('X-Auth-Bypass', 'true');
    return response;
  }

  // Clerk is configured - use dynamic import for Clerk middleware
  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');

  const clerkIsPublicRoute = createRouteMatcher([
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/webhooks(.*)',
    '/api/health',
    '/api/health/(.*)',
    '/api/cron/(.*)',
  ]);

  const clerkHandler = clerkMiddleware(
    async (auth, req) => {
      if (clerkIsPublicRoute(req)) {
        return;
      }

      const { userId } = await auth();

      if (!userId) {
        const reqPathname = req.nextUrl.pathname;
        const redirectUrl = `${APP_URL}${reqPathname}`;
        const signInUrlStr = `${APP_URL}/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`;
        return NextResponse.redirect(new URL(signInUrlStr));
      }

      return NextResponse.next();
    },
    {
      signInUrl: `${APP_URL}/sign-in`,
      signUpUrl: `${APP_URL}/sign-up`,
      afterSignInUrl: `${APP_URL}/dashboard`,
      afterSignUpUrl: `${APP_URL}/dashboard`,
    }
  );

  return clerkHandler(request, {} as any);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
