# 工具调用详情增强 + 小红书攻略引用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强子 Agent 执行过程展示（参数/结果/子步骤），新增小红书攻略来源引用面板

**Architecture:** 扩展 ToolEvent/ToolCallEvent 接口传递 args/result/parentTool，编排器透传子 Agent 事件，前端解析工具调用树并增强详情卡片；新增 SourceEvent 传递 XHS 帖子数据，预览面板改为双标签页

**Tech Stack:** TypeScript, React 19, Next.js 15, Lucide icons, Zustand

---

### Task 1: ToolEvent/ToolCallEvent 接口扩展

**Files:**
- Modify: `src/agent/index.ts:17-22`
- Modify: `lib/agent-adapter.ts:37-43`

- [ ] **Step 1: 扩展 ToolEvent 接口**

修改 `src/agent/index.ts` 中的 ToolEvent（约第 17-22 行）：

```typescript
/** 工具调用事件 */
export interface ToolEvent {
  tool: string
  status: 'start' | 'end'
  durationMs?: number
  args?: Record<string, unknown>    // 工具参数（start 时传）
  result?: string                    // 执行结果摘要（end 时传，截取前 500 字）
  parentTool?: string                // 父工具名（子 Agent 场景）
}
```

- [ ] **Step 2: 在 sendMessage 中传递 args 和 result**

修改 `src/agent/index.ts` 中的 sendMessage 函数，在 `onToolEvent` 调用处添加 args/result：

将 start 事件（约第 126 行）改为：
```typescript
        onToolEvent?.({ tool: toolName, status: 'start', args: toolArgs })
```

将 end 事件（约第 148 行）改为：
```typescript
        onToolEvent?.({
          tool: toolName,
          status: 'end',
          durationMs: Date.now() - toolStart,
          result: result.length > 500 ? result.slice(0, 500) + '...' : result,
        })
```

- [ ] **Step 3: 扩展 ToolCallEvent SSE 接口**

修改 `lib/agent-adapter.ts` 中的 ToolCallEvent（约第 37 行）：

```typescript
/** 工具调用事件数据格式 */
export interface ToolCallEvent {
  type: 'tool-call'
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
  args?: Record<string, unknown>
  result?: string
  parentTool?: string
}
```

- [ ] **Step 4: 更新 SSE 事件构造**

修改 `lib/agent-adapter.ts` 中 handleChatRequest 的回调（约第 72-94 行），在构造 eventSse 时传递新字段：

```typescript
        const response = await orchestrator.sendMessage(fullMessage, (event) => {
          const eventSse: ToolCallEvent = {
            type: 'tool-call',
            agent: guessAgentName(event.tool),
            tool: event.tool,
            status: event.status === 'start' ? 'running' : 'done',
            durationMs: event.durationMs,
            args: event.args,
            result: event.result,
            parentTool: event.parentTool,
          }

          if (event.status === 'end') {
            for (let i = collectedToolCalls.length - 1; i >= 0; i--) {
              if (collectedToolCalls[i].tool === event.tool && collectedToolCalls[i].status === 'running') {
                collectedToolCalls[i] = { ...collectedToolCalls[i], status: 'done', durationMs: event.durationMs, result: event.result }
                break
              }
            }
          } else {
            collectedToolCalls.push(eventSse)
          }

          controller.enqueue(`data: ${JSON.stringify(eventSse)}\n\n`)
        })
```

- [ ] **Step 5: Commit**

```bash
git add src/agent/index.ts lib/agent-adapter.ts
git commit -m "feat: extend ToolEvent/ToolCallEvent with args, result, parentTool"
```

---

### Task 2: 子 Agent 事件透传 + XHS 数据提取

**Files:**
- Modify: `src/agent/orchestrator.ts:50-86,112-156,182-215,218-239`

- [ ] **Step 1: 修改 createOrchestrator 签名接收 onToolEvent**

修改 `src/agent/orchestrator.ts` 的 `createOrchestrator` 函数（约第 218 行），添加 `onToolEvent` 参数：

```typescript
export function createOrchestrator(options: {
  xhs: XHSClient
  memory: Memory | null
  trace?: TraceCollector
  onToolEvent?: (event: import('./index.js').ToolEvent) => void
}): Agent {
  const { xhs, memory, trace, onToolEvent } = options
```

- [ ] **Step 2: 修改 research_agent 透传子 Agent 事件**

修改 `createResearchAgentTool` 函数（约第 31-87 行），将 `onToolEvent` 闭包捕获并在子 Agent 的 `sendMessage` 中传递：

```typescript
function createResearchAgentTool(xhs: XHSClient, trace?: TraceCollector, onToolEvent?: (event: import('./index.js').ToolEvent) => void): Tool {
```

在 `execute` 函数中（约第 75-77 行），修改 `researcher.sendMessage` 调用：

