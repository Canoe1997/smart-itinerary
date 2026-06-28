'use client'

import { useTheme } from 'next-themes'
import { ArrowLeft, Palette, Luggage, Activity } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { XhsConnectionCard } from '@/components/settings/xhs-connection'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { preferences, setPreference } = useAppStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">设置</h1>
      </div>

      <div className="space-y-6">
        {/* 主题设置 */}
        <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Palette className="h-4 w-4 text-violet-500" />
            </div>
            <h2 className="text-sm font-semibold">外观</h2>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">主题</span>
            {mounted && (
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="system">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            )}
          </div>
        </section>

        {/* 旅行偏好 */}
        <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Luggage className="h-4 w-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-semibold">旅行偏好</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">默认天数</span>
              <input
                type="number"
                min={1}
                max={30}
                value={preferences.defaultDays}
                onChange={(e) => setPreference('defaultDays', parseInt(e.target.value, 10) || 3)}
                className="w-20 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">出行人数</span>
              <input
                type="number"
                min={1}
                max={20}
                value={preferences.groupSize}
                onChange={(e) => setPreference('groupSize', parseInt(e.target.value, 10) || 2)}
                className="w-20 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">预算偏好</span>
              <select
                value={preferences.budget}
                onChange={(e) => setPreference('budget', e.target.value as 'low' | 'medium' | 'high')}
                className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="low">经济型</option>
                <option value="medium">中等</option>
                <option value="high">高端</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">语言</span>
              <select
                value={preferences.language}
                onChange={(e) => setPreference('language', e.target.value)}
                className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="中文">中文</option>
                <option value="English">English</option>
                <option value="日本語">日本語</option>
              </select>
            </div>
          </div>
        </section>

        {/* 小红书连接 */}
        <XhsConnectionCard />

        {/* 推理轨迹 */}
        <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Activity className="h-4 w-4 text-emerald-500" />
            </div>
            <h2 className="text-sm font-semibold">推理轨迹</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            推理轨迹文件保存在项目 <code className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-xs">traces/</code> 目录下，
            每次对话结束自动生成。
          </p>
        </section>
      </div>
    </div>
  )
}
