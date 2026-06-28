import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [],
  serverExternalPackages: ['puppeteer', 'ws', '@anthropic-ai/sdk'],
}

export default nextConfig
