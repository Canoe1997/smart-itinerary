'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCallDetailProps {
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
}

const AGENT_CONFIG = {
  researcher: { icon: '🔍', label: '研究员', color: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950' },
  advisor: { icon: '🧭', label: '顾问', color: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950' },
  doc: { icon: '📝', label: '文档', color: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950' },
  orchestrator: { icon: '🤖', label: '编排器', color: 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950' },
}

export function ToolCallDetail({ agent, tool, status, durationMs }: ToolCallDetailProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = AGENT_CONFIG[agent as keyof typeof AGENT_CONFIG] ?? AGENT_CONFIG.orchestrator

  return (
    <div className={cn('rounded-lg border text-sm my-1.5', config.color)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span>{config.icon}</span>
        <span className="font-medium">{config.label}</span>
        <span className="text-muted-foreground">
          {status === 'running' ? `正在调用 ${tool}...` : `${tool} ✓`}
        </span>
        {durationMs && status === 'done' && (
          <span className="text-muted-foreground ml-auto text-xs">{durationMs}ms</span>
        )}
      </button>
      {isOpen && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <p>工具: <code className="bg-muted px-1 rounded">{tool}</code></p>
          {durationMs && <p>耗时: {durationMs}ms</p>}
          <p>状态: {status === 'running' ? '⏳ 执行中...' : '✅ 完成'}</p>
        </div>
      )}
    </div>
  )
}
