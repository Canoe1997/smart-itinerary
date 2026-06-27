/**
 * 推理轨迹追踪 — 类型定义
 *
 * Phase 2.2: Agent 可观测性基础
 */

/** 追踪事件类型 */
export type TraceEventType =
  | 'user_message'
  | 'llm_call'
  | 'tool_call'
  | 'tool_result'
  | 'final_response'

/** 单个追踪事件 */
export interface TraceEvent {
  type: TraceEventType
  timestamp: number
  /** 耗时(ms)，仅 llm_call 和 tool_result 有 */
  durationMs?: number
  data: Record<string, unknown>
}

/** 一次 Agent 会话的完整追踪 */
export interface TraceSession {
  sessionId: string
  agentName: string
  systemPromptPreview: string
  events: TraceEvent[]
  subAgentTraces?: TraceSession[]
  totalDurationMs: number
  totalIterations: number
}

/** 追踪收集器接口 */
export interface TraceCollector {
  record(event: TraceEvent): void
  getSession(): TraceSession
  saveToFile(dir: string): Promise<string>
  /** 创建子 Agent 追踪收集器 */
  createSubCollector(agentName: string): TraceCollector
}
