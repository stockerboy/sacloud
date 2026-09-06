/**
 * ★★v2 수치 한 줄★★ — 「라벨 · 부제 · 큰 숫자 · 단위」.
 * (2026-09-06 · Part 10 ②단계 · 사장님 승인)
 *
 * ── 시안에서 같은 모양이 세 곳에 나온다
 *   ```
 *   승률      12승 6패        66.7 %      ← 지난시즌 카드
 *   승률      10승 6패        62.5 %      ← 시즌별 기록 (선수 상세 오른쪽)
 *   평균 킬뎃                  52.8 %      ← 클랜 시즌별 기록
 *   ```
 *   왼쪽 라벨 · 가운데 흐린 부제 · 오른쪽 큰 숫자 + 작은 단위. ★한 컴포넌트면 된다.★
 *
 * ── ★모르는 값을 0 으로 만들지 않는다★
 *   `value` 가 `null` 이면 `missing` 을 흐리게 그린다 (시안의 「집계 없음」).
 *   ★그 자리를 0 이나 `-` 로 채우지 않는다★ (`CLAUDE.md` 3장 1번 · D-106).
 *
 * ── ★색은 부르는 쪽이 정한다★
 *   승률·킬뎃은 `rateClass()` 를, 순위는 `rankColor()` 를 쓴다.
 *   ★이 컴포넌트가 색을 판단하지 않는다★ — 규칙은 한 곳에만 있어야 한다.
 */
import type { CSSProperties, ReactNode } from 'react'

export interface StatRowProps {
  label: ReactNode
  /** 라벨 아래가 아니라 ★숫자 왼쪽★ 에 붙는 흐린 글자 (예: `12승 6패`) */
  sub?: ReactNode
  /** 큰 숫자. `null` 이면 `missing` 을 그린다 */
  value: ReactNode | null
  /** 숫자 뒤 작은 글자 (예: `%` · `전` · `점`) */
  unit?: ReactNode
  /** 숫자에 줄 색 클래스 (`rateClass()` 결과 등) */
  toneClass?: string
  /** 숫자에 직접 줄 색 */
  color?: string
  /** 값이 없을 때 그릴 글자. 기본 `집계 없음` */
  missing?: ReactNode
  /** 아래 구분선을 그릴까 */
  divider?: boolean
  className?: string
  style?: CSSProperties
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  padding: '13px 18px',
}
const labelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--v2-text-faint)',
  whiteSpace: 'nowrap',
}
const subStyle: CSSProperties = {
  fontSize: 11.5,
  color: 'var(--v2-text-ghost2)',
  whiteSpace: 'nowrap',
}
const valueStyle: CSSProperties = { fontSize: 19, fontWeight: 200, whiteSpace: 'nowrap' }
const unitStyle: CSSProperties = { fontSize: 10.5, color: 'var(--v2-text-ghost2)' }
/** 「집계 없음」은 ★워터마크처럼 흐리게★ — 값처럼 보이면 안 된다 */
const missingStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,.11)',
}

export function StatRow({
  label,
  sub,
  value,
  unit,
  toneClass = '',
  color,
  missing = '집계 없음',
  divider = true,
  className = '',
  style,
}: StatRowProps) {
  const classes = [className]
  if (divider) classes.push('v2-row-divider')

  return (
    <div className={classes.filter(Boolean).join(' ')} style={{ ...row, ...style }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
        {sub ? <span style={subStyle}>{sub}</span> : null}
        {value === null ? (
          <span style={missingStyle}>{missing}</span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span className={toneClass} style={{ ...valueStyle, ...(color ? { color } : {}) }}>
              {value}
            </span>
            {unit ? <span style={unitStyle}>{unit}</span> : null}
          </span>
        )}
      </span>
    </div>
  )
}
