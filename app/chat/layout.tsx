'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { PreviewPanel } from '@/components/layout/preview-panel'
import { MobileNav } from '@/components/layout/mobile-nav'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileTab, setMobileTab] = useState<'chat' | 'itinerary' | 'settings'>('chat')

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Chat — always visible on desktop, tab-controlled on mobile */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className={`flex-1 flex flex-col min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
            {children}
          </div>

          {/* Mobile itinerary view */}
          <div className={`flex-1 overflow-y-auto ${mobileTab === 'itinerary' ? 'block' : 'hidden md:hidden'}`}>
            <div className="p-4">
              <PreviewPanel />
            </div>
          </div>
        </main>

        {/* PreviewPanel — hidden on mobile, shown on desktop */}
        <div className="hidden md:block">
          <PreviewPanel />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />
    </div>
  )
}
