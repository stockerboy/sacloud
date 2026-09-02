import Link from 'next/link'
import type { PlayerTierRecord } from '@sacloud/contract'
import { TIER_WIN_RATE_MIN_GAMES, showsDivision } from '@sacloud/contract'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { divisionLabel, divisionUnit } from '../league/divisionLabel'

/**
 * **티어별 게임빈도 + 천적** (`docs/SITE_SPEC_V2.md` 4절).
 *
 * ```
 * vs 1부리그   469판  55.2%
 *                          hilarious- 의 천적
 * vs 2부리그    89판  67.4%
 * ```
 *
 * **원본(3rd.supply)에 없는 카드다.** 사용자가 요구한 새 기능이라
 * "원본과 동일함이 검증되지 않음" 이 붙는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 판정은 하나도 여기서 하지 않는다
 *   승률을 감출지(10판) · 누가 천적인지(50판 · 70%)는 전부 계약
 *   (`packages/contract/src/tierBreakdown.ts`)이 정해서 내려 준다.
 *   화면이 다시 재면 mock↔live 가 갈린다 — `TodayPerformance` 와 같은 원칙이다.
 *
 * ── `—` 는 "0%" 가 아니라 "아직 말하지 않는다" 는 뜻이다 (D-106)
 *   6판 2승 4패에 `33%` 를 적으면 재 본 값처럼 읽힌다. 왜 비어 있는지는
 *   카드 머리의 안내 한 줄이 밝힌다 — 안 적으면 고장으로 보인다.
 *
 * ── 부리그를 `티어` 라고 부르는 곳은 무소속리그뿐이다 (D-165)
 *   사양 원문은 전부 `티어` 로 적혀 있지만, 그 표기는 리그 구분이 정한다.
 *   공식리그 화면에서 여기만 `1티어` 라고 쓰면 바로 옆 랭킹 탭의 `1부리그` 와
 *   어긋난다. 값은 하나(`division`)고 부르는 이름만 갈린다.
 *
 * 사이드 카드 모양(`bg-side` · 구분선 · `flex justify-between`)은
 * `RecordPanels` 의 `상세정보` 패널과 같다. 그쪽 `Stat`/`Divider` 는 모듈 바깥으로
 * 나오지 않아 같은 마크업을 여기에 다시 적었다.
 */
export function TierBreakdown({
  rows,
  leagueSlug,
  leagueCategory,
}: {
  rows: readonly PlayerTierRecord[]
  /** 천적 클랜명에서 클랜 기록실로 보낸다 */
  leagueSlug: string
  /** `official` | `independent` — 부리그/티어 표기를 고른다 (D-165) */
  leagueCategory?: string
}) {
  /* 줄이 하나도 없으면 카드를 그리지 않는다. 빈 껍데기는 정보가 아니다 */
  if (rows.length === 0) return null
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 «티어별» 축 자체가 감춘 개념이라 카드를 안 그린다.
     값(`rows`)은 응답에 그대로 있다 */
  if (!showsDivision(leagueSlug)) return null

  return (
    <div className="rounded-[2px] border border-line bg-card px-5 py-4 text-text">
      <div className="flex items-baseline justify-between">
        <div>{divisionUnit(leagueCategory)}별 전적</div>
        {/* 왜 어떤 줄의 승률이 비어 있는지 밝힌다. 이 줄이 없으면 `—` 가 고장으로 보인다 */}
        <div className="text-xs text-side-meta">{TIER_WIN_RATE_MIN_GAMES}판부터 승률을 봅니다</div>
      </div>
      {rows.map((row) => (
        <div key={row.tier}>
          <div className="my-2 border-t border-t-line-soft" />
          <div className="flex justify-between py-2 text-3xl">
            <div className="shrink-0 whitespace-nowrap">
              vs {divisionLabel(row.tier, leagueCategory)}
            </div>
            <div className="flex min-w-0 items-center">
              <span className="num mr-2 whitespace-nowrap text-base">
                {formatCount(row.games)}판
              </span>
              {row.win_rate === null ? (
                /* 판수가 모자란다. **0% 로 채우지 않는다** (D-106) */
                <span className="text-side-meta">—</span>
              ) : (
                <span className={`num ${rateClass(row.win_rate)}`}>
                  {formatRate(row.win_rate)}%
                </span>
              )}
            </div>
          </div>
          {row.nemeses.length === 0 ? null : (
            /* 천적. 여럿이면 승률 높은 순으로 온다 — 화면은 순서를 다시 만지지 않는다 */
            <div className="px-1 pb-1 text-right text-base">
              {row.nemeses.map((nemesis, index) => (
                <span key={nemesis.slug}>
                  {index === 0 ? null : <span className="text-side-meta"> · </span>}
                  <Link href={`/league/${leagueSlug}/clan/${nemesis.slug}`}>{nemesis.name}</Link>
                  <span className="num text-side-meta">
                    {' '}
                    {formatCount(nemesis.games)}판 {formatRate(nemesis.win_rate)}%
                  </span>
                </span>
              ))}
              <span> 의 천적</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
