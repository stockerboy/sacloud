'use client'

/**
 * `SACLOUD` 진열대 — **도는 벨트**.
 *
 * 사용자 지시 (2026-09-01 원문):
 * > "열면 딱 케이스가 열리면서 SA CLOUD 라는 진열대에 예쁘게 올리고 문구를 띄워줘"
 * > "진열대는 클랜이 여러개 쌓이면 그 한줄로 지나가게 보여줘 **회전초밥집처럼 계속 도는거야**
 * >  (한줄이 꽉차면 돌리면서 클랜을 전부 보여줘)"
 *
 * ── 끊김 없이 돈다
 *   목록을 **두 벌 이어 붙이고** `translateX(-50%)` 까지 밀었다가 처음으로 되돌린다.
 *   두 벌이 같으므로 되돌아간 순간이 보이지 않는다. `@keyframes` 하나로 끝난다 —
 *   **JS 타이머를 쓰지 않는다.**
 *
 *   ⚠ 이어 붙이는 자리에 **틈이 생기면 안 된다.** 그래서 항목 사이 간격을 `gap` 이 아니라
 *   각 항목의 `padding-right` 로 준다. `gap` 을 쓰면 한 벌의 폭이 `W`, 두 벌의 폭이 `2W+간격`
 *   이 되어 `-50%` 가 `-(W + 간격/2)` 이 된다 — 반 칸씩 어긋나며 이음매가 보인다.
 *
 * ── 개수가 적으면 **돌리지 않는다**
 *   «한줄이 꽉차면 돌리면서» 가 사용자 말이다. 판단 기준은 **컨테이너 너비**다 —
 *   한 벌의 실제 폭(`scrollWidth`)이 보이는 폭(`clientWidth`)보다 넓을 때만 돈다.
 *   개수로 정하지 않는 이유는 화면 폭이 390px 과 1120px 에서 다르기 때문이다.
 *   짧으면 가운데 정렬로 세워 둔다.
 *
 * ── 속도는 개수와 **무관하게 일정**하다
 *   `--belt-dur = 항목수 × BELT_SECONDS_PER_ITEM`. 지속시간이 길이에 비례하므로
 *   픽셀 속도가 고정된다. 클랜이 늘어난다고 빨라지지 않는다.
 *
 * ── 멈춘다
 *   마우스를 올리거나(`:hover`) 포커스가 들어오면(`:focus-within`) 멈춘다.
 *   `paused` prop 으로 밖에서도 멈출 수 있다. 읽을 시간을 줘야 한다.
 *
 * ── 성능
 * ```
 * 애니메이션 속성   transform 하나뿐이다. left · margin · background-position 을 쓰지 않는다
 * will-change      **도는 줄 하나에만** 준다 (`.gacha-belt`). 항목마다 주면 레이어가 폭발한다
 * 합성 레이어      벨트 1개. 캡슐에는 filter 를 쓰지 않는다
 * ```
 *
 * ── `prefers-reduced-motion`
 *   돌리지 않는다. 대신 **가로로 스크롤되는 줄**로 둬서 사용자가 직접 민다.
 *   그때는 두 번째 벌을 `display: none` 으로 감춘다 (같은 클랜이 두 번 보이면 안 된다).
 */

import { useEffect, useRef, useState, type CSSProperties, type Ref, type ReactNode } from 'react'

import { Capsule } from './Capsule'
import type { ClanMarkSource } from '../common/ClanMark'

export interface GachaShelfItem {
  key: string
  name: string
  mark?: ClanMarkSource | null
}

export interface GachaShelfProps {
  /** 진열대에 올라간 **열린** 클랜들 */
  items: readonly GachaShelfItem[]
  /**
   * 벨트 아래 문구 자리. **내용은 부르는 쪽이 정한다** — 여기서 문장을 지어내지 않는다.
   * `children` 도 같은 자리에 이어 붙는다.
   */
  note?: ReactNode
  children?: ReactNode
  /** 밖에서 멈춘다 (손가락을 댔을 때 등) */
  paused?: boolean
  /** 진열대에 새기는 이름 */
  brand?: string
  className?: string
}

/**
 * 항목 하나가 지나가는 데 걸리는 시간(초).
 *
 * 항목 폭이 대략 104px(캡슐 84 + 여백 20)이므로 픽셀 속도는 약 **40px/s** 다.
 * 회전초밥 벨트가 그 정도다 — 이름을 읽을 수는 있고 지루하지는 않다.
 */
