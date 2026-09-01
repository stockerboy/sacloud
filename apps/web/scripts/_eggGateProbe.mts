/**
 * 「알」 관문이 실제로 열려 있는가 — **렌더해서 확인한다** (2026-09-02).
 *
 * 임시 조사용 파일이다. 확인이 끝나면 지운다.
 *
 * 왜 이렇게 확인하는가 — 이 환경에서는 소켓을 열 수 없어(`listen EFAULT`)
 * dev 서버도 Chrome 도 못 띄운다. 그러나 **가리는 판정은 전부 렌더 시점에 난다.**
 * 그래서 서버 없이 `renderToStaticMarkup` 으로 같은 컴포넌트를 그려 보고,
 * 가려졌을 때만 나오는 `▨▨` 와 안내 문구가 있는지 센다.
 *
 * **가장 불리한 조건으로 그린다** — `EggBreak` 이 비어서 아무도 안 깨진 상태,
 * 즉 `state="sealed"` 를 명시로 넘기고 `egg` prop 은 아예 안 넘긴다.
 */

import React, { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/*
 * `tsx` 는 tsconfig 의 `jsx: preserve` 를 보고 **옛 방식**(`React.createElement`)으로 옮긴다.
 * 그래서 컴포넌트 파일 안에서 `React` 가 전역에 있어야 한다. 여기서만 쓰는 조사용 배선이다 —
 * Next 빌드는 자동 런타임을 쓰므로 운영 코드와는 무관하다.
 */
;(globalThis as unknown as { React: typeof React }).React = React

const {
  ClanStatSidebar,
  EGG_SYSTEM_ENABLED,
  EGG_VEIL_MARK,
  EGG_VEIL_MESSAGE,
  EggProvider,
  EggVeil,
  EggVeilLegend,
  EggVeilPanel,
  PlayerStatSidebar,
  PlayerRankTable,
  ClanRankTable,
  PlayerLeagueList,
  ClanLeagueList,
} = await import('@sacloud/ui')

/* 아무도 안 깨진 상태 — 운영에서 `EggBreak` 이 비어 있을 때와 같다 */
const NOBODY_BROKEN = { brokenPlayerIds: [], brokenClanSlugs: [], loading: false }

const wrap = (node: ReactNode) => renderToStaticMarkup(h(EggProvider, { value: NOBODY_BROKEN }, node))

interface Case {
  name: string
  html: string
  /** 가려지지 않았다면 반드시 보여야 하는 값 */
  expect: string[]
}

const cases: Case[] = []

/* ── 선수 상세정보 — `egg` 를 **안 넘긴다** (기본값 `sealed` 를 타는 최악의 경우) */
cases.push({
  name: 'PlayerStatSidebar (egg prop 없음 — 기본값 sealed)',
  html: wrap(
    h(PlayerStatSidebar, {
      rating: 1677,
      placement: false,
      win: 320,
      lose: 188,
      winRate: 62.9,
      kill: 8290,
      death: 5486,
      kdRate: 151.1,
      killPerMatch: 16.3,
      mvpCount: 12,
      rank: 8,
      rankCount: 240,
      clan: { slug: 'probe', name: '조사용클랜', isOfficialClan: true },
    }),
  ),
  expect: ['320', '188', '62.9', '151.1'],
})

/* ── 선수 상세정보 — `sealed` 를 **명시로** 넘긴다 */
cases.push({
  name: 'PlayerStatSidebar (egg="sealed" 명시)',
  html: wrap(
    h(PlayerStatSidebar, {
      rating: 1677,
      placement: false,
      win: 320,
      lose: 188,
      winRate: 62.9,
      kill: 8290,
      death: 5486,
      kdRate: 151.1,
      killPerMatch: 16.3,
      mvpCount: 12,
      rank: 8,
      rankCount: 240,
      clan: { slug: 'probe', name: '조사용클랜', isOfficialClan: true },
      egg: 'sealed',
    }),
  ),
  expect: ['320', '188', '62.9', '151.1'],
})

/* ── 클랜 상세정보 */
cases.push({
  name: 'ClanStatSidebar (egg="sealed" 명시)',
  html: wrap(
    h(ClanStatSidebar, {
      rating: 1520,
      placement: false,
      win: 7917,
      lose: 7424,
      winRate: 51.6,
      division: 2,
      rank: 8,
      egg: 'sealed',
    }),
  ),
  expect: ['7,917', '7,424', '51.6'],
})

/* ── 가리는 컴포넌트 세 개를 직접 */
cases.push({
  name: 'EggVeil (표 한 칸)',
  html: wrap(h(EggVeil, { state: 'sealed' }, '진짜값-51.6%')),
  expect: ['진짜값-51.6%'],
})

cases.push({
  name: 'EggVeilPanel (육각형·최근경기 같은 큰 덩어리)',
  html: wrap(
    h(EggVeilPanel, { state: 'sealed', note: '깨는 방법' }, h('div', null, '진짜-육각형')),
  ),
  expect: ['진짜-육각형'],
})

cases.push({
  name: 'EggVeilLegend (랭킹 표 밑 한 줄)',
  html: wrap(h(EggVeilLegend, null)),
  expect: [],
})

/*
 * ── 랭킹 표 — **사용자가 보고 있던 그 화면**이다.
 *   여기는 `egg` 를 prop 으로 받지 않고 문맥(`useEggKnowledge`)에서 직접 고른다.
 *   위에서 «아무도 안 깨졌다» 는 문맥을 씌웠으므로, 스위치가 안 먹으면 전부 `▨▨` 가 된다.
 */
cases.push({
  name: 'PlayerRankTable (개인랭킹 — 아무도 안 깨진 문맥)',
  html: wrap(
    h(PlayerRankTable, {
      leagueSlug: 'nolink',
      rows: [
        {
          rank: 1,
          league_player_id: 'lp1',
          player: { id: 'p1', name: '조사용선수' },
          clan: { id: 'c1', slug: 'probe', name: '조사용클랜', mark: null },
          win: 320,
          lose: 188,
          win_rate: 62.9,
          kd_rate: 151.1,
          kill_per_match: 16.3,
          rating: 1677,
        },
      ],
    } as never),
  ),
  expect: ['조사용선수', '320', '188', '62.9', '151.1', '1,677'],
})

cases.push({
  name: 'ClanRankTable (클랜랭킹 — 아무도 안 깨진 문맥)',
  html: wrap(
    h(ClanRankTable, {
      leagueSlug: 'supply',
      rows: [
        {
          rank: 1,
          league_clan_id: 'lc1',
          clan: { id: 'c1', slug: 'probe', name: '조사용클랜', mark: null },
          division: 1,
          win: 7917,
          lose: 7424,
          win_rate: 51.6,
          rating: 1520,
          category: 'official',
        },
      ],
    } as never),
  ),
  expect: ['조사용클랜', '7,917', '7,424', '51.6', '1,520'],
})

/*
 * ── 「참여중인 리그」 카드 — 여기는 `sealed ? null : …` 로 **승패 막대를 통째로 지운다.**
 *   가리는 게 아니라 없애는 자리라 따로 본다.
 */
const league = {
  id: 'l1',
  slug: 'nolink',
  name: 'IPL',
  official: true,
  category: 'independent',
  division_count: 5,
}

cases.push({
  name: 'PlayerLeagueList (참여중인 리그 카드 — 승패 막대까지)',
  html: wrap(
    h(PlayerLeagueList, {
      playerId: 'p1',
      entries: [
        {
          league,
          league_player_id: 'lp1',
          clan: { id: 'c1', slug: 'probe', name: '조사용클랜', mark: null },
          rating: 1677,
          win: 320,
          lose: 188,
          win_rate: 62.9,
          kill: 8290,
          death: 5486,
          kd_rate: 151.1,
          placement: false,
          rank: 8,
          rank_count: 240,
        },
      ],
    } as never),
  ),
  expect: ['320', '188', '62.9', '151.1'],
})

cases.push({
  name: 'ClanLeagueList (참여중인 리그 카드 — 승패 막대까지)',
  html: wrap(
    h(ClanLeagueList, {
      clanSlug: 'probe',
      entries: [
        {
          league,
          league_clan_id: 'lc1',
          rating: 1520,
          division: 2,
          win: 7917,
          lose: 7424,
          win_rate: 51.6,
          placement: false,
          status: 'active',
          joined_at: '2026-07-01T00:00:00.000Z',
          rank: 8,
          rank_count: 240,
        },
      ],
    } as never),
  ),
  expect: ['7,917', '7,424', '51.6'],
})

/* ------------------------------------------------------------------ 판정 --- */

console.info(`EGG_SYSTEM_ENABLED = ${EGG_SYSTEM_ENABLED}`)
console.info('')

let failed = 0

for (const c of cases) {
  const problems: string[] = []

  if (c.html.includes(EGG_VEIL_MARK)) problems.push(`가림표시 ${EGG_VEIL_MARK} 가 나온다`)
  if (c.html.includes(EGG_VEIL_MESSAGE)) problems.push(`«${EGG_VEIL_MESSAGE}» 가 나온다`)
  /* 덮개 패널이 쓰는 흐림 처리 — 남아 있으면 값이 읽히지 않는다 */
  if (c.html.includes('blur-[6px]')) problems.push('흐림 덮개(blur)가 남아 있다')

  for (const want of c.expect) {
    if (!c.html.includes(want)) problems.push(`«${want}» 가 화면에 없다`)
  }

  if (problems.length === 0) {
    console.info(`  OK    ${c.name}`)
  } else {
    failed += 1
    console.info(`  FAIL  ${c.name}`)
    for (const p of problems) console.info(`          - ${p}`)
    console.info(`          html: ${c.html.slice(0, 400)}`)
  }
}

console.info('')
if (failed > 0) {
  console.info(`${failed}/${cases.length} 실패 — 관문이 아직 닫혀 있다`)
  process.exit(1)
}
console.info(`${cases.length}/${cases.length} 통과 — 안 깨진 대상도 기록이 그대로 나온다`)
