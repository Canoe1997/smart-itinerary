# Phase 2.1 — Agent-as-Tool 多 Agent 协作系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单 Agent 系统重构为 4 个专家 Agent（编排器 + 研究员 + 顾问 + 文档），通过 Agent-as-Tool 模式协作完成旅行规划。

**Architecture:** Agent-as-Tool — 子 Agent 封装为标准 `Tool` 接口，编排器通过 Function Calling 调用。每个子 Agent 有独立上下文、专属工具集和专用 System Prompt。通用 Agent 工厂 `createAgent(options)` 替代原来的 `createItineraryAgent()`。

**Tech Stack:** TypeScript + MiMo v2.5 Pro (OpenAI FC) + Node.js 20

**Design Spec:** `docs/superpowers/specs/2026-06-26-multi-agent-design.md`

---

## 文件结构总览

```
src/agent/
├── index.ts           # 🔄 重构：createItineraryAgent() → createAgent(options)
├── orchestrator.ts    # ✨ 新：创建编排器 + 3 个 Agent 工具
└── prompts.ts         # 🔄 扩展：1 个 Prompt → 4 个 Prompt

src/index.ts           # 🔄 入口改为使用编排器
```

以下文件 **不变**：`tools/registry.ts`、`tools/xhs.ts`、`tools/memory.ts`、`tools/amap.ts`、`mcp/xiaohongshu.ts`、`memory/index.ts`、`config.ts`、`mimo-client.ts`

---

### Task 1: 重构 Agent 工厂 — `createAgent(options)`

**目标：** 将专用的 `createItineraryAgent()` 改为通用的 `createAgent(options)` 工厂函数。

**Files:**
- Modify: `src/agent/index.ts`

- [ ] **Step 1: 重写 `src/agent/index.ts` 为通用 Agent 工厂**

将 `createItineraryAgent(registry)` 替换为 `createAgent(options)`，接受 systemPrompt、registry、maxIterations 参数。

