/**
 * 对话消息 API — 查询
 *
 * GET /api/conversations/:id/messages — 获取指定对话的所有消息
 */
import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { data, error } = await getSupabase()
      .from('messages')
      .select('id, role, content, tool_calls, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('查询消息失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: data })
  } catch (error) {
    console.error('查询消息 API 错误:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
