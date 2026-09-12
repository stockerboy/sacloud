'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LeagueClan } from '@sacloud/contract'
import { leagueScreen, showsTier } from '@sacloud/contract'
import type { ClanRankTableRow } from '@sacloud/ui'
import { ClanMark, ClanRankTable, ClanSearchBox, EmptyState, RankBox, RankHeader, leagueClanPath, type ClanRankNote } from '@sacloud/ui'
import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { rankClans } from '@/lib/clanRanking'
import { ClanDirectoryV1 } from './ClanDirectoryV1'

/**
 * ★클랜랭킹★ — `/league/{slug}/rank/clan` (2026-09-10 사장님 지시).
 *
 * > «여유되면 클랜랭킹까지 매기고 ★지금 클랜랭킹페이지에 클랜들이 그냥 나열만 돼있음★»
 *
 * ── 무엇이 바뀌었나
 *   ```
 *   전(D-260)  「고용가능 클랜」 — 순위 없음 · 이름 가나다순 · 안내문 «순위가 아니라 이름순입니다»
 *   지금       ★클랜랭킹★ — 순위 1,2,3… · 래더 내림차순 · 티어 구분선 · 검색창은 그대로
 *   ```
 *   2026-09-02 지시로 순위를 뺐던 것을 ★사장님이 오늘 뒤집으셨다.★
 *
 * ── ★값을 없애지 않았다★ (`CLAUDE.md` 2장 1·2번)
 *   승률 · N승N패 · 래더 · 클랜마크 전부 예전 그대로다. ★순위 칸이 도로 붙었을 뿐이다.★
 *   클랜 이름 앞 마크는 `ClanRankTable` 이 언제나 그린다 (사장님 상시 지시, 2026-09-10).
 *
 * ── 데이터 출처는 ★안 바꿨다★
 *   랭킹 API(`leagueRankClans`)가 아니라 참가 클랜 API(`leagueClans`)를 그대로 쓴다.
 *   랭킹 질의는 `placement: false` 로 걸러서 실측(2026-09-02) SPL 63곳 중 19곳,
 *   IPL 43곳 중 4곳이 ★통째로 빠진다.★ 목록은 다 받고 ★순위는 화면에서 세운다★ —
 *   규칙은 `@/lib/clanRanking` 한 곳에 있고 서버(`queries/leagues.ts`)의 정렬과 같은 것이다.
 *   계약(`packages/contract`)도 API 도 한 줄 안 건드렸다.
 *
 * ── 검색은 ★그대로 둔다★ (사장님이 2026-09-02 에 요구한 기능이다)
 *   목록이 이미 브라우저에 다 들어와 있어 치는 대로 걸러진다. 서버에 묻지 않는다.
 *   ★거른 뒤에 번호를 다시 매기지 않는다★ — 검색해도 그 클랜의 진짜 순위가 보인다.
 *
 * ── 되돌리는 법
 *   아래 `RANKED` 를 `false` 로 두면 옛 이름순 화면(`ClanDirectoryV1.tsx`)이 그대로 돌아온다.
 */

/**
 * ★새 화면(순위표)을 쓸 것인가.★ `false` 면 D-260 의 이름순 목록으로 돌아간다 (`CLAUDE.md` 1-4).
 * 타입을 `boolean` 으로 넓혀 둔 이유는 리터럴로 좁히면 옛 가지가 «닿을 수 없는 코드» 가 되기 때문이다.
 */
const RANKED: boolean = true

/**
 * ★SPL 참가 · 전환 안내★ (2026-09-12 사장님) — 사장님이 «이 내용은 SPL 클랜랭킹파트에»
 * 라고 자리를 지정하셨다. 글은 사장님이 쓰신 것을 다듬기만 했다.
 */
