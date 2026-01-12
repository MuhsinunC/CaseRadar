/**
 * Next.js Middleware
 * Clerk authentication middleware for protecting routes
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
]);

// Define routes that require organization selection
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

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes
  if (isPublicRoute(req)) {
    return;
  }

  // Protect all other routes
  const { userId, orgId } = await auth();

  // Require authentication
  if (!userId) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.url);
    return Response.redirect(signInUrl);
  }

  // Require organization for org routes
  if (isOrgRoute(req) && !orgId) {
    const orgSelectUrl = new URL('/org-select', req.url);
    return Response.redirect(orgSelectUrl);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
