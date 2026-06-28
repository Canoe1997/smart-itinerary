/**
 * 对话管理 API — 列表与创建
 *
 * GET  /api/conversations     — 获取最近 50 个对话
 * POST /api/conversations     — 创建新对话
 */
import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('查询对话列表失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversations: data })
  } catch (error) {
    console.error('查询对话列表 API 错误:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const rawTitle = body.title
    const title =
      typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, 200)
        : '新对话'

    const { data, error } = await getSupabase()
      .from('conversations')
      .insert({ title })
      .select('id, title, created_at, updated_at')
      .single()

    if (error) {
      console.error('创建对话失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversation: data })
  } catch (error) {
    console.error('创建对话 API 错误:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
