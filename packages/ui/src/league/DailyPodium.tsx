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
import { rankColorByRatio } from '../record/playerHeadCopy'
import { MarkCircle } from '../v3/primitives'
import { V3 } from '../v3/tokens'
import { Hexagon, type HexAxisView } from '../v3/Hexagon'
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
    /** ★그날 안에서의 등수★ — 축 밑에 «n위» 로 적는다 (2026-09-15 사장님) */
    rank?: number | null
    total?: number | null
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
    /** 원값을 축 단위에 맞게 적는다 — 두 번째 줄로 내려간다 */
    const valueText = (a: (typeof axes)[number]): string | null => {
      if (a.value === null) return null
      if (a.unit === 'seconds') return mmss(a.value)
      if (a.unit === 'per_game') return `${Number.isInteger(a.value) ? a.value : a.value.toFixed(1)}회`
      return `${Math.round(a.value * (a.value <= 1 ? 100 : 1))}%`
    }
    return axes.map((a) => ({
      label: a.label,
      value: a.pct,
      /*
       * ★축 밑에는 «등수» 를 적는다★ (2026-09-15 사장님 «퍼센트 말고 순위로 해주면 안돼?»).
       *
       * 선수 상세·클랜 카드는 처음부터 «n위» 였는데 여기와 깃발만 값을 적고 있었다 —
       * 그날 자료라 시즌 등수가 없어서였다. 이제 ★그날 뛴 사람들 안에서의 등수★ 다.
       * ★값은 안 사라진다★ — 두 번째 줄로 내려간다 (41.7% 같은 원값).
       */
      note: a.rank === null ? (valueText(a) ?? '측정중') : `${a.rank}위`,
      /*
       * ⚠ ★`rankColorHexAxis` 를 쓰면 안 된다★ — 그건 «등수» 를 받는데
       *   그 함수의 경계는 시즌 랭킹용이다. 여기 등수는 ★그날★ 안의 것이라
       *   모집단이 훨씬 작다. 그래서 백분위로 색을 고른다 (승률과 같은 잣대).
       */
      /*
       * ⚠ ★2026-09-16 — 등수 색을 «비율» 로★ (사장님: «상위 5프로 이내는 노란색
       *   10프로이내는 파란색 20프로이내는 초록색 나머지는 걍 하얀색»).
       *   옛 값은 백분위를 승률 잣대(`statColor`)로 칠했다 — 승률과 등수는 다른 값이라
       *   같은 자로 재면 «60% 면 초록» 같은 엉뚱한 뜻이 붙는다.
       */
      noteColor: rankColorByRatio(a.rank, a.total) ?? V3.textMuted,
      /* ★모집단을 같이★ (2026-09-15 · 무한 QA) — «60위» 만 있으면 읽히지 않는다 */
      /* ⚠ ★2026-09-15★ — 클랜 전용 축 이름이 `tempo` 에서 `riflePower` 로 바뀌었다 (사장님) */
      note2: a.rank === null ? null : a.total === null ? valueText(a) : `그날 ${a.total}${a.key === 'riflePower' || row.clan_slug !== null ? '팀중' : '명중'}`,
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
       *   ⚠ ★2026-09-15 — 축 밑이 «등수» 가 됐다★ (사장님 «퍼센트 말고 순위로»).
       *     원값은 두 번째 줄로 내려갔다. 단위는 게임템포만 «초», 선짤만 «회», 나머지는 %.
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
        {/*
          ⚠ ★2026-09-15 밤 — 숫자가 뒤집혀 있었다★ (무한 QA).
            `low_axis` 는 ★백분위★ 다 — «나보다 못한 사람이 몇 %» 이므로 클수록 좋다.
            그걸 그대로 «상위 N%» 라고 적으면 ★반대로 읽힌다.★
            실측: 교환율 «30위 / 그날 49명중» 인데 «상위 39%» 라고 적혀 있었다.
            30/49 는 상위 61% 다. 못한 것을 잘한 것처럼 말하고 있었다.

          ★말도 두 갈래로 나눴다★ — «그것도» 는 잘했을 때 쓰는 말이다.
            절반 안에 들면 «그것도 상위 N%», 아니면 담담하게 «상위 N%» 라고만 적는다.
        */}
        가장 약한 축이 <b style={{ color: '#c8d4ea' }}>{row.low_axis_label}</b>
        {100 - row.low_axis <= 50 ? ' 인데 그것도 ' : ' — '}
        <b style={{ color: 100 - row.low_axis <= 50 ? '#ffd98a' : V3.textMuted }}>
          상위 {100 - row.low_axis}%
        </b>{' '}
        입니다
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
