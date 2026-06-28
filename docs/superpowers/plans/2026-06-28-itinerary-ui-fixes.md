# 行程 UI 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复工具调用状态（始终显示加载中）、行程解析器 bug（丢弃活动项）、行程展示重复（聊天区和预览面板双重显示）

**Architecture:** 修改 Agent 回调签名支持 start/end 事件，修复解析器正则和兜底逻辑，新增行程摘要卡片组件替换聊天区的完整 Markdown 渲染。

**Tech Stack:** TypeScript, React 19, Next.js 15, Lucide icons

---

### Task 1: 工具调用状态 — Agent 回调签名改造

**Files:**
- Modify: `src/agent/index.ts:33,54-57,106-155`
- Modify: `src/agent/orchestrator.ts:50-86,112-156,182-215`

- [ ] **Step 1: 修改 Agent 接口的回调类型**

在 `src/agent/index.ts` 中，将 `onToolCall` 回调签名改为支持 start/end 事件：

```typescript
// src/agent/index.ts — 修改 Agent 接口（约第 33 行）

/** 工具调用事件 */
export interface ToolEvent {
  tool: string
  status: 'start' | 'end'
  durationMs?: number
}

/** Agent 实例接口 */
export interface Agent {
  sendMessage: (userInput: string, onToolEvent?: (event: ToolEvent) => void) => Promise<string>
  getHistory: () => ReadonlyArray<OpenAI.ChatCompletionMessageParam>
  resetHistory: () => void
}
```

- [ ] **Step 2: 修改 sendMessage 中的工具执行逻辑**

在 `src/agent/index.ts` 中，修改 `sendMessage` 函数签名和工具执行循环（约第 54-155 行）：

```typescript
  async function sendMessage(
    userInput: string,
    onToolEvent?: (event: ToolEvent) => void,
  ): Promise<string> {
```

将工具执行循环（约第 106-155 行）替换为：

```typescript
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== 'function') continue
        const func = toolCall.function
        const toolName = func.name
        let toolArgs: Record<string, unknown>

        try {
          toolArgs = JSON.parse(func.arguments) as Record<string, unknown>
        } catch {
          toolArgs = {}
        }

        console.log(`   ⚙️  [ReAct 第${iteration + 1}轮] 调用工具: ${toolName}`)

        // 发送 start 事件
        onToolEvent?.({ tool: toolName, status: 'start' })

        options.trace?.record({
          type: 'tool_call',
          timestamp: Date.now(),
          data: { name: toolName, args: toolArgs, iteration: iteration + 1 },
        })

        const tool = registry?.getTool(toolName)
        let result: string
        const toolStart = Date.now()

        if (!tool) {
          result = `错误：工具 "${toolName}" 不存在`
        } else {
          try {
            result = await tool.execute(toolArgs)
          } catch (error) {
            result = `工具执行失败: ${(error as Error).message}`
          }
        }

        // 发送 end 事件
        onToolEvent?.({ tool: toolName, status: 'end', durationMs: Date.now() - toolStart })

        options.trace?.record({
          type: 'tool_result',
          timestamp: Date.now(),
          data: {
            name: toolName,
            result,
            error: result.startsWith('错误') || result.startsWith('工具执行失败') ? result : undefined,
          },
        })

        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }
```

- [ ] **Step 3: 修改 orchestrator 子 Agent 工具的回调透传**

在 `src/agent/orchestrator.ts` 中，三个子 Agent 工具（`createResearchAgentTool`、`createAdvisorAgentTool`、`createDocAgentTool`）的 `sendMessage` 调用不传 `onToolEvent`（子 Agent 的工具调用不需要前端展示）。这些调用已经没有传第二个参数，所以**无需修改**。

orchestrator 的 `createAgent` 返回的 Agent 会自动使用新的 `ToolEvent` 类型。**无需修改 orchestrator.ts。**

- [ ] **Step 4: Commit**

```bash
git add src/agent/index.ts
git commit -m "feat: add tool start/end events with duration tracking"
```

---

### Task 2: 工具调用状态 — SSE 适配层改造

**Files:**
- Modify: `lib/agent-adapter.ts:37-43,67-99`

- [ ] **Step 1: 更新 ToolCallEvent 接口**

修改 `lib/agent-adapter.ts` 中的 `ToolCallEvent` 接口（约第 37 行）：

```typescript
/** 工具调用事件数据格式 */
export interface ToolCallEvent {
  type: 'tool-call'
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
}
```

接口不变，但需要在 `handleChatRequest` 中正确使用 start/end 事件。

- [ ] **Step 2: 修改 handleChatRequest 的回调处理**