```typescript
/**
 * Smart Itinerary 通用 Agent 工厂 — ReAct 循环 (原生 Function Calling)
 *
 * 任何 Agent（编排器、研究员、顾问、文档）都通过此工厂创建。
 * 每个 Agent 有独立的对话历史、专属工具集和专用 System Prompt。
 *
 * ReAct 循环: Thought → tool_calls → 执行 → tool result → ... → 最终回复
 */
import type OpenAI from 'openai'
import { createMiMoClient } from '../mimo-client.js'
import type { ToolRegistry } from '../tools/registry.js'

/** 默认最大迭代次数 */
const DEFAULT_MAX_ITERATIONS = 15

/** Agent 创建选项 */
export interface AgentOptions {
  /** System Prompt（角色定义） */
  systemPrompt: string
  /** 可用工具注册表（可选，文档 Agent 无工具） */
  registry?: ToolRegistry
  /** 最大迭代次数（默认 15） */
  maxIterations?: number
}

/**
 * 创建通用 Agent (原生 FC ReAct 版本)
 *
 * 每个 Agent 有独立的对话历史，互不干扰。
 * 子 Agent 用完即弃（上下文隔离），编排器持续运行。
 */
export function createAgent(options: AgentOptions) {
  const { systemPrompt, registry, maxIterations = DEFAULT_MAX_ITERATIONS } = options
  const { chatWithTools } = createMiMoClient()

  // 独立对话历史（每个 Agent 实例独享）
  const history: OpenAI.ChatCompletionMessageParam[] = []

  /**
   * 发送消息并执行 ReAct 循环
   */
  async function sendMessage(
    userInput: string,
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void,
  ): Promise<string> {
    history.push({ role: 'user', content: userInput })

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await chatWithTools({
        system: systemPrompt,
        messages: history,
        tools: registry?.getToolDefinitions(),
      })

      const choice = response.choices[0]
      if (!choice) throw new Error('MiMo 返回了空响应')

      const message = choice.message

      // 无工具调用 = 最终回答
      if (!message.tool_calls || message.tool_calls.length === 0) {
        history.push({ role: 'assistant', content: message.content ?? '' })
        return message.content ?? '抱歉，我暂时无法生成回复。'
      }

      // 有工具调用 → 执行工具
      history.push(message as OpenAI.ChatCompletionMessageParam)

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
        onToolCall?.(toolName, toolArgs)

        const tool = registry?.getTool(toolName)
        let result: string

        if (!tool) {
          result = `错误：工具 "${toolName}" 不存在`
        } else {
          try {
            result = await tool.execute(toolArgs)
          } catch (error) {
            result = `工具执行失败: ${(error as Error).message}`
          }
        }

        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }
    }

    return '推理步骤过多，请简化问题后重试。'
  }

  /** 获取对话历史（只读副本） */
  function getHistory(): ReadonlyArray<OpenAI.ChatCompletionMessageParam> {
    return [...history]
  }

  /** 清空对话历史 */
  function resetHistory(): void {
    history.length = 0
  }

  return { sendMessage, getHistory, resetHistory }
}

/**
 * @deprecated 使用 createAgent({ systemPrompt, registry }) 替代
 * 保留兼容性，内部委托给 createAgent
 */
export function createItineraryAgent(registry?: ToolRegistry) {
  // 动态导入 prompts 避免循环依赖
  // 实际迁移完成后删除此函数
  return createAgent({
    systemPrompt: '你是一位旅行规划师。',
    registry,
  })
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误（`createItineraryAgent` 仍存在，向后兼容）

- [ ] **Step 3: 提交**

```bash
git add src/agent/index.ts
git commit -m "refactor: generalize agent factory to createAgent(options)"
```

---

### Task 2: 扩展 System Prompt — 4 个角色 Prompt

**目标：** 将 `prompts.ts` 从 1 个 Prompt 扩展为 4 个专用 Prompt。

**Files:**
- Modify: `src/agent/prompts.ts`

- [ ] **Step 1: 重写 `src/agent/prompts.ts`**

保留原 `TRAVEL_PLANNER_SYSTEM` 作为备份（deprecated），新增 4 个专用 Prompt。

```typescript
/**
 * Agent System Prompts
 *
 * Phase 2.1: 4 个专家 Agent 的角色定义
 * - 编排器：协调专家团队
 * - 研究员：搜索分析攻略
 * - 顾问：推荐美食住宿
 * - 文档：格式化输出
 */

// ─── 编排器（总指挥）───

export const ORCHESTRATOR_SYSTEM = `你是旅行规划总指挥"小旅"。

## 你的角色
你不直接搜索攻略或查询天气，而是协调专家团队完成旅行规划。

## 可用的专家 Agent
- research_agent: 攻略研究员，搜索小红书旅行攻略并分析关键信息
- advisor_agent: 美食住宿顾问，查询天气、搜索周边、推荐餐饮住宿、管理用户偏好
- doc_agent: 文档格式化专家，将行程数据转为精美的 Markdown 文档

## 工作流程
1. **分析需求**：提取目的地、天数、人数、偏好、预算
2. **收集攻略**：调用 research_agent 搜索目的地攻略
3. **获取推荐**：调用 advisor_agent 获取餐饮、住宿、天气等实用信息，传入攻略上下文
4. **生成文档**：调用 doc_agent 将综合信息格式化为完整行程

## 交互规则
- 信息不足时先询问用户（天数、人数、预算、偏好）
- 用户简单问题（如"东京天气如何"）可直接调用 advisor_agent，不需要全部调用
- 收到子 Agent 结果后综合分析，不要直接转发原始文本
- 结尾提示用户可以如何调整行程

## 效率规则
- 按需调用，不是每个请求都需要所有 Agent
- 传给子 Agent 的指令要明确具体（包含目的地、偏好、上下文）`

// ─── 攻略研究员 ───

