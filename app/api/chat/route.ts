/**
 * 聊天 API — SSE 流式端点
 *
 * POST /api/chat
 * 接收用户消息，创建 Orchestrator，返回 SSE 流式响应。
 * 支持 conversationId 将消息持久化到 Supabase。
 */
import { handleChatRequest, processChatRequest } from '@/lib/agent-adapter'
import { getSupabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, conversationId } = body as {
      message: string
      conversationId?: string
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const preferencesSummary = body.preferences as string | undefined

    if (conversationId) {
      const { response, toolCalls } = await processChatRequest(
        message.trim(),
        preferencesSummary,
      )

      // 写入 Supabase（异步，不阻塞响应）
      const writePromise = getSupabase().from('messages').insert([
        {
          conversation_id: conversationId,
          role: 'user',
          content: message.trim(),
        },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: response,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
        },
      ])

      // 更新对话标题（如果还是"新对话"）
      const titlePromise = getSupabase()
        .from('conversations')
        .select('title')
        .eq('id', conversationId)
        .single()
        .then(({ data }) => {
          if (data?.title === '新对话') {
            const shortTitle = message.trim().slice(0, 30)
            return getSupabase()
              .from('conversations')
              .update({ title: shortTitle })
              .eq('id', conversationId)
          }
        })

      // 不 await，让写入和流式响应并行
      Promise.all([writePromise, titlePromise]).catch(() => {})

      return handleChatRequest(message.trim(), preferencesSummary)
    }

    return handleChatRequest(message.trim(), preferencesSummary)
  } catch (error) {
    console.error('Chat API 错误:', error)
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
