import { useState } from 'react'
import type { MatchDetail, MatchPlayerStat } from '@sacloud/contract'
import { useV3Tone } from './tokens'

/**
 * ★★점수판보기★★ (2026-09-20 사장님)
 *
 * > 「세이브점수 킬점수 폭탄설치점수 선짤추가점수 선짤감점 (…)
 * >  ★점수의 구성을 전부 해부해서 볼 수 있게★ 하고싶은데 화면이 복잡해지지 않고
 * >  ★누르면 깔끔하게 뜨고 없애면 깔끔하게 없어지게끔★ 하고싶어
 * >  모바일에서든 피시에서든」
 * > 「★점수판보기★ 라는 버튼을 눌러서 (…) 10명 다 보여주는건 어떰」
 *
 * ── 왜 한 명씩이 아니라 ★열 명을 한 번에★ 인가
 *
 *   점수 구성은 ★견줄 때★ 뜻이 생긴다. 혼자 「세이브 5점」 을 보면 「그래서?」 인데
 *   열 명을 나란히 놓으면 ★누가 무엇으로 벌었는지★ 가 바로 보인다.
 *   한 명씩 펼치면 열 번 눌러야 하고, 펼친 것을 접는 것을 잊는다.
 *
 * ── 칸은 ★다섯★ 이다
 *
 *   ```
 *   선수   킬   세이브   폭탄   선짤   총점
 *   ```
 *
 *   ⚠ ★선짤의 상점과 벌점을 한 칸으로 합쳤다.★ 여섯 칸이면 폰에서 머리글이
 *     ★세로로 한 글자씩★ 떨어진다 — 클랜 명단에서 이미 겪은 함정이다
 *     (`ClanDetailV3` 의 `playerRowStyle` 주석).
 *
 * ⚠ ★킬 점수는 「나머지」 다★ — 평범한 1점짜리 라플킬은 근거 기록에 안 담기므로
 *   총점에서 나머지 셋을 뺀다. 서버(`scorePartsOf`)가 그렇게 만들어 보낸다.
 * ⚠ ★점수를 못 잰 경기는 단추를 안 그린다★ — 눌렀는데 빈 표가 뜨면 더 나쁘다.
 */

/** 여는 애니메이션에 쓰는 시간 (ms). `prefers-reduced-motion` 이면 CSS 가 끈다 */
const OPEN_MS = 180

export function ScoreBoard({ detail, side }: { detail: MatchDetail; side: 'red' | 'blue' }) {
  const V3 = useV3Tone()
  const [open, setOpen] = useState(false)

  /*
   * ⚠ ★`detail.red`/`blue` 는 ★명단★ 이라 점수가 없다★ — 점수는 `*_stats` 에 있다.
   *   처음에 명단을 읽었다가 타입이 잡아 줬다.
   */
  const mine = side === 'red' ? detail.red_stats : detail.blue_stats
  const foes = side === 'red' ? detail.blue_stats : detail.red_stats
  const scored = [...mine, ...foes].filter((s) => s.score_parts !== null)
  /* 점수를 못 잰 경기 — 단추 자체를 안 그린다 */
  if (scored.length === 0) return null

  const myName = (side === 'red' ? detail.league_clan : detail.opponent)?.clan.name ?? '우리 팀'
  const foeName = (side === 'red' ? detail.opponent : detail.league_clan)?.clan.name ?? '상대'
  const mvpId = detail.mvp_player_id

  return (
    <div style={{ margin: '0 14px 14px' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((now) => !now)
        }}
        style={{
          width: '100%',
          appearance: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 6,
          fontSize: 12.5,
          fontWeight: 700,
          color: open ? '#8a6a12' : V3.textDim, /* ⚠2026-09-22 흰카드용, 옛값(다크) #ffe89a — 1-4 */
          border: `1px solid ${open ? V3.gold : V3.rowDivider}`,
          background: open ? 'rgba(255,216,61,.10)' : 'transparent',
        }}
      >
        {open ? '점수판 닫기' : '점수판보기'}
        <span aria-hidden style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : undefined }}>
          ▼
        </span>
      </button>

      {/*
        ⚠ ★높이를 애니메이션하지 않는다★ — 표 높이가 사람 수에 따라 달라서
          화면이 튄다. ★보였다/숨었다★ 만 하고 살짝 떠오르게만 한다.
        ⚠ `hidden` 으로 감춘다 — `display:none` 을 직접 만지면 애니메이션이 안 걸린다.
      */}
      <div hidden={!open}>
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${V3.rowDivider}`,
            borderRadius: 6,
            overflow: 'hidden',
            animation: `sacScoreBoardIn ${OPEN_MS}ms ease-out`,
          }}
        >
          <Head />
          <Group label={`우리 팀 · ${myName}`} rows={mine} mvpId={mvpId} dim={false} />
          <Group label={`상대 · ${foeName}`} rows={foes} mvpId={mvpId} dim />
        </div>
      </div>

      <style>{`
        @keyframes sacScoreBoardIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="sacScoreBoardIn"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

