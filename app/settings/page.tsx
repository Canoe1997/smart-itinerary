'use client'

import { useTheme } from 'next-themes'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/app-store'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { preferences, setPreference } = useAppStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">设置</h1>
      </div>

      <div className="space-y-6">
        {/* 主题设置 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">外观</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>主题</Label>
              {mounted && (
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="system">跟随系统</option>
                  <option value="light">亮色</option>
                  <option value="dark">暗色</option>
                </select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 旅行偏好 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">旅行偏好</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="days">默认天数</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={30}
                value={preferences.defaultDays}
                onChange={(e) => setPreference('defaultDays', parseInt(e.target.value, 10) || 3)}
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="group">出行人数</Label>
              <Input
                id="group"
                type="number"
                min={1}
                max={20}
                value={preferences.groupSize}
                onChange={(e) => setPreference('groupSize', parseInt(e.target.value, 10) || 2)}
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>预算偏好</Label>
              <select
                value={preferences.budget}
                onChange={(e) => setPreference('budget', e.target.value as 'low' | 'medium' | 'high')}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="low">经济型</option>
                <option value="medium">中等</option>
                <option value="high">高端</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <Label>语言</Label>
              <select
                value={preferences.language}
                onChange={(e) => setPreference('language', e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="中文">中文</option>
                <option value="English">English</option>
                <option value="日本語">日本語</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 推理轨迹 */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">推理轨迹</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              推理轨迹文件保存在项目 <code className="rounded bg-muted px-1">traces/</code> 目录下，
              每次对话结束自动生成。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
