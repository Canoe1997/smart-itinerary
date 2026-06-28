'use client'

import { MessageSquare, Map, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type Tab = 'chat' | 'itinerary' | 'settings'

interface MobileNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const router = useRouter()

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: '对话', icon: MessageSquare },
    { id: 'itinerary', label: '行程', icon: Map },
    { id: 'settings', label: '设置', icon: Settings },
  ]

  function handleTabClick(tab: Tab) {
    if (tab === 'settings') {
      router.push('/settings')
      return
    }
    onTabChange(tab)
  }

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] transition-colors min-w-[64px]',
              isActive ? 'text-accent' : 'text-muted-foreground',
            )}
            aria-label={tab.label}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
