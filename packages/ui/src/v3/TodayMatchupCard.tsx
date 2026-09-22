'use client'

/**
 * ★★오늘의 상대전적★★ — 클랜랭킹 맨 위 (2026-09-22 사장님)
 *
 *   «매일 특정 시간 구간 동안 등록된 클랜끼리 서로 가장 많은 경기를 치른 매치업 1개를
 *     자동으로 찾아 클랜랭킹 상단에 실시간 상대전적으로 보여준다»
 *
 * ── ★새로 지어낸 디자인이 없다★ (사장님: 「새로운 디자인을 임의로 만들지 마」)
 *   생김새는 클랜 상세의 `HeadToHeadCard`(`ClanDetailV3.tsx:563`) 를 그대로 옮긴 것이다 —
 *   머리줄 · SET SCORE 줄 · SET WIN RATE 막대 · `H2HChartV3` 차례까지 같다.
 *   색은 ★흰 UI 이전의 남색 판★(`V3_DARK`) 이다. 그 값도 새로 짓지 않고
 *   `tokens.ts` 주석에 남아 있던 것을 되살려 썼다.
 *
 * ── ★다른 점 둘★ (여기만의 것)
 *   ① X축이 ★시즌 28일이 아니라 오늘 하루★ 다 (`dayAxis`). 창은 서버가 준다
 *   ② 「우리 클랜」이 없다 — 남의 두 클랜을 나란히 놓는다. 왼쪽이 `a`, 오른쪽이 `b` 이고
 *      `a` 는 ★클랜 ID 가 앞서는 쪽★ 이라 새로고침해도 좌우가 안 바뀐다
 *
 * ── ★없으면 없다고 쓴다★ (`CLAUDE.md` 2장 1번)
 *   `matchup` 이 `null` 이면 「오늘 아직 집계된 클랜 상대전적이 없습니다」 한 줄이다.
 *   가짜 클랜·가짜 점수를 만들지 않는다.
 */
import type { TodayMatchup } from '@sacloud/contract'
import { V3, V3_DARK } from './tokens'
import { clanThemeOf, fitMarkUrl, hasFitMark, MarkCircle } from './primitives'
import { H2HChartV3 } from './H2HChartV3'
import { dayAxis } from './seasonPlot'