export const RESEARCHER_SYSTEM = `你是一位专业的旅行攻略研究员。

## 你的任务
搜索小红书旅行攻略，提取关键信息，返回结构化研究摘要。

## 工具使用规则
- search_xhs_notes: 搜索攻略，最多搜索 2 次不同关键词
- get_xhs_note: 查看笔记详情，最多查看 4 篇

## 搜索策略
1. 先用核心关键词搜索（如"东京亲子游攻略"）
2. 如结果不够，换一个角度搜索（如"东京带娃必去"）
3. 选择高赞、详细的笔记深入分析

## 输出格式（严格遵守）
返回以下结构的文本摘要：

### 📚 攻略研究摘要

**搜索关键词**: [使用的关键词]
**找到攻略**: [数量] 篇

**高质量攻略来源**:
1. [标题] — 作者: [作者名] 👍[点赞数]
   - 核心建议: [1-2句关键信息]
   - 推荐景点/餐厅: [列表]

**关键发现**:
- 景点推荐: [列表]
- 美食推荐: [列表]
- 交通建议: [关键信息]
- 注意事项: [避坑信息]

## 效率规则
- 收集足够信息后立即返回，不要无限搜索
- 优先选择高赞（>100）和详细（>500字）的攻略
- 如果搜索失败或无结果，明确说明并返回已有信息`

// ─── 美食住宿顾问 ───

export const ADVISOR_SYSTEM = `你是一位专业的美食住宿旅行顾问。

## 你的任务
根据目的地和用户偏好，提供餐饮、住宿、天气、交通等实用建议。

## 可用工具
- get_weather: 查询目的地天气（只需一次）
- search_nearby_poi: 搜索周边餐厅/景点/酒店
- plan_transit: 规划两地交通路线
- geocode_address: 地址转坐标
- search_memory: 搜索用户已有偏好
- save_user_preference: 保存新发现的偏好
- store_travel_knowledge: 存储优质攻略到知识库

## 工作流程
1. 先 search_memory 了解用户已有偏好（一次即可）
2. 查询目的地天气（一次）
3. 根据需求搜索周边餐厅/景点
4. 如发现新偏好，保存到记忆
5. 返回推荐列表

## 输出格式（严格遵守）

### 🍜 美食住宿推荐

**天气情况**: [城市] [天气] [温度]

**餐饮推荐**:
1. [餐厅名] — [类型] — [位置]
   - 推荐理由: [1句]
   - 人均: [价格] | 评分: [评分]

**住宿建议**:
- 推荐区域: [区域名] — [理由]
- 酒店类型: [经济/中档/高档]

**交通提示**:
- [景点A] → [景点B]: [交通方式] 约[时间]

## 效率规则
- 天气查询只需一次
- 周边搜索按需使用，不要为每个景点都搜
- 收集足够信息后立即返回`

// ─── 文档格式化 ───

export const DOC_SYSTEM = `你是一位旅行文档格式化专家。

## 你的任务
将旅行行程数据转为美观、实用的 Markdown 文档。

## 输入
你会收到原始的行程信息（来自攻略研究、美食推荐等），需要整合为一份完整行程。

## 输出格式（严格遵守）

# 🗺️ [目的地] [天数]天旅行行程

## 📋 行程概览
- 🗓️ 行程天数: X天
- 👥 出行人数: X人
- 💰 预算参考: ¥XXXX/人
- 🎯 行程风格: [轻松/紧凑/深度]

## Day X: [主题]
| 时间 | 活动 | 时长 | 备注 |
|------|------|------|------|
| 09:00 | 📍 [地点] | 2h | [交通/费用/贴士] |
| 12:00 | 🍜 [餐厅] | 1.5h | [推荐菜品/人均] |

## 🌤️ 天气预报
[目的地] 未来天气概况

## 💡 实用贴士
- 交通: [关键交通信息]
- 预算: [费用参考]
- 注意: [避坑提醒]

## 📚 攻略来源
1. [标题] — [作者] 👍[点赞数]

## 交互提示
在文档末尾添加：
> 💡 想调整行程？告诉我：
> - "太累了" → 我会减少景点，增加休息时间
> - "想吃XXX" → 我会搜索相关餐厅并调整
> - "下雨了" → 我会推荐室内替代方案`

