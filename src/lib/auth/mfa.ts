/**
 * MFA Enforcement
 * P2-3 Implementation
 *
 * Provides utilities for enforcing Multi-Factor Authentication
 * for administrative users.
 */

import { clerkClient } from '@clerk/nextjs/server';

/**
 * Roles that require MFA to be enabled
 */
export const MFA_REQUIRED_ROLES: readonly string[] = ['ADMIN'] as const;

/**
 * MFA status for a user
 */
export interface MFAStatus {
  /** User ID */
  userId: string;
  /** Whether MFA is enabled */
  enabled: boolean;
  /** Error message if check failed */
  error?: string;
}

/**
 * Check if a role requires MFA
 *
 * @param role - User role to check
 * @returns True if the role requires MFA
 */
export function isMFARequired(role: string): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

/**
 * Check if any of the user's roles require MFA
 *
 * @param roles - Array of user roles
 * @returns True if any role requires MFA
 */
export function anyRoleRequiresMFA(roles: string[]): boolean {
  return roles.some((role) => isMFARequired(role));
}

/**
 * Check MFA status for a user
 *
 * @param userId - Clerk user ID
 * @returns MFA status object
 */
export async function checkMFAStatus(userId: string): Promise<MFAStatus> {
  try {
    const client = clerkClient();
    const user = await client.users.getUser(userId);

    return {
      userId,
      enabled: user.twoFactorEnabled ?? false,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return {
      userId,
      enabled: false,
      error: errorMessage,
    };
  }
}

/**
 * Enforce MFA for a user with the given role
 *
 * @param userId - Clerk user ID
 * @param role - User's role
 * @returns Object with pass/fail and optional error message
 */
export async function enforceMFA(
  userId: string,
  role: string
): Promise<{ allowed: boolean; reason?: string }> {
  // If role doesn't require MFA, allow
  if (!isMFARequired(role)) {
    return { allowed: true };
  }

  // Check MFA status
  const status = await checkMFAStatus(userId);

  if (status.error) {
    return {
      allowed: false,
      reason: `MFA status check failed: ${status.error}`,
    };
  }

  if (!status.enabled) {
    return {
      allowed: false,
      reason: 'MFA required for administrators. Please enable two-factor authentication in your account settings.',
    };
  }

  return { allowed: true };
}

/**
 * Create 403 response for MFA requirement
 *
 * @param reason - Reason for denial
 * @returns Response object with 403 status
 */
export function createMFARequiredResponse(reason: string): Response {
  return new Response(
    JSON.stringify({
      type: 'https://api.caseradar.com/errors/mfa-required',
      title: 'MFA Required',
      status: 403,
      detail: reason,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  );
}
