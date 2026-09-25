'use client'

import { useState } from 'react'
import { playerHexValueText } from '@sacloud/contract'
import { Hexagon } from '../v3/Hexagon'
import type { HexAxisView } from '../v3/Hexagon'
import { type V3Tone, useV3Tone } from '../v3/tokens'
import { MarkCircle } from '../v3/primitives'
import { rankColorByRatio } from '../record/playerHeadCopy'

/**
 * ★최근 폼 1위★ — 그날 가장 잘한 셋을 ★한 카드★ 에 담는다 (2026-09-16 사장님).
 *
 * > «최근경기 페이지에서 기존꺼 지우고 최근 폼1위 파트를 만들어서
 * >  폼1위클랜 , 폼1위스나 , 폼1위라플 이렇게 보여주는데 ★폼1위스나부터★ 보여주고
 * >  밑에 저렇게 세개 나열해서 클랜폼1위 라플폼1위 선택해서
 * >  ★한 카드내에서 다른 사람 그래프로 바뀌게★ 해줘»
 *
 * ── 왜 «카드 셋» 이 아니라 «한 카드» 인가
 *   옛 「오늘의 선수」(`DailyPodium`)는 큰 카드를 ★셋★ 쌓아 화면을 3천 픽셀 넘게
 *   먹었다. 사장님이 두 랭킹 화면에서 그것을 내리라 하셨고, 여기서는 ★육각 하나★
 *   만 두고 밑줄로 갈아 끼우게 하셨다. 세로가 3분의 1이 된다.
 *
 * ── 줄 차례는 ★스나 → 클랜 → 라플★
 *   사장님이 «폼1위스나부터 보여주고» 라고 첫 자리를 못 박으셨다. 나머지 둘은
 *   말씀하신 차례(«폼1위클랜 , 폼1위스나 , 폼1위라플»)에서 스나만 앞으로 뺀 것이다.
 *
 * ── 없는 줄은 ★자리를 안 만든다★
 *   그날 스나로 뛴 사람이 없으면 스나 줄이 없다. 빈 줄을 두면 «없는 사람» 을
 *   있는 것처럼 보이게 한다 (D-106). 셋 다 없으면 카드 자체가 없다.
 */

/** 화면이 실제로 읽는 칸만 — 계약의 `DailyPodiumRow` 가 그대로 들어맞는다 */
export interface FormTopRow {
  name: string
  clan: { name: string; slug: string; mark: { bg: string | null; front: string | null } } | null
  player_id?: string | null
  clan_slug?: string | null
  win: number
  lose: number
  win_rate: number
  kd_rate?: number | null
  axes?: {
    label: string
    value: number | null
    pct: number | null
    unit: 'percent' | 'per_game' | 'seconds'
    rank?: number | null
    total?: number | null
  }[]
}

/** 한 줄 — 무엇의 1위인가 */
export interface FormTopEntry {
  key: 'sniper' | 'clan' | 'rifle'
  label: string
  row: FormTopRow
}

const TONE: Readonly<Record<FormTopEntry['key'], string>> = {
  sniper: '#8fd0ff',
  clan: '#ffd98a',
  rifle: '#b7a6ff',
}

function axesOf(row: FormTopRow, V3: V3Tone): HexAxisView[] {
  const axes = row.axes
  if (axes === undefined || axes.length === 0) return []
  /* ★못 잰 축이 하나라도 있으면 안 그린다★ — 반쪽짜리 육각은 거짓말을 한다 */
  if (axes.some((a) => a.pct === null)) return []
  const valueText = (a: (typeof axes)[number]): string | null => {
    if (a.value === null) return null
    /* ★한 곳에서만 적는다★ — 화면마다 복사하면 축이 바뀔 때 한 곳이 빠진다 (2026-09-16) */
    return playerHexValueText(a.unit, a.value)
  }
  return axes.map((a) => ({
    label: a.label,
    value: a.pct,
    /*
     * ★축 밑에는 «등수»★ (2026-09-15 사장님 «퍼센트 말고 순위로 해주면 안돼?»).
     * 모집단(«그날 n명중»)을 같이 적는다 — «60위» 만 있으면 잘한 건지 모른다.
     */
    note: a.rank === null || a.rank === undefined ? (valueText(a) ?? '측정중') : `${a.rank}위`,
    /* ★등수 색은 «비율»★ (2026-09-16 사장님) — 모집단(`total`)을 같이 본다 */
    noteColor: rankColorByRatio(a.rank, a.total) ?? V3.textMuted,
    note2:
      a.rank === null || a.rank === undefined
        ? null
        : a.total === null || a.total === undefined
          ? valueText(a)
          : `그날 ${a.total}${a.total > 0 ? '명중' : ''}`,
  }))
}

