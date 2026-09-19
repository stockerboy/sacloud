import Link from 'next/link'
import { leagueLandingPath } from '@sacloud/contract'
import { FEATURED_LEAGUES, isLeaguePreparing } from '../site-config'

/**
 * ★★홈 사이트맵 다섯 칸★★ — 2026-09-16 에 ★접이식★ 으로 줄였다 (사장님).
 *
 * ```
 *   Community   Leagues   Operation   Users   Data
 *   ↑ 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D
 * ```
 *
 * ── 왜 바뀌었나
 *   > «구리고 (…) ★정신없어 너무 많아서★» — 2026-09-16 사장님
 *
 *   리그가 셋이 되자 링크가 리그 수만큼 곱해져 한 칸에 다섯 줄씩 쏟아졌다.
 *   폰에서는 발바닥이 화면 두 배 길이였다.
 *
 * ── 지금
 *   ★두 단으로 접었다.★ 겉에는 큰 갈래만 서고, 누르면 꼬리가 펼쳐진다.
 *
 * ```
 *   Leagues   › 경쟁리그      ← 누르면      › 경쟁리그
 *             › 일반리그                       PL
 *                                          › 일반리그
 * ```
 *
 * ── ★JS 를 안 쓴다★
 *   접는 일은 `<details>`·`<summary>` 가 브라우저에서 공짜로 해 준다.
 *   그래서 이 화면은 ★서버 컴포넌트 그대로★ 다 — 홈이 굳어 있는(`force-static`)
 *   화면이라 여기에 상태를 들이면 통째로 클라이언트로 떨어진다.
 *
 * ── 사장님이 정하신 짜임 (원문)
 * ```
 *   커뮤니티 - Hot 자유
 *   리그    - 경쟁리그(누르면 꼬리로 펼쳐짐) - pl / 일반리그 - IPL · 열산리그
 *   오퍼    - 그대로
 *   유저    - PL랭킹 - 개인 · 클랜 / 열산리그랭킹(누르면 바로 개인랭킹으로)
 *   데이터  - 경쟁전데이터 - PL · 공식토너먼트 / 일반전데이터 - IPL · 열산리그
 * ```
 *   ★IPL 랭킹은 사장님 원문에 없지만 넣었다★ — 2026-09-15 «IPL 킬뎃이랑 랭킹
 *   전부 살려» 와 어긋나기 때문이다. 접혀 있으므로 «너무 많다» 는 그대로 풀린다.
 *
 * ── ★열산리그 랭킹은 접지 않는다★
 *   사장님: «열산리그랭킹(누르면바로 개인랭킹으로)». 클랜 기록을 제공하지 않아
 *   꼬리가 한 줄뿐이다 — 한 줄짜리를 접으면 손만 한 번 더 간다.
 */

interface SiteLink {
  label: string
  href: string
  /** 라벨 옆 작은 글자. 없으면 안 그린다 */
  sub?: string
}

/** 큰 갈래 — `links` 가 있으면 접히고, `href` 만 있으면 바로 간다 */
interface SiteNode {
  label: string
  /** 접히는 갈래의 꼬리 */
  links?: readonly SiteLink[]
  /** 접지 않고 바로 가는 갈래 */
  href?: string
}

const LIVE_LEAGUES = FEATURED_LEAGUES.map((league) => ({
  ...league,
  slug: league.href.split('/')[2] ?? '',
})).filter((league) => !isLeaguePreparing(league.slug))

/**
 * ★리그 이름을 여기 적지 않는다★ — `FEATURED_LEAGUES` 한 곳이 정한다.
 * (2026-09-15 QA: 시즌 줄에 «SPL» 이 박혀 있어 이름을 바꿔도 안 따라왔다)
 * 아직 안 연 리그면 빈 글자가 되고, 그 갈래는 아래에서 통째로 빠진다.
 */
const nameOf = (slug: string): string => LIVE_LEAGUES.find((l) => l.slug === slug)?.label ?? ''

/** 그 리그가 지금 열려 있는가 */
const live = (slug: string): boolean => LIVE_LEAGUES.some((l) => l.slug === slug)

