# Phase 2.2 — 推理轨迹追踪系统设计

> **项目**：Smart Itinerary — 基于小红书真实经验的 AI 旅行规划 Agent
> **日期**：2026-06-26
> **状态**：设计完成，待实现

---

## 1. 背景与目标

### 当前状态（Phase 2.1）

多 Agent 系统运行正常（编排器 + 研究员 + 顾问 + 文档），但无法看到 Agent 内部的推理过程。当 Agent 做出错误决策时，缺乏调试手段。

### Phase 2.2 目标

为 Agent 系统添加完整推理轨迹追踪，记录每次调用的输入/输出/耗时/轮次。

**学习目标**：
- Agent 推理轨迹追踪（Trace Collector 模式）
- 可观测性基础（Observability）
- 结构化日志设计

**参考**：《智能体 AI 权威指南》第7章 7.1~7.5

---

## 2. 架构设计

### 2.1 核心概念

**Trace Collector 模式**：在 `AgentOptions` 中添加可选 `trace` 回调，ReAct 循环在关键节点自动记录事件。不传 trace 则零开销。

```
用户消息 → [TraceEvent: user_message]
LLM 调用 → 计时 → [TraceEvent: llm_call] (含耗时)
工具调用 → [TraceEvent: tool_call] → 执行 → [TraceEvent: tool_result] (含耗时)
最终回复 → [TraceEvent: final_response]
```

### 2.2 追踪范围

| Agent | 追踪内容 | 说明 |
|-------|---------|------|
| 编排器 | 用户消息 + LLM 调用 + Agent 工具调用/结果 + 最终回复 | 编排层决策 |
| 研究员 | LLM 调用 + XHS 工具调用/结果 | 数据收集过程 |
| 顾问 | LLM 调用 + 高德/记忆工具调用/结果 | 推荐生成过程 |
| 文档 | LLM 调用（无工具） | 格式化过程 |

每个子 Agent 产生独立 TraceSession，编排器 TraceSession 通过 `subAgentTraces` 引用子 Agent。

---

## 3. 数据模型

### 3.1 TraceEvent

```typescript
/** 追踪事件类型 */
type TraceEventType = 'user_message' | 'llm_call' | 'tool_call' | 'tool_result' | 'final_response'

/** 单个追踪事件 */
interface TraceEvent {
  type: TraceEventType
  timestamp: number
  /** 耗时(ms)，仅 llm_call 和 tool_result 有 */
  durationMs?: number
  data: Record<string, unknown>
}
```

各事件类型的 `data` 字段：

| type | data 字段 | 说明 |
|------|----------|------|
| `user_message` | `{ content: string }` | 用户输入 |
| `llm_call` | `{ iteration: number, hasToolCalls: boolean, content?: string }` | LLM 响应 |
| `tool_call` | `{ name: string, args: Record<string,unknown>, iteration: number }` | 工具调用请求 |
| `tool_result` | `{ name: string, result: string, error?: string }` | 工具执行结果 |
| `final_response` | `{ content: string, totalIterations: number }` | 最终回复 |

### 3.2 TraceSession

```typescript
/** 一次 Agent 会话的完整追踪 */
interface TraceSession {
  sessionId: string
  agentName: string
  systemPromptPreview: string  // 前 100 字符
  events: TraceEvent[]
  subAgentTraces?: TraceSession[]
  totalDurationMs: number
  totalIterations: number
}
```

### 3.3 JSON 输出示例

```json
{
  "sessionId": "orch-1719412800000",
  "agentName": "orchestrator",
  "systemPromptPreview": "你是旅行规划总指挥\"小旅\"...",
  "events": [
    { "type": "user_message", "timestamp": 1719412800000, "data": { "content": "帮我规划3天东京亲子游" } },
    { "type": "llm_call", "timestamp": 1719412802000, "durationMs": 2000, "data": { "iteration": 1, "hasToolCalls": true } },
    { "type": "tool_call", "timestamp": 1719412802100, "data": { "name": "research_agent", "args": { "query": "亲子游攻略", "destination": "东京" }, "iteration": 1 } },
    { "type": "tool_result", "timestamp": 1719412835000, "durationMs": 32900, "data": { "name": "research_agent", "result": "攻略研究摘要..." } },
    { "type": "final_response", "timestamp": 1719412900000, "data": { "content": "# 🗺️ 东京3天...", "totalIterations": 3 } }
  ],
  "subAgentTraces": [
    {
      "sessionId": "res-1719412802100",
      "agentName": "researcher",
      "events": [
        { "type": "llm_call", "data": { "iteration": 1, "hasToolCalls": true } },
        { "type": "tool_call", "data": { "name": "search_xhs_notes", "args": { "keyword": "东京亲子游攻略" } } },
        { "type": "tool_result", "data": { "name": "search_xhs_notes", "result": "..." } }
      ],
      "totalIterations": 3
    }
  ],
  "totalDurationMs": 100000,
  "totalIterations": 3
}
```

