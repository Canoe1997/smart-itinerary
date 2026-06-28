/**
 * XHS Puppeteer Login API
 *
 * POST /api/xhs/login
 * 启动 Puppeteer 浏览器窗口，打开小红书，等待用户登录后自动提取 cookies。
 */
import { NextResponse } from 'next/server'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const POLL_INTERVAL_MS = 2_000 // 2 seconds
const REQUIRED_COOKIES = ['a1', 'web_session'] as const

let loginInProgress = false

function getCookiesPath(): string {
  const mcpPath = process.env.XHS_MCP_PATH || 'mcp-servers/xiaohongshu-mcp'
  return join(process.cwd(), mcpPath, 'cookies.json')
}

function getUserDataDir(): string {
  const dir = join(process.cwd(), '.xhs-browser-data')
  mkdirSync(dir, { recursive: true })
  return dir
}

function findChromePath(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require('fs') as typeof import('fs')
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  return candidates.find((p: string) => existsSync(p))
}

export async function POST() {
  if (loginInProgress) {
    return NextResponse.json(
      { success: false, message: '登录流程已在进行中，请在弹出的浏览器窗口中完成登录' },
      { status: 409 },
    )
  }

  loginInProgress = true

  try {
    const chromePath = findChromePath()
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      ...(chromePath ? { executablePath: chromePath } : {}),
      userDataDir: getUserDataDir(),
    })

    const page = await browser.newPage()
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' })

    // Poll for cookies until all required ones appear or timeout
    const startTime = Date.now()
    let cookiesFound = false

    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

      const allCookies = await page.cookies('https://www.xiaohongshu.com')
      const cookieMap: Record<string, string> = {}
      for (const c of allCookies) {
        cookieMap[c.name] = c.value
      }

      const hasAll = REQUIRED_COOKIES.every((name) => cookieMap[name])
      if (hasAll) {
        cookiesFound = true

        // Build cookies object with required fields
        const cookiesData = {
          a1: cookieMap['a1'],
          web_session: cookieMap['web_session'],
          webId: cookieMap['webId'] ?? cookieMap['web_id'] ?? '',
          saved_at: new Date().toISOString(),
        }

        const cookiesPath = getCookiesPath()
        writeFileSync(cookiesPath, JSON.stringify(cookiesData, null, 2), 'utf-8')

        await browser.close()

        return NextResponse.json({
          success: true,
          message: '小红书登录成功，Cookie 已保存',
          savedAt: cookiesData.saved_at,
        })
      }
    }

    // Timeout
    await browser.close()
    return NextResponse.json({
      success: false,
      message: '登录超时（5分钟），请重试',
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: `登录失败: ${(error as Error).message}`,
    })
  } finally {
    loginInProgress = false
  }
}
