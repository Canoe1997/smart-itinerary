'use client'

import { parseItinerary } from '@/lib/itinerary-parser'
import { DayCard } from './day-card'

interface TimelineProps {
  content: string
}

/**
 * 行程时间线 — 自动解析 Markdown 行程并渲染为 Day Cards
 *
 * 解析失败时返回 null（调用方应降级为纯 Markdown 渲染）。
 */
export function Timeline({ content }: TimelineProps) {
  const days = parseItinerary(content)

  if (!days || days.length === 0) return null

  return (
    <div className="space-y-4 my-4">
      {days.map((day) => (
        <DayCard key={day.day} plan={day} />
      ))}
    </div>
  )
}
