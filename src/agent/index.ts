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
import { TRAVEL_PLANNER_SYSTEM } from './prompts.js'

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
  return createAgent({
    systemPrompt: TRAVEL_PLANNER_SYSTEM,
    registry,
  })
}
