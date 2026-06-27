# Phase 3 — 前端 + 工程化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CLI 交互的多 Agent 旅行规划系统迁移为 Next.js Web 应用，提供流式聊天、行程可视化和 PDF 导出。

**Architecture:** 单仓结构 — Next.js App Router 包裹现有 Agent 代码，通过 API Routes 直接 import 调用 `createOrchestrator()`。SSE 流式输出使用 `ReadableStream` 模拟（MiMo API 非流式）。前端使用 shadcn/ui + Tailwind CSS，Zustand 管理状态。

**Tech Stack:** Next.js 15 (App Router) + React 19 + shadcn/ui + Tailwind CSS 4 + Vercel AI SDK + Zustand + Puppeteer

**Design Spec:** `docs/superpowers/specs/2026-06-28-phase3-frontend-design.md`

---

## 文件结构总览

```
app/
├── layout.tsx                  ✨ 根布局（ThemeProvider + 全局样式）
├── page.tsx                    ✨ 首页（聊天界面）
├── globals.css                 ✨ Tailwind + shadcn/ui CSS 变量
├── api/
│   ├── chat/route.ts           ✨ SSE 流式聊天端点
│   └── pdf/route.ts            ✨ PDF 导出端点
└── settings/
    └── page.tsx                ✨ 设置页

components/
├── chat/
│   ├── chat-container.tsx      ✨ 聊天容器（useChat 集成）
│   ├── message-bubble.tsx      ✨ 消息气泡（Markdown 渲染）
│   ├── tool-call-detail.tsx    ✨ 可折叠工具调用卡片
│   └── input-bar.tsx           ✨ 输入栏
├── itinerary/
│   ├── timeline.tsx            ✨ 行程时间线容器
│   └── day-card.tsx            ✨ 单日行程卡片
├── layout/
│   ├── header.tsx              ✨ 顶部导航栏
│   └── theme-provider.tsx      ✨ 暗色模式 Provider
└── ui/                         ✨ shadcn/ui 组件（Button, Card, Input, Select, Collapsible, ScrollArea）

lib/
├── agent-adapter.ts            ✨ Agent ↔ SSE 适配层
├── pdf-generator.ts            ✨ Puppeteer PDF 生成
├── itinerary-parser.ts         ✨ 行程 Markdown → 结构化数据
└── utils.ts                    ✨ shadcn/ui 工具函数（cn）

stores/
└── app-store.ts                ✨ Zustand store（偏好、主题）

src/
├── index.ts                    🔄 重命名为 index.cli.ts（保留 CLI 入口）

根目录:
├── next.config.ts              ✨ Next.js 配置
├── tailwind.config.ts          ✨ Tailwind 配置
├── postcss.config.mjs          ✨ PostCSS 配置
├── components.json             ✨ shadcn/ui 配置
```

---

### Task 1: 初始化 Next.js 项目 + shadcn/ui

**目标：** 将现有 TypeScript 项目升级为 Next.js App Router 项目，安装所有前端依赖。

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `lib/utils.ts`
- Create: `components.json`
- Rename: `src/index.ts` → `src/index.cli.ts`

- [ ] **Step 1: 安装前端依赖**

```bash
npm install next@^15 react@^19 react-dom@^19 ai @ai-sdk/react zustand next-themes react-markdown remark-gfm puppeteer clsx tailwind-merge class-variance-authority lucide-react
npm install -D @types/react @types/react-dom tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: 更新 `package.json` scripts**

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:cli": "tsx src/index.cli.ts",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint src/ app/",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: 重命名 CLI 入口**

```bash
git mv src/index.ts src/index.cli.ts
```

- [ ] **Step 4: 更新 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: 创建 `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 允许导入 src/ 下的 Agent 代码
  transpilePackages: [],
  // 服务端外部包（不需要打包到客户端）
  serverExternalPackages: ['puppeteer', 'ws', '@anthropic-ai/sdk'],
}

