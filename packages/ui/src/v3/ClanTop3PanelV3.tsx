'use client'

/**
 * ★최근매치 — 클랜별 전적★ (2026-09-22 사장님 · 서플라이 실측 사진 대조).
 *
 * 사장님 지시 원문 (2026-09-22 오후):
 *   「최근매치에 원그래프 있는 저 자리에 클랜별전적을 넣어줘. 제일 많이한 클랜 세개를
 *     세로로 배열하고 이 클랜들 상대로 몇승몇패이고 몇킬몇데스로 몇퍼 쏘고 있는지
 *     ★숫자 색깔시스템★ 적용해서 만들어줘」
 *
 * ── 서플라이 원본(`3rd.supply/league/supply/player/…`)의 「최근매치」 위젯
 *   ```
 *   ┌ 최근매치 ─────────────────────────────────────────────┐
 *   │   ◯ 80%      vs saint    9전 7승 2패 (77.8%)  킬뎃 55.2% │
 *   │  20전 16승 4패  vs MiraGe. 4전 4승 0패 (100%)  킬뎃 73.7% │
 *   │   5연승 중     vs [P.ro™] 3전 1승 2패 (33.3%)  킬뎃 43.6% │
 *   └───────────────────────────────────────────────────────┘
 *   ```
 *   ★왼쪽의 원그래프(도넛)가 있던 자리★ 에 클랜 세 줄을 넣었다 — 사장님 지시 그대로다.
 *   도넛이 있던 자리의 글자(「20전 16승 4패 (80%)」·「5연승 중」)는 ★오른쪽 칸★ 으로 옮겼다.
 *   ★값은 하나도 안 없앴다.★
 *
 * ── 서플라이와 다른 점 셋 (사장님이 그렇게 시키셨다)
 *   ① 정렬이 ★가장 많이 붙은 순★ 이다 (서플라이는 최근 순)
 *   ② ★킬·데스 원값★ 을 같이 적는다 (「1,234킬 1,001데스」) — 서플라이는 퍼센트만 적는다
 *   ③ 승률·킬뎃에 ★숫자 색깔시스템★(`statColor`)을 입힌다 — 서플라이는 전부 회색이다
 *
 * ── 자료
 *   이미 있는 `data.tier_breakdown[].opponents` 를 그대로 쓴다 (2026-09-11 「클랜별 전적」
 *   탭이 쓰던 것과 같은 원천). 구간이 여럿이면 같은 상대를 하나로 더한다. 새 API 를
 *   만들지 않는다.
 *
 *   ⚠ 킬뎃 퍼센트를 구간 사이에 더할 때는 ★킬·데스 원값을 다시 더해서 새로 낸다★ —
 *     2026-09-22 에 `PlayerTierOpponent` 에 `kill`·`death` 를 넣으면서 근사(판수 가중평균)를
 *     쓸 까닭이 없어졌다. ★옛 근사 함수(`mixPct`)는 지우지 않고 아래 남긴다★ (`CLAUDE.md` 1-4) —
 *     무기별 킬뎃(`rifle_kd`·`sniper_kd`)은 아직 원값이 없어 그쪽만 근사로 남는다.
 *
 * ── 오른쪽 요약은 ★최근 20전★ 이다
 *   `match_summary` 가 최근 20전 기준이라고 계약에 적혀 있다. 왼쪽 클랜 줄은 ★시즌 전체★ 라
 *   두 칸의 분모가 다르다 — 그래서 각 칸에 그렇게 적어 둔다. 같은 수인 척하지 않는다.
 */
import { useState } from 'react'
import type { LeaguePlayerDetail, PlayerTierOpponent } from '@sacloud/contract'
import { MarkCircle } from './primitives'
import { statColor } from './rankColors'
import { V3, cardStyle, fmt, pct1 } from './tokens'

/** 구간을 넘어 합친 상대 한 줄 — `PlayerTierOpponent` 과 같은 모양이다 */
type MergedOpponent = PlayerTierOpponent

/**
 * ★옛 근사★ — 퍼센트를 판수로 가중평균한다. 통합 킬뎃은 이제 원값으로 내지만
 * 무기별 킬뎃은 원값이 없어 아직 이걸 쓴다. 지우지 않는다 (`CLAUDE.md` 1-4).
 */
function mixPct(a: number | null, an: number, b: number | null, bn: number): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  const n = an + bn
  return n === 0 ? null : Math.round(((a * an + b * bn) / n) * 10) / 10
}

/** 킬뎃 % — `킬 / (킬 + 데스) × 100`. 잰 판이 없으면 `null` (0% 가 아니다) */
function kdOf(kill: number, death: number): number | null {
  return kill + death === 0 ? null : Math.round((kill / (kill + death)) * 1000) / 10
}

/** ★붙은 상대 전부★ — 구간을 다 합쳐서 판수 내림차순 */
function mergedOpponents(data: LeaguePlayerDetail): MergedOpponent[] {
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
      const kill = now.kill + o.kill
      const death = now.death + o.death
      byId.set(o.league_clan_id, {
        ...now,
        games,
        win,
        lose,
        kill,
        death,
        win_rate: games === 0 ? null : Math.round((win / games) * 1000) / 10,
        /* 원값이 있으면 원값으로 — 없으면(옛 응답) 옛 근사로 떨어진다 */
        kd: kill + death > 0 ? kdOf(kill, death) : mixPct(now.kd, now.games, o.kd, o.games),
        rifle_games: now.rifle_games + o.rifle_games,
        rifle_kd: mixPct(now.rifle_kd, now.rifle_games, o.rifle_kd, o.rifle_games),
        sniper_games: now.sniper_games + o.sniper_games,
        sniper_kd: mixPct(now.sniper_kd, now.sniper_games, o.sniper_kd, o.sniper_games),
      })
    }
  }
  return [...byId.values()].sort((a, b) => b.games - a.games || (a.clan.name < b.clan.name ? -1 : 1))
}