```typescript
        const result = await researcher.sendMessage(
          `请搜索并深度分析关于"${destination} ${query}"的旅行攻略。返回结构化研究摘要。`,
          (event) => {
            onToolEvent?.({ ...event, parentTool: 'research_agent' })
          },
        )
```

- [ ] **Step 3: 修改 advisor_agent 透传子 Agent 事件**

同理修改 `createAdvisorAgentTool`（约第 89 行）签名和 `sendMessage` 调用：

```typescript
function createAdvisorAgentTool(memory: Memory | null, trace?: TraceCollector, onToolEvent?: (event: import('./index.js').ToolEvent) => void): Tool {
```

在 advisor 的 `sendMessage` 调用处（约第 147 行）：

```typescript
        const result = await advisor.sendMessage(task, (event) => {
          onToolEvent?.({ ...event, parentTool: 'advisor_agent' })
        })
```

- [ ] **Step 4: doc_agent 不需要透传（无工具调用）**

`doc_agent` 的子 Agent 没有工具（`maxIterations: 1`），不需要透传。跳过。

- [ ] **Step 5: 更新 register 调用传递 onToolEvent**

修改 `createOrchestrator` 中的 register 调用（约第 226-228 行）：

```typescript
  orchestratorRegistry.register(createResearchAgentTool(xhs, trace, onToolEvent))
  orchestratorRegistry.register(createAdvisorAgentTool(memory, trace, onToolEvent))
  orchestratorRegistry.register(createDocAgentTool(trace))
```

- [ ] **Step 6: 添加 XHS 数据提取函数**

在 `src/agent/orchestrator.ts` 末尾添加提取函数：

```typescript
/** 从子 Agent 历史中提取小红书帖子信息 */
export function extractXHSNotes(history: ReadonlyArray<import('openai').ChatCompletionMessageParam>): Array<{
  id: string; title: string; author: string; url: string; likes: number; excerpt: string
}> {
  const notes: Array<{ id: string; title: string; author: string; url: string; likes: number; excerpt: string }> = []
  const seen = new Set<string>()

  for (const msg of history) {
    if (msg.role !== 'tool') continue
    const content = typeof msg.content === 'string' ? msg.content : ''
    try {
      const data = JSON.parse(content)
      // search_notes 返回数组
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id)
            notes.push({
              id: item.id,
              title: item.display_title || item.title || '未知标题',
              author: item.nickname || '未知作者',
              url: `https://www.xiaohongshu.com/explore/${item.id}`,
              likes: parseInt(item.interact_info?.liked_count ?? '0', 10) || 0,
              excerpt: '',
            })
          }
        }
      }
      // get_note 返回单个对象
      if (data?.id && data?.desc && !seen.has(data.id)) {
        seen.add(data.id)
        notes.push({
          id: data.id,
          title: data.title || '未知标题',
          author: data.nickname || '未知作者',
          url: `https://www.xiaohongshu.com/explore/${data.id}`,
          likes: parseInt(data.interact_info?.liked_count ?? '0', 10) || 0,
          excerpt: (data.desc || '').slice(0, 100),
        })
      }
    } catch {
      // 非 JSON 内容，跳过
    }
  }

  return notes
}
```

- [ ] **Step 7: Commit**

```bash
git add src/agent/orchestrator.ts
git commit -m "feat: pass onToolEvent to sub-agents and add XHS note extraction"
```

---

### Task 3: SSE SourceEvent + ChatContainer 集成

**Files:**
- Modify: `lib/agent-adapter.ts`（新增 SourceEvent）
- Modify: `components/chat/chat-container.tsx`（SSE 解析 + sources 处理）

- [ ] **Step 1: 添加 SourceEvent 类型和发送逻辑**

在 `lib/agent-adapter.ts` 中，导入 `extractXHSNotes` 并在 `onComplete` 中发送 sources：

```typescript
import { extractXHSNotes } from '@/src/agent/orchestrator'
```

在 `handleChatRequest` 中，修改 `onComplete` 回调：

```typescript
    const onComplete = conversationId
      ? (result: { response: string; toolCalls: ToolCallEvent[] }) => {
          // 提取 XHS 数据（通过 orchestrator 历史）
          // 注意：需要从 collectedToolCalls 中解析，或从 orchestrator 获取
          saveToSupabase(conversationId, message.trim(), result).catch(() => {})
        }
      : undefined
