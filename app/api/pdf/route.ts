/**
 * PDF 导出 API
 *
 * POST /api/pdf
 * 接收行程 Markdown，返回 PDF 文件下载。
 */
import { generatePdf } from '@/lib/pdf-generator'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { itinerary, title = '旅行行程单' } = body as {
      itinerary: string
      title?: string
    }

    if (!itinerary || typeof itinerary !== 'string' || !itinerary.trim()) {
      return new Response(JSON.stringify({ error: '行程内容不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (typeof title !== 'string' || title.length > 200) {
      return new Response(JSON.stringify({ error: '标题过长（最多200字符）' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const pdf = await generatePdf(itinerary, title)

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF 生成错误:', error)
    return new Response(JSON.stringify({ error: 'PDF 生成失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
