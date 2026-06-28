'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  children?: React.ReactNode
}

export function MessageBubble({ role, content, children }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <div className={cn('group flex w-full mb-5 relative', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'text-sm leading-relaxed',
          isUser
            ? 'max-w-[70%] rounded-2xl rounded-br-md bg-bubble-user text-bubble-user-text px-4 py-3 shadow-sm'
            : 'max-w-[85%] text-foreground',
        )}
      >
        {children}

        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : '',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-p:leading-relaxed prose-li:leading-relaxed',
          'prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal',
          'prose-pre:bg-muted prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50',
          'prose-blockquote:border-l-2 prose-blockquote:border-accent/40 prose-blockquote:pl-3 prose-blockquote:italic',
          'prose-a:text-accent prose-a:underline prose-a:underline-offset-2',
          'prose-strong:font-semibold',
          'prose-table:text-xs',
          'prose-th:font-semibold prose-th:text-left',
          'prose-td:py-1.5 prose-th:py-1.5',
          'prose-img:rounded-lg',
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {!isUser && (
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground"
          aria-label="复制消息"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
