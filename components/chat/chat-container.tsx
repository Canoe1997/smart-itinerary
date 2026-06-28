'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageBubble } from './message-bubble'
import { ToolCallDetail } from './tool-call-detail'
import { InputBar } from './input-bar'
import { Timeline } from '@/components/itinerary/timeline'
import { parseItinerary } from '@/lib/itinerary-parser'
import { useAppStore } from '@/stores/app-store'
import type { ToolCallEvent } from '@/lib/agent-adapter'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallEvent[]
}

export function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallEvent[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const preferences = useAppStore((s) => s.getPreferencesSummary())

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, currentToolCalls])

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setCurrentToolCalls([])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, preferences }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let toolCalls: ToolCallEvent[] = []
      let buffer = ''

      // 添加空的 assistant 消息（逐步填充）
      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 按 \n\n 分割 SSE 事件（避免 chunk 边界拆分 JSON）
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''  // 最后一段可能不完整，留到下次

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
                // 非 JSON 行，当作普通文本
                assistantContent += line
              }
            } else if (line.trim()) {
              assistantContent += line
            }
          }
        }

        // 更新 assistant 消息内容
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: assistantContent, toolCalls: [...toolCalls] }
              : m,
          ),
        )
      }
    } catch (error) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ 发送失败: ${(error as Error).message}`,
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
      setCurrentToolCalls([])
    }
  }, [preferences])

  const exportPdf = useCallback(async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return

    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: lastAssistant.content }),
      })

      if (!response.ok) throw new Error('PDF 导出失败')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '旅行行程单.pdf'
      a.click()
      // 延迟释放 URL，确保浏览器有时间开始下载
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (error) {
      alert(`PDF 导出失败: ${(error as Error).message}`)
    }
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6" role="log" aria-live="polite" aria-label="聊天消息">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 && (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-4xl mb-4">🗺️</p>
              <h2 className="text-xl font-semibold">你好，我是小旅</h2>
              <p className="text-muted-foreground mt-2 max-w-md">
                告诉我你想去哪里旅行，我会在小红书上搜索真实攻略，为你制定个性化行程。
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const toolCalls = msg.toolCalls && msg.toolCalls.length > 0 ? (
              <div className="mb-2">
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
                <div key={msg.id} className="mb-4">
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
            <div className="flex justify-start mb-4">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入栏 */}
      <InputBar
        onSend={sendMessage}
        onExportPdf={exportPdf}
        isLoading={isLoading}
        hasMessages={messages.some((m) => m.role === 'assistant')}
      />
    </div>
  )
}
