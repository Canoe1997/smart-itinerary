import { redirect } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default async function Home() {
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

  redirect(`/chat/${created!.id}`)
}
