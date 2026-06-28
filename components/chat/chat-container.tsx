'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { MapPin, Compass, Sparkles } from 'lucide-react'
import { MessageBubble } from './message-bubble'
import { ToolCallDetail } from './tool-call-detail'
import { InputBar } from './input-bar'
import { ItineraryCard } from './itinerary-card'
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
  const setLatestSources = useAppStore((s) => s.setLatestSources)
  const storedMessages = useConversationStore((s) => s.messages)

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
      let sourcesData: Array<{ id: string; title: string; author: string; url: string; likes: number; excerpt: string }> | null = null
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
                const parsed = JSON.parse(line.slice(6))
                if (parsed.type === 'sources') {
                  sourcesData = parsed.sources
                  continue
                }
                const tcParsed = parsed as ToolCallEvent
                if (tcParsed.type === 'tool-call') {
                  if (tcParsed.status === 'done') {
                    // Update last matching running toolCall to done
                    let updated = false
                    toolCalls = toolCalls.map((tc) => {
                      if (!updated && tc.tool === tcParsed.tool && tc.status === 'running') {
                        updated = true
                        return { ...tc, status: 'done' as const, durationMs: tcParsed.durationMs }
                      }
                      return tc
                    })
                  } else {
                    toolCalls = [...toolCalls, tcParsed]
                  }
                  setCurrentToolCalls([...toolCalls])
                }
              } catch {
                // Malformed JSON from tool-call event — skip rather than leak into chat
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

      // Store sources for preview panel
      if (sourcesData) {
        setLatestSources(sourcesData)
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
                  {toolCalls}
                  <ItineraryCard content={msg.content} />
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
              <div className="rounded-2xl rounded-bl-md px-4 py-3" role="status" aria-label="正在输入">
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

      <InputBar onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}
