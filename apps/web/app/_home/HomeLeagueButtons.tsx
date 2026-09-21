'use client'

import Link from 'next/link'
import { useState } from 'react'
import { leagueScreen } from '@sacloud/contract'
import { FEATURED_LEAGUES, LEAGUE_LOGO, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★홈 리그 단추 셋★★ (2026-09-18 사장님)
 *
 * > 「메인에 저거 밑에 리그 참가신청 저거 3장 전부 없애고
 * >  IPL PL 열산리그 이렇게 버튼 세개 만들고
 * >  누르면 개인랭킹 , 클랜랭킹 , 최근경기 이렇게 나오고 누를 수 있게 해줘」
 *
 * ```
 *   ┌─────────┐ ┌─────────┐ ┌─────────┐
 *   │   IPL   │ │   PL    │ │ 열산리그 │      ← 누르면 아래가 펼쳐진다
 *   └─────────┘ └─────────┘ └─────────┘
 *   ┌───────────────────────────────────┐
 *   │  개인랭킹  ·  클랜랭킹  ·  최근경기  │      ← 셋 다 진짜로 가는 곳
 *   └───────────────────────────────────┘
 * ```
 *
 * ── ★없는 곳으로 보내지 않는다★ (`CLAUDE.md` 2-1)
 *   셋 다 실제 라우트다:
 *   ```
 *     개인랭킹  /league/{slug}/rank/player
 *     클랜랭킹  /league/{slug}/rank/clan
 *     최근경기  /league/{slug}/match
 *   ```
 *
 * ── ★리그 이름을 여기 적지 않는다★
 *   `FEATURED_LEAGUES` 한 곳이 이름과 순서를 정한다. 준비중 리그는 빠진다 —
 *   눌러도 랭킹이 없는 리그를 세워 두면 거짓말이 된다.
 *
 * ── 왜 «펼치기» 인가
 *   리그 셋 × 화면 셋 = 아홉 칸을 한 번에 늘어놓으면 첫 화면이 목록이 된다.
 *   먼저 ★리그를 고르고★ 그다음에 ★무엇을 볼지★ 고르는 것이 사람이 생각하는 차례다.
 *   ⚠ 처음부터 하나를 펼쳐 둔다 — 아무것도 안 펼쳐진 첫 화면은 «눌러야 뭔가 나온다» 는
 *     것을 말해 주지 못한다.
 */

/** 리그마다의 강조색 — 로고 색을 따른다 */
const TONE: Readonly<Record<string, string>> = {
  /* ★C1 은 금색★ (2026-09-20) — 로고와 같은 색이다 (`league-c1.svg`) */
  c1: '#ffd83d',
  /* ★CPL 도 금색★ (2026-09-21) — 로고의 금색 C 를 따른다 */
  cpl: '#ffd83d',
  nolink: '#5b8dff',
  supply: '#ff5a63',
  sanply: '#9fc4ff',
}

/*
 * ⚠ ★리그마다 있는 화면이 다르다★ (2026-09-19 검수에서 잡았다).
 *
 *   열산리그(`sanply`)는 ★클랜 기록을 제공하지 않는다.★ 그런데 첫 판은 세 단추를
 *   모든 리그에 똑같이 걸어서 ★없는 화면으로 보내고 있었다.★
 *   같은 홈 안의 `HomeSitemap` 은 그걸 알고 일부러 안 걸고 있었다 — 두 곳이 어긋났다.
 *
 *   ★리그가 무엇을 보여 주는가는 `leagueScreen()` 한 자리가 정한다★
 *   (`packages/contract/src/leagueScreen.ts`). 여기에 `if (slug === 'sanply')` 를
 *   적지 않는다 — 그 파일이 「분기를 화면마다 흩뿌리지 말라」고 못 박아 뒀다.
 */
const VIEWS = [
  { label: '개인랭킹', path: 'rank/player', needsClanRank: false },
  { label: '클랜랭킹', path: 'rank/clan', needsClanRank: true },
  { label: '최근경기', path: 'match', needsClanRank: false },
] as const

/*
 * ★차례는 사장님이 적으신 그대로★ — 「IPL PL 열산리그」.
 * ⚠ `FEATURED_LEAGUES` 의 차례(PL · IPL · 열산리그)는 ★안 건드린다★ —
 *   그건 상단바가 같이 쓴다. 여기서만 다시 세운다.
 */
/*
 * ⚠ ★2026-09-20 밤 — C1 을 맨 앞에 더했다★ (사장님).
 *
 *   > 「진짜 실력자들의 실력싸움은 c1에 기록된다」
 *
 *   단추가 셋에서 ★넷★ 이 됐다. 폰에서 한 칸이 좁아지므로 아래 단추의
 *   가로 여백(`px`)과 글자 크기를 ★같이★ 줄였다 — 안 줄이면 「열산리그」 가 접힌다.
 */
const HOME_ORDER = ['c1', 'nolink', 'supply', 'sanply'] as const

const LEAGUES = HOME_ORDER.flatMap((slug) => {
  const found = FEATURED_LEAGUES.find((league) => league.href === `/league/${slug}`)
  if (!found || isLeaguePreparing(slug)) return []
  return [{ slug: slug as string, label: found.label, logo: LEAGUE_LOGO[slug] ?? null }]
})

export function HomeLeagueButtons() {
  /* 처음부터 하나는 펼쳐 둔다 — 빈 화면은 무엇을 눌러야 하는지 못 알려 준다 */
  const [open, setOpen] = useState(LEAGUES[0]?.slug ?? '')
  const picked = LEAGUES.find((league) => league.slug === open) ?? LEAGUES[0]
  const tone = picked ? (TONE[picked.slug] ?? '#5b8dff') : '#5b8dff'

  if (!picked) return null

  /* 그 리그에 ★실제로 있는 화면★ 만 남긴다 */
  const views = VIEWS.filter((v) => !v.needsClanRank || leagueScreen(picked.slug).clanRank)

  return (
    <section aria-label="리그별 바로가기" className="mt-[26px] w-full max-w-[720px] max-md:mt-[20px]">
      {/* ── 리그 단추 셋 ─────────────────────────────────────────────── */}
      <div className="flex items-stretch gap-[10px] max-md:gap-[7px]">
        {LEAGUES.map((league) => {
          const on = league.slug === picked.slug
          const color = TONE[league.slug] ?? '#5b8dff'
          return (
            <button
              key={league.slug}
              type="button"
              onClick={() => setOpen(league.slug)}
              aria-pressed={on}
              /* ★어느 칸이 바뀌는지 읽는 기계에 알려 준다★ (2026-09-19 검수) */
              aria-controls="home-league-views"
              className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-[7px] rounded-[14px] border px-[10px] py-[14px] transition-all duration-150 max-md:gap-[5px] max-md:rounded-[11px] max-md:px-[3px] max-md:py-[10px]"
              style={{
                borderColor: on ? color : 'rgba(146,174,233,.18)',
                background: on ? `${color}14` : 'rgba(255,255,255,.02)',
                boxShadow: on ? `0 8px 24px ${color}22` : 'none',
              }}
            >
              {/*
                ⚠ ★`width`·`height` 를 반드시 준다★ — 없으면 폰에서 가로가 0 이 된다
                  (`HomeLeagueTiles` 가 같은 함정을 적어 뒀다).
              */}
              {league.logo ? (
                <img
                  src={league.logo.src}
                  width={league.logo.w}
                  height={league.logo.h}
                  alt=""
                  aria-hidden
                  /*
                   * ⚠ ★폰에서 22px → 19px★ (2026-09-20 · 단추가 넷이 되면서 실측).
                   *   360px 폰에서 한 칸이 ★75px★ 인데 IPL 로고는 세로 22px 일 때
                   *   가로가 ★74px★ 이다. 여백까지 빼면 ★5px 를 넘친다.★
                   *   19px 로 낮추면 64px 라 들어간다.
                   * ⚠ ★`max-w-none` 을 `max-w-full` 로 바꿨다★ — 앞으로 더 긴 로고가
                   *   들어와도 ★넘치는 대신 줄어든다.★ 그림이 잘리거나 가로 스크롤이 생기지 않는다.
                   */
                  className="block h-[30px] w-auto max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.05] max-md:h-[19px]"
                  style={{ opacity: on ? 1 : 0.62 }}
                />
              ) : null}
              <span
                className="block whitespace-nowrap text-[13px] font-bold tracking-[.10em] transition-colors duration-150 max-md:text-[10.5px] max-md:tracking-[.02em]"
                style={{ color: on ? color : 'var(--v2-text-dim,#8b96b5)' }}
              >
                {league.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── 고른 리그의 화면 셋 ───────────────────────────────────────── */}
      <div
        id="home-league-views"
        /* 단추를 누르면 이 칸의 세 링크가 바뀐다 — 바뀌었다고 말해 준다 */
        aria-live="polite"
        className="mt-[10px] flex items-stretch gap-[10px] max-md:mt-[7px] max-md:gap-[7px]"
      >
        {views.map((view) => (
          <Link prefetch={false}
            key={view.path}
            href={`/league/${picked.slug}/${view.path}`}
            className="flex flex-1 items-center justify-center rounded-[12px] border py-[13px] text-[14px] font-bold transition-all duration-150 max-md:rounded-[10px] max-md:py-[13px] max-md:text-[12.5px]"
            style={{ borderColor: `${tone}3d`, background: 'rgba(255,255,255,.02)' }}
          >
            {/* `a { color: inherit }` — 색은 안쪽 span 에 준다 (D-231) */}
            <span style={{ color: tone }}>{view.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
