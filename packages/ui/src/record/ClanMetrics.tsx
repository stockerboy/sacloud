'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ClanMetrics as ClanMetricsData } from '@sacloud/contract'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { divisionUnit } from '../league/divisionLabel'
import { leaguePlayerPath } from '../common/paths'

/**
 * 클랜페이지 지표 — 티어별 승률 · 승률 추이 · 화력 · 최다연승
 * (`docs/SITE_SPEC_V2.md` 5-3 · 5-4 · 5-5).
 *
 * ```
 * 클랜 지표                                  시즌0 · 2,523전
 * ─────────────────────────────────────────────────────────
 * 티어별 승률
 *   vs 1부리그   346판    49.4%
 *   vs 2부리그  2,177판   52.6%
 *
 * 승률 추이                                  보름 단위
 *   ▁▄█▅▂ …
 *   4/1~4/15  4/16~4/30  …
 *
 * 화력      평균 7,770딜   이긴 1,316판 기준
 * 최다연승  12연승 (멤버보기)
 * ```
 *
 * **원본(3rd.supply)에 없는 블록이다.** 사용자 지시로 만든 신규 기능이고
 * 원본과 동일함이 검증되지 않았다 (`CLAUDE.md` 3장 7번).
 *
 * ── 결측 (D-106)
 *   경기가 없는 보름 칸은 `win_rate = null` 이다. **0% 로 찍어 막대를 바닥까지 그리지 않는다** —
 *   그러면 "그 보름 동안 다 졌다" 로 읽힌다. 막대를 아예 그리지 않고 눈금에 `-` 를 쓴다.
 *   화력도 마찬가지다. 셀 수 있는 경기가 없으면 숫자 대신 그 사실을 적는다.
 *
 * ── 왜 막대인가 (선이 아니라)
 *   `PlayerFormPanel`(D-167)은 달마다 값이 반드시 있는 킬뎃이라 꺾은선이 맞았다.
 *   여기는 **빈 칸이 정상적으로 섞인다.** 선으로 그리면 빈 칸마다 선이 끊겨
 *   무엇이 값이고 무엇이 공백인지 읽히지 않는다. 칸마다 독립된 막대가 낫다.
 *
 * ── 여기 **없는** 지표: 클린시트(반코트)
 *   라운드별 진영과 라운드 승패가 있어야 하는데 DB 에 라운드 점수 칸이 없다.
 *   자세한 것은 `packages/contract/src/clanMetrics.ts` 머리말. 지어내지 않았다.
 */

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="text-base">{title}</div>
      {note ? <div className="text-xs text-meta">{note}</div> : null}
    </div>
  )
}

