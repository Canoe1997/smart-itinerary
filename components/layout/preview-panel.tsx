'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { ChevronRight, FileDown, Loader2, GripVertical } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import { parseItinerary } from '@/lib/itinerary-parser'
import { renderItineraryHtml } from '@/lib/itinerary-html'
import { cn } from '@/lib/utils'

const MIN_WIDTH = 300
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 460

export function PreviewPanel() {
  const { previewCollapsed, togglePreview } = useAppStore()
  const messages = useConversationStore((s) => s.messages)
  const [isExporting, setIsExporting] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Drag resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return
      const delta = startXRef.current - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
      setWidth(newWidth)
    }

    function handleMouseUp() {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const itineraryContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && parseItinerary(msg.content)) {
        return msg.content
      }
    }
    return null
  }, [messages])

  // 生成和 PDF 完全一致的 HTML
  const previewHtml = useMemo(() => {
    if (!itineraryContent) return null
    return renderItineraryHtml(itineraryContent, '旅行行程')
  }, [itineraryContent])

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
    <aside
      className="flex h-full flex-col bg-card border-l border-border shrink-0 relative"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 transition-colors z-10 group"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-3 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity bg-muted-foreground/20">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>

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

      <div className="flex-1 overflow-hidden">
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            title="行程预览"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
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
