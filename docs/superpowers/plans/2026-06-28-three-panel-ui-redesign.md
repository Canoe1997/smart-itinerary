# 三面板 UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单页面聊天 UI 重构为 Claude 风格三面板布局（左侧历史栏 + 中间对话 + 右侧行程预览），使用 Supabase 持久化对话。

**Architecture:** Next.js App Router `/chat/[id]` 路由承载三面板 layout，Supabase 存储 conversations + messages，Zustand 管理 UI 状态（折叠/展开）。CSS 变量替换为 Claude 暖灰色系。

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, Zustand, Supabase (@supabase/supabase-js v2), react-markdown, Lucide icons

---

## File Structure

```
Create:
  lib/supabase.ts                          Supabase 客户端单例
  stores/conversation-store.ts             对话 CRUD + 消息管理 Zustand store
  app/api/conversations/route.ts           GET 列表 + POST 创建
  app/api/conversations/[id]/route.ts      DELETE 删除
  app/api/conversations/[id]/messages/route.ts  GET 消息列表
  app/chat/layout.tsx                      三面板 layout
  app/chat/[id]/page.tsx                   对话页面（替换 ChatContainer）
  components/layout/sidebar.tsx            左侧历史对话列表
  components/layout/preview-panel.tsx      右侧行程预览面板
  components/layout/mobile-nav.tsx         Mobile 底部 tab
  supabase/schema.sql                      建表 SQL

Modify:
  app/globals.css                          替换色彩变量为 Claude 暖灰系
  app/layout.tsx                           移除 Header，改为全屏布局
  app/page.tsx                             重定向到新对话
  stores/app-store.ts                      添加 sidebar/preview 折叠状态
  components/chat/message-bubble.tsx       Claude 风格气泡
  components/chat/input-bar.tsx            Claude 风格底部输入
  components/chat/chat-container.tsx       移除 wrapper，纯消息区
  app/api/chat/route.ts                    增加 conversationId，写入 Supabase
  lib/agent-adapter.ts                     增加 conversationId 参数
```

---

### Task 1: Supabase 客户端 + 数据库 Schema

**Files:**
- Create: `lib/supabase.ts`
- Create: `supabase/schema.sql`

- [ ] **Step 1: 创建 Supabase 客户端**

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
```

- [ ] **Step 2: 创建 SQL schema 文件**

```sql
-- supabase/schema.sql

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- MVP 单用户 RLS（后续加 auth 后收窄）
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON conversations;
CREATE POLICY "Allow all" ON conversations FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all" ON messages;
CREATE POLICY "Allow all" ON messages FOR ALL USING (true);
```

- [ ] **Step 3: 创建 `.env.local` 占位**

在项目根目录创建 `.env.local`（如果不存在），添加：

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.ts supabase/schema.sql
git commit -m "feat: add Supabase client and database schema"
```

---

### Task 2: 对话 CRUD API Routes

**Files:**
- Create: `app/api/conversations/route.ts`
- Create: `app/api/conversations/[id]/route.ts`
- Create: `app/api/conversations/[id]/messages/route.ts`

- [ ] **Step 1: 创建 conversations 列表 + 创建 API**

```typescript
// app/api/conversations/route.ts
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversations: data })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const title = (body.title as string) || '新对话'

  const { data, error } = await supabase
    .from('conversations')
    .insert({ title })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversation: data })
}
```

- [ ] **Step 2: 创建 conversation 删除 API**

