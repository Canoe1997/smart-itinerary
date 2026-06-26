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
import type { Agent } from './index.js'
import { createToolRegistry } from '../tools/registry.js'
import type { Tool } from '../tools/registry.js'
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

      const researchRegistry = createToolRegistry()
      registerXHSTools(researchRegistry, xhs)

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

      const advisorRegistry = createToolRegistry()
      registerAmapTools(advisorRegistry)
      if (memory) {
        registerMemoryTools(advisorRegistry, memory)
      }

      const advisor = createAgent({
        systemPrompt: ADVISOR_SYSTEM,
        registry: advisorRegistry,
        maxIterations: 8,
      })

      console.log(`   🍜 [美食住宿顾问] 启动分析: ${destination}`)

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

export function createOrchestrator(options: {
  xhs: XHSClient
  memory: Memory | null
}): Agent {
  const { xhs, memory } = options

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
