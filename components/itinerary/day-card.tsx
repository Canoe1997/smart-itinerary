'use client'

import { MapPin, Sun, Sunset, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DayPlan, TimeSlot } from '@/lib/itinerary-parser'

const PERIOD_CONFIG = {
  morning: { icon: Sun, label: '上午', color: 'text-amber-500' },
  afternoon: { icon: Sunset, label: '下午', color: 'text-orange-500' },
  evening: { icon: Moon, label: '晚上', color: 'text-indigo-400' },
}

function TimeSlotSection({ slot }: { slot: TimeSlot }) {
  const config = PERIOD_CONFIG[slot.period]
  const Icon = config.icon

  return (
    <div className="flex gap-3 py-3">
      <div className="flex flex-col items-center pt-0.5">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/5', config.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="w-px flex-1 bg-border/60 mt-2" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          {config.label}
        </p>
        {slot.activities.map((activity, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">{activity}</p>
        ))}
        {slot.locations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {slot.locations.map((loc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs bg-primary/8 text-primary rounded-full px-2.5 py-0.5 font-medium"
              >
                <MapPin className="h-3 w-3" />
                {loc}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DayCard({ plan }: { plan: DayPlan }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      <div className="bg-gradient-to-r from-primary/8 to-primary/4 px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold tabular-nums">
            {plan.day}
          </span>
          <span className="text-sm font-semibold tracking-tight">{plan.title}</span>
        </div>
      </div>
      <div className="px-4 pb-2">
        {plan.timeSlots.map((slot, i) => (
          <TimeSlotSection key={i} slot={slot} />
        ))}
      </div>
    </div>
  )
}
