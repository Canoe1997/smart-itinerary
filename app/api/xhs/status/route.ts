/**
 * XHS Cookie Status API
 *
 * GET /api/xhs/status
 * 检查小红书 cookies 的存在性和新鲜度。
 */
import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const COOKIE_MAX_AGE_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

function getCookiesPath(): string {
  const mcpPath = process.env.XHS_MCP_PATH ?? 'mcp-servers/xiaohongshu-mcp'
  return join(process.cwd(), mcpPath, 'cookies.json')
}

export async function GET() {
  const cookiePath = getCookiesPath()

  if (!existsSync(cookiePath)) {
    return NextResponse.json({
      connected: false,
      valid: false,
      savedAt: null,
      message: '未连接小红书',
    })
  }

  try {
    const raw = readFileSync(cookiePath, 'utf-8')
    const cookies = JSON.parse(raw)

    const hasRequiredFields = cookies.a1 && cookies.web_session
    if (!hasRequiredFields) {
      return NextResponse.json({
        connected: false,
        valid: false,
        savedAt: null,
        message: 'Cookie 文件不完整',
      })
    }

    const savedAt: string | null = cookies.saved_at ?? null
    let expired = false
    let daysRemaining: number | null = null

    if (savedAt) {
      const age = Date.now() - new Date(savedAt).getTime()
      daysRemaining = Math.max(0, COOKIE_MAX_AGE_DAYS - age / MS_PER_DAY)
      expired = age > COOKIE_MAX_AGE_DAYS * MS_PER_DAY
    }

    return NextResponse.json({
      connected: true,
      valid: !expired,
      savedAt,
      daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null,
      message: expired
        ? 'Cookie 已过期，请重新连接'
        : '小红书已连接',
    })
  } catch {
    return NextResponse.json({
      connected: false,
      valid: false,
      savedAt: null,
      message: 'Cookie 文件解析失败',
    })
  }
}
