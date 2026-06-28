'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, FileDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputBarProps {
  onSend: (message: string) => void
  onExportPdf: () => void
  isLoading: boolean
  hasMessages: boolean
}

export function InputBar({ onSend, onExportPdf, isLoading, hasMessages }: InputBarProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="border-t border-border/60 bg-background/80 backdrop-blur-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card px-3 py-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/30">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉小旅你的旅行需求..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={onExportPdf}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                title="导出 PDF"
              >
                <FileDown className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
                canSend
                  ? 'bg-primary text-primary-foreground shadow-sm hover:shadow active:scale-95'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
              title="发送"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          按 Enter 发送 · 基于小红书真实攻略
        </p>
      </div>
    </div>
  )
}