```typescript
// app/api/conversations/[id]/route.ts
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: 创建消息列表 API**

```typescript
// app/api/conversations/[id]/messages/route.ts
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, tool_calls, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: data })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/conversations/
git commit -m "feat: add conversation CRUD and messages API routes"
```

---

### Task 3: Conversation Zustand Store

**Files:**
- Create: `stores/conversation-store.ts`

- [ ] **Step 1: 创建 conversation store**

```typescript
// stores/conversation-store.ts
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
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
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
```

- [ ] **Step 2: Commit**

```bash
git add stores/conversation-store.ts
git commit -m "feat: add conversation Zustand store with CRUD operations"
```

---

### Task 4: CSS 变量替换为 Claude 暖灰色系

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: 替换 `:root` 色彩变量**

将 `globals.css` 中 `:root` 块替换为 Claude 暖灰色系：

```css
:root {
  /* Surface — Claude warm gray */
  --background: #FAFAF8;
  --foreground: #1B1B1B;
  --card: #FFFFFF;
  --card-foreground: #1B1B1B;
  --popover: #FFFFFF;
  --popover-foreground: #1B1B1B;

  /* Brand — warm amber-brown accent */
  --primary: #1B1B1B;
  --primary-foreground: #FFFFFF;
  --secondary: #F5F4F2;
  --secondary-foreground: #1B1B1B;
  --muted: #F0EFED;
  --muted-foreground: #6B6B6B;
  --accent: #DA7756;
  --accent-foreground: #FFFFFF;
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;

  /* Border */
  --border: #E8E7E5;
  --input: #E8E7E5;
  --ring: #DA7756;

  /* Sidebar — slightly darker warm gray */
  --sidebar: #F5F4F2;
  --sidebar-foreground: #1B1B1B;
  --sidebar-primary: #1B1B1B;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EBEAE8;
  --sidebar-accent-foreground: #1B1B1B;
  --sidebar-border: #E8E7E5;
  --sidebar-ring: #DA7756;

  /* Radius */
  --radius: 0.75rem;
}
```

- [ ] **Step 2: 替换 `.dark` 色彩变量**

```css
.dark {
  /* Surface */
  --background: #1A1A1A;
  --foreground: #ECECEC;
  --card: #242424;
  --card-foreground: #ECECEC;
  --popover: #242424;
  --popover-foreground: #ECECEC;

  /* Brand */
  --primary: #ECECEC;
  --primary-foreground: #1A1A1A;
  --secondary: #2A2A2A;
  --secondary-foreground: #ECECEC;
  --muted: #2A2A2A;
  --muted-foreground: #8E8E8E;
  --accent: #E8956F;
  --accent-foreground: #1A1A1A;
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;

  /* Border */
  --border: #333333;
  --input: #333333;
  --ring: #E8956F;

  /* Sidebar */
  --sidebar: #141414;
  --sidebar-foreground: #ECECEC;
  --sidebar-primary: #ECECEC;
  --sidebar-primary-foreground: #1A1A1A;
  --sidebar-accent: #2A2A2A;
  --sidebar-accent-foreground: #ECECEC;
  --sidebar-border: #333333;
  --sidebar-ring: #E8956F;
}
```

- [ ] **Step 3: 在 `@theme inline` 中添加新色板映射**

在现有 `@theme inline` 块末尾追加：

```css
  /* Claude-style custom tokens */
  --color-bubble-user: var(--primary);
  --color-bubble-user-text: var(--primary-foreground);
  --color-sidebar-surface: var(--sidebar);
```

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: replace color system with Claude warm gray palette"
```

---

