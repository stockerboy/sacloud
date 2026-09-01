import type { ReactNode } from 'react'
import { LeagueLabel } from '../layout/LeagueLabel'

/**
 * 랭킹을 **한 화면에 두 칸**으로 나란히 둔다 — 왼쪽 SPL, 오른쪽 IPL (2026-09-01 사용자 지시).
 *
 * > "클랜랭킹 그냥 SPL이랑 IPL 한공간에 둬 SPL이 왼쪽 IPL이 오른쪽"
 * > "개인랭킹도 SPL은 왼쪽 IPL은 오른쪽"
 *
 * ── 왜 새 컴포넌트인가 · 옛 화면은 어떻게 되나
 *   부리그 탭 화면(`DivisionTabs` + 한 리그 한 부리그)은 **지우지 않았다**
 *   (`CLAUDE.md` 10-4). `/league/{slug}/rank/clan/{division}` 로 그대로 살아 있고,
 *   기본값만 이 두 칸짜리 화면으로 바뀐 것이다. 되돌리려면 라우트를 예전처럼
 *   `redirect` 로 돌려놓으면 된다.
 *
 * ── 배치
 *   ```
 *   PC(≥768px)   두 칸 나란히
 *   폰(<768px)   위아래 — SPL 이 위, IPL 이 아래. 가로 스크롤은 없다
 *   ```
 *   `minmax(0, 1fr)` 이 핵심이다. 그냥 `1fr` 이면 안쪽 표의 최소 폭이 칸을 밀어
 *   **화면 전체에 가로 스크롤이 생긴다.**
 *
 * ── 색
 *   새 색을 만들지 않는다. 칸 제목은 `--color-text-strong`, 부제는 `--color-faint`,
 *   경계는 `--color-line` 이다. 진홍은 표 안쪽(1위 · 티어 구분선)에서만 쓴다.
 *
 * **`10mountain` 은 이 화면에 없다.** 개인기록만 있는 비공식 리그라 지금 자리를
 * 그대로 둔다 (D-245).
 */
export function RankSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-8 max-md:grid-cols-1 max-md:gap-10">
      {children}
    </div>
  )
}

export interface RankSplitColumnProps {
  /** 리그 표시 이름 (`SPL` · `IPL`) */
  leagueName: string
  /** 제목 옆 작은 글씨 — 리그 구분(`공식`)이나 부리그 안내 */
  note?: string
  children: ReactNode
}

/**
 * 두 칸 중 한 칸. 리그 이름을 머리에 이고 그 아래에 표가 들어간다.
 *
 * `min-w-0` 이 없으면 안쪽 표(고정폭 숫자 칸이 여럿이다)가 칸을 벌려
 * 그리드가 화면 밖으로 나간다.
 */
export function RankSplitColumn({ leagueName, note, children }: RankSplitColumnProps) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-baseline border-b border-line pb-2">
        <h2 className="font-display text-2xl tracking-wide text-text-strong max-md:text-xl">
          <LeagueLabel name={leagueName} />
        </h2>
        {note ? <span className="ml-2.5 text-xs text-faint">{note}</span> : null}
      </div>
      {children}
    </section>
  )
}
