/**
 * 记忆工具定义
 *
 * 让 Agent 能够：
 * - 保存用户偏好（长期记忆）
 * - 搜索已有知识库（RAG 检索）
 * - 存储攻略到知识库
 */
import type { Tool } from './registry.js'
import type { createMemory } from '../memory/index.js'

type Memory = ReturnType<typeof createMemory>

/**
 * 保存用户偏好工具
 *
 * Agent 在对话中识别到用户偏好时自动调用。
 * 例如：用户说"我喜欢温泉" → 保存 preference_type: 'style', key: '喜欢温泉'
 */
export function createSavePreferenceTool(memory: Memory): Tool {
  return {
    name: 'save_user_preference',
    description:
      '保存用户的旅行偏好到记忆系统。当识别到用户的旅行偏好（如喜欢的类型、预算范围、饮食习惯、住宿偏好等）时调用。',
    parameters: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description:
            '偏好类型: destination(目的地偏好), budget(预算), style(风格), food(饮食), accommodation(住宿), activity(活动偏好)',
        },
        key: {
          type: 'string',
          description: '偏好名称，如 "喜欢温泉", "预算适中", "不吃辣"',
        },
        value: {
          type: 'string',
          description: '偏好值，如 "是", "¥10000-20000/人", "避免辛辣食物"',
        },
      },
      required: ['type', 'key', 'value'],
    },
    async execute(args) {
      try {
        await memory.savePreference(
          args.type as string,
          args.key as string,
          args.value as string,
        )
        return `已记住偏好: ${args.key} = ${args.value}`
      } catch (error) {
        return `保存失败: ${(error as Error).message}`
      }
    },
  }
}

/**
 * 搜索记忆工具
 *
 * Agent 在规划前先搜索已有知识和用户偏好，实现 RAG。
 */
export function createSearchMemoryTool(memory: Memory): Tool {
  return {
    name: 'search_memory',
    description:
      '搜索记忆系统中的用户偏好和旅行知识库。规划行程前先调用，了解用户已知偏好和是否有相关攻略储备。',
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，如 "温泉偏好", "东京攻略"',
        },
        type: {
          type: 'string',
          description: '搜索类型: preferences(用户偏好), knowledge(旅行知识), all(全部)',
          enum: ['preferences', 'knowledge', 'all'],
        },
      },
      required: ['query'],
    },
    async execute(args) {
      const query = args.query as string
      const searchType = (args.type as string) ?? 'all'
      const results: string[] = []

      try {
        if (searchType === 'preferences' || searchType === 'all') {
          const prefs = await memory.searchPreferences(query)
          if (prefs.length > 0) {
            results.push('📋 用户偏好:')
            for (const p of prefs) {
              results.push(`  - [${p.preference_type}] ${p.preference_key}: ${p.preference_value}`)
            }
          }
        }

        if (searchType === 'knowledge' || searchType === 'all') {
          const knowledge = await memory.searchKnowledge(query)
          if (knowledge.length > 0) {
            results.push('📚 旅行知识库:')
            for (const k of knowledge) {
              results.push(`  - ${k.title} (${k.author ?? '未知'}) 👍${k.liked_count}`)
              results.push(`    ${k.content.slice(0, 200)}...`)
            }
          }
        }

        return results.length > 0 ? results.join('\n') : '记忆中暂无相关内容。'
      } catch (error) {
        return `搜索记忆失败: ${(error as Error).message}`
      }
    },
  }
}

/**
 * 存储攻略到知识库工具
 *
 * Agent 搜索到好的小红书攻略后，存入知识库供后续 RAG 检索。
 */
export function createStoreKnowledgeTool(memory: Memory): Tool {
  return {
    name: 'store_travel_knowledge',
    description:
      '将旅行攻略存入知识库。当搜索到有价值的小红书攻略时调用，为后续行程规划积累知识。',
    parameters: {
      type: 'object' as const,
      properties: {
        noteId: { type: 'string', description: '小红书笔记ID' },
        title: { type: 'string', description: '笔记标题' },
        author: { type: 'string', description: '作者昵称' },
        content: { type: 'string', description: '笔记正文（精简版，不超过1000字）' },
        destination: { type: 'string', description: '目的地，如 "东京", "伊豆"' },
        likedCount: { type: 'number', description: '点赞数' },
      },
      required: ['title', 'content', 'destination'],
    },
    async execute(args) {
      try {
        await memory.storeKnowledge({
          noteId: args.noteId as string | undefined,
          title: args.title as string,
          author: args.author as string | undefined,
          content: args.content as string,
          destination: args.destination as string,
          likedCount: args.likedCount as number | undefined,
        })
        return `已存入知识库: ${args.title} (${args.destination})`
      } catch (error) {
        return `存储失败: ${(error as Error).message}`
      }
    },
  }
}

/**
 * 注册所有记忆工具
 */
export function registerMemoryTools(
  registry: { register: (tool: Tool) => void },
  memory: Memory,
): void {
  registry.register(createSavePreferenceTool(memory))
  registry.register(createSearchMemoryTool(memory))
  registry.register(createStoreKnowledgeTool(memory))
}