/** 티어별 승률 — 한 판도 안 한 티어도 줄은 남긴다 (원문이 `0판 승률-` 을 적어 두었다) */
function TierRows({
  tiers,
  leagueCategory,
}: {
  tiers: ClanMetricsData['tiers']
  leagueCategory?: string
}) {
  const unit = divisionUnit(leagueCategory)
  return (
    <div className="mt-2">
      {tiers.map((tier) => (
        <div
          key={tier.division}
          className="flex items-center border-b border-b-line-soft py-1 last:border-b-0"
        >
          <div className="w-24 text-sm text-meta">
            vs {tier.division}
            {unit}
          </div>
          <div className="flex-grow text-sm">{formatCount(tier.games)}판</div>
          {tier.win_rate === null ? (
            /* 한 판도 없다. `0%` 로 채우지 않는다 (D-106) */
            <div className="w-40 text-right text-sm text-meta">-</div>
          ) : (
            /* `w-40` — `1,145승 1,032패 52.6%` 가 한 줄에 들어가야 한다.
               좁으면 승패와 승률이 두 줄로 갈라져 표가 계단처럼 보인다 */
            <div className="w-40 whitespace-nowrap text-right text-sm">
              <span className="mr-2 text-meta">
                {formatCount(tier.win)}승 {formatCount(tier.lose)}패
              </span>
              <span className={rateClass(tier.win_rate)}>{formatRate(tier.win_rate)}%</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * 승률 추이 — 보름 칸마다 막대 하나.
 *
 * ⚠ **지금 화면은 이것을 부르지 않는다** (2026-09-02). 주간 꺾은선으로 갈아탔다 —
 *   이유는 `ClanMetrics` 안의 주석에 있다. 되돌릴 수 있게 **지우지 않고 남긴다**
 *   (`CLAUDE.md` 10-4).
 *
 * 막대 높이는 승률 그대로(0~100%)다. 표본을 늘려 보이게 만들지 않는다.
 * 눈금은 칸이 많아지면 글자가 겹치므로 **양 끝과 중간만** 적는다.
 */
export function TrendBars({ trend }: { trend: ClanMetricsData['trend'] }) {
  const played = trend.filter((bucket) => bucket.win_rate !== null)
  if (played.length === 0) {
    return <div className="py-6 text-center text-meta">이 기간에 기록된 경기가 없습니다.</div>
  }
  const step = Math.max(1, Math.ceil(trend.length / 6))

  return (
    <>
      <div className="mt-2 flex h-24 items-end gap-1 border-t border-b border-t-line-soft border-b-line-soft py-1">
        {trend.map((bucket) => (
          <div
            key={bucket.start}
            className="flex h-full flex-grow basis-0 flex-col justify-end"
            title={
              bucket.win_rate === null
                ? `${bucket.label} 경기 없음`
                : `${bucket.label} ${bucket.games}전 ${bucket.win}승 ${bucket.lose}패 · ${formatRate(bucket.win_rate)}%`
            }
          >
            {bucket.win_rate === null ? (
              /* 빈 칸. 바닥에 붙은 0% 막대를 그리면 전패로 읽힌다 (D-106) */
              <div className="h-px w-full bg-line-soft" aria-hidden />
            ) : (
              <div
                className="w-full bg-win-bar"
                style={{ height: `${Math.max(bucket.win_rate, 2)}%` }}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-1">
        {trend.map((bucket, index) => (
          <div key={bucket.start} className="flex-grow basis-0 text-center">
            {/* 칸이 많으면 날짜가 겹치므로 건너뛰며 적는다. 빈 칸에도 자리를 남겨야
                (공백 한 칸) 아래 승률 줄이 칸마다 위아래로 어긋나지 않는다 */}
            <div className="text-[10px] leading-tight text-meta">
              {index % step === 0 || index === trend.length - 1 ? bucket.label : '\u00A0'}
            </div>
            {bucket.win_rate === null ? (
              <div className="text-[10px] leading-tight text-meta">-</div>
            ) : (
              <div className={`text-[10px] leading-tight ${rateClass(bucket.win_rate)}`}>
                {formatRate(bucket.win_rate)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/** 화력 — 이긴 판의 팀 전체 딜량 평균 */
function Firepower({ firepower }: { firepower: ClanMetricsData['firepower'] }) {
  if (firepower.team_damage_avg === null) {
    /* 딜량을 아는 승리 경기가 하나도 없다. 0딜로 적지 않는다 (D-034 · D-106) */
    return <div className="text-sm text-meta">딜량을 아는 승리 경기가 없습니다.</div>
  }
  return (
    <div className="text-sm">
      <span className="text-lg">{formatCount(Math.round(firepower.team_damage_avg))}</span>
      <span className="ml-0.5">딜</span>
      <span className="ml-2 text-xs text-meta">
        이긴 {formatCount(firepower.matches)}판 평균
        {/* 몇 판을 왜 뺐는지 숨기지 않는다 — 표본이 깎인 만큼 값의 무게도 다르다 */}
        {firepower.excluded > 0 ? ` · 딜량 결측 ${formatCount(firepower.excluded)}판 제외` : ''}
      </span>
      {/* 원문 예시(`ex950딜`)가 팀 합계인지 한 명 기준인지 확정되지 않았다 `[미확인]`.
          그래서 한 명 환산값도 같이 보여 준다 — 어느 쪽으로 읽어도 숫자가 보이게 */}
      {firepower.per_player_avg !== null ? (
        <div className="mt-0.5 text-xs text-meta">
          1인 {formatCount(Math.round(firepower.per_player_avg))}딜
        </div>
      ) : null}
    </div>
  )
}

/** 최다연승 — 접어 두고 `멤버보기` 로 편다 (원문: `최다연승:n연승(멤버보기)`) */
function WinStreak({
  streak,
  leagueSlug,
}: {
  streak: ClanMetricsData['best_win_streak']
  leagueSlug: string
}) {
  const [open, setOpen] = useState(false)

  if (streak.count === 0) {
    return <div className="text-sm text-meta">연승 기록이 없습니다.</div>
  }

  return (
    <div className="text-sm">
      <span className="text-lg">{formatCount(streak.count)}</span>
      <span className="ml-0.5">연승</span>
      {streak.members.length > 0 ? (
        <button
          type="button"
          className="ml-2 text-xs text-meta underline"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          {open ? '멤버닫기' : '멤버보기'}
        </button>
      ) : null}
      {streak.from && streak.to ? (
        <span className="ml-2 text-xs text-meta">
          {streak.from.slice(0, 10)} ~ {streak.to.slice(0, 10)}
        </span>
      ) : null}

      {open ? (
        <div className="mt-2 border-t border-t-line-soft pt-2">
          {streak.members.map((member) => (
            <div key={member.player.id} className="flex items-center py-0.5">
              {/* 닉네임을 누르면 그 선수 기록실로 간다 (SITE_SPEC_V2 2절과 같은 규칙) */}
              <Link
                href={leaguePlayerPath(leagueSlug, member.player.id)}
                className="flex-grow hover:underline"
              >
                {member.player.name}
              </Link>
              <span className="text-xs text-meta">{formatCount(member.games)}판</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ClanMetrics({
  metrics,
  leagueSlug,
  leagueCategory,
  ladderGames,
}: {
  metrics: ClanMetricsData
  leagueSlug: string
  /** `independent` 면 부리그를 `티어` 라고 쓴다 (D-165) */
  leagueCategory?: string
  /**
   * **래더에 반영된 판수** — 이 카드가 세는 판수와 다를 수 있다 (2026-09-02).
   *
   * ── 왜 두 숫자가 생기나
   *   이 카드는 «이겼나 졌나» 만 알면 센다. 래더·순위·킬뎃은 **누가 뛰었는지**를
   *   알아야 센다. IPL 은 경기 24,662건 중 라인업을 아는 것이 1,562건(6.3%)뿐이라
   *   같은 클랜이 여기서는 2,691전, 래더에서는 48전이 된다 (2026-09-02 운영 실측).
   *
   *   사장님이 «판수도 다르고 근거가 뭐야» 라고 물었던 자리다.
   *   **둘 다 사실이므로 둘 다 적는다.** 하나를 감추면 다른 화면과 어긋나 보인다.
   *   SPL·10mountain 은 모든 경기에 라인업이 있어 두 값이 같고, 그때는 안 적는다.
   */
  ladderGames?: number
}) {
  return (
    <div className="mt-2 rounded-[2px] border border-line bg-card px-5 py-4">
      <div className="flex items-baseline justify-between">
        <div className="text-lg">클랜 지표</div>
        <div className="text-xs text-meta">
          {formatCount(metrics.games)}전 {formatCount(metrics.win)}승 {formatCount(metrics.lose)}패
          {/* 잘렸으면 숨기지 않는다 — 아래 값들이 전 경기를 본 것이 아니다 */}
          {metrics.truncated ? (
            <span className="ml-1">· 최근 {formatCount(metrics.games)}판만 집계</span>
          ) : null}
          {/* 래더 판수가 다르면 **그 사실을 적는다.** 감추면 다른 화면과 어긋나 보인다 */}
          {ladderGames !== undefined && ladderGames !== metrics.games ? (
            <div className="mt-0.5 text-[11px] text-faint">
              래더 반영은 {formatCount(ladderGames)}전 — 라인업을 아는 경기만 셉니다
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <SectionTitle title="티어별 승률" note="상대의 경기 당시 부리그 기준" />
        <TierRows tiers={metrics.tiers} leagueCategory={leagueCategory} />
      </div>

      {/*
        ⚠ 2026-09-02 — **승률 추이(보름 막대)를 이 카드에서 뺐다.**

        > "승률 추이 그래프는 선수 카드와 같은 주간 그래프로 교체"

        막대가 전부 같아 보였다. 50~57% 를 0~100 축에 그리니 96px 중 7px 차이라
        **눈으로 구분이 안 됐다.** 판수도 안 적혀 있어 대조할 수도 없었다.
        지금은 클랜 화면이 `WeeklyTrendCard`(10 단위 눈금 · 점에 % · 5/10/15/25주 필터)를
        위에 따로 그린다 — 선수 카드와 **같은 컴포넌트**다.

        `TrendBars` 와 `metrics.trend` 는 **지우지 않았다** (`CLAUDE.md` 10-4).
        되돌리려면 이 자리에 아래 두 줄을 다시 넣으면 된다.
        ```tsx
        <SectionTitle title="승률 추이" note="보름 단위" />
        <TrendBars trend={metrics.trend} />
        ```
      */}

      <div className="mt-4">
        <SectionTitle title="화력" note="이긴 판의 팀 전체 딜량 평균" />
        <div className="mt-2">
          <Firepower firepower={metrics.firepower} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="최다연승" />
        <div className="mt-2">
          <WinStreak streak={metrics.best_win_streak} leagueSlug={leagueSlug} />
        </div>
      </div>
    </div>
  )
}
