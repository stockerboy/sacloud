'use client'

/**
 * ★경기 로그 분석 — 날아오는 일곱 단계★ (2026-09-12 사장님)
 *
 * > «이거 막 그 배틀로그 분석 설명처럼 어디서 날아오는 막 애니메이트 써서
 * >  설명해주면 좋겠어 개간지나게»
 *
 * ── 어떻게 움직이나
 *   화면에 들어오는 순간 ★한 칸씩 옆에서 날아온다.★ 홀수는 왼쪽에서, 짝수는 오른쪽에서 —
 *   지그재그로 들어와서 「단계를 하나씩 밟는다」는 느낌이 난다.
 *   번호는 조금 늦게 뜨고, 칸 사이를 잇는 세로 선이 위에서 아래로 자란다.
 *
 * ── ★글이 안 보이게 되는 일은 없다★
 *   기본 상태는 ★보이는 것★ 이다. 자바스크립트가 붙은 뒤에야 \`is-armed\` 를 달아
 *   숨겼다가 보여 준다. 스크립트가 죽거나 옛 브라우저면 그냥 처음부터 다 보인다.
 *   움직임을 줄이라고 한 사람에게는 CSS 가 아무것도 안 움직인다.
 *
 * ── 한 번만 움직인다
 *   들어왔다 나갔다 할 때마다 다시 날아오면 어지럽다. 한 번 보이면 그대로 둔다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PipelineStep {
  no: string
  title: string
  detail: string
  facts: readonly string[]
}

export function GuidePipeline({ steps, note }: { steps: readonly PipelineStep[]; note: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    /* 스크립트가 살아 있다는 것을 확인한 뒤에만 숨긴다 */
    setArmed(true)
    const root = rootRef.current
    if (!root) return
    const items = [...root.querySelectorAll<HTMLElement>('[data-step]')]
    if (typeof IntersectionObserver === 'undefined') {
      for (const el of items) el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          /* 한 번 보이면 그만 본다 — 오갈 때마다 다시 날아오면 어지럽다 */
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    )
    for (const el of items) io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rootRef} className={`guide-flow ${armed ? 'is-armed' : ''}`}>
      <ol className="guide-flow__list">
        {steps.map((step, index) => (
          <li
            key={step.no}
            data-step
            className={`guide-flow__item ${index % 2 === 0 ? 'from-left' : 'from-right'}`}
            style={{ ['--step-delay' as string]: `${(index % 2) * 60}ms` }}
          >
            <span aria-hidden className="guide-flow__rail" />
            <span className="guide-flow__no num">{step.no}</span>
            <div className="guide-flow__body">
              <p className="guide-flow__title">{step.title}</p>
              <p className="guide-flow__detail">{step.detail}</p>
              <ul className="guide-flow__facts">
                {step.facts.map((fact, i) => (
                  <li key={fact} className="guide-flow__fact" style={{ ['--fact-i' as string]: String(i) }}>
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-[14px]">{note}</div>
    </div>
  )
}
