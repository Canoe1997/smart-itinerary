'use client'

/**
 * XHS Connection Card — 小红书连接管理组件
 *
 * 显示小红书连接状态，提供连接/断开功能。
 * 使用 Puppeteer 弹窗登录自动提取 cookies。
 */
import { useEffect, useState, useCallback } from 'react'
import { ExternalLink, CheckCircle, XCircle, Loader2, Unplug } from 'lucide-react'

interface XHSStatus {
  connected: boolean
  valid: boolean
  savedAt: string | null
  daysRemaining?: number | null
  message: string
}

export function XhsConnectionCard() {
  const [status, setStatus] = useState<XHSStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/xhs/status')
      const data: XHSStatus = await res.json()
      setStatus(data)
    } catch {
      setStatus({ connected: false, valid: false, savedAt: null, message: '状态检查失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleLogin = async () => {
    setLoginLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/xhs/login', {
        method: 'POST',
        signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min timeout
      })
      const data = await res.json()
      if (data.success) {
        await fetchStatus()
      } else {
        setError(data.message)
      }
    } catch (e) {
      setError(`连接失败: ${(e as Error).message}`)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await fetch('/api/xhs/cookies', { method: 'DELETE' })
      await fetchStatus()
    } catch {
      setError('断开连接失败')
    }
  }

  const isConnected = status?.connected && status?.valid
  const isExpired = status?.connected && !status?.valid

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
          <ExternalLink className="h-4 w-4 text-red-500" />
        </div>
        <h2 className="text-sm font-semibold">小红书连接</h2>
      </div>

      {/* Status indicator */}
      <div className="mb-4 flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isConnected ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm text-muted-foreground">
          {loading ? '检查中...' : status?.message ?? '未知状态'}
        </span>
        {isConnected && status?.daysRemaining != null && (
          <span className="ml-auto text-xs text-muted-foreground">
            剩余 {status.daysRemaining} 天
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!isConnected ? (
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loginLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                等待登录中...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                {isExpired ? '重新连接' : '连接小红书'}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Unplug className="h-4 w-4" />
            断开连接
          </button>
        )}
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          刷新状态
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        连接后，AI 可以搜索小红书上的真实旅行攻略。Cookie 有效期约 7 天，过期后需重新连接。
      </p>
    </section>
  )
}
