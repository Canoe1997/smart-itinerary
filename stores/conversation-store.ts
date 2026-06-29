import { create } from 'zustand'

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tool_calls: unknown[] | null
  created_at: string
}

interface ConversationState {
  conversations: Conversation[]
  currentId: string | null
  messages: StoredMessage[]
  isLoadingList: boolean
  isLoadingMessages: boolean

  fetchConversations: () => Promise<void>
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  setCurrentId: (id: string) => void
  fetchMessages: (conversationId: string) => Promise<void>
  addMessage: (msg: StoredMessage) => void
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  currentId: null,
  messages: [],
  isLoadingList: false,
  isLoadingMessages: false,

  fetchConversations: async () => {
    set({ isLoadingList: true })
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      if (data.conversations) {
        set({ conversations: data.conversations })
      }
    } finally {
      set({ isLoadingList: false })
    }
  },

  createConversation: async (title?: string) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const data = await res.json()
    const conversation = data.conversation as Conversation
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentId: conversation.id,
      messages: [],
    }))
    return conversation.id
  },

  deleteConversation: async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      throw new Error(`删除失败: ${res.status}`)
    }
    const { conversations, currentId } = get()
    const updated = conversations.filter((c) => c.id !== id)
    const nextCurrentId = currentId === id
      ? (updated[0]?.id ?? null)
      : currentId
    set({
      conversations: updated,
      currentId: nextCurrentId,
      messages: currentId === id ? [] : get().messages,
    })
  },

  setCurrentId: (id) => set({ currentId: id, messages: [] }),

  fetchMessages: async (conversationId: string) => {
    set({ isLoadingMessages: true })
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      const data = await res.json()
      if (data.messages) {
        set({ messages: data.messages })
      }
    } finally {
      set({ isLoadingMessages: false })
    }
  },

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
}))
