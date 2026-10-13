import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: false,
  // mppx lazily imports optional peers (MCP SDK, x402) for transports Korrin does not use on these routes.
  serverExternalPackages: ['mppx'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
    resolveAlias: {
      '@coinbase/cdp-sdk': './src/lib/stubs/cdp-sdk.js',
    },
  },
}

export default nextConfig
