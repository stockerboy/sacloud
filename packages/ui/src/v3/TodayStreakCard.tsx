'use client'

/**
 * ★★오늘의 최다연승 · 최다연패★★ — 클랜랭킹 맨 위 (2026-09-22 사장님)
 *
 *   «클랜랭킹에 비워지게된 자리는 ★그날 하루 최다연승클랜이랑 최다연패클랜 박제★ 해줘
 *     (실시간) 15시~다음날15시»
 *
 * ── ★상대전적 카드가 비운 자리다★
 *   그 카드는 사장님 지시로 ★최근경기 페이지★ 로 옮겼다 (「최근 폼 1위 클랜」 자리).
 *   여기는 그 자리를 이어받는다 — 창(15:00 KST)도 색도 같은 판을 쓴다.
 *
 * ── ★색은 흰 UI 이전의 남색★ (`V3_DARK`) — 상대전적 카드와 같은 결이다.
 *
 * ── ★없으면 없다고 쓴다★ (`CLAUDE.md` 2장 1번)
 *   창 안에 경기가 없으면 「오늘 아직 집계된 경기가 없습니다」 한 줄이다.
 */
import type { TodayStreakClan } from '@sacloud/contract'
import { V3, V3_DARK } from './tokens'
import { clanThemeOf, MarkCircle } from './primitives'

const T = V3_DARK

/** 연승은 파랑(이김), 연패는 빨강(짐) — 표의 승/패 색과 같은 뜻이다 */
const WIN_TONE = { line: V3.blue, text: '#9cc0ff' }
const LOSE_TONE = { line: V3.red, text: '#ff9aa0' }

function Side({
  title,
  unit,
  clan,
  tone,
}: {
  title: string
  unit: string
  clan: TodayStreakClan | null
  tone: { line: string; text: string }
}) {
  const theme = clanThemeOf(clan?.slug ?? null)
  return (
    <div
      style={{
        flex: '1 1 260px',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '18px 18px',
      }}
    >
      <span aria-hidden style={{ width: 3, alignSelf: 'stretch', background: tone.line, flex: 'none' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, letterSpacing: '.08em', color: T.textFaint, whiteSpace: 'nowrap' }}>{title}</div>
        {clan === null ? (
          /* ★가짜 클랜을 만들지 않는다★ — 아무도 이어 가지 못했으면 그렇게 적는다 */
          <div style={{ marginTop: 6, fontSize: 13, color: T.textGhost }}>아직 없습니다</div>
        ) : (
          <>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {/* ★클랜마크는 이름 앞에 항상★ */}
              <MarkCircle clan={{ slug: clan.slug, mark: { bg: clan.mark_bg_url, front: clan.mark_front_url } }}
                title={clan.name} size={32} />
              <span
                style={{
                  fontSize: 19,
                  fontWeight: 900,
                  color: theme.light,
                  letterSpacing: '-.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {clan.name}
              </span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: tone.text }}>{clan.streak}</span>
              <span style={{ fontSize: 12, color: T.textMuted }}>{unit}</span>
              <span style={{ fontSize: 11, color: T.textGhost2 }}>
                · 오늘 {clan.win}승 {clan.lose}패
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function TodayStreakCard({
  best,
  worst,
}: {
  best: TodayStreakClan | null
  worst: TodayStreakClan | null
}) {
  const empty = best === null && worst === null
  return (
    <section
      style={{
        background: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderTop: `2px solid ${V3.blue}`,
        borderRadius: V3.radiusCard,
        overflow: 'hidden',
        fontFamily: V3.font,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '12px 18px',
          borderBottom: `1px solid ${T.rowDivider}`,
        }}
      >
        <span aria-hidden style={{ width: 22, height: 2, background: V3.blue, flex: 'none', alignSelf: 'center' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: T.textStrong, whiteSpace: 'nowrap' }}>오늘의 연승 · 연패</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.textFaint, whiteSpace: 'nowrap' }}>15시 ~ 다음날 15시</span>
      </div>
      {empty ? (
        <div style={{ padding: '26px 18px', textAlign: 'center', color: T.textFaint, fontSize: 13 }}>
          오늘 아직 집계된 경기가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <Side title="최다 연승" unit="연승" clan={best} tone={WIN_TONE} />
          <Side title="최다 연패" unit="연패" clan={worst} tone={LOSE_TONE} />
        </div>
      )}
    </section>
  )
}
