'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlayerTierRecord } from '@sacloud/contract'
import { TIER_WIN_RATE_MIN_GAMES, showsTier } from '@sacloud/contract'
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
 * ══ 2026-09-10 회의 — ★무기 칩 하나 + 티어 세 줄★ ══
 *
 *   > «티어가 세개고 라플, 스나킬뎃을 분리했잖아 그럼 보여줄 수 있는 킬뎃 승률이 벌써
 *   >  6개잖아 (…) 어떻게 하면 어지럽지 않게 아스트라구간에서 몇퍼인지 챌린저구간에서
 *   >  몇퍼인지 보여줄 수 있을까» — 사장님
 *
 *   ── ★숫자를 먼저 줄였다★
 *     ★승률은 무기로 안 갈린다.★ 경기는 팀이 이기는 것이라 ★무기별 승패라는 값이 없다.★
 *     그래서 실제로 보여줄 것은 ★승률 3개 + 킬뎃 3개(무기축 하나)★ 로 끝난다.
 *     남은 무기축 둘은 ★칩으로 갈아 끼운다★ — 화면에 한 번에 뜨는 숫자는 언제나 여섯이다.
 *
 *   ── ★비교하는 축은 티어다★
 *     사장님이 알고 싶은 것은 «아스트라에서 몇 퍼, 챌린저에서 몇 퍼» 다.
 *     그래서 ★티어 셋은 언제나 함께 보인다.★ 티어를 탭으로 나누면 비교가 막힌다.
 *     무기는 ★비교축이 아니라 고르는 값★ 이라 칩이 맞다 (개인랭킹과 같은 조작이다).
 *
 *   ── ★판수를 늘 같이 적는다★ (사장님이 고르신 값)
 *     무기별 판수는 승률의 판수와 ★다르다.★ 스나 21판 · 라플 31판 · 전체 52판 처럼
 *     갈리는데 그걸 감추면 ★왜 숫자가 다른지 알 수가 없다.★
 *
 * 사이드 카드 모양(`bg-side` · 구분선 · `flex justify-between`)은
 * `RecordPanels` 의 `상세정보` 패널과 같다. 그쪽 `Stat`/`Divider` 는 모듈 바깥으로
 * 나오지 않아 같은 마크업을 여기에 다시 적었다.
 */
/**
 * 칩에 걸리는 무기축 셋. ★값과 글자를 여기 한 곳에만 적는다.★
 *
 * `통합` 은 무기를 안 가린 전체다 — 라플+스나가 아니다.
 * (무기를 모르는 판이 섞여 있어 둘의 합보다 클 수 있다 · D-149)
 */
const AXES = [
  { key: 'all', label: '통합' },
  { key: 'sniper', label: '스나' },
  { key: 'rifle', label: '라플' },
] as const

type Axis = (typeof AXES)[number]['key']

/** 고른 축의 킬뎃과 ★그 축의 판수★ 를 꺼낸다. 판수는 축마다 다르다 */
function kdOf(row: PlayerTierRecord, axis: Axis): { kd: number | null; games: number } {
  if (axis === 'sniper') return { kd: row.sniper_kd, games: row.sniper_games }
  if (axis === 'rifle') return { kd: row.rifle_kd, games: row.rifle_games }
  return { kd: row.kd, games: row.known_games }
}

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
  /* ★칩은 카드 안에서만 산다★ — 주소에 안 넣는다. 부리그 탭과 달리 라우트가 안 나뉜다
     (개인랭킹의 무기 칩과 같은 판단이다) */
  const [axis, setAxis] = useState<Axis>('all')

  /* 줄이 하나도 없으면 카드를 그리지 않는다. 빈 껍데기는 정보가 아니다 */
  if (rows.length === 0) return null
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 «티어별» 축 자체가 감춘 개념이라 카드를 안 그린다.
     값(`rows`)은 응답에 그대로 있다 */
  if (!showsTier(leagueSlug)) return null

  return (
    <div className="rounded-[2px] border border-line bg-card px-5 py-4 text-text">
      <div className="flex items-baseline justify-between">
        <div>{divisionUnit(leagueCategory)}별 전적</div>
        {/* 왜 어떤 줄의 승률이 비어 있는지 밝힌다. 이 줄이 없으면 `—` 가 고장으로 보인다 */}
        <div className="text-xs text-side-meta">
          {TIER_WIN_RATE_MIN_GAMES}판부터 승률·킬뎃을 봅니다
        </div>
      </div>
      {/*
        ★무기 칩★ — 고르는 값이지 비교축이 아니다. 누르면 ★킬뎃 줄만★ 바뀐다.
        승률은 무기로 안 갈리므로 ★한 글자도 안 움직인다.★
      */}
      <div className="mt-3 flex gap-1">
        {AXES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setAxis(item.key)}
            aria-pressed={axis === item.key}
            className={`num cursor-pointer rounded-[2px] border px-2.5 py-1 text-xs transition-colors duration-100 ${
              axis === item.key
                ? 'border-accent text-accent'
                : 'border-line-soft text-side-meta hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {rows.map((row) => {
        const picked = kdOf(row, axis)
        return (
        <div key={row.tier}>
          <div className="my-2 border-t border-t-line-soft" />
          {/* 티어 이름 — 이름은 `divisionLabel` 이 만든다. 여기서 지어내지 않는다 */}
          <div className="pt-1 text-3xl">vs {divisionLabel(row.tier, leagueCategory)}</div>
          {/*
            ★두 줄로 끝낸다★ — 승률 한 줄, 킬뎃 한 줄 (2026-09-10 회의).
            ★판수를 늘 같이 적는다★ (사장님이 고르신 값) — 무기별 판수는 승률의 판수와
            다르다. 스나 21판 · 라플 31판 · 전체 52판 처럼 갈리는데 감추면 왜 숫자가
            다른지 알 수가 없다.
          */}
          <div className="flex items-baseline justify-between py-0.5 text-base">
            <span className="text-side-meta">승률</span>
            <span className="flex items-baseline gap-2">
              {row.win_rate === null ? (
                /* 판수가 모자란다. **0% 로 채우지 않는다** (D-106) */
                <span className="text-side-meta">—</span>
              ) : (
                <span className={`num text-xl ${rateClass(row.win_rate)}`}>
                  {formatRate(row.win_rate)}%
                </span>
              )}
              <span className="num w-14 text-right text-xs text-side-meta">
                {formatCount(row.games)}판
              </span>
            </span>
          </div>
          <div className="flex items-baseline justify-between py-0.5 pb-1 text-base">
            <span className="text-side-meta">킬뎃</span>
            <span className="flex items-baseline gap-2">
              {picked.kd === null ? (
                <span className="text-side-meta">—</span>
              ) : (
                <span className={`num text-xl ${rateClass(picked.kd)}`}>
                  {formatRate(picked.kd)}%
                </span>
              )}
              <span className="num w-14 text-right text-xs text-side-meta">
                {formatCount(picked.games)}판
              </span>
            </span>
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
        )
      })}
    </div>
  )
}