---

## 4. 实现设计

### 4.1 TraceCollector 接口

```typescript
interface TraceCollector {
  record(event: TraceEvent): void
  getSession(): TraceSession
  saveToFile(dir: string): Promise<string>  // 返回文件路径
}
```

### 4.2 AgentOptions 扩展

```typescript
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

### 4.3 ReAct 循环追踪点

在 `src/agent/index.ts` 的 ReAct 循环中，4 个关键位置记录事件：

1. **用户消息加入后** → `trace.record({ type: 'user_message', ... })`
2. **LLM 调用前后** → 计时，调用后 `trace.record({ type: 'llm_call', durationMs, ... })`
3. **工具调用前后** → 调用前 `trace.record({ type: 'tool_call', ... })`，执行后 `trace.record({ type: 'tool_result', durationMs, ... })`
4. **最终回复** → `trace.record({ type: 'final_response', ... })`

### 4.4 编排器子 Agent 追踪

`orchestrator.ts` 中为每个子 Agent 创建独立 TraceCollector，子 Agent trace 作为 `subAgentTraces` 嵌套在编排器 trace 中。

### 4.5 入口集成

```typescript
// src/index.ts
import { createTraceCollector } from './trace/collector.js'

const trace = createTraceCollector('orchestrator')
const orchestrator = createOrchestrator({ xhs, memory, trace })

// ... 对话循环 ...

// 退出时保存
const filePath = await trace.saveToFile('traces')
console.log(`📊 追踪日志已保存: ${filePath}`)
```

---

## 5. 文件结构变更

```
src/
├── agent/
│   ├── index.ts          # 🔄 添加 trace 可选参数和 4 个记录点
│   ├── orchestrator.ts   # 🔄 传递 trace 到子 Agent
│   └── prompts.ts        # （不变）
├── trace/
│   ├── collector.ts      # ✨ createTraceCollector() 实现
│   └── types.ts          # ✨ TraceEvent / TraceSession / TraceCollector 类型
└── index.ts              # 🔄 创建 TraceCollector，传入编排器，退出时保存
```

### 变更说明

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `agent/index.ts` | 修改 | ReAct 循环添加 4 个 trace 记录点 |
| `agent/orchestrator.ts` | 修改 | 为子 Agent 创建独立 TraceCollector |
| `trace/types.ts` | 新增 | 类型定义 |
| `trace/collector.ts` | 新增 | Collector 实现 + JSON 保存 |
| `index.ts` | 修改 | 创建 collector，传入编排器 |

### 不变的部分

- `agent/prompts.ts` — Prompt 不受影响
- `tools/` — 所有工具文件不变
- `mcp/`、`memory/`、`config.ts`、`mimo-client.ts` — 不变

---

## 6. 验收标准

- [ ] `npm run build` 编译无错误
- [ ] `npm run dev` 启动正常，输入旅行需求后正常规划
- [ ] 退出后 `traces/` 目录生成 JSON 文件
- [ ] JSON 包含编排器的完整事件序列（user_message → llm_call → tool_call → tool_result → ... → final_response）
- [ ] JSON 包含 `subAgentTraces`（研究员、顾问、文档各自的事件序列）
- [ ] 每个事件有 `timestamp`，LLM 和工具调用有 `durationMs`
- [ ] 不传 trace 时系统正常运行（零开销）

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Trace 数据过大 | 大量工具结果可能导致 JSON 文件很大 | tool_result 中截断到前 500 字符 |
| 追踪影响性能 | 每次事件写入内存数组 | 内存写入开销极小，仅退出时写文件 |
| 修改 ReAct 循环引入 bug | 核心代码改动 | 可选 trace，不传则完全不影响 |
