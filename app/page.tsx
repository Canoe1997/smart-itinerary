import { redirect } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function Home() {
  try {
    const { data } = await getSupabase()
      .from('conversations')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      redirect(`/chat/${data.id}`)
    }

    const { data: created } = await getSupabase()
      .from('conversations')
      .insert({ title: '新对话' })
      .select('id')
      .single()

    if (created) {
      redirect(`/chat/${created.id}`)
    }
  } catch {
    // Supabase 未配置或表不存在
  }

  // Fallback: 显示欢迎页
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">小旅 — AI 旅行规划师</h1>
        <p className="text-muted-foreground mb-4">请先在 Supabase 中创建数据库表</p>
        <code className="text-sm bg-muted px-3 py-1.5 rounded-lg">supabase/schema.sql</code>
      </div>
    </div>
  )
}