### Task 5: App Layout 重构（全屏三面板）

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: 修改根 layout — 移除 Header，全屏布局**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/layout/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: '小旅 — AI 旅行规划师',
  description: '基于小红书真实经验的 AI 旅行规划助手',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: 修改首页 — 重定向到新对话**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default async function Home() {
  // 获取最新对话，没有则创建
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (data) {
    redirect(`/chat/${data.id}`)
  }

  // 没有对话，创建一个
  const { data: created } = await supabase
    .from('conversations')
    .insert({ title: '新对话' })
    .select('id')
    .single()

  redirect(`/chat/${created!.id}`)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: restructure root layout for three-panel design"
```

---

### Task 6: Sidebar 组件

**Files:**
- Create: `components/layout/sidebar.tsx`

- [ ] **Step 1: 创建 Sidebar 组件**

```tsx
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
      await deleteConversation(id)
      setDeletingId(null)
      // 如果删的是当前对话，跳转到列表第一个
      const remaining = conversations.filter((c) => c.id !== id)
      if (remaining.length > 0) {
        router.push(`/chat/${remaining[0].id}`)
      } else {
        const newId = await createConversation()
        router.push(`/chat/${newId}`)
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
      {/* 顶部：新建 + 收起 */}
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

      {/* 对话列表 */}
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

      {/* 底部：设置 */}
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
```

- [ ] **Step 2: 扩展 app-store 添加折叠状态**

在 `stores/app-store.ts` 的 `AppState` 接口添加：

```typescript
interface AppState {
  preferences: UserPreferences
  sidebarCollapsed: boolean
  previewCollapsed: boolean
  setTheme: (theme: UserPreferences['theme']) => void
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
  getPreferencesSummary: () => string
  toggleSidebar: () => void
  togglePreview: () => void
}
```

在 store 实现中添加：

```typescript
sidebarCollapsed: false,
previewCollapsed: false,
toggleSidebar: () =>
  set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
togglePreview: () =>
  set((state) => ({ previewCollapsed: !state.previewCollapsed })),
```

- [ ] **Step 3: Commit**

```bash
git add components/layout/sidebar.tsx stores/app-store.ts
git commit -m "feat: add sidebar component and collapse state management"
```

---

### Task 7: 三面板 Chat Layout

**Files:**
- Create: `app/chat/layout.tsx`
- Create: `app/chat/[id]/page.tsx`

- [ ] **Step 1: 创建三面板 layout**

```tsx
// app/chat/layout.tsx
'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { useAppStore } from '@/stores/app-store'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 创建对话页面**

```tsx
// app/chat/[id]/page.tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add app/chat/
git commit -m "feat: add three-panel chat layout and page route"
```

---

### Task 8: ChatContainer 重构（Claude 风格）

**Files:**
- Modify: `components/chat/chat-container.tsx`
- Modify: `components/chat/message-bubble.tsx`
- Modify: `components/chat/input-bar.tsx`

- [ ] **Step 1: 重构 MessageBubble — Claude 风格**

替换 `components/chat/message-bubble.tsx` 全文：

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  children?: React.ReactNode
}

export function MessageBubble({ role, content, children }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <div className={cn('group flex w-full mb-5 relative', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'text-sm leading-relaxed',
          isUser
            ? 'max-w-[70%] rounded-2xl rounded-br-md bg-bubble-user text-bubble-user-text px-4 py-3 shadow-sm'
            : 'max-w-[85%] text-foreground',
        )}
      >
        {children}

        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : '',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-p:leading-relaxed prose-li:leading-relaxed',
          'prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal',
          'prose-pre:bg-muted prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50',
          'prose-blockquote:border-l-2 prose-blockquote:border-accent/40 prose-blockquote:pl-3 prose-blockquote:italic',
          'prose-a:text-accent prose-a:underline prose-a:underline-offset-2',
          'prose-strong:font-semibold',
          'prose-table:text-xs',
          'prose-th:font-semibold prose-th:text-left',
          'prose-td:py-1.5 prose-th:py-1.5',
          'prose-img:rounded-lg',
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {/* 复制按钮 — hover 显示 */}
      {!isUser && (
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground"
          aria-label="复制消息"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 重构 InputBar — Claude 风格底部横条**

替换 `components/chat/input-bar.tsx` 全文：

```tsx
'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputBarProps {
  onSend: (message: string) => void
  isLoading: boolean
}

export function InputBar({ onSend, isLoading }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl bg-muted/80 px-4 py-3 transition-shadow focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="告诉小旅你的旅行需求..."
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 resize-none leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-full rounded-full transition-all duration-150',
              canSend
                ? 'bg-foreground text-background hover:opacity-80 active:scale-95'
                : 'bg-muted-foreground/20 text-muted-foreground/40 cursor-not-allowed',
            )}
            title="发送"
            aria-label="发送消息"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/40">
          小旅可能会犯错，请核实重要信息
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 重构 ChatContainer — 对接 Supabase + Claude 风格**

替换 `components/chat/chat-container.tsx` 全文：

```tsx
'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { MapPin, Compass, Sparkles } from 'lucide-react'
import { MessageBubble } from './message-bubble'
import { ToolCallDetail } from './tool-call-detail'
import { InputBar } from './input-bar'
import { Timeline } from '@/components/itinerary/timeline'
import { parseItinerary } from '@/lib/itinerary-parser'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import type { ToolCallEvent } from '@/lib/agent-adapter'

interface LiveMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallEvent[]
}

const QUICK_PROMPTS = [
  { icon: MapPin, text: '规划3天东京亲子游' },
  { icon: Compass, text: '推荐大阪美食攻略' },
  { icon: Sparkles, text: '帮我制定伊豆温泉行程' },
]

interface ChatContainerProps {
  conversationId: string
}

export function ChatContainer({ conversationId }: ChatContainerProps) {
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallEvent[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const preferences = useAppStore((s) => s.getPreferencesSummary())
  const storedMessages = useConversationStore((s) => s.messages)
  const addStoredMessage = useConversationStore((s) => s.addMessage)

  // 当 stored messages 变化，同步到 live
  useEffect(() => {
    const mapped: LiveMessage[] = storedMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: (m.tool_calls as ToolCallEvent[]) ?? undefined,
    }))
    setLiveMessages(mapped)
  }, [storedMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveMessages, isLoading, currentToolCalls])

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: LiveMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }
    setLiveMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setCurrentToolCalls([])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, conversationId, preferences }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let toolCalls: ToolCallEvent[] = []
      let buffer = ''

      const assistantId = `assistant-${Date.now()}`
      setLiveMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const lines = event.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6)) as ToolCallEvent
                if (parsed.type === 'tool-call') {
                  toolCalls = [...toolCalls, parsed]
                  setCurrentToolCalls([...toolCalls])
                }
              } catch {
                assistantContent += line
              }
            } else if (line.trim()) {
              assistantContent += line
            }
          }
        }

        setLiveMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: assistantContent, toolCalls: [...toolCalls] }
              : m,
          ),
        )
      }
    } catch (error) {
      const errorMsg: LiveMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `发送失败: ${(error as Error).message}`,
      }
      setLiveMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
      setCurrentToolCalls([])
    }
  }, [conversationId, preferences])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6" role="log" aria-live="polite" aria-label="聊天消息">
        <div className="mx-auto max-w-3xl">
          {liveMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-[15vh]">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
                <MapPin className="h-7 w-7 text-accent" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">你好，我是小旅</h2>
              <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground leading-relaxed">
                基于小红书真实攻略，为你制定个性化旅行行程。
                告诉我你想去哪里，我来帮你规划。
              </p>

              <div className="mt-8 flex flex-col items-center gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.text}
                    onClick={() => sendMessage(prompt.text)}
                    className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground transition-all duration-150 hover:border-accent/30 hover:text-foreground hover:shadow-sm"
                  >
                    <prompt.icon className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-accent" />
                    {prompt.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {liveMessages.map((msg) => {
            const toolCalls = msg.toolCalls && msg.toolCalls.length > 0 ? (
              <div className="mb-2.5">
                {msg.toolCalls.map((tc, i) => (
                  <ToolCallDetail
                    key={`${tc.tool}-${i}`}
                    agent={tc.agent}
                    tool={tc.tool}
                    status={tc.status}
                    durationMs={tc.durationMs}
                  />
                ))}
              </div>
            ) : null

            if (msg.role === 'assistant' && parseItinerary(msg.content)) {
              return (
                <div key={msg.id} className="mb-5">
                  <Timeline content={msg.content} />
                  <MessageBubble role={msg.role} content={msg.content}>
                    {toolCalls}
                  </MessageBubble>
                </div>
              )
            }

            return (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content}>
                {toolCalls}
              </MessageBubble>
            )
          })}

          {isLoading && currentToolCalls.length === 0 && (
            <div className="flex justify-start mb-5">
              <div className="rounded-2xl rounded-bl-md px-4 py-3">
                <span className="inline-flex gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入栏 */}
      <InputBar onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/chat/
git commit -m "feat: refactor chat UI to Claude-style messages and input"
```

---

### Task 9: 修改 Chat API — 写入 Supabase

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `lib/agent-adapter.ts`

- [ ] **Step 1: 修改 agent-adapter 返回文本和工具调用**

修改 `lib/agent-adapter.ts` 的 `handleChatRequest` 函数签名，增加 `conversationId` 参数，并返回文本内容而不是 Response（让 route 层决定如何存储）：

在文件末尾添加一个新函数：

```typescript
/**
 * 处理聊天请求并返回结果（不直接返回 Response）
 * 用于需要在 route 层写入 Supabase 的场景
 */
export async function processChatRequest(
  userMessage: string,
  preferencesSummary?: string,
): Promise<{ response: string; toolCalls: ToolCallEvent[] }> {
  const xhs = await getXHSClient()
  const memory = getMemory()
  const trace = createTraceCollector('orchestrator')
  const orchestrator = createOrchestrator({ xhs, memory, trace })

  const fullMessage = preferencesSummary
    ? `${userMessage}\n\n[用户偏好: ${preferencesSummary}]`
    : userMessage

  const collectedToolCalls: ToolCallEvent[] = []

  const response = await orchestrator.sendMessage(fullMessage, (toolName) => {
    const event: ToolCallEvent = {
      type: 'tool-call',
      agent: guessAgentName(toolName),
      tool: toolName,
      status: 'running',
    }
    collectedToolCalls.push(event)
  })

  trace.saveToFile('traces').catch(() => {})

  return { response, toolCalls: collectedToolCalls }
}
```

- [ ] **Step 2: 修改 chat route — 支持 conversationId + 写入 Supabase**

替换 `app/api/chat/route.ts` 全文：

```typescript
// app/api/chat/route.ts
import { handleChatRequest, processChatRequest } from '@/lib/agent-adapter'
import { supabase } from '@/lib/supabase'

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

    // 如果有 conversationId，用 processChatRequest 存储到 Supabase
    if (conversationId) {
      const { response, toolCalls } = await processChatRequest(
        message.trim(),
        preferencesSummary,
      )

      // 写入 Supabase（异步，不阻塞响应）
      const writePromise = supabase.from('messages').insert([
        {
          conversation_id: conversationId,
          role: 'user',
          content: message.trim(),
        },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: response,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
        },
      ])

      // 更新对话标题（如果还是"新对话"）
      const titlePromise = supabase
        .from('conversations')
        .select('title')
        .eq('id', conversationId)
        .single()
        .then(({ data }) => {
          if (data?.title === '新对话') {
            const shortTitle = message.trim().slice(0, 30)
            return supabase
              .from('conversations')
              .update({ title: shortTitle })
              .eq('id', conversationId)
          }
        })

      // 不 await，让写入和流式响应并行
      Promise.all([writePromise, titlePromise]).catch(() => {})

      // 用 handleChatRequest 返回 SSE 流
      return handleChatRequest(message.trim(), preferencesSummary)
    }

    // 无 conversationId，直接流式返回（向后兼容）
    return handleChatRequest(message.trim(), preferencesSummary)
  } catch (error) {
    console.error('Chat API 错误:', error)
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts lib/agent-adapter.ts
git commit -m "feat: persist chat messages to Supabase with conversation tracking"
```

---

### Task 10: PreviewPanel 组件

**Files:**
- Create: `components/layout/preview-panel.tsx`
- Modify: `app/chat/layout.tsx`（集成预览面板）

- [ ] **Step 1: 创建 PreviewPanel 组件**

```tsx
// components/layout/preview-panel.tsx
'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight, FileDown, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import { parseItinerary } from '@/lib/itinerary-parser'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

export function PreviewPanel() {
  const { previewCollapsed, togglePreview } = useAppStore()
  const messages = useConversationStore((s) => s.messages)
  const [isExporting, setIsExporting] = useState(false)

  // 找到最后一条包含行程的助手消息
  const itineraryContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && parseItinerary(msg.content)) {
        return msg.content
      }
    }
    return null
  }, [messages])

  const handleExportPdf = useCallback(async () => {
    if (!itineraryContent || isExporting) return
    setIsExporting(true)

    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: itineraryContent }),
      })

      if (!res.ok) throw new Error('PDF 导出失败')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `旅行行程-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (error) {
      alert(`PDF 导出失败: ${(error as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }, [itineraryContent, isExporting])

  if (previewCollapsed) {
    return (
      <button
        onClick={togglePreview}
        className="fixed right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border/60 shadow-sm hover:bg-muted transition-colors"
        aria-label="展开预览面板"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
      </button>
    )
  }

  return (
    <aside className="flex h-full w-[340px] flex-col bg-card border-l border-border shrink-0">
      {/* 标题 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">行程预览</h2>
        <button
          onClick={togglePreview}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="折叠预览面板"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Markdown 渲染 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {itineraryContent ? (
          <div className={cn(
            'prose prose-sm max-w-none',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
            'prose-p:text-foreground/80 prose-p:leading-relaxed',
            'prose-li:text-foreground/80 prose-li:leading-relaxed',
            'prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md',
            'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:text-xs',
            'prose-a:text-accent prose-a:underline',
            'prose-strong:text-foreground prose-strong:font-semibold',
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {itineraryContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileDown className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              暂无行程内容
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              向小旅描述你的旅行需求，行程会在这里预览
            </p>
          </div>
        )}
      </div>

      {/* PDF 导出按钮 */}
      {itineraryContent && (
        <div className="border-t border-border p-3">
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              'bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-50',
            )}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {isExporting ? '导出中...' : '导出 PDF'}
          </button>
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: 集成 PreviewPanel 到 chat layout**

修改 `app/chat/layout.tsx`：

```tsx
// app/chat/layout.tsx
'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { PreviewPanel } from '@/components/layout/preview-panel'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
      <PreviewPanel />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/layout/preview-panel.tsx app/chat/layout.tsx
git commit -m "feat: add preview panel with itinerary rendering and PDF export"
```

---

### Task 11: 响应式适配

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/preview-panel.tsx`
- Modify: `app/chat/layout.tsx`
- Create: `components/layout/mobile-nav.tsx`

- [ ] **Step 1: 创建 MobileNav 组件**

```tsx
// components/layout/mobile-nav.tsx
'use client'

import { MessageSquare, Map, Settings } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type Tab = 'chat' | 'itinerary' | 'settings'

interface MobileNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const router = useRouter()

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: '对话', icon: MessageSquare },
    { id: 'itinerary', label: '行程', icon: Map },
    { id: 'settings', label: '设置', icon: Settings },
  ]

  function handleTabClick(tab: Tab) {
    if (tab === 'settings') {
      router.push('/settings')
      return
    }
    onTabChange(tab)
  }

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] transition-colors min-w-[64px]',
              isActive ? 'text-accent' : 'text-muted-foreground',
            )}
            aria-label={tab.label}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: 修改 chat layout — 响应式三面板**

