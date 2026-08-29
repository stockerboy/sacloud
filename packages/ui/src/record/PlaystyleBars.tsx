import type { PlayerPlaystyle, PlayerPlaystyleBar } from '@sacloud/contract'
import { pendingText } from './traitCopy'

/**
 * 플레이스타일 바 두 줄 (`docs/PLAYER_TRAITS_SPEC.md` 8절 · D-182 · D-185).
 *
 * 육각형이 **"얼마나 잘하나"** 라면 이것은 **"어떻게 하나"** 다.
 * 잘하고 못하고를 뜻하지 않는다 — 가운데(`정석`)가 나쁜 것이 아니다.
 *
 * ```
 * 블루   안전함  ────────●──────── 변칙적
 * 레드   느린전개 ────────●──────── 빠른전개
 * ```
 *
 * ── 블루·레드는 **색 이름이 아니라 진영**이다 (D-182 · 사용자 확정)
 *   블루 = 수비 · 레드 = 공격. 그 진영으로 뛴 **라운드만** 골라서 잰다.
 *   그래서 색도 진영 색을 쓴다 — 승/패 색(`win-bar`/`lose-bar`)과 같은 토큰이다.
 *
 * ── 아직 두 줄 다 못 잰다
 *   라운드별 진영(D-184 의 폭탄 판정)과 라운드 복원이 있어야 나온다.
 *   **가운데로 채우지 않는다** — `정석` 은 "재 봤더니 가운데" 라는 뜻이라
 *   모르는 것을 그렇게 적으면 거짓이 된다 (D-106). 눈금만 그리고 `측정중` 이라고 적는다.
 */

const BAR_COLOR: Record<PlayerPlaystyleBar['key'], string> = {
  blue: 'var(--color-win-bar)',
  red: 'var(--color-lose-bar)',
}

function Bar({ bar }: { bar: PlayerPlaystyleBar }) {
  /* `-100 ~ +100` 을 `0 ~ 100%` 자리로 옮긴다. 못 쟀으면 아무것도 찍지 않는다 */
  const left = bar.value === null ? null : (bar.value + 100) / 2

  return (
    <div className="py-1.5">
      <div className="flex items-center text-xs">
        <span className="w-8 shrink-0" style={{ color: BAR_COLOR[bar.key] }}>
          {bar.side_label}
        </span>
        <span className="w-16 shrink-0 text-side-meta">{bar.left_label}</span>
        <span className="relative mx-1 h-1.5 flex-grow rounded-full bg-side-line">
          {/* 가운데(`정석`) 눈금 — 값이 없어도 그린다. 축이 무엇인지는 보여야 한다 */}
          <span
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-side-meta"
            style={{ left: '50%' }}
            aria-hidden
          />
          {left === null ? null : (
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${left}%`, backgroundColor: BAR_COLOR[bar.key] }}
              aria-hidden
            />
          )}
        </span>
        <span className="w-16 shrink-0 text-right text-side-meta">{bar.right_label}</span>
      </div>
      {bar.pending === null ? null : (
        <div className="mt-0.5 pl-8 text-xs text-side-meta">
          측정중 — {pendingText(bar.pending)}
        </div>
      )}
    </div>
  )
}

export function PlaystyleBars({ playstyle }: { playstyle: PlayerPlaystyle }) {
  return (
    <div className="mt-2 bg-side px-3 py-3 text-line shadow-card">
      <div className="flex items-baseline justify-between">
        <div>플레이스타일</div>
        {/* 무엇을 뜻하는 바인지 한 번은 밝혀 둔다 — 블루/레드는 색이 아니라 진영이다 */}
        <div className="text-xs text-side-meta">블루 = 수비 · 레드 = 공격</div>
      </div>
      <div className="mt-1">
        {playstyle.bars.map((bar) => (
          <Bar key={bar.key} bar={bar} />
        ))}
      </div>
    </div>
  )
}
