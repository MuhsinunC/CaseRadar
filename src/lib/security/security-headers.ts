/**
 * Security Headers Configuration
 * HTTP security headers for XSS, clickjacking, and other attack prevention
 */

export interface SecurityHeaders {
  'X-DNS-Prefetch-Control': string;
  'Strict-Transport-Security': string;
  'X-Frame-Options': string;
  'X-Content-Type-Options': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  [key: string]: string;
}

export interface CSPOptions {
  production?: boolean;
  nonce?: string;
  reportUri?: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
}

const REQUIRED_HEADERS = [
  'X-DNS-Prefetch-Control',
  'Strict-Transport-Security',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
];

/**
 * Get all required security headers
 */
export function getSecurityHeaders(): SecurityHeaders {
  return {
    // Disable DNS prefetching to prevent privacy leaks
    'X-DNS-Prefetch-Control': 'off',

    // Enforce HTTPS for 2 years, include subdomains, allow preloading
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',

    // Prevent clickjacking by denying framing
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restrict browser features
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  };
}

/**
 * Generate Content-Security-Policy header
 */
export function getCSPHeader(options: CSPOptions = {}): string {
  const { production = false, nonce, reportUri } = options;

  const directives: string[] = [
    // Default fallback - only allow same origin
    "default-src 'self'",

    // Scripts - self and optionally with nonce for inline scripts
    nonce ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self'",

    // Styles - self and unsafe-inline for CSS-in-JS (common in Next.js)
    "style-src 'self' 'unsafe-inline'",

    // Images - self, data URIs, and HTTPS
    "img-src 'self' data: https:",

    // Fonts - self and common CDNs
    "font-src 'self' https://fonts.gstatic.com",

    // Connect - self and API endpoints
    "connect-src 'self' https://api.clerk.dev https://api.stripe.com",

    // Object - none (disable plugins)
    "object-src 'none'",

    // Base URI - self only
    "base-uri 'self'",

    // Form action - self only
    "form-action 'self'",

    // Frame ancestors - none (prevent embedding)
    "frame-ancestors 'none'",
  ];

  // Add upgrade-insecure-requests in production
  if (production) {
    directives.push('upgrade-insecure-requests');
  }

  // Add report URI if provided
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Validate that all required security headers are present
 */
export function validateSecurityHeaders(
  headers: Record<string, string>
): ValidationResult {
  const missing: string[] = [];

  for (const header of REQUIRED_HEADERS) {
    if (!headers[header]) {
      missing.push(header);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get headers for Next.js middleware
 */
export function getNextSecurityHeaders(): { key: string; value: string }[] {
  const headers = getSecurityHeaders();
  const csp = getCSPHeader({ production: process.env.NODE_ENV === 'production' });

  return [
    ...Object.entries(headers).map(([key, value]) => ({ key, value })),
    { key: 'Content-Security-Policy', value: csp },
  ];
}
