/**
 * 推理轨迹追踪 — 收集器实现
 *
 * 记录 Agent 的完整推理链路，保存为 JSON 文件。
 * 每个 Agent 实例拥有独立的收集器，编排器的收集器管理子 Agent 的收集器。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { TraceEvent, TraceSession, TraceCollector } from './types.js'

/** 工具结果截断长度 */
const MAX_RESULT_LENGTH = 500

/**
 * 创建追踪收集器
 *
 * @param agentName - Agent 名称（orchestrator / researcher / advisor / doc）
 * @param systemPrompt - Agent 的 System Prompt（取前 100 字符作为摘要）
 */
export function createTraceCollector(
  agentName: string,
  systemPrompt: string = '',
): TraceCollector {
  const sessionId = `${agentName}-${Date.now()}`
  const events: TraceEvent[] = []
  const subAgentTraces: TraceSession[] = []
  const startTime = Date.now()

  function record(event: TraceEvent): void {
    // 截断过长的 tool_result
    const processedEvent = { ...event }
    if (
      processedEvent.type === 'tool_result' &&
      typeof processedEvent.data.result === 'string' &&
      processedEvent.data.result.length > MAX_RESULT_LENGTH
    ) {
      processedEvent.data = {
        ...processedEvent.data,
        result: processedEvent.data.result.slice(0, MAX_RESULT_LENGTH) + '...(截断)',
      }
    }
    events.push(processedEvent)
  }

  function getSession(): TraceSession {
    // 从事件中推断总轮次（取 llm_call 中最大的 iteration）
    let totalIterations = 0
    for (const event of events) {
      if (event.type === 'llm_call' && typeof event.data.iteration === 'number') {
        totalIterations = Math.max(totalIterations, event.data.iteration)
      }
    }

    return {
      sessionId,
      agentName,
      systemPromptPreview: systemPrompt.slice(0, 100),
      events: [...events],
      subAgentTraces: subAgentTraces.length > 0 ? [...subAgentTraces] : undefined,
      totalDurationMs: Date.now() - startTime,
      totalIterations,
    }
  }

  async function saveToFile(dir: string): Promise<string> {
    await mkdir(dir, { recursive: true })
    const fileName = `session-${sessionId}.json`
    const filePath = join(dir, fileName)
    const session = getSession()
    await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
    return filePath
  }

  function createSubCollector(agentName: string): TraceCollector {
    const sub = createTraceCollector(agentName, '')
    // Override getSession to register sub-trace in parent
    const originalGetSession = sub.getSession.bind(sub)
    sub.getSession = () => {
      const session = originalGetSession()
      const existingIndex = subAgentTraces.findIndex((t) => t.sessionId === session.sessionId)
      if (existingIndex >= 0) {
        subAgentTraces[existingIndex] = session
      } else {
        subAgentTraces.push(session)
      }
      return session
    }
    return sub
  }

  return { record, getSession, saveToFile, createSubCollector }
}
