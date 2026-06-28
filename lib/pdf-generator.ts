/**
 * PDF 生成器 — Puppeteer 服务端渲染
 *
 * 将行程 Markdown 转为精美的 A4 PDF。
 */
import puppeteer from 'puppeteer'
import { marked } from 'marked'
import { existsSync } from 'fs'

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

/** 转义 HTML 特殊字符（防止 XSS） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 将行程 Markdown 渲染为 HTML（带打印优化样式） */
function renderItineraryHtml(markdown: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const htmlContent = marked.parse(markdown) as string

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      color: #1a1a2e;
      padding: 40px;
      line-height: 1.8;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 3px solid #3b82f6;
    }
    .header h1 {
      font-size: 28px;
      color: #1e40af;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .content h1, .content h2, .content h3 {
      color: #1e40af;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    .content h1 { font-size: 24px; border-bottom: 2px solid #dbeafe; padding-bottom: 8px; }
    .content h2 { font-size: 20px; }
    .content h3 { font-size: 17px; color: #3b82f6; }
    .content p { margin-bottom: 12px; }
    .content ul, .content ol {
      margin-left: 24px;
      margin-bottom: 12px;
    }
    .content li { margin-bottom: 6px; }
    .content strong { color: #1e40af; }
    .content em { color: #6b7280; }
    .content blockquote {
      border-left: 4px solid #3b82f6;
      padding-left: 16px;
      margin: 16px 0;
      color: #4b5563;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .content th, .content td {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      text-align: left;
    }
    .content th { background: #eff6ff; color: #1e40af; }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      .content h2 { page-break-before: auto; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🗺️ ${safeTitle}</h1>
    <p class="subtitle">由「小旅」AI 旅行规划师生成 · ${new Date().toLocaleDateString('zh-CN')}</p>
  </div>
  <div class="content">${htmlContent}</div>
  <div class="footer">
    <p>基于小红书真实攻略 · Powered by Smart Itinerary</p>
  </div>
</body>
</html>`
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
