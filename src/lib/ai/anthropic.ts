/**
 * Anthropic Client Wrapper
 * Provides a centralized Anthropic client instance for the application.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Lazy-initialized Anthropic client
 * Uses ANTHROPIC_API_KEY from environment variables
 */
let _anthropic: Anthropic | null = null;

/**
 * Get the Anthropic client (lazy initialization)
 */
export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use getAnthropic() instead
 */
export const anthropic = {
  get messages() {
    return getAnthropic().messages;
  },
};

/**
 * Check if Anthropic is configured
 */
export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
