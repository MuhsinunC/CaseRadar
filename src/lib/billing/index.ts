/**
 * Billing Module
 *
 * Exports for subscription and billing management
 */

// Billing service
export {
  createStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  cancelSubscription,
  updateSubscription,
  getPlanLimits,
  checkPlanLimit,
  mapPriceToPlan,
  type PlanLimits,
  type CreateCustomerInput,
  type CheckoutSessionInput,
  type BillingPortalInput,
  type CancelSubscriptionInput,
  type UpdateSubscriptionInput,
  type CheckPlanLimitInput,
  type CheckPlanLimitResult,
} from './billing-service';

// Webhook handlers
export {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  processStripeWebhook,
  type StripeWebhookEvent,
} from './subscription-webhook';
