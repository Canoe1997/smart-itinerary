import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (data) {
    redirect(`/chat/${data.id}`)
  }

  const { data: created } = await supabase
    .from('conversations')
    .insert({ title: '新对话' })
    .select('id')
    .single()

  redirect(`/chat/${created!.id}`)
}
