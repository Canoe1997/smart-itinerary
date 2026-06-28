/**
 * XHS Cookies API
 *
 * DELETE /api/xhs/cookies
 * 清除小红书 cookies（退出登录）。
 */
import { NextResponse } from 'next/server'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

function getCookiesPath(): string {
  const mcpPath = process.env.XHS_MCP_PATH || 'mcp-servers/xiaohongshu-mcp'
  return join(process.cwd(), mcpPath, 'cookies.json')
}

export async function DELETE() {
  const cookiePath = getCookiesPath()

  if (!existsSync(cookiePath)) {
    return NextResponse.json({ success: true, message: 'Cookie 文件不存在，无需清除' })
  }

  try {
    unlinkSync(cookiePath)
    return NextResponse.json({ success: true, message: '小红书 Cookie 已清除' })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `清除失败: ${(error as Error).message}` },
      { status: 500 },
    )
  }
}
