# Phase 2.2 — 推理轨迹追踪系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为多 Agent 系统添加完整推理轨迹追踪，记录每次 Agent 调用的输入/输出/耗时/轮次，输出为结构化 JSON 文件。

**Architecture:** 在 `AgentOptions` 添加可选 `trace` 回调，ReAct 循环在 4 个关键位置自动记录事件（user_message / llm_call / tool_call+tool_result / final_response）。编排器为每个子 Agent 创建独立 TraceCollector，子 trace 嵌套在编排器 trace 中。不传 trace 时零开销。

**Tech Stack:** TypeScript + Node.js fs

**Design Spec:** `docs/superpowers/specs/2026-06-26-trace-tracking-design.md`

---

## 文件结构总览

```
src/trace/
├── types.ts          # ✨ TraceEvent / TraceSession / TraceCollector 类型
└── collector.ts      # ✨ createTraceCollector() 实现 + JSON 保存

src/agent/
├── index.ts          # 🔄 添加 name/trace 可选参数 + 4 个记录点
├── orchestrator.ts   # 🔄 传递 trace 到子 Agent
└── prompts.ts        # （不变）

src/index.ts          # 🔄 创建 TraceCollector，传入编排器
```

---

### Task 1: 创建追踪类型 — `trace/types.ts`

**Files:**
- Create: `src/trace/types.ts`

- [ ] **Step 1: 创建 `src/trace/types.ts`**

```typescript
/**
 * 推理轨迹追踪 — 类型定义
 *
 * Phase 2.2: Agent 可观测性基础
 */

/** 追踪事件类型 */
export type TraceEventType =
  | 'user_message'
  | 'llm_call'
  | 'tool_call'
  | 'tool_result'
  | 'final_response'

/** 单个追踪事件 */
export interface TraceEvent {
  type: TraceEventType
  timestamp: number
  /** 耗时(ms)，仅 llm_call 和 tool_result 有 */
  durationMs?: number
  data: Record<string, unknown>
}

/** 一次 Agent 会话的完整追踪 */
export interface TraceSession {
  sessionId: string
  agentName: string
  systemPromptPreview: string
  events: TraceEvent[]
  subAgentTraces?: TraceSession[]
  totalDurationMs: number
  totalIterations: number
}

/** 追踪收集器接口 */
export interface TraceCollector {
  record(event: TraceEvent): void
  getSession(): TraceSession
  saveToFile(dir: string): Promise<string>
  /** 创建子 Agent 追踪收集器 */
  createSubCollector(agentName: string): TraceCollector
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/trace/types.ts
git commit -m "feat: add trace tracking type definitions"
```

---

### Task 2: 创建追踪收集器 — `trace/collector.ts`

**Files:**
- Create: `src/trace/collector.ts`

- [ ] **Step 1: 创建 `src/trace/collector.ts`**

```typescript
/**
 * 推理轨迹追踪 — 收集器实现
 *
 * 记录 Agent 的完整推理链路，保存为 JSON 文件。
 * 每个 Agent 实例拥有独立的收集器，编排器的收集器管理子 Agent 的收集器。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { TraceEvent, TraceSession, TraceCollector } from './types.js'

/** 工具结果截断长度 */
const MAX_RESULT_LENGTH = 500

/**
 * 创建追踪收集器
 *
 * @param agentName - Agent 名称（orchestrator / researcher / advisor / doc）
 * @param systemPrompt - Agent 的 System Prompt（取前 100 字符作为摘要）
 */
export function createTraceCollector(
  agentName: string,
  systemPrompt: string = '',
): TraceCollector {
  const sessionId = `${agentName}-${Date.now()}`
  const events: TraceEvent[] = []
  const subAgentTraces: TraceSession[] = []
  const startTime = Date.now()

  function record(event: TraceEvent): void {
    // 截断过长的 tool_result
    const processedEvent = { ...event }
    if (
      processedEvent.type === 'tool_result' &&
      typeof processedEvent.data.result === 'string' &&
      processedEvent.data.result.length > MAX_RESULT_LENGTH
    ) {
      processedEvent.data = {
        ...processedEvent.data,
        result: processedEvent.data.result.slice(0, MAX_RESULT_LENGTH) + '...(截断)',
      }
    }
    events.push(processedEvent)
  }

  function getSession(): TraceSession {
    // 从事件中推断总轮次（取 llm_call 中最大的 iteration）
    let totalIterations = 0
    for (const event of events) {
      if (event.type === 'llm_call' && typeof event.data.iteration === 'number') {
        totalIterations = Math.max(totalIterations, event.data.iteration)
      }
    }

    return {
      sessionId,
      agentName,
      systemPromptPreview: systemPrompt.slice(0, 100),
      events: [...events],
      subAgentTraces: subAgentTraces.length > 0 ? [...subAgentTraces] : undefined,
      totalDurationMs: Date.now() - startTime,
      totalIterations,
    }
  }

  async function saveToFile(dir: string): Promise<string> {
    await mkdir(dir, { recursive: true })
    const fileName = `session-${sessionId}.json`
    const filePath = join(dir, fileName)
    const session = getSession()
    await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
    return filePath
  }

  function createSubCollector(agentName: string): TraceCollector {
    const sub = createTraceCollector(agentName, '')
    // 每次获取 session 时更新子追踪列表
    const originalGetSession = sub.getSession.bind(sub)
    sub.getSession = () => {
      const session = originalGetSession()
      // 查找是否已存在，更新或添加
      const existingIndex = subAgentTraces.findIndex((t) => t.sessionId === session.sessionId)
      if (existingIndex >= 0) {
        subAgentTraces[existingIndex] = session
      } else {
        subAgentTraces.push(session)
      }
      return session
    }
    return sub
  }

  return { record, getSession, saveToFile, createSubCollector }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/trace/collector.ts
git commit -m "feat: implement trace collector with JSON file output"
```

