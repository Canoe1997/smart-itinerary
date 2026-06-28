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
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md',
        )}
      >
        {/* 工具调用详情（插在消息前面） */}
        {children}

        {/* Markdown 内容 */}
        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : 'dark:prose-invert',
          'prose-headings:mt-3 prose-headings:mb-2',
          'prose-p:my-1.5 prose-li:my-0.5',
          'prose-code:bg-muted-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
          'prose-pre:bg-muted-foreground/10 prose-pre:rounded-lg',
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
