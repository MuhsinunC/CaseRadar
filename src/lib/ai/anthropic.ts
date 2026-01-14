/**
 * Anthropic Client Wrapper
 * Provides a centralized Anthropic client instance for the application.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Initialized Anthropic client
 * Uses ANTHROPIC_API_KEY from environment variables
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Check if Anthropic is configured
 */
export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