export function FormTopCard({
  leagueSlug,
  day,
  entries,
}: {
  leagueSlug: string
  /** 기준일 (`YYYY-MM-DD`). 없으면 아무것도 안 그린다 */
  day: string | null
  entries: readonly FormTopEntry[]
}) {
  const V3 = useV3Tone()
  /* 처음 펴는 줄 — 사장님이 «폼1위스나부터» 라고 하셨다. 스나가 없으면 첫 줄 */
  const first = entries.find((e) => e.key === 'sniper') ?? entries[0] ?? null
  const [pickedKey, setPickedKey] = useState<FormTopEntry['key'] | null>(null)
  const picked = entries.find((e) => e.key === (pickedKey ?? first?.key)) ?? first

  if (day === null || entries.length === 0 || picked === undefined || picked === null) return null
  const hexAxes = axesOf(picked.row, V3)
  const href =
    picked.row.player_id != null
      ? `/league/${leagueSlug}/player/${picked.row.player_id}`
      : picked.row.clan_slug != null
        ? `/league/${leagueSlug}/clan/${picked.row.clan_slug}`
        : null

  return (
    <section className="v2-flagmt">
      <header className="v2-flagmt__head">
        {/*
          ★제목이 «무엇의 1위인지» 를 말한다★ (2026-09-16 사장님:
            «그냥 최근 폼 1위 스나 / 최근 폼 1위 라플 이라고 적고»).
          여태는 날짜와 «고르게 잘하고 승률도 좋은 쪽» 이 붙어 길기만 했고,
          정작 지금 보는 것이 스나인지 라플인지 클랜인지를 안 알려 줬다.
        */}
        <span className="v2-flagmt__title">최근 폼 1위 {picked.label}</span>
        {/* 날짜는 작게 뒤에 — 어느 날 기록인지는 알아야 한다 */}
        <span className="v2-flagmt__state"> {day.slice(5).replace('-', '/')}</span>
      </header>

      {/* 고른 줄의 이름 — 육각만 있으면 «누구 것인지» 를 모른다 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px 0',
          minWidth: 0,
        }}
      >
        <MarkCircle clan={picked.row.clan} size={22} />
        {href === null ? (
          <span style={{ fontSize: 14, fontWeight: 700, color: V3.textStrong }}>{picked.row.name}</span>
        ) : (
          <a href={href} style={{ fontSize: 14, fontWeight: 700, color: V3.textStrong }}>
            {picked.row.name}
          </a>
        )}
        {picked.row.clan === null || picked.row.clan_slug != null ? null : (
          <span style={{ fontSize: 11.5, color: V3.textGhost2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {picked.row.clan.name}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>
          {picked.row.win}승 {picked.row.lose}패 · {picked.row.win_rate}%
          {/* ★킬뎃도 적는다★ (2026-09-16 사장님). 못 잰 줄에는 안 적는다 — 0% 로 우기지 않는다 */}
          {typeof picked.row.kd_rate === 'number' ? (
            <>
              <span style={{ color: V3.textGhost2 }}> · </span>
              킬뎃 {picked.row.kd_rate}%
            </>
          ) : null}
        </span>
      </div>

      {hexAxes.length === 0 ? null : (
        <div className="v2-flagmt__hex">
          <Hexagon axes={hexAxes} id={`formtop-${leagueSlug}-${picked.key}`} />
        </div>
      )}

      {/* 밑에 셋 — 누르면 위 육각이 그 줄 것으로 바뀐다 */}
      <ol className="v2-flagmt__rest">
        {entries.map((e) => (
          <li key={e.key} className={e.key === picked.key ? 'is-on' : undefined}>
            <button
              type="button"
              className="v2-flagmt__pick"
              aria-pressed={e.key === picked.key}
              onClick={() => setPickedKey(e.key)}
            >
              <span className="v2-flagmt__rank" style={{ color: TONE[e.key] }}>
                {e.label}
              </span>
            </button>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.row.name}
            </span>
            {e.row.clan === null || e.row.clan_slug != null ? null : (
              <span className="v2-flagmt__restclan">{e.row.clan.name}</span>
            )}
            <span className="v2-flagmt__restline">
              {e.row.win}승 {e.row.lose}패 · {e.row.win_rate}%
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
