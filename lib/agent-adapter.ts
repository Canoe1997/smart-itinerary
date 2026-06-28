/**
 * Agent <-> SSE 适配层
 *
 * 将现有 Orchestrator Agent 的非流式响应转为 ReadableStream（SSE）。
 * MiMo API 返回完整字符串后，通过 chunk 推送模拟流式体验。
 */
import { createTextStreamResponse } from 'ai'
import { loadConfig } from '@/src/config'
import { createXHSClient } from '@/src/mcp/xiaohongshu'
import { createMemory } from '@/src/memory/index'
import { createOrchestrator } from '@/src/agent/orchestrator'
import { createTraceCollector } from '@/src/trace/collector'

type XHSClient = ReturnType<typeof createXHSClient>

/** Promise-based 单例：避免并发请求重复启动 MCP 进程 */
let xhsPromise: Promise<XHSClient> | null = null

function getXHSClient(): Promise<XHSClient> {
  if (!xhsPromise) {
    const config = loadConfig()
    const client = createXHSClient(config.xhsMcpPath)
    xhsPromise = client.start().then(() => client)
  }
  return xhsPromise
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
 * 处理聊天请求 -- 核心适配函数
 *
 * 每次请求创建新的 Orchestrator 实例（上下文隔离）。
 * Agent 返回完整响应后，通过 ReadableStream 逐 chunk 推送。
 */
export async function handleChatRequest(
  userMessage: string,
  preferencesSummary?: string,
): Promise<Response> {
  const xhs = await getXHSClient()
  const memory = getMemory()
  const trace = createTraceCollector('orchestrator')

  const orchestrator = createOrchestrator({ xhs, memory, trace })

  // 构建用户输入（可选注入偏好）
  const fullMessage = preferencesSummary
    ? `${userMessage}\n\n[用户偏好: ${preferencesSummary}]`
    : userMessage

  // createTextStreamResponse 要求 ReadableStream<string>（非 Uint8Array）
  const textStream = new ReadableStream<string>({
    async start(controller) {
      try {
        const response = await orchestrator.sendMessage(fullMessage, (toolName) => {
          // 工具调用开始 -> 发送 SSE 自定义事件
          const event: ToolCallEvent = {
            type: 'tool-call',
            agent: guessAgentName(toolName),
            tool: toolName,
            status: 'running',
          }
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        })

        // 逐 chunk 推送响应文本
        const chunkSize = 20
        for (let i = 0; i < response.length; i += chunkSize) {
          const chunk = response.slice(i, i + chunkSize)
          controller.enqueue(chunk)
          // 小延迟模拟流式（总时长约 1-2 秒）
          if (i + chunkSize < response.length) {
            await new Promise((r) => setTimeout(r, 15))
          }
        }
      } catch (error) {
        const errorMsg = `\n\n❌ 发生错误: ${(error as Error).message}`
        controller.enqueue(errorMsg)
      } finally {
        controller.close()
        // 异步保存 trace
        trace.saveToFile('traces').catch(() => {})
      }
    },
  })

  return createTextStreamResponse({ textStream })
}

/** 根据工具名猜测所属 Agent */
function guessAgentName(toolName: string): string {
  if (toolName.includes('xhs') || toolName.includes('search')) return 'researcher'
  if (toolName.includes('weather') || toolName.includes('route') || toolName.includes('memory')) return 'advisor'
  if (toolName.includes('doc')) return 'doc'
  return 'orchestrator'
}
