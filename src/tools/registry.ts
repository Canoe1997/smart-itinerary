/**
 * 工具注册表
 *
 * 统一管理 Agent 可用的工具。
 * 工具定义使用 OpenAI Function Calling 格式（MiMo 原生支持）。
 *
 * 对应指南 "四大组件 — Action（行动）"
 */
import type OpenAI from 'openai'

/** 工具定义 */
export interface Tool {
  /** 工具名称 */
  name: string
  /** 工具功能描述 */
  description: string
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>
  /** 实际执行函数 */
  execute: (args: Record<string, unknown>) => Promise<string>
}

/** 工具注册表 */
export interface ToolRegistry {
  register(tool: Tool): void
  /** 获取 OpenAI 格式工具定义（传给 LLM） */
  getToolDefinitions(): OpenAI.ChatCompletionTool[]
  getTool(name: string): Tool | undefined
  size(): number
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>()

  function register(tool: Tool): void {
    tools.set(tool.name, tool)
  }

  function getToolDefinitions(): OpenAI.ChatCompletionTool[] {
    return [...tools.values()].map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  function getTool(name: string): Tool | undefined {
    return tools.get(name)
  }

  function size(): number {
    return tools.size
  }

  return { register, getToolDefinitions, getTool, size }
}