// ─── 兼容性（Phase 1 遗留）───

/** @deprecated 使用 ORCHESTRATOR_SYSTEM 替代 */
export const TRAVEL_PLANNER_SYSTEM = ORCHESTRATOR_SYSTEM
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/agent/prompts.ts
git commit -m "feat: add 4 specialized agent system prompts (orchestrator/researcher/advisor/doc)"
```

---

### Task 3: 创建编排器 — `orchestrator.ts`

**目标：** 创建编排器模块，将 3 个子 Agent 封装为 Tool 并注册到编排器的工具注册表。

**Files:**
- Create: `src/agent/orchestrator.ts`

- [ ] **Step 1: 创建 `src/agent/orchestrator.ts`**

```typescript
/**
 * 编排器 — 多 Agent 协作的核心
 *
 * 编排器 Agent 拥有 3 个「Agent 工具」，通过 FC 决定调用顺序：
 * - research_agent: 攻略研究员
 * - advisor_agent: 美食住宿顾问
 * - doc_agent: 文档格式化
 *
 * 每个子 Agent 工具内部创建临时 Agent（独立上下文），执行完毕后返回结果。
 */
import { createAgent } from './index.js'
import { createToolRegistry } from '../tools/registry.js'
import type { Tool, ToolRegistry } from '../tools/registry.js'
import type { createXHSClient } from '../mcp/xiaohongshu.js'
import type { createMemory } from '../memory/index.js'
import { registerXHSTools } from '../tools/xhs.js'
import { registerMemoryTools } from '../tools/memory.js'
import { registerAmapTools } from '../tools/amap.js'
import {
  ORCHESTRATOR_SYSTEM,
  RESEARCHER_SYSTEM,
  ADVISOR_SYSTEM,
  DOC_SYSTEM,
} from './prompts.js'

type XHSClient = ReturnType<typeof createXHSClient>
type Memory = ReturnType<typeof createMemory>

/**
 * 创建攻略研究员 Agent 工具
 *
 * 内部创建临时研究员 Agent，拥有 XHS 工具，执行搜索分析任务。
 */
function createResearchAgentTool(xhs: XHSClient): Tool {
  return {
    name: 'research_agent',
    description:
      '调用攻略研究员搜索小红书旅行攻略。输入搜索关键词和目的地，返回结构化研究摘要（高质量攻略列表、关键发现、推荐景点餐厅）。',
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，如"东京亲子游攻略"、"大阪美食推荐"',
        },
        destination: {
          type: 'string',
          description: '目的地城市，如"东京"、"大阪"',
        },
      },
      required: ['query', 'destination'],
    },
    async execute(args) {
      const query = args.query as string
      const destination = args.destination as string

      // 创建研究员专属注册表
      const researchRegistry = createToolRegistry()
      registerXHSTools(researchRegistry, xhs)

      // 创建临时研究员 Agent（独立上下文）
      const researcher = createAgent({
        systemPrompt: RESEARCHER_SYSTEM,
        registry: researchRegistry,
        maxIterations: 6,
      })

      console.log(`   🔍 [攻略研究员] 启动搜索: "${destination} ${query}"`)

      const result = await researcher.sendMessage(
        `请搜索并深度分析关于"${destination} ${query}"的旅行攻略。返回结构化研究摘要。`,
      )

      console.log(`   ✅ [攻略研究员] 完成，返回研究摘要`)
      return result
    },
  }
}

/**
 * 创建美食住宿顾问 Agent 工具
 *
 * 内部创建临时顾问 Agent，拥有高德+记忆工具。
 */
