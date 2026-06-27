# Phase 3 — 前端 + 工程化设计文档

> Smart Itinerary 旅行规划 Agent 的 Web UI 设计。

## 1. 目标

将现有 CLI 交互的多 Agent 旅行规划系统迁移为 Next.js Web 应用，提供：
- 多轮对话界面（SSE 流式输出）
- 行程可视化展示（Timeline + Day Cards）
- PDF 行程单导出
- 暗色模式 + 移动端适配
- 用户偏好设置

## 2. 技术栈

| 层面 | 选择 | 版本/说明 |
|------|------|----------|
| 框架 | Next.js (App Router) | 15.x, React 19 |
| UI 库 | shadcn/ui + Tailwind CSS | 4.x |
| 流式通信 | Vercel AI SDK | `ai` + `@ai-sdk/react` |
| 状态管理 | Zustand | 轻量，持久化到 localStorage |
| 主题 | next-themes | system/light/dark |
| PDF | Puppeteer | 服务端生成 A4 PDF |
| 包管理 | npm | 单仓结构 |

## 3. 架构

### 3.1 单仓结构

Next.js App Router 作为主框架，现有 Agent 代码保持在 `src/` 下，通过 API Routes 直接调用。

```
smart-itinerary/
├── src/                        ← 现有 Agent 代码（几乎不改）
│   ├── agent/
│   │   ├── index.ts            # Agent 工厂 + ReAct 循环
│   │   ├── orchestrator.ts     # 多 Agent 编排器
│   │   └── prompts.ts          # 4 个 Agent System Prompt
│   ├── tools/                  # 工具注册 + 实现
│   ├── trace/                  # 推理轨迹追踪
│   ├── mcp/                    # XHS MCP 客户端
│   ├── memory/                 # Supabase 记忆系统
│   ├── mimo-client.ts          # MiMo API 客户端
│   └── config.ts               # 配置
├── app/                        ← Next.js App Router
│   ├── layout.tsx              # 根布局（ThemeProvider + 全局样式）
│   ├── page.tsx                # 首页（聊天界面）
│   ├── globals.css             # Tailwind + CSS 变量主题
│   ├── api/
│   │   ├── chat/route.ts       # SSE 流式聊天端点
│   │   └── pdf/route.ts        # PDF 导出端点
│   └── settings/
│       └── page.tsx            # 用户偏好设置页
├── components/
│   ├── chat/                   # 聊天组件
│   │   ├── chat-container.tsx  # 消息列表 + useChat 集成
│   │   ├── message-bubble.tsx  # 单条消息（Markdown + 气泡）
│   │   ├── tool-call-detail.tsx # 可折叠工具调用卡片
│   │   └── input-bar.tsx       # 输入框 + 发送 + PDF 按钮
│   ├── itinerary/              # 行程展示组件
│   │   ├── timeline.tsx        # 行程时间线容器
│   │   └── day-card.tsx        # 单日行程卡片
│   ├── layout/                 # 布局组件
│   │   ├── header.tsx          # 顶部导航栏
│   │   └── theme-provider.tsx  # 暗色模式 Provider
│   └── ui/                     # shadcn/ui 组件（自动生成）
├── lib/
│   ├── agent-adapter.ts        # Agent ↔ Vercel AI SDK 适配层
│   ├── pdf-generator.ts        # Puppeteer PDF 生成
│   └── itinerary-parser.ts     # 行程 Markdown → 结构化数据
├── stores/
│   └── app-store.ts            # Zustand store（偏好、主题）
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.local
```

### 3.2 通信流程

```
用户输入 → useChat hook → POST /api/chat (SSE)
                ↓
      app/api/chat/route.ts
                ↓
      lib/agent-adapter.ts
        ├── 从 Zustand store 读取用户偏好
        ├── 创建 TraceCollector
        ├── 创建 Orchestrator Agent
        ├── 调用 agent.sendMessage()
        └── 将响应转为 StreamingTextResponse
                ↓
      SSE 流式响应 → 前端逐 token 渲染
                ↓
      会话结束 → 保存 trace → 清理 Agent 实例
```

**关键设计决策：**
- 每次 `/api/chat` 请求创建新的 Agent 实例（与 CLI 行为一致）
- Vercel AI SDK 的 `useChat` 内置消息列表、loading 状态、错误处理
- Agent 的多轮对话通过 `useChat` 的 messages 数组自动维护

### 3.3 Agent 适配层

`lib/agent-adapter.ts` 负责将现有 Agent 与 Vercel AI SDK 对接：