```

但实际上 extractXHSNotes 需要 orchestrator 的 history，这在 adapter 层不容易获取。**更好的方案：** 在编排器的 `sendMessage` 返回后，从编排器的 history 中提取。

修改 `handleChatRequest`，在 orchestrator.sendMessage 返回后提取 XHS 数据：

```typescript
        const response = await orchestrator.sendMessage(fullMessage, (event) => {
          // ... existing event handling ...
        })

        // 提取 XHS 攻略来源
        const sources = extractXHSNotes(orchestrator.getHistory())
        if (sources.length > 0) {
          controller.enqueue(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
        }
```

- [ ] **Step 2: 修改 ChatContainer SSE 解析处理 sources**

在 `components/chat/chat-container.tsx` 中，修改 SSE 解析循环（约第 95-116 行），添加 sources 事件处理：

```typescript
import type { ToolCallEvent } from '@/lib/agent-adapter'

// 在 sendMessage 函数内，声明 sources 变量
let sourcesData: Array<{ id: string; title: string; author: string; url: string; likes: number; excerpt: string }> | null = null

// 在 SSE 解析循环中添加：
if (parsed.type === 'sources') {
  sourcesData = (parsed as { type: 'sources'; sources: typeof sourcesData }).sources ?? null
  continue
}

// 在流结束后，将 sources 存入消息
if (sourcesData) {
  setLiveMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId ? { ...m, sources: sourcesData } : m,
    ),
  )
}
```

- [ ] **Step 3: 扩展 LiveMessage 接口**

在 `components/chat/chat-container.tsx` 的 `LiveMessage` 接口中添加 `sources` 字段：

```typescript
interface LiveMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallEvent[]
  sources?: Array<{
    id: string
    title: string
    author: string
    url: string
    likes: number
    excerpt: string
  }>
}
```

- [ ] **Step 4: 将 sources 传递给预览面板**

在 ChatContainer 中，将最新助手消息的 sources 存入 Zustand store 或通过 context 传递给预览面板。最简单的方式：在 app-store 中添加 `latestSources` 状态。

在 `stores/app-store.ts` 中添加：

```typescript
interface AppState {
  // ... existing fields
  latestSources: Array<{ id: string; title: string; author: string; url: string; likes: number; excerpt: string }> | null
  setLatestSources: (sources: AppState['latestSources']) => void
}
```

在 store 实现中：

```typescript
latestSources: null,
setLatestSources: (sources) => set({ latestSources: sources }),
```

在 ChatContainer 的 sources 处理处调用：

```typescript
import { useAppStore } from '@/stores/app-store'
const setLatestSources = useAppStore((s) => s.setLatestSources)

