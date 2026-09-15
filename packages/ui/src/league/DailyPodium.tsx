'use client'

/**
 * ★오늘의 셋★ — 그날 클랜전을 뛴 사람·클랜 중 「고르게 잘하고 승률도 좋은」 셋.
 *
 * 2026-09-14 사장님:
 *   «IPL이랑 SPL 개인랭킹이랑 클랜랭킹 둘 다 그 날 클랜전한 인원들을 일열로 세워서
 *     ★육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함★ 3명 그리고 3개씩 뽑아서
 *     올려주는거 어때? 그 날 승률이랑 킬뎃 적어주고
 *     (★IPL도 여기에만 예외로 킬뎃 적어줌★)»
 *
 * ── 무엇을 적나
 *   ```
 *   승률    그날 승률 + 몇 승 몇 패
 *   킬뎃    그날 킬뎃 — ★리그를 가리지 않는다★ (IPL 도 여기서만 적는다)
 *   최저축  여섯 축 중 가장 낮은 축과 그 값 — «약점이 여기인데 그것도 상위 76%»
 *   ```
 *
 * ── ⚠ 킬뎃은 여기서만 예외다
 *   IPL 은 화면 어디에도 킬데스를 안 적는다(`leagueScreen`). 이 카드만 예외이고,
 *   그건 ★사장님이 직접 예외로 두신 자리★ 다. 그래서 `leagueScreen` 을 보지 않는다 —
 *   보면 IPL 에서 칸이 사라져 사장님 지시와 어긋난다.
 *
 * ── 판정은 여기서 안 한다
 *   누구를 올릴지도, 그날이 언제인지도 서버가 이미 끝냈다. 화면은 ★받은 대로 그린다.★
 */
import type { ReactNode } from 'react'
import { MarkCircle } from '../v3/primitives'
import { V3 } from '../v3/tokens'
import { Hexagon, type HexAxisView } from '../v3/Hexagon'
import { statColor } from '../v3/rankColors'
import { mmss } from '@sacloud/contract'

export interface DailyPodiumRowView {
  rank: number
  name: string
  clan: { name: string; slug: string; mark: { bg: string | null; front: string | null } } | null
  player_id: string | null
  clan_slug: string | null
  games: number
  win: number
  lose: number
  win_rate: number
  kd_rate: number | null
  low_axis: number
  low_axis_label: string
  avg_axis: number
  /**
   * ★그날 육각★ — ★그 하루에 뛴 경기만★ 으로 만든 여섯 축 (2026-09-15 사장님:
   * «누적 1,2,3등말고 / 그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고»).
   * 비어 있으면 육각을 안 그린다.
   */
  axes?: readonly {
    key: string
    label: string
    value: number | null
    pct: number | null
    unit: 'percent' | 'per_game' | 'seconds'
  }[]
}

/** 1·2·3등 색 — 개인랭킹 포디움과 같은 금·은·동이다 */
const MEDAL: readonly string[] = ['#ffd98a', '#d7e0f0', '#e0a878']

