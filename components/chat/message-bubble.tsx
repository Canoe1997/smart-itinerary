'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  children?: React.ReactNode
}

export function MessageBubble({ role, content, children }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex w-full mb-5', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          'transition-shadow duration-200',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md shadow-sm'
            : 'bg-card border border-border/60 rounded-bl-md shadow-sm',
        )}
      >
        {children}

        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : '',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-p:leading-relaxed prose-li:leading-relaxed',
          'prose-code:text-xs prose-code:bg-foreground/8 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal',
          'prose-pre:bg-foreground/5 prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50',
          'prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-3 prose-blockquote:italic',
          'prose-a:text-primary prose-a:underline prose-a:underline-offset-2',
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
    </div>
  )
}