---

### Task 3: 修改 Agent 工厂 — 添加 trace 记录点

**Files:**
- Modify: `src/agent/index.ts`

- [ ] **Step 1: 扩展 `AgentOptions` 接口**

在 `AgentOptions` 中添加 `name` 和 `trace` 字段：

```typescript
import type { TraceCollector } from '../trace/types.js'

export interface AgentOptions {
  systemPrompt: string
  registry?: ToolRegistry
  maxIterations?: number
  /** Agent 名称（追踪日志标识） */
  name?: string
  /** 追踪收集器（可选，不传则零开销） */
  trace?: TraceCollector
}
```

- [ ] **Step 2: 在 ReAct 循环中添加 4 个 trace 记录点**

修改 `createAgent` 函数，在以下 4 个位置添加 trace 记录：

**位置 1 — 用户消息加入后（line 53 之后）：**
```typescript
history.push({ role: 'user', content: userInput })
options.trace?.record({
  type: 'user_message',
  timestamp: Date.now(),
  data: { content: userInput },
})
```

**位置 2 — LLM 调用前后（line 56 前后）：**
```typescript
const llmStart = Date.now()
const response = await chatWithTools({ ... })
options.trace?.record({
  type: 'llm_call',
  timestamp: Date.now(),
  durationMs: Date.now() - llmStart,
  data: {
    iteration: iteration + 1,
    hasToolCalls: !!(message.tool_calls && message.tool_calls.length > 0),
    content: message.tool_calls ? undefined : (message.content ?? ''),
  },
})
```

**位置 3 — 工具调用前后（line 88 前后）：**
```typescript
// 调用前
options.trace?.record({
  type: 'tool_call',
  timestamp: Date.now(),
  data: { name: toolName, args: toolArgs, iteration: iteration + 1 },
})

// 执行后（在 result 赋值之后）
options.trace?.record({
  type: 'tool_result',
  timestamp: Date.now(),
  data: { name: toolName, result, error: result.startsWith('错误') || result.startsWith('工具执行失败') ? result : undefined },
})
```

**位置 4 — 最终回复（line 70 和 line 112 之前）：**
```typescript
// 在 return 之前
options.trace?.record({
  type: 'final_response',
  timestamp: Date.now(),
  data: { content: message.content ?? '', totalIterations: iteration + 1 },
})
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误（trace 是可选参数，不影响现有调用）

- [ ] **Step 4: 提交**

```bash
git add src/agent/index.ts
git commit -m "feat: add optional trace recording points to ReAct loop"
```

---

### Task 4: 修改编排器 — 传递 trace 到子 Agent

**Files:**
- Modify: `src/agent/orchestrator.ts`

- [ ] **Step 1: 修改 `createOrchestrator` 接受 trace 参数**

```typescript
import type { TraceCollector } from '../trace/types.js'