替换 `app/chat/layout.tsx` 全文：

```tsx
// app/chat/layout.tsx
'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { PreviewPanel } from '@/components/layout/preview-panel'
import { MobileNav } from '@/components/layout/mobile-nav'
import { useAppStore } from '@/stores/app-store'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileTab, setMobileTab] = useState<'chat' | 'itinerary' | 'settings'>('chat')
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const previewCollapsed = useAppStore((s) => s.previewCollapsed)

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile when not active */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Chat — always visible on desktop, tab-controlled on mobile */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className={`flex-1 flex flex-col min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
            {children}
          </div>

          {/* Mobile itinerary view */}
          <div className={`flex-1 overflow-y-auto ${mobileTab === 'itinerary' ? 'block' : 'hidden md:hidden'}`}>
            <div className="p-4">
              <PreviewPanel />
            </div>
          </div>
        </main>

        {/* PreviewPanel — hidden on mobile, shown on desktop */}
        <div className="hidden md:block">
          <PreviewPanel />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />
    </div>
  )
}
```

- [ ] **Step 3: 更新 Sidebar — 移动端全屏 overlay**

在 `components/layout/sidebar.tsx` 中，当通过 `MobileNav` 在移动端打开时，需要改为全屏 overlay。在现有 Sidebar 组件的最外层 `<aside>` 上添加响应式类：

```tsx
// 修改 aside 元素，添加移动端 overlay 样式
<aside className={cn(
  'flex h-full w-[260px] flex-col bg-sidebar border-r border-sidebar-border shrink-0',
  // 移动端隐藏（由 MobileNav 控制）
)}>
```

Sidebar 在移动端由 `hidden md:block` 的 wrapper 控制显隐，无需额外修改。

- [ ] **Step 4: 更新 PreviewPanel — 移动端内嵌模式**

PreviewPanel 已在 layout 中通过 `hidden md:block` 控制。移动端通过 MobileNav 的 itinerary tab 显示。无需额外修改 PreviewPanel 本身。

- [ ] **Step 5: Commit**

```bash
git add components/layout/mobile-nav.tsx app/chat/layout.tsx
git commit -m "feat: add responsive layout with mobile bottom navigation"
```

---

### Task 12: 键盘快捷键 + 快速提示修复

**Files:**
- Modify: `app/chat/layout.tsx`

- [ ] **Step 1: 添加全局快捷键**

在 `app/chat/layout.tsx` 中添加 `useEffect` 处理快捷键：

```tsx
import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useRouter, useParams } from 'next/navigation'
import { useConversationStore } from '@/stores/conversation-store'

