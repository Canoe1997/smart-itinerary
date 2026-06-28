/**
 * 单个对话 API — 删除
 *
 * DELETE /api/conversations/:id — 删除指定对话
 */
import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { error } = await getSupabase()
      .from('conversations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('删除对话失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除对话 API 错误:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