/** 열린 리그만 꼬리로 만든다 — 없는 곳으로 보내지 않는다 */
const leaf = (slug: string, tail: string, label?: string): SiteLink[] =>
  live(slug) ? [{ label: label ?? nameOf(slug), href: `/league/${slug}${tail}` }] : []

const COLUMNS: readonly { title: string; nodes: readonly SiteNode[] }[] = [
  {
    title: 'Community',
    nodes: [
      { label: 'HOT게시판', href: '/board/hot' },
      { label: '자유게시판', href: '/board/free' },
    ],
  },
  {
    title: 'Leagues',
    nodes: [
      {
        label: '경쟁리그',
        links: live('supply')
          ? [{ label: nameOf('supply'), href: leagueLandingPath('supply'), sub: '기록게임' }]
          : [],
      },
      {
        label: '일반리그',
        links: [
          ...(live('nolink')
            ? [{ label: nameOf('nolink'), href: leagueLandingPath('nolink'), sub: '무소속' }]
            : []),
          ...(live('sanply')
            ? [{ label: nameOf('sanply'), href: leagueLandingPath('sanply') }]
            : []),
        ],
      },
    ],
  },
  {
    title: 'Operation',
    /* ★그대로★ — 사장님: «오퍼-그대로» */
    nodes: [
      { label: '이용약관', href: '/clause/service' },
      { label: '개인정보 취급방침', href: '/clause/policy' },
    ],
  },
  {
    title: 'Users',
    nodes: [
      {
        label: `${nameOf('supply')}랭킹`,
        links: [...leaf('supply', '/rank/player', '개인'), ...leaf('supply', '/rank/clan', '클랜')],
      },
      {
        label: `${nameOf('nolink')}랭킹`,
        links: [...leaf('nolink', '/rank/player', '개인'), ...leaf('nolink', '/rank/clan', '클랜')],
      },
      /* 클랜 기록이 없으니 바로 개인랭킹으로 (사장님: «누르면바로 개인랭킹으로») */
      { label: `${nameOf('sanply')}랭킹`, href: '/league/sanply/rank/player' },
    ],
  },
  {
    title: 'Data',
    nodes: [
      {
        label: '경쟁전데이터',
        /* 공식 토너먼트는 ★아직 없는 화면★ 이라 걸지 않는다 (D-106) */
        links: leaf('supply', '/match'),
      },
      {
        label: '일반전데이터',
        links: [...leaf('nolink', '/match'), ...leaf('sanply', '/match')],
      },
    ],
  },
]
  /* ★꼬리가 하나도 없는 갈래는 그리지 않는다★ — 눌러도 빈 칸이 열린다 */
  .map((column) => ({
    ...column,
    nodes: column.nodes.filter((n) => n.href !== undefined || (n.links?.length ?? 0) > 0),
  }))
  /* ★갈래가 하나도 없는 칸도 그리지 않는다★ */
  .filter((column) => column.nodes.length > 0)

/**
 * ★2026-09-16 까지 쓰던 납작한 사이트맵★ — 지우지 않는다 (`CLAUDE.md` 1-4).
 * 리그마다 한 줄씩 늘어서던 판이다. 되돌리려면 이 모양으로 `COLUMNS` 를 되돌린다.
 */
export const HOME_SITEMAP_FLAT_V2 = [
  { title: 'Community', links: ['HOT게시판', '자유게시판', '공지사항'] },
  { title: 'Leagues', links: ['리그마다 한 줄'] },
  { title: 'Operation', links: ['이용약관', '개인정보 취급방침'] },
  { title: 'Users', links: ['리그마다 개인랭킹 · 클랜랭킹'] },
  { title: 'Data', links: ['리그마다 경기데이터'] },
] as const

/** 꼬리 한 줄 */
function Leaf({ link }: { link: SiteLink }) {
  return (
    <Link href={link.href} className="flex items-baseline gap-[6px]">
      <span className="whitespace-nowrap text-[var(--v2-text-dim)] transition-colors duration-100 hover:text-[var(--v2-text-strong)]">
        {link.label}
      </span>
      {link.sub ? (
        <span className="text-[10.5px] text-[var(--v2-text-ghost)] max-md:hidden">{link.sub}</span>
      ) : null}
    </Link>
  )
}

