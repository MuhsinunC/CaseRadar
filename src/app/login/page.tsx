import { redirect } from 'next/navigation';

// Force dynamic to avoid static build issues with Clerk middleware
export const dynamic = 'force-dynamic';

/**
 * Login redirect page
 * Clerk dashboard may be configured to redirect to /login after sign-in.
 * This page redirects authenticated users to the dashboard.
 */
export default function LoginPage() {
  redirect('/dashboard');
}