修改 `lib/agent-adapter.ts` 中 `handleChatRequest` 的 `textStream` 部分。将 `orchestrator.sendMessage` 的回调从 `onToolCall` 改为 `onToolEvent`，发送两种 SSE 事件：

```typescript
        const collectedToolCalls: ToolCallEvent[] = []

        const response = await orchestrator.sendMessage(fullMessage, (event) => {
          const toolCallEvent: ToolCallEvent = {
            type: 'tool-call',
            agent: guessAgentName(event.tool),
            tool: event.tool,
            status: event.status === 'start' ? 'running' : 'done',
            durationMs: event.durationMs,
          }

          if (event.status === 'end') {
            // 更新 collectedToolCalls 中最后一个 matching running 为 done
            for (let i = collectedToolCalls.length - 1; i >= 0; i--) {
              if (collectedToolCalls[i].tool === event.tool && collectedToolCalls[i].status === 'running') {
                collectedToolCalls[i] = { ...collectedToolCalls[i], status: 'done', durationMs: event.durationMs }
                break
              }
            }
          } else {
            collectedToolCalls.push(toolCallEvent)
          }

          controller.enqueue(`data: ${JSON.stringify(toolCallEvent)}\n\n`)
        })
```

- [ ] **Step 3: Commit**

```bash
git add lib/agent-adapter.ts
git commit -m "feat: emit tool done events with duration via SSE"
```

---

### Task 3: 工具调用状态 — 前端 done 事件处理

**Files:**
- Modify: `components/chat/chat-container.tsx:93-101`

- [ ] **Step 1: 修改 SSE 解析逻辑处理 done 事件**

在 `components/chat/chat-container.tsx` 的 SSE 解析循环中（约第 93-101 行），修改 tool-call 事件处理：

```typescript
                if (parsed.type === 'tool-call') {
                  if (parsed.status === 'done') {
                    // 更新最后一个 matching running toolCall 为 done
                    toolCalls = toolCalls.map((tc, i) => {
                      if (tc.tool === parsed.tool && tc.status === 'running' && 
                          !toolCalls.slice(i + 1).some(t => t.tool === parsed.tool && t.status === 'done')) {
                        return { ...tc, status: 'done', durationMs: parsed.durationMs }
                      }
                      return tc
                    })
                  } else {
                    toolCalls = [...toolCalls, parsed]
                  }
                  setCurrentToolCalls([...toolCalls])
                }
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/chat-container.tsx
git commit -m "feat: handle tool done events in chat frontend"
```

---

### Task 4: 行程解析器 Bug 修复

**Files:**
- Modify: `lib/itinerary-parser.ts:55-93`

- [ ] **Step 1: 修复解析器 — 扩展 Day 标题正则 + 活动项兜底**

替换 `parseItinerary` 函数（约第 55-93 行）：

```typescript
export function parseItinerary(markdown: string): DayPlan[] | null {
  const lines = markdown.split('\n').map((l) => l.trim())
  const days: DayPlan[] = []
  let currentDay: DayPlan | null = null
  let currentTimeSlot: TimeSlot | null = null

  for (const line of lines) {
    if (!line) continue

    // 匹配天数标题：支持更多格式
    // ## Day 1 / ## 第1天 / **Day 1** / Day 1: / 第1天：
    const dayMatch = line.match(
      /^#{1,3}\s*(?:Day\s*(\d+)|第(\d+)天)|^\*{2}(?:Day\s*(\d+)|第(\d+)天)|^(?:Day\s*(\d+)|第(\d+)天)\s*[:：—-]/i
    )
    if (dayMatch) {
      const dayNum = parseInt(dayMatch[1] ?? dayMatch[2] ?? dayMatch[3] ?? dayMatch[4] ?? dayMatch[5] ?? dayMatch[6], 10)
      currentDay = { day: dayNum, title: line.replace(/^#{1,3}\s*/, '').replace(/^\*{2}|\*{2}$/g, ''), timeSlots: [] }
      days.push(currentDay)
      currentTimeSlot = null
      continue
    }

    if (!currentDay) continue

    // 匹配时间段
    const period = detectPeriod(line)
    if (period) {
      // 去重：如果当前 Day 已有同类型 period，合并而非新建
      const existing = currentDay.timeSlots.find((ts) => ts.period === period)
      if (existing) {
        currentTimeSlot = existing
      } else {
        currentTimeSlot = { period, label: line.replace(/^[-*]\s*/, '').replace(/[🌅🌞🌆🍽️]/g, '').trim(), activities: [], locations: [] }
        currentDay.timeSlots.push(currentTimeSlot)
      }
      continue
    }

    // 匹配活动行
    const activityMatch = line.match(/^[-*]\s+(.+)/)
    if (activityMatch) {
      // 兜底：如果无时间段，默认归入 morning
      if (!currentTimeSlot) {
        currentTimeSlot = { period: 'morning', label: '全天', activities: [], locations: [] }
        currentDay.timeSlots.push(currentTimeSlot)
      }
      const text = activityMatch[1]
      currentTimeSlot.activities.push(text)
      currentTimeSlot.locations.push(...extractLocations(text))
    }
  }

  return days.length > 0 ? days : null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/itinerary-parser.ts
git commit -m "fix: improve itinerary parser - support more formats, handle activities before time slots"
```

