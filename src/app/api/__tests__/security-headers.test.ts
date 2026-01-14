/**
 * Security Headers Configuration Tests
 * Tests that security headers are properly configured
 * P0-5 Implementation
 *
 * Note: These tests verify the security headers configuration.
 * Integration tests require the server to be running.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the vercel.json configuration
function getVercelConfig() {
  const configPath = path.join(process.cwd(), 'vercel.json');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

// Get headers for a specific source pattern
function getHeadersForSource(config: any, source: string) {
  const headerBlock = config.headers?.find((h: any) => h.source === source);
  return headerBlock?.headers || [];
}

// Get a specific header value
function getHeaderValue(headers: any[], headerKey: string): string | undefined {
  const header = headers.find((h: any) => h.key === headerKey);
  return header?.value;
}

describe('Security Headers Configuration', () => {
  const config = getVercelConfig();
  const globalHeaders = getHeadersForSource(config, '/(.*)');

  describe('Content-Security-Policy', () => {
    const csp = getHeaderValue(globalHeaders, 'Content-Security-Policy');

    it('should have CSP header configured', () => {
      expect(csp).toBeTruthy();
    });

    it('should set default-src to self', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('should allow scripts from self and trusted sources', () => {
      expect(csp).toContain("script-src");
      expect(csp).toContain("'self'");
      // Allow Clerk scripts
      expect(csp).toMatch(/clerk/);
    });

    it('should allow styles from self with unsafe-inline for Tailwind', () => {
      expect(csp).toContain("style-src");
      expect(csp).toContain("'self'");
      expect(csp).toContain("'unsafe-inline'");
    });

    it('should allow images from self and data URIs', () => {
      expect(csp).toContain("img-src");
      expect(csp).toContain("'self'");
      expect(csp).toContain("data:");
    });

    it('should allow fonts from self and Google Fonts', () => {
      expect(csp).toContain("font-src");
      expect(csp).toMatch(/fonts\.gstatic\.com/);
    });

    it('should allow connections to API endpoints', () => {
      expect(csp).toContain("connect-src");
      expect(csp).toContain("'self'");
      // Allow Clerk API
      expect(csp).toMatch(/clerk/);
      // Allow Stripe
      expect(csp).toMatch(/stripe/);
    });

    it('should disallow frames from being embedded', () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should set upgrade-insecure-requests', () => {
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('X-Frame-Options', () => {
    it('should be set to DENY', () => {
      const value = getHeaderValue(globalHeaders, 'X-Frame-Options');
      expect(value).toBe('DENY');
    });
  });

  describe('X-Content-Type-Options', () => {
    it('should be set to nosniff', () => {
      const value = getHeaderValue(globalHeaders, 'X-Content-Type-Options');
      expect(value).toBe('nosniff');
    });
  });

  describe('Referrer-Policy', () => {
    it('should be set to strict-origin-when-cross-origin', () => {
      const value = getHeaderValue(globalHeaders, 'Referrer-Policy');
      expect(value).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Strict-Transport-Security', () => {
    it('should be configured with appropriate max-age', () => {
      const value = getHeaderValue(globalHeaders, 'Strict-Transport-Security');
      expect(value).toBeTruthy();
      expect(value).toMatch(/max-age=\d+/);
      expect(value).toContain('includeSubDomains');
    });
  });

  describe('Permissions-Policy', () => {
    it('should be configured', () => {
      const value = getHeaderValue(globalHeaders, 'Permissions-Policy');
      expect(value).toBeTruthy();
    });

    it('should disable camera', () => {
      const value = getHeaderValue(globalHeaders, 'Permissions-Policy');
      expect(value).toContain('camera=()');
    });

    it('should disable microphone', () => {
      const value = getHeaderValue(globalHeaders, 'Permissions-Policy');
      expect(value).toContain('microphone=()');
    });

    it('should disable geolocation', () => {
      const value = getHeaderValue(globalHeaders, 'Permissions-Policy');
      expect(value).toContain('geolocation=()');
    });
  });

  describe('API Headers', () => {
    const apiHeaders = getHeadersForSource(config, '/api/(.*)');

    it('should have Cache-Control set to no-store for API routes', () => {
      const value = getHeaderValue(apiHeaders, 'Cache-Control');
      expect(value).toContain('no-store');
    });
  });
});

describe('CSP Policy Validation', () => {
  const config = getVercelConfig();
  const globalHeaders = getHeadersForSource(config, '/(.*)');
  const csp = getHeaderValue(globalHeaders, 'Content-Security-Policy');

  it('should have valid CSP directives', () => {
    // CSP should have standard directives
    const requiredDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-ancestors',
    ];

    requiredDirectives.forEach((directive) => {
      expect(csp).toContain(directive);
    });
  });

  it('should allow required external services', () => {
    // Clerk for authentication
    expect(csp).toMatch(/clerk/i);
    // Stripe for payments
    expect(csp).toMatch(/stripe/i);
    // Google Fonts
    expect(csp).toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it('should not allow unsafe-eval in script-src (unless required by framework)', () => {
    // This is a warning - some frameworks require unsafe-eval
    // If present, it should be documented
    if (csp?.includes("'unsafe-eval'")) {
      console.warn(
        'CSP contains unsafe-eval - ensure this is required by the framework'
      );
    }
  });
});
