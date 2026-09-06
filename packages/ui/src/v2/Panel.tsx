/**
 * ★★v2 카드★★ — 시안의 모든 화면이 이 한 장을 반복해서 쓴다.
 * (2026-09-06 · Part 10 ②단계 · 사장님 승인)
 *
 * ── 시안에서 관찰한 것
 *   ```
 *   배경    linear-gradient(160deg,#14151c,#0c0d12 58%)   ← 단색이 아니다
 *   테두리  1px #1e1f28
 *   위쪽    ★2px 강조선★ — 리그색 · 순위색 · 진행중이면 초록
 *   모서리  ★0★
 *   ```
 *
 * ── ★색을 직접 받지 않는다★
 *   `edge` 를 주면 그 색이 위쪽 선이 되고, 안 주면 `--v2-accent`(리그색)를 쓴다.
 *   ★리그 강조색은 부모의 `.sac-spl` / `.sac-ipl` / `.sac-sanply` 가 정한다★ —
 *   그래서 이 컴포넌트는 리그를 알 필요가 없다.
 *
 * ── ★없는 것은 안 그린다★
 *   `watermark` 를 안 주면 워터마크 요소 자체가 없다. 빈 칸을 만들지 않는다
 *   (사장님 지시: «실제 데이터가 없으면 그 요소 자체를 렌더하지 않는다»).
 */
import type { CSSProperties, ReactNode } from 'react'

export interface PanelProps {
  children: ReactNode
  /** 위쪽 2px 선의 색. 안 주면 리그 강조색 */
  edge?: string | null
  /** 위쪽 선을 아예 안 그린다 */
  noEdge?: boolean
  /** ★진행중(Cloud 0)★ — 카드 전체가 초록으로 발광한다 */
  live?: boolean
  /** 카드 안 대형 흐린 글자. 없으면 ★요소를 안 만든다★ */
  watermark?: string | null
  /** 워터마크 위치 — 기본은 오른쪽 아래 */
  watermarkStyle?: CSSProperties
  /** 카드 위를 지나가는 빛 */
  sweep?: boolean
  /** 빛의 색 (기본 흰빛) */
  sweepColor?: string
  className?: string
  style?: CSSProperties
}

export function Panel({
  children,
  edge,
  noEdge = false,
  live = false,
  watermark = null,
  watermarkStyle,
  sweep = false,
  sweepColor = 'rgba(255,255,255,.07)',
  className = '',
  style,
}: PanelProps) {
  const classes = ['v2-panel']
  if (live) classes.push('v2-panel--live')
  else if (!noEdge) classes.push('v2-panel--edge')
  if (className) classes.push(className)

  /* `live` 는 자기 색(초록)을 쓴다 — `edge` 로 덮지 않는다 */
  const edgeStyle: CSSProperties =
    !live && !noEdge && edge ? { borderTopColor: edge } : {}

  return (
    <div className={classes.join(' ')} style={{ ...edgeStyle, ...style }}>
      {sweep ? (
        <span
          className="v2-sweep"
          style={{
            background: `linear-gradient(90deg,rgba(255,255,255,0),${sweepColor},rgba(255,255,255,0))`,
          }}
        />
      ) : null}
      {watermark ? (
        <span
          className="v2-watermark"
          style={{ right: 16, bottom: 8, fontSize: 52, ...watermarkStyle }}
          aria-hidden="true"
        >
          {watermark}
        </span>
      ) : null}
      {children}
    </div>
  )
}
