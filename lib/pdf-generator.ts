/**
 * PDF 生成器 — Puppeteer 服务端渲染
 *
 * 将行程 Markdown 转为精美的 A4 PDF。
 * HTML 模板由 lib/itinerary-html.ts 共享，确保预览和 PDF 一致。
 */
import puppeteer from 'puppeteer'
import { existsSync } from 'fs'
import { renderItineraryHtml } from './itinerary-html.js'

/** 查找系统 Chrome 路径（macOS / Linux） */
function findChromePath(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  return candidates.find((p) => existsSync(p))
}

/**
 * 生成 PDF Buffer
 */
export async function generatePdf(markdown: string, title: string): Promise<Buffer> {
  const chromePath = findChromePath()
  const browser = await puppeteer.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    const html = renderItineraryHtml(markdown, title)
    await page.setContent(html, { waitUntil: 'load' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