```typescript
export async function handleChatRequest(messages: Message[]): Promise<StreamingTextResponse> {
  const preferences = getAppStore().preferences
  const trace = createTraceCollector('orchestrator')
  const orchestrator = createOrchestrator({ xhs, memory, trace })

  const lastMessage = messages[messages.length - 1].content

  // 方案：使用 ReadableStream 实现流式
  // Agent.sendMessage() 返回完整字符串（MiMo API 非流式）
  // 通过 ReadableStream 逐字符/逐 chunk 推送，模拟流式体验
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await orchestrator.sendMessage(lastMessage)
        // 逐 chunk 推送（每 20ms 一个 chunk，模拟打字效果）
        const chunks = response.match(/.{1,20}/gs) || []
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
          await new Promise(r => setTimeout(r, 20))
        }
      } catch (error) {
        controller.enqueue(new TextEncoder().encode('\n\n❌ 发生错误，请重试'))
      } finally {
        controller.close()
        trace.saveToFile('traces').catch(console.warn)
      }
    }
  })

  return new StreamingTextResponse(stream)
}
```

**流式策略说明：**
- MiMo API 当前为非流式返回（`chatWithTools` 返回完整字符串）
- 使用 `ReadableStream` + chunk 推送模拟流式输出，提升用户体验
- 后续如 MiMo 支持流式 API，可直接替换为真正的流式传输
- 工具调用进度通过 SSE 自定义数据事件传输（`data: {"type":"tool-call",...}\n\n`）
```

## 4. UI 设计

### 4.1 页面布局

```
┌─────────────────────────────────────────────┐
│ Header: Logo + "小旅" + 设置齿轮 + 暗色切换  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 聊天区域（主内容，max-w-3xl 居中）    │    │
│  │                                     │    │
│  │  [用户气泡] 我想规划3天东京亲子游     │    │
│  │                                     │    │
│  │  [Agent气泡] 好的，我来帮你规划！    │    │
│  │   ┌─ 🔍 研究员: 搜索小红书 ─────┐  │    │
│  │   │  xhs_search("东京亲子游")   │  │    │
│  │   │  → 找到 5 篇热门攻略        │  │    │
│  │   └──────────────────────────────┘  │    │
│  │   ┌─ 🧭 顾问: 查询天气 ─────────┐  │    │
│  │   │  get_weather("东京")        │  │    │
│  │   │  → 25°C 晴                 │  │    │
│  │   └──────────────────────────────┘  │    │
│  │                                     │    │
│  │  [行程卡片区域]                      │    │
│  │  ┌─ Day 1 ─────────────────────┐   │    │
│  │  │ 🌅 上午: 浅草寺 + 晴空塔     │   │    │
│  │  │ 🍜 午餐: 抹茶甜品店          │   │    │
│  │  │ 🎢 下午: teamLab            │   │    │
│  │  └──────────────────────────────┘  │    │
│  │  ┌─ Day 2 ─────────────────────┐   │    │
│  │  │ ...                         │   │    │
│  │  └──────────────────────────────┘  │    │
│  └─────────────────────────────────────┘    │
│                                             │
├─────────────────────────────────────────────┤
│ [输入框] 输入你的旅行需求...     [发送] [PDF] │
└─────────────────────────────────────────────┘
```

### 4.2 组件规格

**chat-container** — 聊天容器
- 使用 `useChat` hook 管理消息状态
- 自动滚动到最新消息
- 加载状态显示 typing indicator

**message-bubble** — 消息气泡
- 用户消息：右侧，主色调背景
- Agent 消息：左侧，浅灰背景
- 支持 Markdown 渲染（react-markdown + remark-gfm）
- 代码块语法高亮

**tool-call-detail** — 工具调用卡片（可折叠）
- 默认折叠，显示图标 + 简短状态（如"🔍 正在搜索小红书…"）
- 展开后显示：工具名、参数、结果（截断）、耗时
- 不同 Agent 用不同颜色标识：研究员蓝色、顾问绿色、文档紫色

**timeline + day-card** — 行程展示
- 自动解析 Agent 返回的行程文本（`lib/itinerary-parser.ts`）
- 识别 `Day N` / `第N天` 标题行，提取时间段（上午/下午/晚上）和地点
- 按天分组，每天一个 Day Card（时间段、地点、餐饮、交通）
- 解析失败时退化为纯 Markdown 渲染（react-markdown）

**工具调用进度传输：**
- Agent 的 `onToolCall` 回调在 API Route 中触发
- 通过 SSE 自定义数据事件推送到前端：`data: {"type":"tool-call","agent":"researcher","tool":"xhs_search","status":"running"}`
- 前端解析自定义事件，更新 tool-call-detail 组件状态

**input-bar** — 输入栏
- 固定底部，支持 Shift+Enter 换行
- 发送按钮 + PDF 导出按钮
- 移动端适配键盘弹出（`safe-area-inset-bottom`）
- 发送中禁用输入，显示 loading 状态

### 4.3 暗色模式

- shadcn/ui CSS 变量系统：`--background`, `--foreground`, `--primary` 等
- `next-themes` ThemeProvider 包裹根布局
- 三种模式：system（默认）/ light / dark
- Header 右侧图标切换

### 4.4 移动端适配

- 聊天气泡窄屏全宽，宽屏限宽 `max-w-3xl`
- 行程卡片移动端单列，桌面端可并排
- Header 移动端精简（Logo + 暗色切换）
- 输入栏 `position: fixed` + `safe-area-inset-bottom`

### 4.5 设置页 `/settings`

```
┌────────────────────────────────┐
│ ← 返回     设置                │
├────────────────────────────────┤
│ 🎨 主题        [跟随系统 ▾]    │
│ 📅 默认天数     [3]            │
│ 👤 出行人数     [2]            │
│ 💰 预算偏好     [中等 ▾]       │
│ 🗣️ 语言        [中文 ▾]       │
├────────────────────────────────┤
│ 📊 推理轨迹                    │
│    [查看最近的 trace 文件]     │
└────────────────────────────────┘
```

偏好存储在 Zustand store + `localStorage`，持久化跨会话。创建 Agent 时偏好注入 system prompt。

## 5. PDF 导出

### 5.1 API 端点

`POST /api/pdf` — 接收行程 Markdown，返回 PDF 文件。

**请求体：**
```typescript
interface PdfRequest {
  itinerary: string    // Agent 返回的行程 Markdown
  title?: string       // PDF 标题，默认"旅行行程单"
}
```

**响应：** `application/pdf` Content-Type，触发浏览器下载。

### 5.2 PDF 模板

Puppeteer 渲染独立的 HTML 模板：
- 顶部：Logo + 行程标题 + 生成日期
- 主体：按天分块，每天包含时间线、地点、餐饮、交通
- 样式：打印优化，A4 尺寸，适当的 margins 和 page-break
- 颜色：使用主色调，保持与 Web UI 一致的视觉风格

### 5.3 实现

```typescript
// lib/pdf-generator.ts
export async function generatePdf(markdown: string, title: string): Promise<Buffer> {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  const html = renderItineraryHtml(markdown, title)  // Markdown → HTML + CSS
  await page.setContent(html)
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  await browser.close()
  return pdf
}
```

## 6. 状态管理

### Zustand Store

```typescript
interface AppStore {
  // 用户偏好
  preferences: {
    theme: 'system' | 'light' | 'dark'
    defaultDays: number
    groupSize: number
    budget: 'low' | 'medium' | 'high'
    language: string
  }
  // Actions
  setTheme: (theme: string) => void
  setPreference: (key: string, value: unknown) => void
}
```

持久化：Zustand `persist` middleware → `localStorage`。

## 7. 迁移策略

### 现有 CLI 代码处理

- `src/index.ts`（CLI 入口）保留，作为 `npm run dev:cli` 备用
- Agent 核心代码（`src/agent/`, `src/tools/`, `src/trace/`）完全不动
- 新增 Next.js 相关文件在项目根目录（`app/`, `components/`, `lib/`）

### 配置调整

- `tsconfig.json`：扩展为 Next.js 兼容配置
- `package.json`：添加 Next.js、React、shadcn/ui 等依赖
- 新增 `next.config.ts`、`tailwind.config.ts`
- `.env.local`：复用现有 `.env` 的环境变量

### 新增脚本

```json
{
  "scripts": {
    "dev": "next dev",           // Web UI 开发
    "dev:cli": "tsx src/index.ts", // 原 CLI 入口
    "build": "next build",
    "start": "next start"
  }
}
```

## 8. 依赖清单

### 新增依赖

```json
{
  "dependencies": {
    "next": "^15.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "ai": "^4.x",
    "@ai-sdk/react": "^1.x",
    "zustand": "^5.x",
    "next-themes": "^0.4.x",
    "react-markdown": "^9.x",
    "remark-gfm": "^4.x",
    "puppeteer": "^24.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "class-variance-authority": "^0.7.x",
    "lucide-react": "^0.460.x"
  },
  "devDependencies": {
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "tailwindcss": "^4.x",
    "@tailwindcss/postcss": "^4.x"
  }
}
```

## 9. 测试策略

- **组件测试**：React Testing Library + Vitest
- **E2E 测试**：Playwright（关键用户流程：发送消息、查看行程、导出 PDF）
- **API 测试**：Vitest 测试 `/api/chat` 和 `/api/pdf` 端点

## 10. 范围排除

以下功能不在本次范围内：
- ❌ Notion 导出（用户明确跳过）
- ❌ 用户认证系统（学习项目不需要）
- ❌ 多用户/多人协作
- ❌ 数据库存储对话历史（仅内存 + localStorage）
- ❌ 部署配置（Vercel 部署后续单独处理）
