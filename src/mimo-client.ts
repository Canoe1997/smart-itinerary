/**
 * MiMo API 客户端 (OpenAI 兼容协议)
 *
 * MiMo v2.5 Pro 支持原生 Function Calling，但使用 OpenAI 格式。
 * 通过 OpenAI SDK 实现工具调用，通过 Anthropic SDK 保留纯对话能力。
 */
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { loadConfig } from './config.js'

export interface ChatOptions {
  /** 系统提示词 */
  system?: string
  /** 对话消息列表 */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  /** 温度参数 (0-1) */
  temperature?: number
  /** 最大输出 token 数 */
  maxTokens?: number
}

export function createMiMoClient() {
  const config = loadConfig()

  // OpenAI 客户端（支持原生 Function Calling，使用 OpenAI 端点）
  const openai = new OpenAI({
    apiKey: config.mimoApiKey,
    baseURL: config.mimoOpenaiBaseUrl,
  })

  // Anthropic 客户端（纯对话，使用 Anthropic 端点）
  const anthropic = new Anthropic({
    apiKey: config.mimoApiKey,
    baseURL: config.mimoBaseUrl,
  })

  /**
   * 纯对话（Anthropic 协议）
   */
  async function chat(options: ChatOptions): Promise<string> {
    const { system, messages, temperature = 0.7, maxTokens = 4096 } = options

    const response = await anthropic.messages.create({
      model: config.mimoModel,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('MiMo 返回了空回复')
    }
    return textBlock.text
  }

  /**
   * 带工具调用的对话（OpenAI 原生 Function Calling）
   *
   * messages 已经是 OpenAI 格式（包含 tool_calls 和 tool 角色），直接透传。
   */
  async function chatWithTools(options: {
    system?: string
    messages: OpenAI.ChatCompletionMessageParam[]
    temperature?: number
    maxTokens?: number
    tools?: OpenAI.ChatCompletionTool[]
  }): Promise<OpenAI.ChatCompletion> {
    const { system, messages, temperature = 0.7, maxTokens = 4096, tools } = options

    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = []
    if (system) {
      oaiMessages.push({ role: 'system', content: system })
    }
    oaiMessages.push(...messages)

    return openai.chat.completions.create({
      model: config.mimoModel,
      max_tokens: maxTokens,
      temperature,
      messages: oaiMessages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    })
  }

  return { chat, chatWithTools, client: openai }
}
