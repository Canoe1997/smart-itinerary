'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputBarProps {
  onSend: (message: string) => void
  isLoading: boolean
}

export function InputBar({ onSend, isLoading }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl bg-muted/80 px-4 py-3 transition-shadow focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="告诉小旅你的旅行需求..."
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 resize-none leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150',
              canSend
                ? 'bg-foreground text-background hover:opacity-80 active:scale-95'
                : 'bg-muted-foreground/20 text-muted-foreground/40 cursor-not-allowed',
            )}
            title="发送"
            aria-label="发送消息"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/40">
          小旅可能会犯错，请核实重要信息
        </p>
      </div>
    </div>
  )
}