export default nextConfig
```

- [ ] **Step 6: 创建 `postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
```

- [ ] **Step 7: 创建 `components.json`（shadcn/ui 配置）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 8: 创建 `lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: 创建 `app/globals.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0.017 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0.017 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0.017 285.823);
  --primary: oklch(0.45 0.15 250);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0.015 285.823);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0.019 285.823);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0.015 285.823);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.007 285.823);
  --input: oklch(0.922 0.007 285.823);
  --ring: oklch(0.45 0.15 250);
  --radius: 0.625rem;
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0.017 285.823);
  --sidebar-primary: oklch(0.205 0.015 285.823);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0.015 285.823);
  --sidebar-border: oklch(0.922 0.007 285.823);
  --sidebar-ring: oklch(0.708 0.016 285.823);
}

.dark {
  --background: oklch(0.145 0.017 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0.017 285.823);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0.017 285.823);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.55 0.18 250);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.269 0.019 285.823);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0.019 285.823);
  --muted-foreground: oklch(0.708 0.016 285.823);
  --accent: oklch(0.269 0.019 285.823);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.269 0.019 285.823);
  --input: oklch(0.269 0.019 285.823);
  --ring: oklch(0.55 0.18 250);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0.015 285.823);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.55 0.18 250);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0.019 285.823);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.269 0.019 285.823);
  --sidebar-ring: oklch(0.488 0.243 264.376);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, sans-serif;
  }
}
```

- [ ] **Step 10: 创建 `app/layout.tsx`**

```tsx
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
      <body className="min-h-screen antialiased">
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

注意：`ThemeProvider` 在 Task 7 创建。此时先创建占位的 `components/layout/theme-provider.tsx`：

```tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 11: 创建 `app/page.tsx` 占位**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">🗺️ 小旅 — AI 旅行规划师</h1>
      <p className="text-muted-foreground mt-2">即将加载聊天界面...</p>
    </main>
  )
}
```

- [ ] **Step 12: 更新 `.gitignore`**

在现有 `.gitignore` 末尾添加：

```
# Next.js
.next/
out/
```

- [ ] **Step 13: 验证项目可启动**

```bash
npm run dev
```

Expected: Next.js 开发服务器在 `http://localhost:3000` 启动，显示占位页面。

- [ ] **Step 14: 提交**

```bash
git add -A
git commit -m "feat: initialize Next.js App Router with shadcn/ui and Tailwind"
```

---

### Task 2: Zustand Store + shadcn/ui 组件

**目标：** 创建状态管理 store 和安装所需的 shadcn/ui 基础组件。

**Files:**
- Create: `stores/app-store.ts`
- Create: `components/ui/button.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/select.tsx`
- Create: `components/ui/collapsible.tsx`
- Create: `components/ui/scroll-area.tsx`

- [ ] **Step 1: 创建 `stores/app-store.ts`**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark'
  defaultDays: number
  groupSize: number
  budget: 'low' | 'medium' | 'high'
  language: string
}

interface AppState {
  preferences: UserPreferences
  setTheme: (theme: UserPreferences['theme']) => void
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
  getPreferencesSummary: () => string
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultDays: 3,
  groupSize: 2,
  budget: 'medium',
  language: '中文',
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      preferences: DEFAULT_PREFERENCES,

      setTheme: (theme) =>
        set((state) => ({
          preferences: { ...state.preferences, theme },
        })),

      setPreference: (key, value) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        })),

      getPreferencesSummary: () => {
        const { defaultDays, groupSize, budget, language } = get().preferences
        const budgetMap = { low: '经济型', medium: '中等', high: '高端' }
        return `${defaultDays}天行程, ${groupSize}人, ${budgetMap[budget]}预算, ${language}`
      },
    }),
    {
      name: 'smart-itinerary-preferences',
    },
  ),
)
```

- [ ] **Step 2: 安装 shadcn/ui 组件**

```bash
npx shadcn@latest add button card input select collapsible scroll-area
```

Expected: 在 `components/ui/` 下生成 6 个组件文件。

- [ ] **Step 3: 验证编译**

```bash
npm run typecheck
```

Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: add Zustand store and shadcn/ui base components"
```

---

### Task 3: Agent 适配层（SSE 流式）

**目标：** 创建 Agent ↔ Vercel AI SDK 适配层，将现有 Agent 的非流式响应转为 SSE 流式输出。

**Files:**
- Create: `lib/agent-adapter.ts`

- [ ] **Step 1: 创建 `lib/agent-adapter.ts`**

