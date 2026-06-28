'use client'

import { useMemo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight, FileDown, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import { parseItinerary } from '@/lib/itinerary-parser'
import { cn } from '@/lib/utils'

export function PreviewPanel() {
  const { previewCollapsed, togglePreview } = useAppStore()
  const messages = useConversationStore((s) => s.messages)
  const [isExporting, setIsExporting] = useState(false)

  const itineraryContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && parseItinerary(msg.content)) {
        return msg.content
      }
    }
    return null
  }, [messages])

  const handleExportPdf = useCallback(async () => {
    if (!itineraryContent || isExporting) return
    setIsExporting(true)

    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: itineraryContent }),
      })

      if (!res.ok) throw new Error('PDF 导出失败')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `旅行行程-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (error) {
      alert(`PDF 导出失败: ${(error as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }, [itineraryContent, isExporting])

  if (previewCollapsed) {
    return (
      <button
        onClick={togglePreview}
        className="fixed right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border/60 shadow-sm hover:bg-muted transition-colors"
        aria-label="展开预览面板"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
      </button>
    )
  }

  return (
    <aside className="flex h-full w-[340px] flex-col bg-card border-l border-border shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">行程预览</h2>
        <button
          onClick={togglePreview}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="折叠预览面板"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {itineraryContent ? (
          <div className={cn(
            'prose prose-sm max-w-none',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
            'prose-p:text-foreground/80 prose-p:leading-relaxed',
            'prose-li:text-foreground/80 prose-li:leading-relaxed',
            'prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md',
            'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:text-xs',
            'prose-a:text-accent prose-a:underline',
            'prose-strong:text-foreground prose-strong:font-semibold',
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {itineraryContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileDown className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              暂无行程内容
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              向小旅描述你的旅行需求，行程会在这里预览
            </p>
          </div>
        )}
      </div>

      {itineraryContent && (
        <div className="border-t border-border p-3">
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              'bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-50',
            )}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {isExporting ? '导出中...' : '导出 PDF'}
          </button>
        </div>
      )}
    </aside>
  )
}
