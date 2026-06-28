import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer', 'ws', '@anthropic-ai/sdk'],
  webpack: (config) => {
    // 现有源码使用 .js 扩展名导入（TypeScript ESM 惯例）
    // 需要让 webpack 将 .js 解析到 .ts 文件
    config.resolve = config.resolve ?? {}
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default nextConfig