const SPL_NOTES: readonly { title: string; lines: readonly string[] }[] = [
  {
    title: 'SPL → IPL 전환 안내',
    lines: [
      'SPL은 플레이어 수가 적고 미활동 클랜이 대부분이라, SPL 리그 중 IPL 전환 참가 클랜을 받습니다.',
      '전환 비용은 CLOUD 0 시즌(9/3~10/1) 동안만 무료입니다.',
      'IPL 참가와 SPL 참가를 겸할 수 없습니다.',
      'SPL 클랜 중 10월 1일까지 활동이 없는 클랜은 일괄 삭제됩니다.',
      'IPL 전환 비율이 일정 수를 넘으면 SPL 리그는 폐지됩니다. 신중히 선택해 주세요.',
      '클린한 게임과 클랜원 5인 체제로 말 맞추는 무소속 퀵매치 참가를 강력히 권합니다.',
    ],
  },
  {
    title: '리그 참가 신청',
    lines: [
      'CLOUD 1 시즌에 참가할 IPL 리그 참가 클랜을 CLOUD 0 시즌 동안 모집합니다.',
      '이 기간에는 SPL → IPL 전환 클랜을 제외한 신규 참가 클랜에 5만원의 등록 비용이 발생합니다.',
      '정규 시즌 시작은 10월 1일입니다. 그 이후의 리그 신청은 유료입니다.',
    ],
  },
]

export function ClanDirectory({
  leagueSlug,
  /**
   * ★서버가 미리 알려 준 리그 구분★ (2026-09-10). 없으면 예전 그대로 브라우저가 물어본다.
   * 이게 없으면 첫 그림에서 티어 이름이 `1티어` 로 잠깐 나왔다가 `ASTRA` 로 바뀐다 —
   * 까닭은 `prefetchClanRank.ts` 끝의 주석에 적어 뒀다.
   */
  leagueCategory,
}: {
  leagueSlug: string
  leagueCategory?: string | null
}) {
  if (!RANKED) return <ClanDirectoryV1 leagueSlug={leagueSlug} />
  return <ClanRankDirectory leagueSlug={leagueSlug} leagueCategory={leagueCategory} />
}

