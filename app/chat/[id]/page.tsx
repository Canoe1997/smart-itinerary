'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useConversationStore } from '@/stores/conversation-store'
import { ChatContainer } from '@/components/chat/chat-container'

export default function ChatPage() {
  const params = useParams()
  const id = params.id as string
  const { setCurrentId, fetchMessages } = useConversationStore()

  useEffect(() => {
    setCurrentId(id)
    fetchMessages(id)
  }, [id, setCurrentId, fetchMessages])

  return <ChatContainer conversationId={id} />
}
