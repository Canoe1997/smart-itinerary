'use client'

import { Map, ChevronRight, FileDown, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { parseItinerary } from '@/lib/itinerary-parser'
import { useState, useCallback, useMemo } from 'react'

interface ItineraryCardProps {
  content: string
}

export function ItineraryCard({ content }: ItineraryCardProps) {
  const togglePreview = useAppStore((s) => s.togglePreview)
  const [isExporting, setIsExporting] = useState(false)

  const itinerary = useMemo(() => parseItinerary(content), [content])

  const totalDays = itinerary?.length ?? 0
  const totalActivities = useMemo(() => {
    if (!itinerary) return 0
    return itinerary.reduce(
      (sum, day) => sum + day.timeSlots.reduce((s, slot) => s + slot.activities.length, 0),
      0,
    )
  }, [itinerary])

  const destination = useMemo(() => {
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
    return firstLine.replace(/^#+\s*/, '').replace(/^\*{2}|\*{2}$/g, '').trim().slice(0, 30)
  }, [content])

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: content }),
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
  }, [content, isExporting])

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm max-w-[420px]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <Map className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold">行程已规划完成</p>
          <p className="text-xs text-muted-foreground">
            {destination && `${destination} · `}
            {totalDays > 0 && `${totalDays}天`}
            {totalActivities > 0 && ` · ${totalActivities}个活动`}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={togglePreview}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-colors hover:opacity-90 active:scale-[0.98]"
        >
          查看完整行程
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          PDF
        </button>
      </div>
    </div>
  )
}
