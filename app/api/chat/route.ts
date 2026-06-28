/**
 * 聊天 API — SSE 流式端点
 *
 * POST /api/chat
 * 接收用户消息，创建 Orchestrator，返回 SSE 流式响应。
 */
import { handleChatRequest } from '@/lib/agent-adapter'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message } = body as { message: string }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 偏好通过请求体传递（服务端无法直接读取客户端 Zustand store）
    const preferencesSummary = body.preferences as string | undefined

    return handleChatRequest(message.trim(), preferencesSummary)
  } catch (error) {
    console.error('Chat API 错误:', error)
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
