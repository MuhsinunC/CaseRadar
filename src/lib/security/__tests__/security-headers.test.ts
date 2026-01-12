/**
 * Security Headers Tests
 * Tests for HTTP security headers configuration
 */

import { describe, it, expect } from 'vitest';
import {
  getSecurityHeaders,
  getCSPHeader,
  validateSecurityHeaders,
} from '../security-headers';

describe('Security Headers', () => {
  describe('getSecurityHeaders', () => {
    it('should return all required security headers', () => {
      const headers = getSecurityHeaders();

      expect(headers).toHaveProperty('X-DNS-Prefetch-Control');
      expect(headers).toHaveProperty('Strict-Transport-Security');
      expect(headers).toHaveProperty('X-Frame-Options');
      expect(headers).toHaveProperty('X-Content-Type-Options');
      expect(headers).toHaveProperty('Referrer-Policy');
      expect(headers).toHaveProperty('Permissions-Policy');
    });

    it('should set X-DNS-Prefetch-Control to off', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-DNS-Prefetch-Control']).toBe('off');
    });

    it('should set Strict-Transport-Security with max-age', () => {
      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('max-age=');
      expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    });

    it('should set X-Frame-Options to DENY or SAMEORIGIN', () => {
      const headers = getSecurityHeaders();
      expect(['DENY', 'SAMEORIGIN']).toContain(headers['X-Frame-Options']);
    });

    it('should set X-Content-Type-Options to nosniff', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should set appropriate Referrer-Policy', () => {
      const headers = getSecurityHeaders();
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should include Permissions-Policy', () => {
      const headers = getSecurityHeaders();
      expect(headers['Permissions-Policy']).toBeDefined();
      expect(headers['Permissions-Policy']).toContain('camera=()');
      expect(headers['Permissions-Policy']).toContain('microphone=()');
    });
  });

  describe('getCSPHeader', () => {
    it('should return a valid Content-Security-Policy', () => {
      const csp = getCSPHeader();

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('script-src');
      expect(csp).toContain('style-src');
      expect(csp).toContain('img-src');
    });

    it('should allow self for default-src', () => {
      const csp = getCSPHeader();
      expect(csp).toContain("default-src 'self'");
    });

    it('should configure script-src appropriately', () => {
      const csp = getCSPHeader();
      expect(csp).toContain("script-src 'self'");
    });

    it('should configure style-src appropriately', () => {
      const csp = getCSPHeader();
      expect(csp).toContain('style-src');
    });

    it('should allow data: URIs for images', () => {
      const csp = getCSPHeader();
      expect(csp).toContain('img-src');
      expect(csp).toContain('data:');
    });

    it('should block frame-ancestors by default', () => {
      const csp = getCSPHeader();
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should include upgrade-insecure-requests in production', () => {
      const csp = getCSPHeader({ production: true });
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('validateSecurityHeaders', () => {
    it('should return true for valid headers', () => {
      const headers = getSecurityHeaders();
      const result = validateSecurityHeaders(headers);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should detect missing required headers', () => {
      const headers = { 'X-Frame-Options': 'DENY' };
      const result = validateSecurityHeaders(headers);
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should list all missing headers', () => {
      const headers = {};
      const result = validateSecurityHeaders(headers);
      expect(result.missing).toContain('Strict-Transport-Security');
      expect(result.missing).toContain('X-Frame-Options');
      expect(result.missing).toContain('X-Content-Type-Options');
    });
  });
});