---

### Task 5: 行程摘要卡片组件

**Files:**
- Create: `components/chat/itinerary-card.tsx`

- [ ] **Step 1: 创建 ItineraryCard 组件**

```tsx
// components/chat/itinerary-card.tsx
'use client'

import { Map, ChevronRight, FileDown, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { parseItinerary } from '@/lib/itinerary-parser'
import { useState, useCallback, useMemo } from 'react'

interface ItineraryCardProps {
  content: string
}

export function ItineraryCard({ content }: ItineraryCardProps) {
  const togglePreview = useAppStore((s) => s.togglePreview)
  const [isExporting, setIsExporting] = useState(false)

  const itinerary = useMemo(() => parseItinerary(content), [content])

  const totalDays = itinerary?.length ?? 0
  const totalActivities = useMemo(() => {
    if (!itinerary) return 0
    return itinerary.reduce(
      (sum, day) => sum + day.timeSlots.reduce((s, slot) => s + slot.activities.length, 0),
      0,
    )
  }, [itinerary])

  // 从第一行提取目的地（通常 Agent 输出的第一行包含目的地信息）
  const destination = useMemo(() => {
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
    return firstLine.replace(/^#+\s*/, '').replace(/^\*{2}|\*{2}$/g, '').trim().slice(0, 30)
  }, [content])

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: content }),
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
  }, [content, isExporting])

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm max-w-[420px]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <Map className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold">行程已规划完成</p>
          <p className="text-xs text-muted-foreground">
            {destination && `${destination} · `}
            {totalDays > 0 && `${totalDays}天`}
            {totalActivities > 0 && ` · ${totalActivities}个活动`}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={togglePreview}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-colors hover:opacity-90 active:scale-[0.98]"
        >
          查看完整行程
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          PDF
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/itinerary-card.tsx
git commit -m "feat: add itinerary summary card component"
```

---

### Task 6: ChatContainer — 行程渲染逻辑重构

**Files:**
- Modify: `components/chat/chat-container.tsx:1-12,170-200`

- [ ] **Step 1: 添加 ItineraryCard 导入**

在 `components/chat/chat-container.tsx` 顶部添加导入：

```typescript
import { ItineraryCard } from './itinerary-card'
```

移除不再需要的导入（Timeline 和 parseItinerary 将不再在此文件使用）：

```typescript
// 移除这两行：
import { Timeline } from '@/components/itinerary/timeline'
import { parseItinerary } from '@/lib/itinerary-parser'
```

添加 `parseItinerary` 的导入（仍需要用于检测是否是行程消息）：

```typescript
import { parseItinerary } from '@/lib/itinerary-parser'
```

保留 `parseItinerary` 导入，移除 `Timeline` 导入。

- [ ] **Step 2: 添加 useMemo 缓存 parseItinerary**

在 `ChatContainer` 组件内部（`const storedMessages = ...` 之后），添加 `useMemo` 导入并缓存行程检测：

```typescript
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
```

在消息渲染循环中使用 `useMemo` 不可行（因为是 per-message），但可以在渲染时用 `useMemo` 缓存最后一条行程消息的检测。实际上更好的做法是在渲染循环中直接使用 `parseItinerary`（它很快，只做字符串匹配）。

- [ ] **Step 3: 替换行程消息渲染逻辑**

修改消息渲染部分（约第 170-200 行）。将：

```typescript
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
```

替换为：

```typescript
            if (msg.role === 'assistant' && parseItinerary(msg.content)) {
              return (
                <div key={msg.id} className="mb-5">
                  {toolCalls}
                  <ItineraryCard content={msg.content} />
                </div>
              )
            }
```

- [ ] **Step 4: Commit**

```bash
git add components/chat/chat-container.tsx
git commit -m "feat: replace full itinerary rendering with summary card in chat"
```

---

### Task 7: TypeScript 验证 + 构建

- [ ] **Step 1: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 构建检查**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: 修复任何编译错误**

如有类型错误，修复后重新验证。

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "chore: verify itinerary UI fixes compile correctly"
```