const T = V3_DARK

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function TodayMatchupCard({ matchup }: { matchup: TodayMatchup | null }) {
  if (matchup === null) {
    return (
      <section
        style={{
          background: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderTop: `2px solid ${V3.blue}`,
          borderRadius: V3.radiusCard,
          padding: '28px 18px',
          textAlign: 'center',
          color: T.textFaint,
          fontSize: 13,
          fontFamily: V3.font,
        }}
      >
        오늘 아직 집계된 클랜 상대전적이 없습니다
      </section>
    )
  }

  const { a, b, a_win: aWin, b_win: bWin, total } = matchup
  const aTheme = clanThemeOf(a.slug)
  const bTheme = clanThemeOf(b.slug)
  /* 아직 한 판도 안 끝났으면 막대를 반반으로 둔다 — 한쪽으로 기울여 거짓말하지 않는다 */
  const share = total > 0 ? (aWin / total) * 100 : 50
  const fromMs = Date.parse(matchup.from)
  const axis = dayAxis(Number.isFinite(fromMs) ? fromMs : Date.now())

  const aClan = { slug: a.slug, name: a.name, mark: { bg: a.mark_bg_url, front: a.mark_front_url } }
  const bClan = { slug: b.slug, name: b.name, mark: { bg: b.mark_bg_url, front: b.mark_front_url } }

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
      {/* ── 머리줄 — `CardHead` 와 같은 꼴 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '12px 18px',
          borderBottom: `1px solid ${T.rowDivider}`,
          flexWrap: 'wrap',
        }}
      >
        <span aria-hidden style={{ width: 22, height: 2, background: V3.blue, flex: 'none', alignSelf: 'center' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: T.textStrong, whiteSpace: 'nowrap' }}>상대전적</span>
        <span style={{ fontSize: 11, color: T.textFaint, whiteSpace: 'nowrap' }}>
          {a.name} vs {b.name}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.textFaint, whiteSpace: 'nowrap' }}>오늘 집계 {fmt(total)}경기</span>
      </div>

      {/* ── SET SCORE ── */}
      <div
        className="v3-setscore"
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 26,
          padding: '26px 18px 22px',
          flexWrap: 'wrap',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${share}%`,
            background: `linear-gradient(100deg, ${aTheme.light}42, ${aTheme.main}29 40%, ${aTheme.deep}0f 78%, transparent)`,
            pointerEvents: 'none',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${100 - share}%`,
            background: `linear-gradient(260deg, ${bTheme.light}3d, ${bTheme.main}29 40%, ${bTheme.deep}0f 78%, transparent)`,
            pointerEvents: 'none',
          }}
        />
        {hasFitMark(a.slug) ? (
          <span
            aria-hidden
            className="v3-setscore-bg"
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 150,
              height: 150,
              backgroundImage: `url(${fitMarkUrl(a.slug)})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.08,
              filter: 'grayscale(1)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
        {hasFitMark(b.slug) ? (
          <span
            aria-hidden
            className="v3-setscore-bg"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 150,
              height: 150,
              backgroundImage: `url(${fitMarkUrl(b.slug)})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.08,
              filter: 'grayscale(1)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `${share}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,.04))',
            pointerEvents: 'none',
          }}
        />

        <span className="v3-setscore-team" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="sac-h2h-name" style={{ fontSize: 28, fontWeight: 900, color: aTheme.light, letterSpacing: '-.01em', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.name}
          </span>
          <MarkCircle clan={aClan} size={52} className="v3-setscore-mark" />
        </span>
        <span
          className="v3-setscore-num"
          style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: aTheme.light, letterSpacing: '-.02em' }}
        >
          {aWin}
        </span>
        <span
          className="v3-setscore-mid"
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 88 }}
        >
          <span style={{ fontSize: 10.5, color: T.textFaint, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>SET SCORE</span>
          <span style={{ fontSize: 11, color: T.textGhost2, whiteSpace: 'nowrap' }}>오늘</span>
        </span>
        <span
          className="v3-setscore-num"
          style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: bTheme.light, letterSpacing: '-.02em' }}
        >
          {bWin}
        </span>
        <span className="v3-setscore-team" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <MarkCircle clan={bClan} size={52} className="v3-setscore-mark" />
          <span className="sac-h2h-name" style={{ fontSize: 28, fontWeight: 900, color: bTheme.light, letterSpacing: '-.01em', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {b.name}
          </span>
        </span>
      </div>

      {/* ── SET WIN RATE ── */}
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ display: 'flex', height: 8, gap: 4, borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${share}%`,
              borderTop: `2px solid ${aTheme.edge}`,
              background: `linear-gradient(100deg, ${aTheme.light}6b, ${aTheme.main}3d 46%, ${aTheme.deep}1a)`,
            }}
          />
          <div
            style={{
              width: `${100 - share}%`,
              borderTop: `2px solid ${bTheme.edge}`,
              background: `linear-gradient(260deg, ${bTheme.light}6b, ${bTheme.main}3d 46%, ${bTheme.deep}1a)`,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 7 }}>
          <span style={{ fontSize: 11.5, color: T.textMuted, whiteSpace: 'nowrap' }}>
            SET WIN RATE <span style={{ fontWeight: 700, color: aTheme.light }}>{total > 0 ? `${share.toFixed(1)}%` : '-'}</span>
          </span>
          <span style={{ fontSize: 11.5, color: T.textMuted, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: bTheme.light }}>{total > 0 ? `${(100 - share).toFixed(1)}%` : '-'}</span> ·{' '}
            {fmt(total)}전 기준
          </span>
        </div>
      </div>

      {/*
        ── 누적 승률 그래프 ──
        `games` 는 ★시간순★ 이고, 그래프가 앞에서부터 훑어 ★그 시점까지의 누적 승률★ 을 만든다.
        「우리(mine)」 자리에 `a` 를 놓는다 — `a_won` 이 곧 `won` 이다.
      */}
      <H2HChartV3
        games={matchup.games.map((g) => ({ at: g.start_at, won: g.a_won }))}
        theme={aTheme}
        oppTheme={bTheme}
        mineName={a.name}
        mineSlug={a.slug}
        oppName={b.name}
        oppSlug={b.slug}
        axis={axis}
        tone={T}
        compact
      />
    </section>
  )
}
