'use client'

/**
 * ★육각형 위 작은 래더 그래프★ (2026-09-22 사장님 — 서플라이 실측 사진)
 *
 * > 「빨간원안에 육각그래프와 킬데스 그래프를 배치한다(광고자리) 저 크기를 넘으면
 * >  안되며 최대한 비슷한 크기의 배치를 한다」
 * > 후속 정정: 「그래프랑 육각 같이 넣지 말고 위에 그래프만 넣고 동그라미 친
 * >  이 자리에 육각 넣어」
 *
 * 서플라이는 이 자리(선수 상세 오른쪽)에 세로로 긴 광고(호텔스닷컴+어도비 두 장)를
 * 쌓는다. 우리는 광고를 안 쓰니 그 세로 자리에 ★위 그래프 · 아래 육각형★ 을 쌓는다.
 * ⚠ 광고 자리 폭을 넘지 않는다 — `PlayerHeaderV3` 의 `.v3-phead-hex` 폭(옛 392px
 * 육각형 하나)을 그대로 상한으로 삼는다.
 *
 * `TrendChartV3` 는 이미 ★폰 폭(700px 미만)에서 세로를 낮추는 phone 모드★ 를
 * 갖고 있다(`seasonPlot.ts` 의 `plotBox`) — 새 차트를 만들지 않고 그 모드를
 * 좁은 PC 칸에도 그대로 빌려 쓴다. 데이터는 `PlayerHeaderV3` 가 이미 받은
 * `LeaguePlayerDetail.trend` 를 그대로 쓴다 — 새로 물어보지 않는다.
 */
import type { LeaguePlayerDetail } from '@sacloud/contract'
import { TrendChartV3 } from './TrendChartV3'
import { V3 } from './tokens'

export function PlayerHexTrend({ data }: { data: LeaguePlayerDetail }) {
  /* ★오늘 판이 있으면 「오늘」, 없으면 마지막으로 뛴 날★ — `TrendCard`(PlayerDetailV3)와 같은 규칙 */
  const today = data.trend.find((d) => d.today) ?? null
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const dayRef = today && today.win + today.lose > 0 ? { d: today, name: '오늘' } : lastPlayed ? { d: lastPlayed, name: lastPlayed.label } : null

  /* ★찍힌 날이 없으면 그리지 않는다★ — 빈 그래프를 억지로 채우지 않는다 (D-106) */
  const hasAnyDay = data.trend.some((d) => d.win + d.lose > 0)
  if (!hasAnyDay) return null

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: V3.textFaint, letterSpacing: '.02em', padding: '0 2px 6px' }}>
        래더 추이
      </div>
      <TrendChartV3
        days={data.trend}
        mode="day"
        seed={data.player.id}
        markSlug={data.clan?.slug ?? null}
        winLabel={dayRef ? `${dayRef.name} ${dayRef.d.win}승 ${dayRef.d.lose}패` : '아직 경기 없음'}
        kdLabel={dayRef ? `${dayRef.name} ${dayRef.d.kill}킬 ${dayRef.d.death}데스` : ''}
        showsKd
      />
    </div>
  )
}