function ClanRankDirectory({
  leagueSlug,
  leagueCategory,
}: {
  leagueSlug: string
  leagueCategory?: string | null
}) {
  const [query, setQuery] = useState('')
  const ready = useApiReady()

  /* 티어 이름(`ASTRA` · `CHALLENGER1` · `CHALLENGER2`)은 리그 구분(`independent`)을 봐야 나온다.
     이름은 `divisionLabel` 이 만든다 — ★여기서 티어 이름을 지어내지 않는다★ */
  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })
  /* 브라우저가 받은 답이 먼저다. 아직 없으면 ★서버가 건네준 값★ 을 쓴다 */
  const category = league.data?.data.category ?? leagueCategory ?? undefined

  /* 한 번에 다 받는다. 400 은 라우트의 상한과 같은 값이다 —
     넘치면 아래 `useEffect` 가 커서를 따라 이어 받는다 */
  const clans = useCursorQuery<LeagueClan>(
    'leagueClans',
    ['league', leagueSlug, 'clans', 'directory'],
    { params: { leagueSlug }, search: { size: 400 } },
  )

  /* 남은 쪽을 자동으로 이어 받는다.
     ★순위를 세우려면 전체가 손에 있어야 한다★ — 반쯤 받은 목록의 1위는 1위가 아니다 */
  const { hasMore, loadingMore, loadMore } = clans
  useEffect(() => {
    if (hasMore && !loadingMore) loadMore()
  }, [hasMore, loadingMore, loadMore])

  const complete = !clans.loading && !hasMore

  /* 티어를 쓰는 리그(IPL)만 티어 축으로 세운다. ★리그 slug 를 여기서 비교하지 않는다★ —
     규칙은 계약의 `showsTier` 한 곳이다 (D-204) */
  const byTier = showsTier(leagueSlug)

  /* 줄 세우기 + 번호 붙이기. 규칙은 `@/lib/clanRanking` 한 곳에 있다 */
  const ranked = useMemo(() => rankClans(clans.items, { byTier }), [clans.items, byTier])

  /* ★검색은 순위를 매긴 뒤에 거른다.★ 걸러 놓고 번호를 매기면 3위가 1위로 보인다 */
  const filtered = useMemo(() => ranked.filter(matches(query)), [ranked, query])

  /**
   * ★승격유력 · 강등위기★ (2026-09-11 사장님)
   *   구간마다 1·2등 → 승격유력 · 꼴찌 두 팀 → 강등위기.
   *   맨 위 구간(ASTRA)은 올라갈 곳이 없어 승격 표시를 안 하고,
   *   맨 아래 구간은 내려갈 곳이 없어 강등 표시를 안 한다.
   *   ★순위가 없는(배치 중) 클랜은 세지 않는다★ — 뛴 적이 없으니 꼴찌가 아니다.
   */
  const noteOf = useMemo(() => {
    const byTier = new Map<number, number>()
    for (const r of ranked) {
      if (r.rank === null) continue
      byTier.set(r.division, Math.max(byTier.get(r.division) ?? 0, r.rank))
    }
    const top = Math.min(...[...byTier.keys()], Number.POSITIVE_INFINITY)
    const bottom = Math.max(...[...byTier.keys()], Number.NEGATIVE_INFINITY)
    return (division: number, rank: number | null): ClanRankNote => {
      if (rank === null || !byTier.has(division)) return null
      const size = byTier.get(division) as number
      if (rank <= 2 && division !== top && size > 4) return 'promote'
      if (rank > size - 2 && division !== bottom && size > 4) return 'relegate'
      return null
    }
  }, [ranked])

  const rows: ClanRankTableRow[] = useMemo(
    () =>
      filtered.map((row) => ({
        rank: row.rank,
        note: noteOf(row.division, row.rank),
        league_clan_id: row.id,
        clan: row.clan,
        division: row.division,
        /* ★내 구간에서의 승률★ (2026-09-11 사장님) — 같은 티어 상대와 붙은 판만.
           같은 티어 경기가 아직 없으면 통합으로 떨어진다 (빈 칸을 만들지 않는다) */
        win: row.tier_win_rate === null ? row.win : row.tier_win,
        lose: row.tier_win_rate === null ? row.lose : row.tier_lose,
        win_rate: row.tier_win_rate ?? row.win_rate,
        rating: row.rating,
      })),
    [filtered, noteOf],
  )

  /* 어떤 칸을 보여 줄지는 화면이 아니라 `leagueScreen()` 한 곳이 정한다.
     ★순위 칸을 내리던 `rank: false` 를 걷어냈다★ — 그게 이번 지시의 알맹이다 */
  const columns = leagueScreen(leagueSlug).clanColumns
  /**
   * ★클랜랭킹을 안 하는 리그★ (2026-09-12 사장님: «SPL은 클랜 랭킹이 없다 (…) 공지하라»).
   * 순위표 대신 공지 · 참가 안내 · 클랜 목록을 그린다.
   */
  const notice = leagueScreen(leagueSlug).clanRankNotice

  /**
   * ★번호 없이 무작위로 늘어놓는다★ (2026-09-12 사장님:
   * «그냥 내가 지우라고 한 클랜을 제외한 클랜들을 무작위로 나열해 번호 붙이지 말고»).
   *
   * ⚠ `Math.random()` 을 쓰면 안 된다 — 서버가 그린 차례와 브라우저가 그린 차례가 달라
   *   화면이 한 번 튄다(hydration mismatch). 그래서 ★클랜 id 를 섞은 값★ 으로 줄 세운다.
   *   사람 눈에는 무작위이고 두 곳에서 늘 같은 차례가 나온다.
   *
   * 감춘 클랜(사장님이 지우라고 하신 셋)은 목록을 만드는 질의에서 이미 빠져 있다
   * (계약의 `CLAN_HIDDEN_IN_LEAGUE`).
   */
  const scattered = useMemo(() => {
    const keyOf = (id: string) => {
      let h = 2166136261
      for (let i = 0; i < id.length; i += 1) {
        h ^= id.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
      return h >>> 0
    }
    return [...ranked].sort((a, b) => keyOf(a.clan.id) - keyOf(b.clan.id))
  }, [ranked])

  if (notice !== null) {
    return (
      <div className="pc-container">
        <div className="pb-[var(--section-gap)] max-md:pb-8">
          <div
            className="mx-auto mt-[30px] w-full max-w-[900px] px-[22px] py-[24px] text-center"
            style={{
              borderRadius: 10,
              border: '1px solid var(--v2-card-border)',
              background: 'var(--v2-card)',
            }}
          >
            <p className="text-[14px] font-bold leading-[1.7] text-[var(--v2-text-strong)]">{notice}</p>
            <p className="mt-[10px] text-[12px] leading-[1.7] text-[var(--v2-text-faint)]">
              개인랭킹과 경기 기록은 그대로 제공됩니다.
            </p>
          </div>

          {/* ★리그 참가 · 전환 안내★ — 사장님 지시로 이 자리에 붙인다 (2026-09-12) */}
          <div className="mx-auto mt-[14px] w-full max-w-[900px]">
            {SPL_NOTES.map((block) => (
              <div
                key={block.title}
                className="mb-[10px] px-[18px] py-[15px]"
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--v2-card-border)',
                  background: 'var(--v2-card)',
                }}
              >
                <p className="mb-[7px] text-[13px] font-bold text-[#9cc0ff]">{block.title}</p>
                {block.lines.map((line) => (
                  <p
                    key={line}
                    className="mb-[5px] pl-[13px] text-[12.5px] leading-[1.85] text-[var(--v2-text-muted)]"
                    style={{ textIndent: '-13px' }}
                  >
                    · {line}
                  </p>
                ))}
              </div>
            ))}
          </div>

          {/* ★참가 클랜 — 번호 없이 무작위★ (2026-09-12 사장님) */}
          <div className="mx-auto mt-[14px] w-full max-w-[900px]">
            <div className="mb-[8px] flex items-baseline gap-[8px] px-[2px]">
              <span className="text-[10.5px] font-bold tracking-[.14em] text-[var(--v2-text-ghost)]">
                참가 클랜
              </span>
              {complete ? (
                <span className="text-[10.5px] text-[var(--v2-text-ghost)]">{scattered.length}곳 · 순서 없음</span>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-[7px]">
              {scattered.map((row) => (
                <li key={row.clan.id}>
                  <Link
                    href={leagueClanPath(leagueSlug, row.clan.slug)}
                    className="flex items-center gap-[7px] px-[10px] py-[7px]"
                    style={{
                      borderRadius: 999,
                      border: '1px solid var(--v2-card-border)',
                      background: 'var(--v2-card)',
                    }}
                  >
                    <span className="flex h-[20px] w-[20px] items-center justify-center">
                      <ClanMark clan={row.clan} alt={row.clan.name} />
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--v2-text)]">
                      {row.clan.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  const searching = query.trim().length > 0

  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다 — `.mobile-bleed`(표)가 화면 끝까지 가도록 */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="클랜랭킹"
          notice={
            byTier
              ? '티어 안에서 래더가 높은 순입니다. 승률은 같은 티어끼리 붙은 판만 셉니다. 높은 티어와 게임에서 승리시 더 큰 점수를 받습니다.'
              : '래더가 높은 순입니다. 높은 티어와 게임에서 승리시 더 큰 점수를 받습니다.'
          }
        />
        <ClanSearchBox
          value={query}
          onChange={setQuery}
          shown={rows.length}
          /* 다 받기 전에는 개수를 말하지 않는다 — 받다 만 수를 「전부」라고 쓰면 거짓말이다 */
          total={complete ? ranked.length : undefined}
        />
        {searching && complete && rows.length === 0 ? (
          <RankBox>
            <EmptyState message={`'${query.trim()}' 와(과) 맞는 클랜이 없습니다.`} />
          </RankBox>
        ) : (
          <RankBox>
            <ClanRankTable
              leagueSlug={leagueSlug}
              rows={rows}
              /* 다 받을 때까지 뼈대를 보여 준다 — ★반쯤 받은 목록에 붙인 순위는 거짓이다★ */
              loading={clans.loading || hasMore || loadingMore}
              error={clans.error}
              onRetry={clans.retry}
              /* ★티어 구분선★ (사장님 지시). 티어를 안 쓰는 리그에서는 표가 스스로 무시한다
                 (`ClanRankTable` 안의 `showsTier` 확인) — 리그별 분기를 화면에 뿌리지 않는다 */
              groupByDivision
              leagueCategory={category}
              columns={columns}
            />
          </RankBox>
        )}
      </div>
    </div>
  )
}

/**
 * 검색 규칙 — **이름에 들어 있으면 걸린다.** (D-260 에서 그대로 가져왔다)
 *
 * 대소문자와 공백을 무시한다. 슬러그도 같이 본다 — 주소에 쓰이는 이름으로 찾는 사람이 있다.
 * 초성 검색은 **넣지 않았다.** 원본에도 없고, 규칙을 지어내는 일이 된다.
 */
function matches(query: string): (row: { clan: { name: string; slug: string } }) => boolean {
  const needle = normalize(query)
  if (needle === '') return () => true
  return (row) => normalize(row.clan.name).includes(needle) || normalize(row.clan.slug).includes(needle)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}