function createAdvisorAgentTool(memory: Memory | null): Tool {
  return {
    name: 'advisor_agent',
    description:
      '调用美食住宿顾问获取目的地的餐饮、住宿、天气、交通等实用建议。传入目的地、偏好和攻略上下文，返回推荐列表。',
    parameters: {
      type: 'object' as const,
      properties: {
        destination: {
          type: 'string',
          description: '目的地城市，如"东京"',
        },
        preferences: {
          type: 'string',
          description: '用户偏好，如"亲子游、喜欢海鲜、预算适中"',
        },
        researchContext: {
          type: 'string',
          description: '攻略研究员提供的研究摘要（传入以获得更精准推荐）',
        },
      },
      required: ['destination'],
    },
    async execute(args) {
      const destination = args.destination as string
      const preferences = (args.preferences as string) ?? ''
      const researchContext = (args.researchContext as string) ?? ''

      // 创建顾问专属注册表
      const advisorRegistry = createToolRegistry()
      registerAmapTools(advisorRegistry)
      if (memory) {
        registerMemoryTools(advisorRegistry, memory)
      }

      // 创建临时顾问 Agent
      const advisor = createAgent({
        systemPrompt: ADVISOR_SYSTEM,
        registry: advisorRegistry,
        maxIterations: 8,
      })

      console.log(`   🍜 [美食住宿顾问] 启动分析: ${destination}`)

      // 构建任务指令，包含攻略上下文
      const task = [
        `请为"${destination}"提供美食、住宿、天气、交通建议。`,
        preferences ? `用户偏好: ${preferences}` : '',
        researchContext ? `\n攻略研究结果（供参考）:\n${researchContext}` : '',
        '\n返回结构化的推荐列表。',
      ]
        .filter(Boolean)
        .join('\n')

      const result = await advisor.sendMessage(task)

      console.log(`   ✅ [美食住宿顾问] 完成，返回推荐列表`)
      return result
    },
  }
}

/**
 * 创建文档格式化 Agent 工具
 *
 * 纯 LLM 格式化，无工具。
 */
function createDocAgentTool(): Tool {
  return {
    name: 'doc_agent',
    description:
      '调用文档格式化专家将行程数据转为精美的 Markdown 文档。传入原始行程信息，返回格式化后的完整行程文档。',
    parameters: {
      type: 'object' as const,
      properties: {
        itineraryData: {
          type: 'string',
          description: '原始行程数据，包含攻略摘要、推荐列表、用户需求等信息',
        },
        destination: {
          type: 'string',
          description: '目的地',
        },
        days: {
          type: 'string',
          description: '行程天数',
        },
      },
      required: ['itineraryData', 'destination'],
    },
    async execute(args) {
      const itineraryData = args.itineraryData as string
      const destination = args.destination as string
      const days = (args.days as string) ?? '未指定'

      // 创建文档 Agent（无工具，纯 LLM 格式化）
      const docAgent = createAgent({
        systemPrompt: DOC_SYSTEM,
        maxIterations: 1,
      })

      console.log(`   📝 [文档专家] 格式化行程: ${destination} ${days}天`)

      const result = await docAgent.sendMessage(
        `请将以下行程数据格式化为精美的 Markdown 文档。\n\n目的地: ${destination}\n天数: ${days}\n\n行程数据:\n${itineraryData}`,
      )

      console.log(`   ✅ [文档专家] 完成`)
      return result
    },
  }
}

/**
 * 创建编排器 Agent
 *
 * 编排器拥有 3 个 Agent 工具，通过 ReAct 循环协调它们完成旅行规划。
 */
