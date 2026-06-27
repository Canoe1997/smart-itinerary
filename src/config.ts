/**
 * Smart Itinerary 配置
 *
 * 所有环境变量集中管理，启动时校验必填项。
 */
import 'dotenv/config'

export interface AppConfig {
  /** 小米 MiMo API Key */
  mimoApiKey: string
  /** MiMo Anthropic 端点 (纯对话) */
  mimoBaseUrl: string
  /** MiMo OpenAI 端点 (Function Calling) */
  mimoOpenaiBaseUrl: string
  /** 使用的模型名称 */
  mimoModel: string
  /** 小红书 MCP 服务路径 */
  xhsMcpPath: string
  /** Supabase 连接字符串 (可选，Phase 1.3 启用) */
  supabaseUrl?: string
  supabaseKey?: string
  /** 高德地图 Web 服务 Key (可选，Phase 1.4 启用) */
  amapKey?: string
}

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`缺少必要环境变量: ${key}。请在 .env 文件中配置。`)
  }
  return value
}

function optionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key]
  return value && value.trim() !== '' ? value : defaultValue
}

export function loadConfig(): AppConfig {
  return {
    mimoApiKey: requireEnv('MIMO_API_KEY'),
    mimoBaseUrl: optionalEnv('MIMO_BASE_URL', 'https://api.xiaomimimo.com/anthropic'),
    mimoOpenaiBaseUrl: optionalEnv('MIMO_OPENAI_BASE_URL', 'https://api.xiaomimimo.com/openai'),
    mimoModel: optionalEnv('MIMO_MODEL', 'mimo-v2.5-pro'),
    xhsMcpPath: optionalEnv('XHS_MCP_PATH', 'mcp-servers/xiaohongshu-mcp'),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    amapKey: process.env.AMAP_KEY,
  }
}