/**
 * ★★사이트맵 — 이제 ★햄버거 서랍★ 이 쓴다★★ (2026-09-19 사장님)
 *
 * > 「햄버거 메뉴 기존거 없애고 밑에걸로 바꿔주고 기존의 밑애 것들은 없애버려」
 *
 * 홈 맨 아래에 있던 C-L-O-U-D 다섯 칸을 ★서랍 안으로 옮겼다.★ 홈 아래에서는 뺐다.
 * ⚠ 그래서 `apps/web/app/_home/` 에서 `packages/ui/src/layout/` 로 ★옮겼다★ —
 *   상단바(`SiteHeaderV2`)는 `packages/ui` 에 있어서 `apps/web` 을 못 가져온다.
 *   파일 이름도 «홈» 을 뗐다 (`HomeSitemap` → `SiteMapNav`).
 */
export function SiteMapNav({ inDrawer = false }: { inDrawer?: boolean }) {
  return (
    <nav
      aria-label="사이트맵"
      className={
        inDrawer
          ? 'w-full px-6 pb-5 pt-4'
          : 'mx-auto mt-[30px] w-full max-w-[940px] border-t border-[var(--v2-head-divider)] pt-[22px]'
      }
    >
      {/* PC — 다섯 칸. 폰 — 칸이 세로로 쌓인다 (접혀 있어 길지 않다) */}
      <div
        className={
          inDrawer
            ? 'flex flex-col gap-[18px]'
            : 'grid grid-cols-5 gap-[26px] max-md:flex max-md:flex-col max-md:gap-[18px]'
        }
      >
        {COLUMNS.map((column) => (
          <div key={column.title} className="flex flex-col gap-[12px]">
            {/* 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D */}
            <div className="text-[14.5px] font-bold text-[var(--v2-text-strong)] max-md:text-[13px]">
              <span className="text-[var(--v2-blue)]">{column.title.charAt(0)}</span>
              {column.title.slice(1)}
            </div>

            <div className="flex flex-col gap-[9px] text-[12.5px] max-md:gap-[7px] max-md:text-[12px]">
              {column.nodes.map((node) =>
                node.href !== undefined ? (
                  /* 접지 않는 갈래 — 바로 간다 */
                  <Leaf key={node.label} link={{ label: node.label, href: node.href }} />
                ) : (
                  /*
                   * 접는 갈래. `<details>` 가 브라우저에서 접고 편다 — JS 가 없다.
                   * `marker` 를 지우고 우리 표시(›)를 직접 그린다 — 기본 삼각형은
                   * 브라우저마다 크기·색이 달라 다섯 칸의 결이 어긋난다.
                   */
                  <details key={node.label} className="group">
                    <summary className="flex cursor-pointer list-none items-baseline gap-[5px] text-[var(--v2-text-dim)] transition-colors duration-100 marker:content-none hover:text-[var(--v2-text-strong)] [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className="text-[10px] text-[var(--v2-text-ghost)] transition-transform duration-100 group-open:rotate-90"
                      >
                        ›
                      </span>
                      <span className="whitespace-nowrap">{node.label}</span>
                    </summary>
                    {/*
                      ⚠ ★2026-09-17 — 접혀 있을 때 ★진짜로★ 없애 준다★ (무한 QA 가 잡았다).
                        크롬은 닫힌 `<details>` 안쪽 글자에도 ★사각형을 준다.★ 그리지는 않는데
                        `getBoundingClientRect()` 는 154x19 를 돌려준다 — 그래서 자동 QA 가
                        «「PL」과 「일반리그」가 겹친다» 고 잡았다. 눈으로는 안 보인다.
                        ★재서 확인했다★ — summary «경쟁리그»(y1250) · 안 보이는 leaf «PL»(y1248).

                        `hidden group-open:flex` 를 주면 닫혔을 때 `display:none` 이라
                        사각형이 0 이 된다. ★펼쳤을 때의 모습은 그대로다.★
                    */}
                    <div className="mt-[7px] hidden flex-col gap-[7px] pl-[13px] group-open:flex">
                      {(node.links ?? []).map((link) => (
                        <Leaf key={link.href} link={link} />
                      ))}
                    </div>
                  </details>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
