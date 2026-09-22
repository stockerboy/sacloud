'use client'

/**
 * ★클랜별 전적 TOP3★ (2026-09-22 사장님 — 서플라이 실측 사진 대조).
 *
 * 사장님 지시 원문: 「클랜별 전적 가장많이 한 클랜 3개를 보여주고 승률이랑 킬데스를
 * 적어주고 더보기 버튼을 만들어 나머지 클랜이랑 한것도 볼 수 있게한다(세로 배열)」
 *
 * 3rd.supply 실제 화면(사장님이 폰 사진으로 보내심)의 「최근매치」 위젯과 같은 자리 ·
 * 같은 줄 구성(클랜마크 + 상대클랜명 + 전적 + 승률 + 킬뎃, 세로로 3줄)이다. 다른 점은
 * 서플라이는 ★최근★ 붙은 상대 3개를 보여주는데, 사장님은 ★가장 많이★ 붙은 상대
 * 3개를 원하셨다 — 그 정렬 기준만 다르고 나머지 형식은 그대로 따라간다.
 *
 * 데이터는 이미 있는 `data.tier_breakdown[].opponents` 를 그대로 쓴다(2026-09-11
 * 「클랜별 전적」 탭이 쓰는 것과 같은 원천) — 구간이 여럿이면 같은 상대를 하나로
 * 더해서 합계로 「가장 많이 한 순」을 가린다. 새 API를 만들지 않는다.
 *
 * ⚠ 킬뎃을 구간 사이에 더할 때 ★원값(킬·데스)이 없어 퍼센트를 판수 가중평균으로
 *   섞는다★ — `PlayerDetailV3.tsx` 의 `ClanVsCard` 가 이미 같은 근사를 쓰고 있다
 *   (그 파일의 «이것은 근사값이다» 주석 참고). 같은 방식을 따라간다 — 화면마다
 *   다른 계산을 만들지 않는다.
 */
import type { LeaguePlayerDetail, PlayerTierOpponent } from '@sacloud/contract'
import { MarkCircle } from './primitives'
import { statColor } from './rankColors'
import { V3, cardStyle, fmt, pct1 } from './tokens'

/** 구간을 넘어 합친 상대 한 줄 — `PlayerTierOpponent` 과 같은 모양이다 */
type MergedOpponent = PlayerTierOpponent

function mixPct(a: number | null, an: number, b: number | null, bn: number): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  const n = an + bn
  return n === 0 ? null : Math.round(((a * an + b * bn) / n) * 10) / 10
}

/** ★가장 많이 붙은 상대 3곳★ — 구간을 다 합쳐서 판수 내림차순 */
function topOpponentsOf(data: LeaguePlayerDetail, limit: number): MergedOpponent[] {
  const byId = new Map<string, MergedOpponent>()
  for (const tier of data.tier_breakdown) {
    for (const o of tier.opponents) {
      const now = byId.get(o.league_clan_id)
      if (now === undefined) {
        byId.set(o.league_clan_id, { ...o })
        continue
      }
      const games = now.games + o.games
      const win = now.win + o.win
      const lose = now.lose + o.lose
      byId.set(o.league_clan_id, {
        ...now,
        games,
        win,
        lose,
        win_rate: games === 0 ? null : Math.round((win / games) * 1000) / 10,
        kd: mixPct(now.kd, now.games, o.kd, o.games),
        rifle_games: now.rifle_games + o.rifle_games,
        rifle_kd: mixPct(now.rifle_kd, now.rifle_games, o.rifle_kd, o.rifle_games),
        sniper_games: now.sniper_games + o.sniper_games,
        sniper_kd: mixPct(now.sniper_kd, now.sniper_games, o.sniper_kd, o.sniper_games),
      })
    }
  }
  return [...byId.values()].sort((a, b) => b.games - a.games).slice(0, limit)
}

export function ClanTop3PanelV3({ data, onMore }: { data: LeaguePlayerDetail; onMore: () => void }) {
  const top3 = topOpponentsOf(data, 3)
  if (top3.length === 0) return null
  return (
    <div style={{ marginTop: 16, ...cardStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>클랜별 전적</span>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>가장 많이 붙은 클랜 순</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onMore}
          style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: V3.textDim, background: 'transparent', border: `1px solid ${V3.chipBorder}`, borderRadius: 999, padding: '4px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          더보기
        </button>
      </div>
      {/* ★세로 배열★ (사장님 지시) — 한 줄에 하나씩 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {top3.map((o, i) => (
          <div
            key={o.league_clan_id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: i === top3.length - 1 ? 'none' : `1px solid ${V3.rowDivider}` }}
          >
            <MarkCircle clan={o.clan} size={24} />
            <span style={{ fontSize: 13, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {o.clan.name}
            </span>
            <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>
              {fmt(o.games)}전 {fmt(o.win)}승 {fmt(o.lose)}패
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: o.win_rate === null ? V3.textGhost : statColor(o.win_rate), whiteSpace: 'nowrap' }}>
              {pct1(o.win_rate)}
            </span>
            <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>
              킬뎃 {o.kd === null ? '—' : pct1(o.kd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
