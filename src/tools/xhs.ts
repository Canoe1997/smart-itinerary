/**
 * 小红书工具定义
 *
 * 将 MCP 小红书服务封装为 Agent 可调用的工具。
 * Agent 的 "Action" 层通过这些工具获取真实旅行经验数据。
 *
 * 可用工具:
 * - search_notes: 搜索小红书笔记（核心，行程规划的数据来源）
 * - get_note: 获取笔记详情（深度分析单篇攻略）
 */
import type { Tool } from './registry.js'
import type { createXHSClient } from '../mcp/xiaohongshu.js'

type XHSClient = ReturnType<typeof createXHSClient>

/**
 * 创建小红书搜索工具
 *
 * Agent 通过此工具搜索真实旅行攻略，作为行程规划的数据来源。
 */
export function createSearchNotesTool(xhs: XHSClient): Tool {
  return {
    name: 'search_xhs_notes',
    description:
      '搜索小红书旅行笔记。输入关键词（如目的地+主题），返回相关笔记列表（标题、作者、互动数据）。' +
      '用于获取真实旅行经验、攻略和推荐。当用户询问旅行目的地、景点、美食、住宿时使用。',
    parameters: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词，如 "伊豆 温泉 攻略"、"东京 亲子游 推荐"',
        },
      },
      required: ['keyword'],
    },
    async execute(args) {
      const keyword = args.keyword as string
      if (!keyword?.trim()) return '错误：请提供搜索关键词'
      const result = await xhs.searchNotes(keyword.trim())
      if (result.isError) {
        return `搜索失败: ${result.content[0]?.text ?? '未知错误'}`
      }
      // 精简返回内容，避免撑爆上下文窗口
      return result.content[0]?.text ?? '无搜索结果'
    },
  }
}

/**
 * 创建获取笔记详情工具
 *
 * 当 Agent 需要深入分析某篇攻略时调用。
 */
export function createGetNoteTool(xhs: XHSClient): Tool {
  return {
    name: 'get_xhs_note',
    description:
      '获取小红书笔记详情。输入笔记ID，返回完整的笔记内容（标题、正文、作者、互动数据、图片链接）。' +
      '用于深入分析某篇攻略的具体内容。当需要了解某篇笔记的详细信息时使用。',
    parameters: {
      type: 'object' as const,
      properties: {
        noteId: {
          type: 'string',
          description: '笔记ID（从 search_xhs_notes 结果中获取）',
        },
      },
      required: ['noteId'],
    },
    async execute(args) {
      const noteId = args.noteId as string
      const result = await xhs.getNote(noteId)
      if (result.isError) {
        return `获取详情失败: ${result.content[0]?.text ?? '未知错误'}`
      }
      return result.content[0]?.text ?? '无笔记内容'
    },
  }
}

/**
 * 注册所有小红书工具到注册表
 */
export function registerXHSTools(
  registry: { register: (tool: Tool) => void },
  xhs: XHSClient,
): void {
  registry.register(createSearchNotesTool(xhs))
  registry.register(createGetNoteTool(xhs))
}
