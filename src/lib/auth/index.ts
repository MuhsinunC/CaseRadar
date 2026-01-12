/**
 * Auth Module
 *
 * Exports for authentication and authorization
 */

// Auth middleware
export {
  withAuth,
  withRole,
  withOrganization,
  getCurrentUser,
  requireAuth,
  hasPermission,
  canAccessOrganization,
  getOrganizationId,
  composeMiddleware,
  type AuthenticatedUser,
  type AuthContext,
  type AuthenticatedHandler,
} from './auth-middleware';

// User sync
export {
  syncUser,
  syncOrganization,
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
  handleOrgCreated,
  handleOrgUpdated,
  handleOrgMembershipCreated,
  handleOrgMembershipDeleted,
  processClerkWebhook,
  type ClerkWebhookEvent,
  type SyncUserInput,
  type SyncOrgInput,
} from './user-sync';