export function createOrchestrator(options: {
  xhs: XHSClient
  memory: Memory | null
  trace?: TraceCollector
}): Agent {
```

- [ ] **Step 2: 传递 trace 到编排器的 createAgent 调用**

```typescript
return createAgent({
  systemPrompt: ORCHESTRATOR_SYSTEM,
  registry: orchestratorRegistry,
  maxIterations: 10,
  name: 'orchestrator',
  trace: options.trace,
})
```

- [ ] **Step 3: 为每个子 Agent 创建子 trace 收集器**

在 `createResearchAgentTool`、`createAdvisorAgentTool`、`createDocAgentTool` 中，接受可选 `trace` 参数，为子 Agent 创建 `trace.createSubCollector('researcher')` 等。

修改工厂函数签名：
```typescript
function createResearchAgentTool(xhs: XHSClient, trace?: TraceCollector): Tool {
```

在 `execute` 中创建子 Agent 时传入子 trace：
```typescript
const subTrace = trace?.createSubCollector('researcher')
const researcher = createAgent({
  systemPrompt: RESEARCHER_SYSTEM,
  registry: researchRegistry,
  maxIterations: 6,
  name: 'researcher',
  trace: subTrace,
})
```

对 advisor（`'advisor'`）和 doc（`'doc'`）做同样处理。

在 `createOrchestrator` 中传递 trace：
```typescript
orchestratorRegistry.register(createResearchAgentTool(xhs, options.trace))
orchestratorRegistry.register(createAdvisorAgentTool(memory, options.trace))
orchestratorRegistry.register(createDocAgentTool(options.trace))
```

- [ ] **Step 4: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/agent/orchestrator.ts
git commit -m "feat: pass trace collector to sub-agents in orchestrator"
```

---

### Task 5: 修改入口 — 集成追踪系统

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 添加 trace 导入和创建**

在 `src/index.ts` 顶部添加导入：
```typescript
import { createTraceCollector } from './trace/collector.js'
```

在编排器创建之前：
```typescript
// 3. 创建追踪收集器
const trace = createTraceCollector('orchestrator', '你是旅行规划总指挥"小旅"。')

// 4. 创建编排器（内部注册 3 个 Agent 工具）
const orchestrator = createOrchestrator({ xhs, memory, trace })
```

- [ ] **Step 2: 退出时保存追踪日志**

在 `finally` 块中添加：
```typescript
finally {
  rl.close()
  xhs.stop()
  // 保存追踪日志
  try {
    const filePath = await trace.saveToFile('traces')
    console.log(`📊 追踪日志已保存: ${filePath}`)
  } catch (error) {
    console.warn('⚠️  追踪日志保存失败:', (error as Error).message)
  }
}
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/index.ts
git commit -m "feat: integrate trace tracking into entry point"
```

---

### Task 6: 验证追踪系统

**目标：** 运行系统，验证 JSON 追踪文件生成正确。

- [ ] **Step 1: 启动系统**

Run: `npm run dev`

Expected: 正常启动，无额外输出差异

- [ ] **Step 2: 测试完整流程**

输入: `帮我规划3天东京亲子游`
等待完成，输入 `/quit`

Expected: 退出后显示 `📊 追踪日志已保存: traces/session-orchestrator-xxxxx.json`

- [ ] **Step 3: 检查 JSON 文件**

Run: `cat traces/session-*.json | head -50`

Expected: JSON 包含：
- `agentName: "orchestrator"`
- `events` 数组含 `user_message`、`llm_call`、`tool_call`、`tool_result`、`final_response` 事件
- `subAgentTraces` 数组含 researcher/advisor/doc 的独立追踪
- 每个 `llm_call` 和 `tool_result` 有 `durationMs` 字段
- `tool_result` 中长文本被截断到 500 字符

- [ ] **Step 4: 验证不传 trace 时正常工作**

临时注释掉 `src/index.ts` 中 trace 相关代码，运行 `npx tsc --noEmit`，确认编译通过。

---

## 总结

| Task | 文件 | 变更类型 |
|------|------|---------|
| 1 | `src/trace/types.ts` | 新增：类型定义 |
| 2 | `src/trace/collector.ts` | 新增：收集器实现 |
| 3 | `src/agent/index.ts` | 修改：添加 4 个 trace 记录点 |
| 4 | `src/agent/orchestrator.ts` | 修改：传递 trace 到子 Agent |
| 5 | `src/index.ts` | 修改：创建 collector，退出时保存 |
| 6 | 手动验证 | 运行 + 检查 JSON 文件 |