```typescript
/**
 * Agent ↔ SSE 适配层
 *
 * 将现有 Orchestrator Agent 的非流式响应转为 ReadableStream（SSE）。
 * MiMo API 返回完整字符串后，通过 chunk 推送模拟流式体验。
 */
import { StreamingTextResponse } from 'ai'
import { loadConfig } from '@/src/config'
import { createXHSClient } from '@/src/mcp/xiaohongshu'
import { createMemory } from '@/src/memory/index'
import { createOrchestrator } from '@/src/agent/orchestrator'
import { createTraceCollector } from '@/src/trace/collector'

/** 全局单例：XHS 客户端（避免重复启动 MCP 进程） */
let xhsInstance: ReturnType<typeof createXHSClient> | null = null
let xhsReady = false

async function getXHSClient(): Promise<ReturnType<typeof createXHSClient> | null> {
  if (xhsInstance && xhsReady) return xhsInstance

  try {
    const config = loadConfig()
    xhsInstance = createXHSClient(config.xhsMcpPath)
    await xhsInstance.start()
    xhsReady = true
    return xhsInstance
  } catch (error) {
    console.warn('XHS MCP 启动失败:', (error as Error).message)
    return null
  }
}

function getMemory(): ReturnType<typeof createMemory> | null {
  try {
    return createMemory()
  } catch {
    return null
  }
}

/** 工具调用事件数据格式 */
export interface ToolCallEvent {
  type: 'tool-call'
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
}

/**
 * 处理聊天请求 — 核心适配函数
 *
 * 每次请求创建新的 Orchestrator 实例（上下文隔离）。
 * Agent 返回完整响应后，通过 ReadableStream 逐 chunk 推送。
 */
export async function handleChatRequest(
  userMessage: string,
  preferencesSummary?: string,
): Promise<StreamingTextResponse> {
  const xhs = await getXHSClient()
  const memory = getMemory()
  const trace = createTraceCollector('orchestrator')

  const orchestrator = createOrchestrator({ xhs, memory, trace })

  // 构建用户输入（可选注入偏好）
  const fullMessage = preferencesSummary
    ? `${userMessage}\n\n[用户偏好: ${preferencesSummary}]`
    : userMessage

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const startTime = Date.now()

      try {
        const response = await orchestrator.sendMessage(fullMessage, (toolName) => {
          // 工具调用开始 → 发送 SSE 自定义事件
          const event: ToolCallEvent = {
            type: 'tool-call',
            agent: guessAgentName(toolName),
            tool: toolName,
            status: 'running',
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        })

        // 逐 chunk 推送响应文本
        const chunkSize = 20
        for (let i = 0; i < response.length; i += chunkSize) {
          const chunk = response.slice(i, i + chunkSize)
          controller.enqueue(encoder.encode(chunk))
          // 小延迟模拟流式（总时长约 1-2 秒）
          if (i + chunkSize < response.length) {
            await new Promise((r) => setTimeout(r, 15))
          }
        }
      } catch (error) {
        const errorMsg = `\n\n❌ 发生错误: ${(error as Error).message}`
        controller.enqueue(encoder.encode(errorMsg))
      } finally {
        controller.close()
        // 异步保存 trace
        trace.saveToFile('traces').catch(() => {})
      }
    },
  })

  return new StreamingTextResponse(stream)
}

/** 根据工具名猜测所属 Agent */
function guessAgentName(toolName: string): string {
  if (toolName.includes('xhs') || toolName.includes('search')) return 'researcher'
  if (toolName.includes('weather') || toolName.includes('route') || toolName.includes('memory')) return 'advisor'
  if (toolName.includes('doc')) return 'doc'
  return 'orchestrator'
}
```

- [ ] **Step 2: 验证编译**

```bash
npm run typecheck
```

Expected: 可能有 `@/src/` 路径解析错误，这在 Task 1 的 `tsconfig.json` paths 配置中已处理。如有错误，检查 paths 配置。

- [ ] **Step 3: 提交**

```bash
git add lib/agent-adapter.ts
git commit -m "feat: add Agent adapter layer with SSE streaming"
```

---

### Task 4: 聊天 API Route + PDF API Route

**目标：** 创建 Next.js API Routes 处理聊天请求和 PDF 导出。

