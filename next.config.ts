import type { NextConfig } from "next";

/**
 * Security headers configuration
 * Based on architecture documentation: 09-security-compliance.md
 */
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.stripe.com",
      "font-src 'self'",
      "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://api.stripe.com https://api.openai.com https://api.anthropic.com",
      "frame-src 'self' https://js.stripe.com https://*.clerk.accounts.dev",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  // Creates a minimal production build with all dependencies
  output: 'standalone',

  // Security headers for all routes
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  // Strict mode for better React practices
  reactStrictMode: true,

  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },

  // External packages that should not be bundled (use native require at runtime)
  // This prevents Turbopack from trying to resolve optional dependencies like AWS SDK
  serverExternalPackages: ['unzipper'],

  // Empty turbopack config to silence the warning about webpack config
  turbopack: {},

  // Webpack configuration for handling optional dependencies (fallback for non-Turbopack builds)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark AWS SDK as external - it's an optional dependency of unzipper
      // that we don't use (we're not loading files from S3)
      config.externals = config.externals || [];
      config.externals.push({
        '@aws-sdk/client-s3': 'commonjs @aws-sdk/client-s3',
      });
    }
    return config;
  },
};

export default nextConfig;