// 在 sourcesData 处理处
if (sourcesData) {
  setLatestSources(sourcesData)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/agent-adapter.ts components/chat/chat-container.tsx stores/app-store.ts
git commit -m "feat: add SSE sources event and pass XHS data to preview panel"
```

---

### Task 4: ToolCallDetail UI 增强

**Files:**
- Modify: `components/chat/tool-call-detail.tsx`

- [ ] **Step 1: 扩展 ToolCallDetailProps 接口**

```typescript
interface ToolCallDetailProps {
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
  args?: Record<string, unknown>
  result?: string
  children?: React.ReactNode  // 子步骤列表
}
```

- [ ] **Step 2: 更新展开态显示**

替换展开内容区域（约第 56-63 行）：

```typescript
      {isOpen && (
        <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground space-y-2">
          {args && Object.keys(args).length > 0 && (
            <div>
              <p className="font-medium text-foreground/70 mb-1">参数</p>
              {Object.entries(args).map(([key, value]) => (
                <p key={key} className="truncate">
                  <span className="text-foreground/50">{key}: </span>
                  <span className="text-foreground/80">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                </p>
              ))}
            </div>
          )}
          {result && (
            <div>
              <p className="font-medium text-foreground/70 mb-1">结果</p>
              <p className="text-foreground/60 line-clamp-3">{result}</p>
            </div>
          )}
          {children && (
            <div>
              <p className="font-medium text-foreground/70 mb-1">子步骤</p>
              <div className="space-y-1">{children}</div>
            </div>
          )}
          {!args && !result && !children && (
            <>
              <p>工具: <code className="bg-foreground/5 px-1.5 py-0.5 rounded-md text-xs">{tool}</code></p>
              {durationMs && <p>耗时: <span className="tabular-nums">{durationMs}ms</span></p>}
              <p>状态: {status === 'running' ? '执行中...' : '已完成'}</p>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/tool-call-detail.tsx
git commit -m "feat: enhance tool call detail card with args, result, and sub-steps"
```

---

### Task 5: 工具调用树聚合 + 渲染

**Files:**
- Modify: `components/chat/chat-container.tsx`（工具调用树聚合逻辑）

- [ ] **Step 1: 添加工具调用树构建函数**

在 `components/chat/chat-container.tsx` 中，添加一个辅助函数将扁平的 toolCalls 列表转为树形结构：

```typescript
interface ToolCallNode extends ToolCallEvent {
  children: ToolCallEvent[]
}

function buildToolCallTree(toolCalls: ToolCallEvent[]): ToolCallNode[] {
  const roots: ToolCallNode[] = []
  const parentMap = new Map<string, ToolCallNode>()

  for (const tc of toolCalls) {
    if (tc.parentTool) {
      // 子工具调用，找到父节点
      const parent = parentMap.get(tc.parentTool)
      if (parent) {
        parent.children.push(tc)
      }
    } else {
      // 顶层调用
      const node: ToolCallNode = { ...tc, children: [] }
      roots.push(node)
      parentMap.set(tc.tool, node)
    }
  }

  return roots
}
```

- [ ] **Step 2: 修改消息渲染使用树形结构**

在消息渲染处（约第 170-185 行），替换 toolCalls 渲染逻辑：

```typescript
            const toolCallTree = msg.toolCalls ? buildToolCallTree(msg.toolCalls) : []
            const toolCalls = toolCallTree.length > 0 ? (
              <div className="mb-2.5">
                {toolCallTree.map((node, i) => (
                  <ToolCallDetail
                    key={`${node.tool}-${i}`}
                    agent={node.agent}
                    tool={node.tool}
                    status={node.status}
                    durationMs={node.durationMs}
                    args={node.args}
                    result={node.result}
                  >
                    {node.children.map((child, j) => (
                      <div key={`${child.tool}-${j}`} className="flex items-center gap-1.5 text-xs text-muted-foreground/80 py-0.5">
                        {child.status === 'done' ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <span>{child.tool}</span>
                        {child.durationMs && <span className="tabular-nums text-muted-foreground/50">{child.durationMs}ms</span>}
                      </div>
                    ))}
                  </ToolCallDetail>
                ))}
              </div>
            ) : null
```

需要添加 `Check` 和 `Loader2` 的导入：

```typescript
import { MapPin, Compass, Sparkles, Check, Loader2 } from 'lucide-react'
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-container.tsx
git commit -m "feat: build tool call tree and render sub-steps in detail cards"
```

---

### Task 6: SourceCard 组件

**Files:**
- Create: `components/layout/source-card.tsx`

- [ ] **Step 1: 创建 SourceCard 组件**

```tsx
// components/layout/source-card.tsx
'use client'

import { Heart, ExternalLink } from 'lucide-react'

interface SourceCardProps {
  id: string
  title: string
  author: string
  url: string
  likes: number
  excerpt: string
}

export function SourceCard({ title, author, url, likes, excerpt }: SourceCardProps) {
  const likesDisplay = likes >= 1000 ? `${(likes / 1000).toFixed(1)}k` : String(likes)

  return (
    <div className="rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-snug line-clamp-2">{title}</h4>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        @{author}
        {likes > 0 && (
          <span className="inline-flex items-center gap-0.5 ml-2">
            <Heart className="h-3 w-3" />
            {likesDisplay}
          </span>
        )}
      </p>
      {excerpt && (
        <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed">
          {excerpt}
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        查看原文
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/source-card.tsx
git commit -m "feat: add source card component for XHS post citations"
```

---

### Task 7: 预览面板双标签页

**Files:**
- Modify: `components/layout/preview-panel.tsx`

- [ ] **Step 1: 添加标签页状态和 sources 数据**

在 PreviewPanel 组件中添加：

```typescript
import { SourceCard } from './source-card'
import { Map, BookOpen } from 'lucide-react'

// 在组件内部
const [activeTab, setActiveTab] = useState<'itinerary' | 'sources'>('itinerary')
const latestSources = useAppStore((s) => s.latestSources)
```

- [ ] **Step 2: 添加标签页切换 UI**

在标题栏下方、内容区上方添加标签页：

```tsx
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">行程预览</h2>
          {latestSources && latestSources.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('itinerary')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'itinerary' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Map className="h-3 w-3" />
                行程
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'sources' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen className="h-3 w-3" />
                攻略来源 ({latestSources.length})
              </button>
            </div>
          )}
        </div>
        <button
          onClick={togglePreview}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="折叠预览面板"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
```

- [ ] **Step 3: 修改内容区根据标签页切换**

替换内容区（约 `<div className="flex-1 overflow-hidden">` 部分）：

```tsx
      <div className="flex-1 overflow-hidden">
        {activeTab === 'itinerary' ? (
          previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="行程预览"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <FileDown className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">暂无行程内容</p>
              <p className="text-xs text-muted-foreground/60 mt-1">向小旅描述你的旅行需求，行程会在这里预览</p>
            </div>
          )
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {latestSources?.map((source) => (
              <SourceCard key={source.id} {...source} />
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add components/layout/preview-panel.tsx
git commit -m "feat: add itinerary/sources tab switcher to preview panel"
```

---

### Task 8: TypeScript 验证

- [ ] **Step 1: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 构建检查**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: 修复任何编译错误**

如有类型错误，修复后重新验证。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify tool detail and sources features compile correctly"
```