export const BELT_SECONDS_PER_ITEM = 2.6

export function GachaShelf({
  items,
  note,
  children,
  paused = false,
  brand = 'SACLOUD',
  className = '',
}: GachaShelfProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const setRef = useRef<HTMLUListElement>(null)

  /* 서버에서는 항상 «안 돈다» 로 그린다. 브라우저에서 재 보고 넘칠 때만 켠다 —
     초기값이 false 라 하이드레이션이 어긋나지 않는다 */
  const [spin, setSpin] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const oneSet = setRef.current
    if (!viewport || !oneSet) return

    /* 한 벌의 실제 폭이 보이는 폭보다 넓으면 «한 줄이 꽉 찼다» 로 본다.
       두 번째 벌은 `spin` 이 켜진 뒤에 붙으므로 이 측정값은 흔들리지 않는다 */
    const measure = () => {
      setSpin(oneSet.scrollWidth > viewport.clientWidth + 1)
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(oneSet)
    return () => observer.disconnect()
  }, [items.length])

  const beltStyle: CSSProperties = {
    // 개수에 비례한 지속시간 = 개수와 무관한 픽셀 속도
    ['--belt-dur' as string]: `${Math.max(1, items.length) * BELT_SECONDS_PER_ITEM}s`,
  }

  return (
    <section className={`border border-line bg-card ${className}`}>
      {/* 진열대 이름. 도는 줄 **위**에 새긴다 */}
      <div className="flex items-center gap-3 px-5 pt-4">
        {/* 진홍은 이 짧은 선 하나뿐이다 — 넓은 면에 칠하지 않는다 (D-204) */}
        <span aria-hidden className="h-px w-8 bg-accent" />
        <h2 className="display text-[20px] leading-none tracking-[0.28em] text-text-strong">
          {brand}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-line-soft" />
      </div>

      {items.length === 0 ? null : (
        <div
          ref={viewportRef}
          className="gacha-belt-viewport mt-4 border-y border-line bg-card-2 py-4"
        >
          <div
            style={beltStyle}
            className={
              `flex ${spin ? 'gacha-belt w-max' : 'w-full justify-center'} ` +
              `${paused ? 'gacha-belt-paused' : ''}`
            }
          >
            <BeltSet items={items} setRef={setRef} trimLast={!spin} />
            {/* 이어 붙는 두 번째 벌. 되돌아가는 순간을 가린다.
                `prefers-reduced-motion` 이면 CSS 가 이것을 감춘다 */}
            {spin ? <BeltSet items={items} clone /> : null}
          </div>
        </div>
      )}

      {note || children ? (
        <div className="px-5 pb-5 pt-4">
          {note ? <div className="text-[13px] leading-relaxed text-text">{note}</div> : null}
          {children ? <div className={note ? 'mt-3' : ''}>{children}</div> : null}
        </div>
      ) : null}
    </section>
  )
}

/**
 * 한 벌.
 *
 * 항목 사이 간격을 `gap` 이 아니라 `pr` 로 준다 — 이유는 파일 머리말(이음매) 참조.
 */
function BeltSet({
  items,
  setRef,
  clone = false,
  trimLast = false,
}: {
  items: readonly GachaShelfItem[]
  setRef?: Ref<HTMLUListElement>
  clone?: boolean
  /**
   * 마지막 칸의 오른쪽 여백을 뗀다.
   *
   * **돌지 않을 때만** 쓴다. 가운데 정렬인데 끝에 여백이 남아 있으면 줄 전체가
   * 반 칸 왼쪽으로 치우쳐 보인다. 돌 때는 절대 떼면 안 된다 — 그 여백이 두 벌을
   * 잇는 이음매다 (파일 머리말 참조).
   */
  trimLast?: boolean
}) {
  return (
    <ul
      ref={setRef}
      aria-hidden={clone || undefined}
      className={`flex shrink-0 list-none ${clone ? 'gacha-belt-clone' : ''}`}
    >
      {items.map((item) => (
        <li key={item.key} className={`pr-5 max-md:pr-4 ${trimLast ? 'last:pr-0' : ''}`}>
          <Capsule name={item.name} mark={item.mark ?? null} state="opened" size="md" />
        </li>
      ))}
    </ul>
  )
}
