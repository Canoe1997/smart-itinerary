'use client'

import { MapPin, Sun, Sunset, Moon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DayPlan, TimeSlot } from '@/lib/itinerary-parser'

const PERIOD_ICON = {
  morning: Sun,
  afternoon: Sunset,
  evening: Moon,
}

const PERIOD_LABEL = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
}

function TimeSlotSection({ slot }: { slot: TimeSlot }) {
  const Icon = PERIOD_ICON[slot.period]

  return (
    <div className="flex gap-3 py-2">
      <div className="flex flex-col items-center pt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {PERIOD_LABEL[slot.period]}
        </p>
        {slot.activities.map((activity, i) => (
          <p key={i} className="text-sm leading-relaxed">{activity}</p>
        ))}
        {slot.locations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {slot.locations.map((loc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5"
              >
                <MapPin className="h-2.5 w-2.5" />
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
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {plan.day}
          </span>
          {plan.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        {plan.timeSlots.map((slot, i) => (
          <TimeSlotSection key={i} slot={slot} />
        ))}
      </CardContent>
    </Card>
  )
}