/** 한 줄 — 서플라이의 «vs saint  9전 7승 2패 (77.8%)  - 킬뎃: 55.2%» 를 우리 색으로 */
function OpponentRow({ o, last }: { o: MergedOpponent; last: boolean }) {
  const kdKnown = o.kill + o.death > 0
  return (
    <div
      className="sac-prr-opp"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto',
        alignItems: 'center',
        columnGap: 12,
        rowGap: 3,
        padding: '11px 16px',
        borderBottom: last ? 'none' : `1px solid ${V3.rowDivider}`,
      }}
    >
      {/* 왼쪽 위 — 클랜마크 + 클랜명. ★마크는 언제나 이름 앞★ */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, flex: 'none' }}>vs</span>
        <MarkCircle clan={o.clan} size={24} />
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {o.clan.name}
        </span>
      </span>
      {/* 오른쪽 위 — 전적 + 승률 */}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', justifySelf: 'end' }}>
        <span style={{ fontSize: 11.5, color: V3.textDim }}>
          {fmt(o.games)}전 {fmt(o.win)}승 {fmt(o.lose)}패
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: o.win_rate === null ? V3.textGhost : statColor(o.win_rate) }}>
          {pct1(o.win_rate)}
        </span>
      </span>
      {/* 왼쪽 아래 — 킬·데스 원값 (사장님: 「몇킬몇데스로」). 모르면 «알수없음» — 0 으로 채우지 않는다 */}
      <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {kdKnown ? `${fmt(o.kill)}킬 ${fmt(o.death)}데스` : '킬·데스 알수없음'}
      </span>
      {/* 오른쪽 아래 — 킬뎃 (사장님: 「몇퍼 쏘고 있는지」) */}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', justifySelf: 'end' }}>
        <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>킬뎃</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: o.kd === null ? V3.textGhost : statColor(o.kd) }}>{pct1(o.kd)}</span>
      </span>
    </div>
  )
}

/**
 * ★최근매치★ — 왼쪽 클랜별 전적(도넛이 있던 자리) · 오른쪽 최근 20전 요약.
 *
 * `onMore` 는 ★더 이상 안 쓴다★ — 2026-09-22 에 본문 탭 셋(그래프·플레이분석·클랜별전적)이
 * 없어져서 넘어갈 곳이 사라졌다. 「더보기」는 ★이 카드 안에서 펼친다.★
 * 자리는 남긴다 (`CLAUDE.md` 1-4) — 탭을 되살리면 그대로 쓴다.
 */
export function ClanTop3PanelV3({ data, onMore }: { data: LeaguePlayerDetail; onMore?: () => void }) {
  const [all, setAll] = useState(false)
  void onMore
  const opponents = mergedOpponents(data)
  const shown = all ? opponents : opponents.slice(0, 3)
  const s = data.match_summary
  const streak =
    s.streak.type === 'win' ? { text: `${s.streak.count}연승 중`, color: V3.blue }
    : s.streak.type === 'lose' ? { text: `${s.streak.count}연패 중`, color: V3.red }
    : null

  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 720px) {
          .sac-prr-recent { grid-template-columns: minmax(0,1fr) !important; }
          .sac-prr-recent > .sac-prr-side { border-left: none !important; border-top: 1px solid ${V3.divider}; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>최근매치</span>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>클랜별 전적 · 많이 붙은 순</span>
      </div>
      <div className="sac-prr-recent" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 210px' }}>
        {/* ── 왼쪽 — 원그래프가 있던 자리 (사장님 지시) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {shown.length === 0 ? (
            <div style={{ padding: '22px 16px', fontSize: 12, color: V3.textGhost }}>아직 맞붙은 클랜이 없습니다</div>
          ) : (
            shown.map((o, i) => <OpponentRow key={o.league_clan_id} o={o} last={i === shown.length - 1} />)
          )}
          {opponents.length > 3 ? (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              style={{
                margin: 0, width: '100%', padding: '9px 0', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700,
                color: V3.textDim, background: 'transparent', border: 'none', borderTop: `1px solid ${V3.rowDivider}`, cursor: 'pointer',
              }}
            >
              {all ? '접기 ▲' : `더보기 (${opponents.length - 3}곳 더) ▼`}
            </button>
          ) : null}
        </div>
        {/* ── 오른쪽 — 도넛 옆에 있던 글자를 그대로 옮겼다 ── */}
        <div
          className="sac-prr-side"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '18px 14px', borderLeft: `1px solid ${V3.divider}`,
          }}
        >
          <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>최근 {fmt(s.recent_count)}전</span>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: statColor(s.win_rate) }}>{pct1(s.win_rate)}</span>
          <span style={{ fontSize: 12, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(s.win)}승 {fmt(s.lose)}패</span>
          {streak ? (
            <span style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: streak.color, whiteSpace: 'nowrap' }}>{streak.text}</span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
