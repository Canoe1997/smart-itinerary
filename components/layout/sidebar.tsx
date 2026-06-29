// components/layout/sidebar.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Plus, MessageSquare, Trash2, Settings, ChevronLeft } from 'lucide-react'
import { useConversationStore, type Conversation } from '@/stores/conversation-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>()
  const now = new Date()

  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    let key: string
    if (diffDays === 0) key = '今天'
    else if (diffDays === 1) key = '昨天'
    else if (diffDays <= 7) key = '本周'
    else key = '更早'

    const list = groups.get(key) ?? []
    list.push(conv)
    groups.set(key, list)
  }
  return groups
}

export function Sidebar() {
  const router = useRouter()
  const params = useParams()
  const currentId = params.id as string

  const {
    conversations,
    fetchConversations,
    createConversation,
    deleteConversation,
    isLoadingList,
  } = useConversationStore()

  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const groups = groupByDate(conversations)

  async function handleNew() {
    const id = await createConversation()
    router.push(`/chat/${id}`)
  }

  async function handleDelete(id: string) {
    if (deletingId === id) {
      try {
        await deleteConversation(id)
        setDeletingId(null)
        // Read fresh state from store (not stale closure)
        const remaining = useConversationStore.getState().conversations
        if (remaining.length > 0) {
          router.push(`/chat/${remaining[0].id}`)
        } else {
          const newId = await createConversation()
          router.push(`/chat/${newId}`)
        }
      } catch (error) {
        console.error('删除对话失败:', error)
        setDeletingId(null)
      }
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  if (sidebarCollapsed) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border/60 shadow-sm hover:bg-sidebar-accent transition-colors"
        aria-label="展开侧栏"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
    )
  }

  return (
    <aside className="flex h-full w-[260px] flex-col bg-sidebar border-r border-sidebar-border shrink-0">
      <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
        <button
          onClick={handleNew}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-border/60 hover:bg-sidebar-accent transition-colors w-full"
        >
          <Plus className="h-4 w-4" />
          新对话
        </button>
        <button
          onClick={toggleSidebar}
          className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors shrink-0"
          aria-label="折叠侧栏"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoadingList ? (
          <div className="space-y-2 px-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-sidebar-accent/50 animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            还没有对话<br />开始第一次旅行规划吧
          </p>
        ) : (
          Array.from(groups.entries()).map(([label, items]) => (
            <div key={label} className="mb-3">
              <p className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </p>
              {items.map((conv) => {
                const isActive = conv.id === currentId
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors relative',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/60 text-sidebar-foreground',
                    )}
                    onClick={() => router.push(`/chat/${conv.id}`)}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-accent" />
                    )}
                    <span className="flex-1 truncate">{conv.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(conv.id)
                      }}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md transition-colors shrink-0',
                        deletingId === conv.id
                          ? 'bg-destructive/10 text-destructive'
                          : 'opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent text-muted-foreground',
                      )}
                      aria-label={deletingId === conv.id ? '确认删除' : '删除对话'}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-sidebar-border p-2">
        <a
          href="/settings"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="h-4 w-4" />
          设置
        </a>
      </div>
    </aside>
  )
}
