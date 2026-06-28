'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { Send, FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

  return (
    <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的旅行需求..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
        {hasMessages && (
          <Button
            onClick={onExportPdf}
            variant="outline"
            size="icon"
            title="导出 PDF"
          >
            <FileDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