// 在 ChatLayout 组件内添加：
const router = useRouter()
const params = useParams()
const toggleSidebar = useAppStore((s) => s.toggleSidebar)
const togglePreview = useAppStore((s) => s.togglePreview)
const createConversation = useConversationStore((s) => s.createConversation)

useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // ⌘+B — 切换侧栏
    if (e.metaKey && e.key === 'b') {
      e.preventDefault()
      toggleSidebar()
    }
    // ⌘+. — 切换预览面板
    if (e.metaKey && e.key === '.') {
      e.preventDefault()
      togglePreview()
    }
    // ⌘+Shift+N — 新建对话
    if (e.metaKey && e.shiftKey && e.key === 'N') {
      e.preventDefault()
      createConversation().then((id) => router.push(`/chat/${id}`))
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [toggleSidebar, togglePreview, createConversation, router])
```

- [ ] **Step 2: Commit**

```bash
git add app/chat/layout.tsx
git commit -m "feat: add keyboard shortcuts for sidebar, preview, and new chat"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 构建检查**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: 手动验证清单**

在 `npm run dev` 下验证：

- [ ] `/` 重定向到 `/chat/{id}`
- [ ] 左侧栏显示对话列表（或空态提示）
- [ ] 点击 `+ 新对话` 创建新对话并跳转
- [ ] 发送消息，显示 Claude 风格气泡（用户深色/助手无背景）
- [ ] 输入框 Enter 发送，Shift+Enter 换行
- [ ] 右侧行程预览面板显示（或折叠状态）
- [ ] `⌘+B` 切换侧栏，`⌘+.` 切换预览面板
- [ ] 刷新页面，对话消息从 Supabase 恢复
- [ ] 暗色模式下颜色正确（暖灰而非纯黑）
- [ ] 移动端（<768px）底部 tab 正常

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "chore: three-panel UI redesign complete"
```
