/**
 * 行程 HTML 渲染 — PDF 和预览面板共享
 *
 * 将行程 Markdown 转为带样式的 HTML。
 * PDF 生成器和前端预览面板使用同一模板，确保视觉一致。
 */
import { marked } from 'marked'

/** 转义 HTML 特殊字符（防止 XSS） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ITINERARY_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #1a1a2e;
    padding: 24px;
    line-height: 1.8;
    background: #fff;
  }
  .header {
    text-align: center;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 3px solid #DA7756;
  }
  .header h1 {
    font-size: 24px;
    color: #1B1B1B;
    margin-bottom: 8px;
    font-weight: 700;
  }
  .header .subtitle {
    color: #6B6B6B;
    font-size: 13px;
  }
  .content h1, .content h2, .content h3 {
    color: #1B1B1B;
    margin-top: 24px;
    margin-bottom: 12px;
    page-break-after: avoid;
  }
  .content h1 { font-size: 22px; border-bottom: 2px solid #E8E7E5; padding-bottom: 8px; font-weight: 700; }
  .content h2 { font-size: 18px; font-weight: 600; }
  .content h3 { font-size: 16px; color: #DA7756; font-weight: 600; }
  .content p { margin-bottom: 12px; color: #374151; }
  .content ul, .content ol {
    margin-left: 24px;
    margin-bottom: 12px;
  }
  .content li { margin-bottom: 6px; color: #374151; }
  .content strong { color: #1B1B1B; font-weight: 600; }
  .content em { color: #6B6B6B; }
  .content blockquote {
    border-left: 4px solid #DA7756;
    padding: 12px 16px;
    margin: 16px 0;
    color: #4b5563;
    background: #FAFAF8;
    border-radius: 0 8px 8px 0;
  }
  .content code {
    background: #F0EFED;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }
  .content pre {
    background: #F5F4F2;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
  }
  .content pre code { background: none; padding: 0; }
  .content table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
  }
  .content th, .content td {
    border: 1px solid #E8E7E5;
    padding: 8px 12px;
    text-align: left;
    font-size: 14px;
  }
  .content th { background: #FAFAF8; color: #1B1B1B; font-weight: 600; }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #E8E7E5;
    text-align: center;
    color: #9CA3AF;
    font-size: 12px;
  }
`

/**
 * 将行程 Markdown 渲染为带样式的 HTML
 */
export function renderItineraryHtml(markdown: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const htmlContent = marked.parse(markdown) as string

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>${ITINERARY_STYLES}</style>
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