**Files:**
- Create: `app/api/chat/route.ts`
- Create: `app/api/pdf/route.ts`
- Create: `lib/pdf-generator.ts`

- [ ] **Step 1: 创建 `app/api/chat/route.ts`**

```typescript
/**
 * 聊天 API — SSE 流式端点
 *
 * POST /api/chat
 * 接收用户消息，创建 Orchestrator，返回 SSE 流式响应。
 */
import { handleChatRequest } from '@/lib/agent-adapter'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message } = body as { message: string }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 注意：服务端无法直接读取 Zustand（客户端 store）
    // 偏好通过请求体传递，或在此处读取默认值
    const preferencesSummary = body.preferences as string | undefined

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

- [ ] **Step 2: 创建 `lib/pdf-generator.ts`**

```typescript
/**
 * PDF 生成器 — Puppeteer 服务端渲染
 *
 * 将行程 Markdown 转为精美的 A4 PDF。
 */
import puppeteer from 'puppeteer'
import { marked } from 'marked'

/** 将行程 Markdown 渲染为 HTML（带打印优化样式） */
function renderItineraryHtml(markdown: string, title: string): string {
  const htmlContent = marked.parse(markdown) as string

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      color: #1a1a2e;
      padding: 40px;
      line-height: 1.8;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 3px solid #3b82f6;
    }
    .header h1 {
      font-size: 28px;
      color: #1e40af;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .content h1, .content h2, .content h3 {
      color: #1e40af;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    .content h1 { font-size: 24px; border-bottom: 2px solid #dbeafe; padding-bottom: 8px; }
    .content h2 { font-size: 20px; }
    .content h3 { font-size: 17px; color: #3b82f6; }
    .content p { margin-bottom: 12px; }
    .content ul, .content ol {
      margin-left: 24px;
      margin-bottom: 12px;
    }
    .content li { margin-bottom: 6px; }
    .content strong { color: #1e40af; }
    .content em { color: #6b7280; }
    .content blockquote {
      border-left: 4px solid #3b82f6;
      padding-left: 16px;
      margin: 16px 0;
      color: #4b5563;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .content th, .content td {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      text-align: left;
    }
    .content th { background: #eff6ff; color: #1e40af; }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      .content h2 { page-break-before: auto; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🗺️ ${title}</h1>
    <p class="subtitle">由「小旅」AI 旅行规划师生成 · ${new Date().toLocaleDateString('zh-CN')}</p>
  </div>
  <div class="content">${htmlContent}</div>
  <div class="footer">
    <p>基于小红书真实攻略 · Powered by Smart Itinerary</p>
  </div>
</body>
</html>`
}

/**
 * 生成 PDF Buffer
 */
export async function generatePdf(markdown: string, title: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    const html = renderItineraryHtml(markdown, title)
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
```

注意：需要安装 `marked` 依赖：
```bash
npm install marked
npm install -D @types/marked
```

- [ ] **Step 3: 创建 `app/api/pdf/route.ts`**

```typescript
/**
 * PDF 导出 API
 *
 * POST /api/pdf
 * 接收行程 Markdown，返回 PDF 文件下载。
 */
import { generatePdf } from '@/lib/pdf-generator'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { itinerary, title = '旅行行程单' } = body as {
      itinerary: string
      title?: string
    }

    if (!itinerary || typeof itinerary !== 'string' || !itinerary.trim()) {
      return new Response(JSON.stringify({ error: '行程内容不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const pdf = await generatePdf(itinerary, title)

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF 生成错误:', error)
    return new Response(JSON.stringify({ error: 'PDF 生成失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

- [ ] **Step 4: 验证编译**

```bash
npm run typecheck
```

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: add chat SSE API route and PDF export API route"
```

---

### Task 5: 聊天 UI 组件

**目标：** 实现聊天界面的核心组件：chat-container、message-bubble、tool-call-detail、input-bar。

**Files:**
- Create: `components/chat/chat-container.tsx`
- Create: `components/chat/message-bubble.tsx`
- Create: `components/chat/tool-call-detail.tsx`
- Create: `components/chat/input-bar.tsx`

- [ ] **Step 1: 创建 `components/chat/tool-call-detail.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCallDetailProps {
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
}

const AGENT_CONFIG = {
  researcher: { icon: '🔍', label: '研究员', color: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950' },
  advisor: { icon: '🧭', label: '顾问', color: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950' },
  doc: { icon: '📝', label: '文档', color: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950' },
  orchestrator: { icon: '🤖', label: '编排器', color: 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950' },
}

export function ToolCallDetail({ agent, tool, status, durationMs }: ToolCallDetailProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = AGENT_CONFIG[agent as keyof typeof AGENT_CONFIG] ?? AGENT_CONFIG.orchestrator

  return (
    <div className={cn('rounded-lg border text-sm my-1.5', config.color)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span>{config.icon}</span>
        <span className="font-medium">{config.label}</span>
        <span className="text-muted-foreground">
          {status === 'running' ? `正在调用 ${tool}...` : `${tool} ✓`}
        </span>
        {durationMs && status === 'done' && (
          <span className="text-muted-foreground ml-auto text-xs">{durationMs}ms</span>
        )}
      </button>
      {isOpen && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <p>工具: <code className="bg-muted px-1 rounded">{tool}</code></p>
          {durationMs && <p>耗时: {durationMs}ms</p>}
          <p>状态: {status === 'running' ? '⏳ 执行中...' : '✅ 完成'}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `components/chat/message-bubble.tsx`**

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  children?: React.ReactNode
}

export function MessageBubble({ role, content, children }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md',
        )}
      >
        {/* 工具调用详情（插在消息前面） */}
        {children}

        {/* Markdown 内容 */}
        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : 'dark:prose-invert',
          'prose-headings:mt-3 prose-headings:mb-2',
          'prose-p:my-1.5 prose-li:my-0.5',
          'prose-code:bg-muted-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
          'prose-pre:bg-muted-foreground/10 prose-pre:rounded-lg',
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 `components/chat/input-bar.tsx`**

```tsx
'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { Send, FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface InputBarProps {
  onSend: (message: string) => void
  onExportPdf: () => void
  isLoading: boolean
  hasMessages: boolean
}

export function InputBar({ onSend, onExportPdf, isLoading, hasMessages }: InputBarProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的旅行需求..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
        {hasMessages && (
          <Button
            onClick={onExportPdf}
            variant="outline"
            size="icon"
            title="导出 PDF"
          >
            <FileDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 创建 `components/chat/chat-container.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageBubble } from './message-bubble'
import { ToolCallDetail } from './tool-call-detail'
import { InputBar } from './input-bar'
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
      const toolCalls: ToolCallEvent[] = []

      // 添加空的 assistant 消息（逐步填充）
      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })

        // 解析 SSE 自定义事件
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as ToolCallEvent
              if (event.type === 'tool-call') {
                toolCalls.push(event)
                setCurrentToolCalls([...toolCalls])
              }
            } catch {
              // 非 JSON 行，当作普通文本
              assistantContent += line
            }
          } else {
            assistantContent += line
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
    // 取最后一条 assistant 消息的完整内容
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
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(`PDF 导出失败: ${(error as Error).message}`)
    }
  }, [messages])

  return (
    <div className="flex h-screen flex-col">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
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

          {messages.map((msg) => (
            <MessageBubble key={msg.id} role={msg.role} content={msg.content}>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
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
              )}
            </MessageBubble>
          ))}

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
```

- [ ] **Step 5: 更新 `app/page.tsx` 使用 ChatContainer**

```tsx
import { ChatContainer } from '@/components/chat/chat-container'

export default function Home() {
  return <ChatContainer />
}
```

- [ ] **Step 6: 验证编译**

```bash
npm run typecheck
```

Expected: 无错误（`ToolCallEvent` 类型需要从 `lib/agent-adapter.ts` 导出，已在 Task 3 定义）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: add chat UI components (container, bubble, tool-call, input)"
```

---

### Task 6: 行程可视化组件

**目标：** 实现行程解析器和可视化组件（Timeline + Day Cards）。

**Files:**
- Create: `lib/itinerary-parser.ts`
- Create: `components/itinerary/timeline.tsx`
- Create: `components/itinerary/day-card.tsx`

- [ ] **Step 1: 创建 `lib/itinerary-parser.ts`**

```typescript
/**
 * 行程解析器 — Markdown → 结构化数据
 *
 * 从 Agent 返回的 Markdown 行程文本中提取天数、时间段、地点等信息。
 * 解析失败时返回 null，前端退化为纯 Markdown 渲染。
 */

export interface TimeSlot {
  period: 'morning' | 'afternoon' | 'evening'
  label: string
  activities: string[]
  locations: string[]
}

export interface DayPlan {
  day: number
  title: string
  timeSlots: TimeSlot[]
}

const PERIOD_KEYWORDS: Record<string, TimeSlot['period']> = {
  '上午': 'morning',
  '早上': 'morning',
  '早晨': 'morning',
  'morning': 'morning',
  '下午': 'afternoon',
  '午后': 'afternoon',
  'afternoon': 'afternoon',
  '晚上': 'evening',
  '傍晚': 'evening',
  '夜晚': 'evening',
  'evening': 'evening',
  '午餐': 'afternoon',
  '晚餐': 'evening',
}

const LOCATION_PATTERN = /[一-鿿\w]{2,}(?:寺|塔|公园|广场|街|区|城|馆|园|店|厅|寺|神社|温泉|港|湾|桥|山|湖|岛)/g

function detectPeriod(line: string): TimeSlot['period'] | null {
  for (const [keyword, period] of Object.entries(PERIOD_KEYWORDS)) {
    if (line.toLowerCase().includes(keyword)) return period
  }
  return null
}

function extractLocations(line: string): string[] {
  return [...line.matchAll(LOCATION_PATTERN)].map((m) => m[0])
}

/**
 * 解析行程 Markdown 文本
 *
 * 返回 DayPlan[] 或 null（解析失败时）。
 */
export function parseItinerary(markdown: string): DayPlan[] | null {
  const lines = markdown.split('\n').map((l) => l.trim())
  const days: DayPlan[] = []
  let currentDay: DayPlan | null = null
  let currentTimeSlot: TimeSlot | null = null

  for (const line of lines) {
    if (!line) continue

    // 匹配天数标题：## Day 1 / ## 第1天 / ### Day 1 — 东京
    const dayMatch = line.match(/^#{1,3}\s*(?:Day\s*(\d+)|第(\d+)天)/i)
    if (dayMatch) {
      const dayNum = parseInt(dayMatch[1] ?? dayMatch[2], 10)
      currentDay = { day: dayNum, title: line.replace(/^#{1,3}\s*/, ''), timeSlots: [] }
      days.push(currentDay)
      currentTimeSlot = null
      continue
    }

    if (!currentDay) continue

    // 匹配时间段：**上午** / - 上午：/ 🌅 上午
    const period = detectPeriod(line)
    if (period) {
      currentTimeSlot = { period, label: line.replace(/^[-*]\s*/, '').replace(/[🌅🌞🌆🍽️]/g, '').trim(), activities: [], locations: [] }
      currentDay.timeSlots.push(currentTimeSlot)
      continue
    }

    // 匹配活动行：- xxx 或 * xxx
    const activityMatch = line.match(/^[-*]\s+(.+)/)
    if (activityMatch && currentTimeSlot) {
      const text = activityMatch[1]
      currentTimeSlot.activities.push(text)
      currentTimeSlot.locations.push(...extractLocations(text))
    }
  }

  return days.length > 0 ? days : null
}
```

- [ ] **Step 2: 创建 `components/itinerary/day-card.tsx`**

```tsx
'use client'

import { MapPin, Sun, Sunset, Moon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DayPlan, TimeSlot } from '@/lib/itinerary-parser'

const PERIOD_ICON = {
  morning: Sun,
  afternoon: Sunset,
  evening: Moon,
}

const PERIOD_LABEL = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
}

function TimeSlotSection({ slot }: { slot: TimeSlot }) {
  const Icon = PERIOD_ICON[slot.period]

  return (
    <div className="flex gap-3 py-2">
      <div className="flex flex-col items-center pt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {PERIOD_LABEL[slot.period]}
        </p>
        {slot.activities.map((activity, i) => (
          <p key={i} className="text-sm leading-relaxed">{activity}</p>
        ))}
        {slot.locations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {slot.locations.map((loc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5"
              >
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DayCard({ plan }: { plan: DayPlan }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {plan.day}
          </span>
          {plan.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        {plan.timeSlots.map((slot, i) => (
          <TimeSlotSection key={i} slot={slot} />
        ))}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: 创建 `components/itinerary/timeline.tsx`**

```tsx
'use client'

import { parseItinerary } from '@/lib/itinerary-parser'
import { DayCard } from './day-card'

interface TimelineProps {
  content: string
}

/**
 * 行程时间线 — 自动解析 Markdown 行程并渲染为 Day Cards
 *
 * 解析失败时返回 null（调用方应降级为纯 Markdown 渲染）。
 */
export function Timeline({ content }: TimelineProps) {
  const days = parseItinerary(content)

  if (!days || days.length === 0) return null

  return (
    <div className="space-y-4 my-4">
      {days.map((day) => (
        <DayCard key={day.day} plan={day} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 集成 Timeline 到 ChatContainer**

修改 `components/chat/chat-container.tsx`，在 assistant 消息中检测行程内容并渲染 Timeline：

在 `MessageBubble` 渲染前添加行程检测逻辑：

```tsx
import { Timeline } from '@/components/itinerary/timeline'
import { parseItinerary } from '@/lib/itinerary-parser'

// 在 message 映射中，检查是否包含行程
{msg.role === 'assistant' && parseItinerary(msg.content) ? (
  <div className="mb-2">
    <Timeline content={msg.content} />
    {/* 仍然显示 Markdown 文本（行程之外的内容） */}
    <MessageBubble role={msg.role} content={msg.content}>
      {toolCalls}
    </MessageBubble>
  </div>
) : (
  <MessageBubble role={msg.role} content={msg.content}>
    {toolCalls}
  </MessageBubble>
)}
```

- [ ] **Step 5: 验证编译**

```bash
npm run typecheck
```

Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add itinerary parser and timeline/day-card components"
```

---

### Task 7: Header + 暗色模式 + 移动端适配

**目标：** 创建顶部导航栏，完善暗色模式切换，确保移动端响应式布局。

**Files:**
- Create: `components/layout/header.tsx`
- Modify: `components/layout/theme-provider.tsx`（已创建，确认内容正确）
- Modify: `app/layout.tsx`（添加 Header）
- Modify: `components/chat/chat-container.tsx`（响应式样式微调）

- [ ] **Step 1: 创建 `components/layout/header.tsx`**

```tsx
'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, Settings } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">🗺️</span>
          <span className="hidden sm:inline">小旅</span>
        </Link>

        <div className="flex items-center gap-1">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
          <Link href="/settings">
            <Button variant="ghost" size="icon" title="设置">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 更新 `app/layout.tsx` 添加 Header**

```tsx
import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Header } from '@/components/layout/header'
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
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 更新 `components/chat/chat-container.tsx` 布局**

修改 `ChatContainer` 的最外层 div，让 Header 不被遮挡：

```tsx
<div className="flex h-[calc(100vh-3.5rem)] flex-col">
  {/* ... */}
</div>
```

（`3.5rem` = Header 高度 `h-14`）

- [ ] **Step 4: 验证暗色模式**

```bash
npm run dev
```

在浏览器中测试：
- 点击 Header 的月亮/太阳图标切换暗色/亮色
- 刷新页面后主题保持（localStorage 持久化）
- 在移动端视口下 Header 仅显示 Logo + 图标

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: add header with dark mode toggle and mobile responsive layout"
```

---

### Task 8: 设置页

**目标：** 创建 `/settings` 页面，管理用户偏好。

**Files:**
- Create: `app/settings/page.tsx`

- [ ] **Step 1: 创建 `app/settings/page.tsx`**

```tsx
'use client'

import { useTheme } from 'next-themes'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/app-store'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { preferences, setPreference } = useAppStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">设置</h1>
      </div>

      <div className="space-y-6">
        {/* 主题设置 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">🎨 外观</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>主题</Label>
              {mounted && (
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="system">跟随系统</option>
                  <option value="light">亮色</option>
                  <option value="dark">暗色</option>
                </select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 旅行偏好 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">🧳 旅行偏好</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="days">默认天数</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={30}
                value={preferences.defaultDays}
                onChange={(e) => setPreference('defaultDays', parseInt(e.target.value, 10) || 3)}
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="group">出行人数</Label>
              <Input
                id="group"
                type="number"
                min={1}
                max={20}
                value={preferences.groupSize}
                onChange={(e) => setPreference('groupSize', parseInt(e.target.value, 10) || 2)}
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>预算偏好</Label>
              <select
                value={preferences.budget}
                onChange={(e) => setPreference('budget', e.target.value as 'low' | 'medium' | 'high')}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="low">经济型</option>
                <option value="medium">中等</option>
                <option value="high">高端</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <Label>语言</Label>
              <select
                value={preferences.language}
                onChange={(e) => setPreference('language', e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="中文">中文</option>
                <option value="English">English</option>
                <option value="日本語">日本語</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 推理轨迹 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">📊 推理轨迹</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              推理轨迹文件保存在项目 <code className="bg-muted px-1 rounded">traces/</code> 目录下，
              每次对话结束自动生成。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证设置页功能**

```bash
npm run dev
```

在浏览器中测试：
- 访问 `/settings`，修改偏好值
- 刷新页面后偏好保持（Zustand persist → localStorage）
- 点击返回按钮回到首页

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: add settings page with user preferences"
```

---

### Task 9: 端到端验证 + 修复

**目标：** 启动完整系统，验证所有功能正常工作。

- [ ] **Step 1: 确保环境变量配置**

检查 `.env` 文件包含所有必要的环境变量（MIMO_API_KEY 等）。

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

Expected: Next.js 在 `http://localhost:3000` 启动。

- [ ] **Step 3: 测试聊天流程**

1. 访问 `http://localhost:3000`
2. 输入："帮我规划3天东京亲子游"
3. 验证：
   - ✅ 消息发送成功
   - ✅ 显示 typing indicator
   - ✅ 工具调用卡片出现（可折叠）
   - ✅ Agent 回复逐步显示（流式效果）
   - ✅ 行程自动渲染为 Day Cards

- [ ] **Step 4: 测试暗色模式**

1. 点击 Header 的月亮图标
2. 验证：
   - ✅ 页面切换为暗色主题
   - ✅ 所有组件（气泡、卡片、输入框）样式正确
   - ✅ 刷新后主题保持

- [ ] **Step 5: 测试移动端**

1. 浏览器开发者工具 → 切换为移动端视口（375px）
2. 验证：
   - ✅ Header 精简显示
   - ✅ 聊天气泡全宽
   - ✅ 输入栏固定底部
   - ✅ Day Cards 单列堆叠

- [ ] **Step 6: 测试设置页**

1. 访问 `/settings`
2. 修改偏好（默认天数、预算等）
3. 返回首页，发送新消息
4. 验证偏好被注入到 Agent 请求中

- [ ] **Step 7: 测试 PDF 导出**

1. 完成一次对话（有行程回复）
2. 点击输入栏的下载图标
3. 验证：
   - ✅ 浏览器触发 PDF 下载
   - ✅ PDF 内容包含行程
   - ✅ PDF 样式美观（Logo + 标题 + 行程块）

- [ ] **Step 8: 类型检查 + 提交**

```bash
npm run typecheck
git add -A
git commit -m "feat: complete Phase 3 frontend with end-to-end verification"
```

---

## 总结

| Task | 文件 | 变更类型 |
|------|------|---------|
| 1 | `package.json`, `tsconfig.json`, `next.config.ts`, `app/` | 项目初始化 |
| 2 | `stores/app-store.ts`, `components/ui/*` | 状态管理 + UI 基础 |
| 3 | `lib/agent-adapter.ts` | Agent 适配层 |
| 4 | `app/api/chat/route.ts`, `app/api/pdf/route.ts`, `lib/pdf-generator.ts` | API Routes |
| 5 | `components/chat/*` | 聊天 UI 组件 |
| 6 | `lib/itinerary-parser.ts`, `components/itinerary/*` | 行程可视化 |
| 7 | `components/layout/header.tsx`, `app/layout.tsx` | Header + 暗色模式 |
| 8 | `app/settings/page.tsx` | 设置页 |
| 9 | 手动验证 | 端到端测试 |