/** 칸 넓이는 ★한 곳★ 에만 적는다 — 머리글과 줄이 어긋나면 표가 깨진다 */
const COLUMNS = 'minmax(58px,1fr) 34px 44px 34px 38px 42px'

function Head() {
  const V3 = useV3Tone()
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 4,
        padding: '6px 11px',
        background: V3.rowDivider2, /* ⚠2026-09-22 흰카드용, 옛값(다크) rgba(255,255,255,.03) — 1-4 */
        fontSize: 9.5,
        fontWeight: 700,
        color: V3.textMuted,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
      }}
    >
      <span>선수</span>
      <span style={{ textAlign: 'right' }}>킬</span>
      <span style={{ textAlign: 'right' }}>세이브</span>
      <span style={{ textAlign: 'right' }}>폭탄</span>
      <span style={{ textAlign: 'right' }}>선짤</span>
      <span style={{ textAlign: 'right' }}>총점</span>
    </div>
  )
}

function Group({
  label,
  rows,
  mvpId,
  dim,
}: {
  label: string
  rows: readonly MatchPlayerStat[]
  mvpId: string | null
  dim: boolean
}) {
  const V3 = useV3Tone()
  const scored = rows.filter((r) => r.score_parts !== null)
  if (scored.length === 0) return null
  /* 점수 높은 순 — 표는 견주라고 있는 것이다 */
  const sorted = [...scored].sort((a, b) => (b.score_parts?.total ?? 0) - (a.score_parts?.total ?? 0))
  return (
    <>
      <div
        style={{
          padding: '5px 11px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.06em',
          color: V3.textMuted,
          background: V3.rowDivider2, /* ⚠2026-09-22 흰카드용, 옛값(다크) rgba(255,255,255,.015) — 1-4 */
        }}
      >
        {label}
      </div>
      {sorted.map((row) => (
        <Row key={row.player_id} row={row} mvp={row.player_id === mvpId} dim={dim} />
      ))}
    </>
  )
}

function Row({ row, mvp, dim }: { row: MatchPlayerStat; mvp: boolean; dim: boolean }) {
  const V3 = useV3Tone()
  const p = row.score_parts
  if (p === null) return null
  /* 0 은 흐리게 — 눈이 ★값이 있는 칸★ 으로 가게 한다 */
  /* ⚠ 2026-09-22 흰 카드용. 옛 값(다크, 0일 때 흐림) #3f4c66 — 1-4 */
  const tone = (n: number): string => (n === 0 ? V3.textGhost : n < 0 ? '#ff6b72' : V3.text)
  const signed = (n: number): string => (n === 0 ? '0' : n > 0 ? `+${n}` : String(n))
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 4,
        padding: '7px 11px',
        borderTop: `1px solid ${V3.rowDivider2}`,
        fontSize: 12.5,
        fontVariantNumeric: 'tabular-nums',
        opacity: dim ? 0.62 : 1,
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: V3.textStrong,
          fontWeight: 600,
        }}
      >
        {row.name}
        {mvp ? <span style={{ color: V3.gold }}> ★</span> : null}
      </span>
      <span style={{ textAlign: 'right', color: tone(p.kill) }}>{p.kill}</span>
      <span style={{ textAlign: 'right', color: tone(p.save) }}>{p.save}</span>
      <span style={{ textAlign: 'right', color: tone(p.bomb) }}>{p.bomb}</span>
      <span style={{ textAlign: 'right', color: tone(p.opening), fontWeight: p.opening === 0 ? 400 : 700 }}>
        {signed(p.opening)}
      </span>
      <span style={{ textAlign: 'right', color: V3.textStrong, fontWeight: 800 }}>{p.total}</span>
    </div>
  )
}
