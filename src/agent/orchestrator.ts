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
import type { TraceCollector } from '../trace/types.js'
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

function createResearchAgentTool(xhs: XHSClient, trace?: TraceCollector): Tool {
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
      if (typeof args.query !== 'string' || !args.query.trim()) {
        return '错误：缺少 query 参数'
      }
      if (typeof args.destination !== 'string' || !args.destination.trim()) {
        return '错误：缺少 destination 参数'
      }
      const query = args.query
      const destination = args.destination

      const researchRegistry = createToolRegistry()
      registerXHSTools(researchRegistry, xhs)

      const subTrace = trace?.createSubCollector('researcher')
      const researcher = createAgent({
        systemPrompt: RESEARCHER_SYSTEM,
        registry: researchRegistry,
        maxIterations: 6,
        name: 'researcher',
        trace: subTrace,
      })

      console.log(`   🔍 [攻略研究员] 启动搜索: "${destination} ${query}"`)

      try {
        const result = await researcher.sendMessage(
          `请搜索并深度分析关于"${destination} ${query}"的旅行攻略。返回结构化研究摘要。`,
        )
        console.log(`   ✅ [攻略研究员] 完成，返回研究摘要`)
        return result
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误'
        console.error(`   ❌ [攻略研究员] 失败: ${msg}`)
        return `攻略研究员执行失败：${msg}`
      }
    },
  }
}

function createAdvisorAgentTool(memory: Memory | null, trace?: TraceCollector): Tool {
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
      if (typeof args.destination !== 'string' || !args.destination.trim()) {
        return '错误：缺少 destination 参数'
      }
      const destination = args.destination
      const preferences = typeof args.preferences === 'string' ? args.preferences : ''
      const researchContext = typeof args.researchContext === 'string' ? args.researchContext : ''

      const advisorRegistry = createToolRegistry()
      registerAmapTools(advisorRegistry)
      if (memory) {
        registerMemoryTools(advisorRegistry, memory)
      }

      const subTrace = trace?.createSubCollector('advisor')
      const advisor = createAgent({
        systemPrompt: ADVISOR_SYSTEM,
        registry: advisorRegistry,
        maxIterations: 8,
        name: 'advisor',
        trace: subTrace,
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

      try {
        const result = await advisor.sendMessage(task)
        console.log(`   ✅ [美食住宿顾问] 完成，返回推荐列表`)
        return result
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误'
        console.error(`   ❌ [美食住宿顾问] 失败: ${msg}`)
        return `美食住宿顾问执行失败：${msg}`
      }
    },
  }
}

function createDocAgentTool(trace?: TraceCollector): Tool {
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
      if (typeof args.itineraryData !== 'string' || !args.itineraryData.trim()) {
        return '错误：缺少 itineraryData 参数'
      }
      if (typeof args.destination !== 'string' || !args.destination.trim()) {
        return '错误：缺少 destination 参数'
      }
      const itineraryData = args.itineraryData
      const destination = args.destination
      const days = typeof args.days === 'string' ? args.days : '未指定'

      const subTrace = trace?.createSubCollector('doc')
      const docAgent = createAgent({
        systemPrompt: DOC_SYSTEM,
        maxIterations: 1,
        name: 'doc',
        trace: subTrace,
      })

      console.log(`   📝 [文档专家] 格式化行程: ${destination} ${days}天`)

      try {
        const result = await docAgent.sendMessage(
          `请将以下行程数据格式化为精美的 Markdown 文档。\n\n目的地: ${destination}\n天数: ${days}\n\n行程数据:\n${itineraryData}`,
        )
        console.log(`   ✅ [文档专家] 完成`)
        return result
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误'
        console.error(`   ❌ [文档专家] 失败: ${msg}`)
        return `文档格式化执行失败：${msg}`
      }
    },
  }
}

export function createOrchestrator(options: {
  xhs: XHSClient
  memory: Memory | null
  trace?: TraceCollector
}): Agent {
  const { xhs, memory, trace } = options

  const orchestratorRegistry = createToolRegistry()
  orchestratorRegistry.register(createResearchAgentTool(xhs, trace))
  orchestratorRegistry.register(createAdvisorAgentTool(memory, trace))
  orchestratorRegistry.register(createDocAgentTool(trace))

  console.log(`🤖 编排器就绪 (${orchestratorRegistry.size()} 个 Agent 工具)`)

  return createAgent({
    systemPrompt: ORCHESTRATOR_SYSTEM,
    registry: orchestratorRegistry,
    maxIterations: 10,
    name: 'orchestrator',
    trace,
  })
}
