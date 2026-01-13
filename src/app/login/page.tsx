import { redirect } from 'next/navigation';

/**
 * Login redirect page
 * Clerk dashboard may be configured to redirect to /login after sign-in.
 * This page redirects authenticated users to the dashboard.
 */
export default function LoginPage() {
  redirect('/dashboard');
}
