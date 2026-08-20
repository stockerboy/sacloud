'use client'

import { useEffect, useState } from 'react'
import { formatRelativeTime } from './relative-time'

/**
 * `2026-08-20T09:00:00+09:00` → `3시간 전`
 *
 * 서버 렌더와 클라이언트 렌더의 기준 시각이 달라 hydration 불일치가 나기 쉬우므로
 * 마운트 이후에 다시 계산한다. 첫 렌더는 `dateTime` 속성만 있는 빈 문자열이다.
 */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const [text, setText] = useState('')

  useEffect(() => {
    setText(formatRelativeTime(value))
  }, [value])

  return (
    <time className={className} dateTime={value}>
      {text}
    </time>
  )
}
