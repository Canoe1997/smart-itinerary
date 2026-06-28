# 工具调用详情增强 + 小红书攻略引用

> 增强子 Agent 执行过程展示，新增小红书攻略来源引用面板。

## 1. 工具调用详情增强

### 1.1 数据流改造

**ToolEvent 接口扩展（`src/agent/index.ts`）：**

```typescript
export interface ToolEvent {
  tool: string
  status: 'start' | 'end'
  durationMs?: number
  args?: Record<string, unknown>    // 新增：工具参数
  result?: string                    // 新增：执行结果（截取前 500 字）
  parentTool?: string                // 新增：父工具名（子 Agent 场景）
}
```

- `start` 事件附带 `args`
- `end` 事件附带 `result`（截取前 500 字避免 SSE 数据过大）

**ToolCallEvent SSE 接口扩展（`lib/agent-adapter.ts`）：**

```typescript
export interface ToolCallEvent {
  type: 'tool-call'
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
  args?: Record<string, unknown>    // 新增
  result?: string                    // 新增
  parentTool?: string                // 新增：标识属于哪个子 Agent
}
```

### 1.2 子 Agent 事件透传

**编排器改造（`src/agent/orchestrator.ts`）：**

当前 `research_agent`/`advisor_agent`/`doc_agent` 的 `execute()` 函数创建子 Agent 时，不传 `onToolEvent`。需要改造为：

1. 编排器的 `execute()` 闭包捕获外层 `onToolEvent`
2. 子 Agent 的 `sendMessage()` 传入回调，将子工具事件包装为 `parentTool: 'research_agent'` 后转发

```typescript
// research_agent.execute() 内部
const researcher = createAgent({ ... })
const result = await researcher.sendMessage(task, (event) => {
  onToolEvent?.({
    ...event,
    parentTool: 'research_agent',  // 标记来源
  })
})
```

这样前端能看到：
- `research_agent` start（编排器层级）
- `search_xhs_notes` start（研究员内部，parentTool='research_agent'）
- `search_xhs_notes` end
- `get_xhs_note` start
- `get_xhs_note` end
- `research_agent` end

### 1.3 前端 ToolCallDetail 增强

**展开态显示内容：**

```
┌─────────────────────────────────────────────┐
│ ▼ 🔍 研究员  search_xhs_notes ✅ 1.2s      │
├─────────────────────────────────────────────┤
│ 搜索: "东京亲子游 攻略"                       │
│ 结果: 找到 5 篇攻略，已获取 3 篇详细内容...     │
│                                             │
│ ┌─ 子步骤 ─────────────────────────────┐    │
│ │ ✅ search_xhs_notes  0.8s            │    │
│ │ ✅ get_xhs_note  "东京3天攻略" 0.5s   │    │
│ │ ✅ get_xhs_note  "带娃东京行" 0.4s    │    │
│ └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**数据聚合逻辑：**

ChatContainer 中维护一个 `toolCallTree` 结构：
- 顶层 toolCall（如 research_agent）包含 `children: ToolCallEvent[]`
- 子 Agent 的工具调用通过 `parentTool` 匹配到父节点
- ToolCallDetail 组件接收树形数据而非扁平列表

---

## 2. 小红书攻略引用

### 2.1 数据收集

**Agent 层面（`src/agent/orchestrator.ts`）：**

编排器的 `research_agent` 工具在执行完成后，解析子 Agent 的工具调用历史，提取 XHS 帖子信息：

```typescript
// 从子 Agent 历史中提取 XHS 数据
const xhsNotes = extractXHSNotes(researcher.getHistory())

function extractXHSNotes(history) {
  // 找到 get_xhs_note 的结果，解析 JSON
  // 提取 id, title, nickname, interact_info, desc
  // 构造 URL: https://www.xiaohongshu.com/explore/{id}
}
```

**SSE 新增事件类型（`lib/agent-adapter.ts`）：**

```typescript
interface SourceEvent {
  type: 'sources'
  sources: Array<{
    id: string
    title: string
    author: string
    url: string
    likes: number
    excerpt: string    // desc 前 100 字
  }>
}
```

在 `handleChatRequest` 的 `onComplete` 回调中，从 collectedToolCalls 中解析 XHS 数据并发送 SourceEvent。

**存储：** sources 数据随消息一起写入 Supabase（`messages` 表的 `tool_calls` JSONB 字段扩展）。

### 2.2 前端 — 预览面板标签页

**右侧面板改为双标签页：**

```
┌──────────────────────────┐
│ [行程预览] [攻略来源]  [▶] │
├──────────────────────────┤
│                          │
│  标签页内容               │
│                          │
└──────────────────────────┘
```

- `行程预览` 标签：现有 HTML iframe 渲染（不变）
- `攻略来源` 标签：卡片列表，每个帖子一张卡片

**攻略卡片设计：**

```
┌────────────────────────────┐
│ 📝 东京3天亲子游攻略         │
│ @旅行达人小明 · ❤️ 2.3k     │
│                            │
│ 带娃去了浅草寺和晴空塔，     │
│ teamLab真的太适合小朋友...   │
│                            │
│ [查看原文 →]                │
└────────────────────────────┘
```

- 标题 `text-sm font-medium`
- 作者 + 点赞数 `text-xs text-muted-foreground`
- 摘要 `text-xs text-muted-foreground/80`，最多 3 行
- "查看原文" 链接 → `https://www.xiaohongshu.com/explore/{id}`（新窗口打开）
- 卡片 hover 时微抬阴影

**数据来源：** 从 conversation store 的 messages 中找到最后一条包含 sources 的消息。

### 2.3 ChatContainer 集成

SSE 解析循环中新增 `type: 'sources'` 事件处理：

```typescript
if (parsed.type === 'sources') {
  // 存储到当前助手消息的 sources 字段
  sourcesData = parsed.sources
}
```

消息渲染时，将 sources 传递给预览面板。

---

## 文件变更总结

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/index.ts` | 修改 | ToolEvent 增加 args/result/parentTool |
| `src/agent/orchestrator.ts` | 修改 | 子 Agent 事件透传 + XHS 数据提取 |
| `lib/agent-adapter.ts` | 修改 | ToolCallEvent 扩展 + SourceEvent |
| `lib/itinerary-html.ts` | 不变 | — |
| `components/chat/tool-call-detail.tsx` | 修改 | 展开态显示参数/结果/子步骤 |
| `components/chat/chat-container.tsx` | 修改 | 工具调用树聚合 + sources 事件处理 |
| `components/layout/preview-panel.tsx` | 修改 | 双标签页（行程预览 + 攻略来源） |
| `components/layout/source-card.tsx` | 新建 | 攻略引用卡片组件 |
