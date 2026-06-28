/**
 * 行程解析器 — Markdown → 结构化数据
 *
 * 从 Agent 返回的 Markdown 行程文本中提取天数、时间段、地点等信息。
 * 解析失败时返回 null，前端退化为纯 Markdown 渲染。
 */

export interface TimeSlot {
  period: 'morning' | 'afternoon' | 'evening'
  label: string
  activities: string[]
  locations: string[]
}

export interface DayPlan {
  day: number
  title: string
  timeSlots: TimeSlot[]
}

const PERIOD_KEYWORDS: Record<string, TimeSlot['period']> = {
  '上午': 'morning',
  '早上': 'morning',
  '早晨': 'morning',
  'morning': 'morning',
  '下午': 'afternoon',
  '午后': 'afternoon',
  'afternoon': 'afternoon',
  '晚上': 'evening',
  '傍晚': 'evening',
  '夜晚': 'evening',
  'evening': 'evening',
  '午餐': 'afternoon',
  '晚餐': 'evening',
}

const LOCATION_PATTERN = /[一-鿿\w]{2,}(?:寺|塔|公园|广场|街|区|城|馆|园|店|厅|寺|神社|温泉|港|湾|桥|山|湖|岛)/g

function detectPeriod(line: string): TimeSlot['period'] | null {
  for (const [keyword, period] of Object.entries(PERIOD_KEYWORDS)) {
    if (line.toLowerCase().includes(keyword)) return period
  }
  return null
}

function extractLocations(line: string): string[] {
  return [...line.matchAll(LOCATION_PATTERN)].map((m) => m[0])
}

/**
 * 解析行程 Markdown 文本
 *
 * 返回 DayPlan[] 或 null（解析失败时）。
 */
export function parseItinerary(markdown: string): DayPlan[] | null {
  const lines = markdown.split('\n').map((l) => l.trim())
  const days: DayPlan[] = []
  let currentDay: DayPlan | null = null
  let currentTimeSlot: TimeSlot | null = null

  for (const line of lines) {
    if (!line) continue

    // 匹配天数标题：支持更多格式
    // ## Day 1 / ## 第1天 / **Day 1** / Day 1: / 第1天：
    const dayMatch = line.match(
      /^#{1,3}\s*(?:Day\s*(\d+)|第(\d+)天)|^\*{2}(?:Day\s*(\d+)|第(\d+)天)|^(?:Day\s*(\d+)|第(\d+)天)\s*[:：—-]/i
    )
    if (dayMatch) {
      const dayNum = parseInt(dayMatch[1] ?? dayMatch[2] ?? dayMatch[3] ?? dayMatch[4] ?? dayMatch[5] ?? dayMatch[6], 10)
      currentDay = { day: dayNum, title: line.replace(/^#{1,3}\s*/, '').replace(/^\*{2}|\*{2}$/g, ''), timeSlots: [] }
      days.push(currentDay)
      currentTimeSlot = null
      continue
    }

    if (!currentDay) continue

    // 匹配时间段
    const period = detectPeriod(line)
    if (period) {
      // 去重：如果当前 Day 已有同类型 period，合并而非新建
      const existing = currentDay.timeSlots.find((ts) => ts.period === period)
      if (existing) {
        currentTimeSlot = existing
      } else {
        currentTimeSlot = { period, label: line.replace(/^[-*]\s*/, '').replace(/[🌅🌞🌆🍽️]/g, '').trim(), activities: [], locations: [] }
        currentDay.timeSlots.push(currentTimeSlot)
      }
      continue
    }

    // 匹配活动行
    const activityMatch = line.match(/^[-*]\s+(.+)/)
    if (activityMatch) {
      // 兜底：如果无时间段，默认归入 morning
      if (!currentTimeSlot) {
        currentTimeSlot = { period: 'morning', label: '全天', activities: [], locations: [] }
        currentDay.timeSlots.push(currentTimeSlot)
      }
      const text = activityMatch[1]
      currentTimeSlot.activities.push(text)
      currentTimeSlot.locations.push(...extractLocations(text))
    }
  }

  return days.length > 0 ? days : null
}
