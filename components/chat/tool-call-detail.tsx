'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Search, Compass, FileText, Bot, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCallDetailProps {
  agent: string
  tool: string
  status: 'running' | 'done'
  durationMs?: number
}

const AGENT_CONFIG = {
  researcher: { icon: Search, label: '研究员', color: 'border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/50', iconColor: 'text-blue-500' },
  advisor: { icon: Compass, label: '顾问', color: 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/50', iconColor: 'text-emerald-500' },
  doc: { icon: FileText, label: '文档', color: 'border-violet-200 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/50', iconColor: 'text-violet-500' },
  orchestrator: { icon: Bot, label: '编排器', color: 'border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50', iconColor: 'text-slate-500' },
}

export function ToolCallDetail({ agent, tool, status, durationMs }: ToolCallDetailProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = AGENT_CONFIG[agent as keyof typeof AGENT_CONFIG] ?? AGENT_CONFIG.orchestrator
  const Icon = config.icon

  return (
    <div className={cn('rounded-xl border text-sm my-1.5 transition-all duration-200', config.color)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className={cn('h-3.5 w-3.5', config.iconColor)} />
        <span className="font-medium text-foreground/80">{config.label}</span>
        <span className="text-muted-foreground text-xs">
          {status === 'running' ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {tool}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              {tool}
            </span>
          )}
        </span>
        {durationMs && status === 'done' && (
          <span className="text-muted-foreground/60 ml-auto text-xs tabular-nums">{durationMs}ms</span>
        )}
      </button>
      {isOpen && (
        <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
          <p>工具: <code className="bg-foreground/5 px-1.5 py-0.5 rounded-md text-xs">{tool}</code></p>
          {durationMs && <p>耗时: <span className="tabular-nums">{durationMs}ms</span></p>}
          <p>状态: {status === 'running' ? '执行中...' : '已完成'}</p>
        </div>
      )}
    </div>
  )
}
