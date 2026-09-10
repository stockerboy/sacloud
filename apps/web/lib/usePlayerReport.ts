'use client'

/**
 * ★핵의심 신고★ 버튼 훅 (2026-09-10)
 *
 * 로그인한 회원만 누른다 — 서버가 401 을 주면 그 말을 그대로 보여 준다.
 * 같은 날 두 번은 409 다. 어느 쪽이든 서버가 돌려준 «현재 신고 수»로 화면을 맞춘다.
 */
import { useCallback, useState } from 'react'
import { buildPath, endpoints } from '@sacloud/contract'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api'

export function usePlayerReport(playerId: string, initialCount: number) {
  const [count, setCount] = useState(initialCount)
  const [reported, setReported] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const onReport = useCallback(async () => {
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const endpoint = endpoints.playerReport
      const response = await fetch(`${BASE_URL}${buildPath(endpoint.path, { playerId })}`, {
        method: endpoint.method,
        credentials: 'same-origin',
      })
      const payload = (await response.json().catch(() => null)) as
        | { data?: { count?: number }; message?: string; error?: { message?: string } }
        | null
      const next = payload?.data?.count
      if (typeof next === 'number') setCount(next)
      if (response.ok) {
        setReported(true)
        setMessage('신고했습니다')
      } else {
        setMessage(payload?.message ?? payload?.error?.message ?? (response.status === 401 ? '로그인한 회원만 신고할 수 있습니다' : '신고하지 못했습니다'))
      }
    } catch {
      setMessage('신고하지 못했습니다')
    } finally {
      setPending(false)
    }
  }, [pending, playerId])
  return { count, reported, pending, message, onReport }
}
