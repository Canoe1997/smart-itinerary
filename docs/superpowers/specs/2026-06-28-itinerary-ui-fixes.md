# 行程 UI 修复 + 工具状态 + 展示重设计

> 修复工具调用状态、行程解析器 bug、行程展示 UX 三个问题。

## 1. 工具调用状态修复

### 问题

`src/agent/index.ts` 的 `onToolCall` 回调在工具执行**前**触发，只发 `status: 'running'`。工具完成后无事件，UI 永远显示加载中。

### 方案

修改 `sendMessage` 的回调签名，支持 start/end 两种事件：

**`src/agent/index.ts`：**
- 回调类型从 `(toolName: string) => void` 改为 `(event: { tool: string; status: 'start' | 'end'; durationMs?: number }) => void`
- 工具执行前调用 `{ tool: toolName, status: 'start' }`
- 工具执行后调用 `{ tool: toolName, status: 'end', durationMs }`

**`lib/agent-adapter.ts`：**
- 适配新回调，发送两种 SSE 事件：
  - start → `{ type: 'tool-call', status: 'running' }`
  - end → `{ type: 'tool-call', status: 'done', durationMs }`

**`components/chat/chat-container.tsx`：**
- 收到 `status: 'done'` 事件时，更新对应 toolCall 的状态（用 tool 名匹配最后一个 running 的）
- `collectedToolCalls` 存入 Supabase 时使用最终 done 状态

**`components/chat/tool-call-detail.tsx`：**
- 无需修改（已支持 running/done 两种渲染）

### 影响范围

- `src/agent/index.ts` — 回调签名 + 工具执行包裹
- `src/agent/orchestrator.ts` — 透传回调签名
- `lib/agent-adapter.ts` — SSE 事件适配
- `components/chat/chat-container.tsx` — done 事件解析

---

## 2. 行程解析器修复

### 问题

1. 活动项在时间段关键词之前出现时被丢弃（`currentTimeSlot` 为 null）
2. 只识别 `## Day N` / `## 第N天` 格式，不识别 `**Day N**` 等
3. 解析结果无缓存，每次渲染重复计算

### 方案

**`lib/itinerary-parser.ts`：**
- 活动项无时间段时，自动归入默认 `morning` 时间段
- 扩展 Day 标题正则，支持 `**Day N**`、`Day N:`、`第N天：` 等格式
- 去重：同一 Day 内相同 period 只保留一个 TimeSlot（合并活动）

**`components/chat/chat-container.tsx`：**
- 用 `useMemo` 缓存 `parseItinerary` 结果

**`components/itinerary/day-card.tsx`：**
- 无需修改

---

## 3. 行程展示 UX 重设计

### 问题

行程内容在聊天区（Timeline + Markdown）和右侧预览面板**重复显示**。

### 方案

行程消息在聊天区改为**紧凑摘要卡片**，完整内容仅在右侧预览面板显示。

**新增组件 `components/chat/itinerary-card.tsx`：**

```
┌─────────────────────────────────────┐
│ 📋 行程已规划完成                     │
│                                     │
│ 东京亲子游 · 3天 · 5个景点           │
│                                     │
│ [查看完整行程 →]  [导出 PDF]         │
└─────────────────────────────────────┘
```

样式：
- `bg-card border border-border rounded-xl p-4`
- 标题 `text-sm font-semibold`，摘要 `text-xs text-muted-foreground`
- "查看完整行程" 按钮 → 调用 `togglePreview()` 展开右面板
- "导出 PDF" 按钮 → POST `/api/pdf` 下载
- Lucide 图标：Map + FileDown + ChevronRight

**`components/chat/chat-container.tsx` 修改：**

行程消息的渲染逻辑：

```
之前：
  if (parseItinerary(msg.content)) {
    return <>
      <Timeline content={msg.content} />      // 结构化卡片
      <MessageBubble content={msg.content}>   // 完整 Markdown（重复！）
        {toolCalls}
      </MessageBubble>
    </>
  }

之后：
  if (parseItinerary(msg.content)) {
    return <>
      {toolCalls}                              // 工具调用详情
      <ItineraryCard content={msg.content} /> // 紧凑摘要卡片
    </>
  }
```

- 行程消息不再使用 `<MessageBubble>`（不渲染完整 Markdown）
- 工具调用详情保留在摘要卡片上方
- `parseItinerary` 结果通过 props 传给 ItineraryCard 提取摘要

**右侧面板 `components/layout/preview-panel.tsx`：**
- 保持不变（Markdown 渲染 + PDF 导出）

---

## 文件变更总结

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/index.ts` | 修改 | 回调签名 + 工具执行包裹 |
| `src/agent/orchestrator.ts` | 修改 | 透传回调签名 |
| `lib/agent-adapter.ts` | 修改 | SSE start/end 事件 |
| `lib/itinerary-parser.ts` | 修改 | 解析器 bug 修复 |
| `components/chat/itinerary-card.tsx` | 新建 | 行程摘要卡片 |
| `components/chat/chat-container.tsx` | 修改 | 行程渲染逻辑 + useMemo |