export function createOrchestrator(options: {
  xhs: XHSClient
  memory: Memory | null
}): ReturnType<typeof createAgent> {
  const { xhs, memory } = options

  // 编排器专属注册表（只有 Agent 工具，无直接业务工具）
  const orchestratorRegistry = createToolRegistry()
  orchestratorRegistry.register(createResearchAgentTool(xhs))
  orchestratorRegistry.register(createAdvisorAgentTool(memory))
  orchestratorRegistry.register(createDocAgentTool())

  console.log(`🤖 编排器就绪 (${orchestratorRegistry.size()} 个 Agent 工具)`)

  return createAgent({
    systemPrompt: ORCHESTRATOR_SYSTEM,
    registry: orchestratorRegistry,
    maxIterations: 10,
  })
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/agent/orchestrator.ts
git commit -m "feat: create orchestrator with 3 agent-as-tool sub-agents"
```

---

### Task 4: 更新入口 — 使用编排器

**目标：** 修改 `src/index.ts`，用编排器替代原来的单 Agent。

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 重写 `src/index.ts`**

```typescript
/**
 * Smart Itinerary — 入口 (多 Agent 协作)
 *
 * Phase 2.1: 编排器 + 3 个专家 Agent（研究员/顾问/文档）
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { loadConfig } from './config.js'
import { createXHSClient } from './mcp/xiaohongshu.js'
import { createMemory } from './memory/index.js'
import { createOrchestrator } from './agent/orchestrator.js'

async function main() {
  console.log('🗺️  Smart Itinerary — AI 旅行规划师 (多 Agent 协作)')
  console.log('─'.repeat(55))

  const config = loadConfig()

  // 1. 启动小红书 MCP 服务
  const xhs = createXHSClient(config.xhsMcpPath)
  console.log('⏳ 正在连接小红书服务...')
  try {
    await xhs.start()
    console.log('✅ 小红书服务就绪')
  } catch (error) {
    console.warn('⚠️  小红书服务启动失败:', (error as Error).message)
  }

  // 2. 初始化记忆系统
  let memory: ReturnType<typeof createMemory> | null = null
  try {
    memory = createMemory()
    console.log('🧠 记忆系统就绪 (Supabase)')
  } catch (error) {
    console.warn('⚠️  记忆系统未启用:', (error as Error).message)
  }

  // 3. 创建编排器（内部注册 3 个 Agent 工具）
  const orchestrator = createOrchestrator({ xhs, memory })

  console.log('\n输入你的旅行需求，我来帮你规划行程！')
  console.log('输入 /quit 退出，/new 开始新旅程\n')

  const rl = readline.createInterface({ input, output })

  try {
    while (true) {
      const userInput = await rl.question('🧑 你: ')

      if (!userInput.trim()) continue
      if (userInput.trim() === '/quit') {
        console.log('\n👋 期待下次旅行规划！再见！')
        break
      }
      if (userInput.trim() === '/new') {
        orchestrator.resetHistory()
        console.log('\n✨ 已开启新旅程。\n')
        continue
      }

      console.log('\n🤔 小旅正在规划中...\n')

      try {
        const reply = await orchestrator.sendMessage(userInput, (toolName, _args) => {
          // 编排器的工具调用都是 Agent 调用，已在子 Agent 内部显示详情
          if (toolName === 'research_agent') {
            console.log('   🔍 调用攻略研究员...\n')
          } else if (toolName === 'advisor_agent') {
            console.log('   🍜 调用美食住宿顾问...\n')
          } else if (toolName === 'doc_agent') {
            console.log('   📝 调用文档专家...\n')
          }
        })

        console.log('🗺️  小旅:')
        console.log('─'.repeat(55))
        console.log(reply)
        console.log('─'.repeat(55))
        console.log()
      } catch (error) {
        console.error('❌ 出错了:', (error as Error).message)
        console.log('请重试或输入 /quit 退出\n')
      }
    }
  } finally {
    rl.close()
    xhs.stop()
  }
}

main().catch((error) => {
  console.error('❌ 启动失败:', error.message)
  process.exit(1)
})
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/index.ts
git commit -m "feat: switch entry point to multi-agent orchestrator"
```

---

### Task 5: 清理遗留代码 + 验证

**目标：** 删除 deprecated 兼容代码，确保最终编译和运行正常。

**Files:**
- Modify: `src/agent/index.ts`（删除 `createItineraryAgent` 兼容函数）
- Modify: `src/agent/prompts.ts`（删除 `TRAVEL_PLANNER_SYSTEM` deprecated 导出）

- [ ] **Step 1: 清理 `src/agent/index.ts`**

删除文件末尾的 deprecated 兼容函数：

```diff
- /**
-  * @deprecated 使用 createAgent({ systemPrompt, registry }) 替代
-  * 保留兼容性，内部委托给 createAgent
-  */
- export function createItineraryAgent(registry?: ToolRegistry) {
-   return createAgent({
-     systemPrompt: '你是一位旅行规划师。',
-     registry,
-   })
- }
```

- [ ] **Step 2: 清理 `src/agent/prompts.ts`**

删除文件末尾的 deprecated 导出：

```diff
- // ─── 兼容性（Phase 1 遗留）───
- 
- /** @deprecated 使用 ORCHESTRATOR_SYSTEM 替代 */
- export const TRAVEL_PLANNER_SYSTEM = ORCHESTRATOR_SYSTEM
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 验证构建通过**

Run: `npm run build`
Expected: 成功，无错误

- [ ] **Step 5: 提交**

```bash
git add src/agent/index.ts src/agent/prompts.ts
git commit -m "chore: remove deprecated Phase 1 compatibility code"
```

---

### Task 6: 手动验证多 Agent 流程

**目标：** 运行系统，验证多 Agent 协作正常工作。

- [ ] **Step 1: 启动系统**

Run: `npm run dev`

Expected 输出：
```
🗺️  Smart Itinerary — AI 旅行规划师 (多 Agent 协作)
───────────────────────────────────────────────────────
⏳ 正在连接小红书服务...
✅ 小红书服务就绪
🧠 记忆系统就绪 (Supabase)
🗺️  高德地图工具已注册 (天气/路线/地理编码/周边搜索)
🤖 编排器就绪 (3 个 Agent 工具)

输入你的旅行需求，我来帮你规划行程！
```

- [ ] **Step 2: 测试完整流程**

输入: `帮我规划3天东京亲子游，喜欢吃海鲜`

Expected 行为：
1. 编排器分析需求
2. 调用 `research_agent` → 研究员搜索攻略 → 返回摘要
3. 调用 `advisor_agent` → 顾问查天气+搜周边 → 返回推荐
4. 调用 `doc_agent` → 文档专家格式化 → 返回 Markdown 行程
5. 编排器汇总输出最终行程

Expected 终端显示：
```
🤔 小旅正在规划中...

   🔍 调用攻略研究员...

   🔍 [攻略研究员] 启动搜索: "东京 亲子游攻略"
   ⚙️  [ReAct 第1轮] 调用工具: search_xhs_notes
   ⚙️  [ReAct 第2轮] 调用工具: get_xhs_note
   ...
   ✅ [攻略研究员] 完成，返回研究摘要

   🍜 调用美食住宿顾问...

   🍜 [美食住宿顾问] 启动分析: 东京
   ⚙️  [ReAct 第1轮] 调用工具: search_memory
   ⚙️  [ReAct 第2轮] 调用工具: get_weather
   ...
   ✅ [美食住宿顾问] 完成，返回推荐列表

   📝 调用文档专家...

   📝 [文档专家] 格式化行程: 东京 3天
   ✅ [文档专家] 完成

🗺️  小旅:
───────────────────────────────────────────────────────
# 🗺️ 东京3天亲子海鲜之旅
...
```

- [ ] **Step 3: 测试简单问题（跳过子 Agent）**

输入: `东京现在天气怎么样？`

Expected: 编排器直接调用 `advisor_agent`，不调用 `research_agent` 和 `doc_agent`

- [ ] **Step 4: 测试 /new 命令**

输入: `/new` → 显示 "✨ 已开启新旅程。"
输入: `/quit` → 显示 "👋 期待下次旅行规划！再见！"

---

## 总结

| Task | 文件 | 变更类型 |
|------|------|---------|
| 1 | `src/agent/index.ts` | 重构为通用 `createAgent(options)` |
| 2 | `src/agent/prompts.ts` | 扩展为 4 个专用 System Prompt |
| 3 | `src/agent/orchestrator.ts` | 新增：编排器 + 3 个 Agent 工具 |
| 4 | `src/index.ts` | 入口改为使用编排器 |
| 5 | 清理 | 删除 deprecated 兼容代码 |
| 6 | 手动验证 | 运行 `npm run dev` 测试完整流程 |