export function DailyPodium({
  day,
  rows,
  kind,
  hrefOf,
}: {
  /** 기준일 (`YYYY-MM-DD`). 없으면 아무것도 안 그린다 */
  day: string | null
  rows: readonly DailyPodiumRowView[]
  kind: 'player' | 'clan'
  /** 줄을 누르면 갈 곳. `null` 이면 링크를 안 건다 */
  hrefOf: (row: DailyPodiumRowView) => string | null
}) {
  /* 그날 경기가 없거나 조건에 맞는 줄이 없으면 ★칸 자체를 안 만든다★ (빈 카드를 그리지 않는다) */
  if (day === null || rows.length === 0) return null

  return (
    <section style={{ margin: '4px 0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '0 2px 10px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
          {kind === 'player' ? '오늘의 선수' : '오늘의 클랜'}
        </h2>
        <span style={{ fontSize: 11, color: V3.textGhost2 }}>
          {day.slice(5).replace('-', '/')} · 고르게 잘하고 승률도 좋은 {rows.length}
          {kind === 'player' ? '명' : '곳'}
        </span>
      </div>

      <div className="daily-podium">
        {rows.map((row) => {
          const href = hrefOf(row)
          const body = <Body row={row} kind={kind} />
          return href === null ? (
            <div key={`${row.player_id ?? row.clan_slug}`} className="daily-podium-card">
              {body}
            </div>
          ) : (
            <a
              key={`${row.player_id ?? row.clan_slug}`}
              href={href}
              className="daily-podium-card"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {body}
            </a>
          )
        })}
      </div>
    </section>
  )
}

function Body({ row, kind }: { row: DailyPodiumRowView; kind: 'player' | 'clan' }) {
  /*
   * 그날 육각 — 면적은 백분위, 글자는 원값.
   * ★못 잰 축이 하나라도 있으면 안 그린다★ — 반쪽짜리 육각은 거짓말을 한다.
   */
  const hexAxes: HexAxisView[] | null = (() => {
    const axes = row.axes
    if (axes === undefined || axes.length === 0) return null
    if (axes.some((a) => a.pct === null)) return null
    return axes.map((a) => ({
      label: a.label,
      value: a.pct,
      note:
        a.value === null
          ? '측정중'
          : a.unit === 'seconds'
            ? mmss(a.value)
            : a.unit === 'per_game'
              /* 캐리력은 «한 라운드 최대 킬» 이라 정수다 — «4.0킬» 로 적지 않는다 (2026-09-15) */
              ? `${Number.isInteger(a.value) ? a.value : a.value.toFixed(1)}${a.key === 'carry' ? '킬' : '회'}`
              : `${Math.round(a.value * (a.value <= 1 ? 100 : 1))}%`,
      /*
       * ⚠ ★`rankColorHexAxis` 를 쓰면 안 된다★ — 그건 «등수» 를 받는다.
       *   여기 값은 ★백분위★ 라 승률과 같은 잣대를 쓴다.
       */
      noteColor: a.pct === null ? V3.textMuted : statColor(a.pct),
      note2: null,
    }))
  })()

  const medal = MEDAL[row.rank - 1] ?? V3.textFaint
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ flex: 'none', fontSize: 15, fontWeight: 800, color: medal, width: 16 }}>
          {row.rank}
        </span>
        <MarkCircle
          clan={row.clan === null ? null : { slug: row.clan.slug, mark: row.clan.mark }}
          size={24}
          title={row.clan?.name ?? undefined}
        />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: V3.textStrong,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.name}
          </span>
          {kind === 'player' && row.clan !== null ? (
            <span
              style={{
                fontSize: 10.5,
                color: V3.textGhost2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.clan.name}
            </span>
          ) : null}
        </span>
      </div>

      {/*
       * ★그날 육각★ (2026-09-15 사장님: «개인랭킹도 그렇고 클랜랭킹도 그렇고 저렇게 두지 말고
       *   그 날 1,2,3위 육각그래프를 띄워달라고 / 누적 1,2,3등말고»).
       *
       *   ★시즌 누적이 아니다.★ 면적은 ★그날 안에서의 백분위★ 로 그리고,
       *   축 밑에는 ★원값★ 을 적는다 (게임템포만 «초», 선짤·연속킬·캐리력은 «회/킬»).
       */}
      {hexAxes === null ? null : (
        <div style={{ marginTop: 10 }}>
          <Hexagon axes={hexAxes} id={`daily-${kind}-${row.player_id ?? row.clan_slug ?? row.rank}`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, marginTop: 11, flexWrap: 'wrap' }}>
        <Stat label="승률" value={`${row.win_rate.toFixed(0)}%`} sub={`${row.win}승 ${row.lose}패`} tone="#7fa9ff" />
        {/* ★IPL 도 여기에만 적는다★ — 사장님이 직접 두신 예외라 리그를 보지 않는다 */}
        <Stat
          label="킬뎃"
          value={row.kd_rate === null ? '—' : `${row.kd_rate.toFixed(0)}%`}
          sub={`${row.games}판`}
          tone="#ff8a90"
        />
      </div>

      <p
        style={{
          marginTop: 10,
          paddingTop: 9,
          borderTop: `1px solid ${V3.divider}`,
          fontSize: 10.5,
          lineHeight: 1.6,
          color: V3.textGhost2,
        }}
      >
        가장 약한 축이 <b style={{ color: '#c8d4ea' }}>{row.low_axis_label}</b> 인데 그것도{' '}
        <b style={{ color: '#ffd98a' }}>상위 {row.low_axis}%</b> 입니다
      </p>
    </>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub: string
  tone: string
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: V3.textFaint, letterSpacing: '.04em' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{sub}</span>
      </span>
    </span>
  )
}
