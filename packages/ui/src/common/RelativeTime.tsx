'use client'

import { useEffect, useState } from 'react'
import { formatRelativeTime } from './relative-time'

/**
 * `2026-08-20T09:00:00+09:00` → `3시간 전`
 *
 * 서버 렌더와 클라이언트 렌더의 기준 시각이 달라 hydration 불일치가 나기 쉬우므로
 * 마운트 이후에 다시 계산한다. 첫 렌더는 `dateTime` 속성만 있는 빈 문자열이다.
 */
export function RelativeTime({
  value,
  className,
  withClock = false,
}: {
  value: string
  className?: string
  /**
   * ★뒤에 시각(HH:MM)을 붙인다★ (2026-09-03 · O-038 ④).
   *
   * 경기 목록에서 스무 줄이 전부 **「제3보급창고 - 7일 전」** 이었다 (강민재).
   * 같은 맵에서 같은 날 여러 판을 하니 **어느 판인지 구별이 안 된다.**
   * 시각 한 줄이면 끝난다.
   *
   * ⚠ 기본은 `false` 다 — **부르는 쪽이 켠 데서만 바뀐다.**
   *   상대시각만 있던 다른 화면은 그대로다.
   * ⚠ 시각도 **마운트 뒤에** 만든다. 서버와 브라우저의 표준시가 달라
   *   hydration 이 어긋나는 것을 막으려는 이 파일의 원래 이유가 그대로 걸린다.
   */
  withClock?: boolean
}) {
  const [text, setText] = useState('')

  useEffect(() => {
    const relative = formatRelativeTime(value)
    if (!withClock) {
      setText(relative)
      return
    }
    const at = new Date(value)
    if (Number.isNaN(at.getTime())) {
      setText(relative)
      return
    }
    /* `03:45` — 초는 안 붙인다. 판을 가르는 데 분이면 충분하다 */
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    setText(`${relative} ${clock}`)
  }, [value, withClock])

  return (
    <time className={className} dateTime={value}>
      {text}
    </time>
  )
}
