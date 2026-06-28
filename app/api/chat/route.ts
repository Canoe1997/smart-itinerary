/**
 * 聊天 API — SSE 流式端点
 *
 * POST /api/chat
 * 接收用户消息，创建 Orchestrator，返回 SSE 流式响应。
 * 支持 conversationId 将消息持久化到 Supabase。
 */
import { handleChatRequest, type ToolCallEvent } from '@/lib/agent-adapter'
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

    // 流结束后写入 Supabase（通过 onComplete 回调，只运行一次 Agent）
    const onComplete = conversationId
      ? (result: { response: string; toolCalls: ToolCallEvent[] }) => {
          saveToSupabase(conversationId, message.trim(), result).catch(() => {})
        }
      : undefined

    return handleChatRequest(message.trim(), preferencesSummary, onComplete)
  } catch (error) {
    console.error('Chat API 错误:', error)
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function saveToSupabase(
  conversationId: string,
  userMessage: string,
  result: { response: string; toolCalls: ToolCallEvent[] },
) {
  await getSupabase().from('messages').insert([
    { conversation_id: conversationId, role: 'user', content: userMessage },
    {
      conversation_id: conversationId,
      role: 'assistant',
      content: result.response,
      tool_calls: result.toolCalls.length > 0 ? result.toolCalls : null,
    },
  ])

  // 自动更新对话标题
  const { data } = await getSupabase()
    .from('conversations')
    .select('title')
    .eq('id', conversationId)
    .single()

  if (data?.title === '新对话') {
    await getSupabase()
      .from('conversations')
      .update({ title: userMessage.slice(0, 30) })
      .eq('id', conversationId)
  }
}
