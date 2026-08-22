/**
 * 공개 Beta Season 부트스트랩 (Phase 12).
 *
 * ── 왜 같은 리그 안에서 여는가
 *   Beta를 `supply` 리그의 시즌으로 열면 **클랜·부리그·별칭·로스터가 그대로 따라온다.**
 *   복사하지 않으니 복사 과정에서 어긋날 일도 없다. 사용자에게 보이는 시즌 흐름도
 *   `Season 1 … Season 7 → Beta Season → Season 8` 하나로 이어진다 (D-098).
 *
 * ── 승계하는 것 / 하지 않는 것
 *   승계   클랜 identity · slug · 별칭 · 1부/2부 division · active · 로스터(joinedAt 포함)
 *   초기화 rating · 승패 · 킬데스 · MVP · 배치고사 — 전원 같은 baseline에서 시작한다
 *
 *   Season 7의 경쟁 기록은 가져오지 않는다. `closeSeason`이 그 시점 상태를 시즌 카드로
 *   굳혀 두고, `startSeason`이 전원을 baseline으로 되돌린다 (D-101).
 *
 * ── 승강을 적용하지 않는다
 *   우리 DB의 Season 7 클랜은 전부 `placement=true`(배치고사)이고 rating이 기본값이다.
 *   그 값으로 1부 최하위 ↔ 2부 1위를 바꾸면 **없는 성적으로 부리그를 흔드는 것**이다.
 *   그래서 `skipPromotion`으로 연다. 실제 승강은 Beta가 끝날 때 실제 성적으로 한다.
 */
import { prisma } from '@sacloud/db'
import { closeSeason, previewSeasonStart, startSeason, seasonLabel, SEASON_BASELINE } from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'

/** 2026-08-20 00:00:00 KST = 2026-08-19T15:00:00Z */
export const BETA_DATA_START = new Date('2026-08-20T00:00:00+09:00')

export interface BetaBootstrapResult {
  ok: boolean
  reason: string
  closedSeason: number | null
  betaSeasonId: string | null
  betaNumber: number | null
  startedAtIso: string | null
  startedAtKst: string | null
  clans: { division: number; name: string; slug: string }[]
  rosterMemberships: number
  players: number
}

function toKst(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')
}

export async function bootstrapBeta(input: {
  leagueSlug: string
  startedAt?: Date
  dryRun?: boolean
}): Promise<BetaBootstrapResult> {
  const startedAt = input.startedAt ?? BETA_DATA_START
  const empty: BetaBootstrapResult = {
    ok: false,
    reason: '',
    closedSeason: null,
    betaSeasonId: null,
    betaNumber: null,
    startedAtIso: null,
    startedAtKst: null,
    clans: [],
    rosterMemberships: 0,
    players: 0,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, name: true, divisionCount: true },
  })
  if (!league) return { ...empty, reason: `리그를 찾을 수 없다: ${input.leagueSlug}` }

  /* 이미 베타가 열려 있으면 다시 열지 않는다 (두 번 실행해도 안전해야 한다) */
  const existingBeta = await prisma.season.findFirst({
    where: { leagueId: league.id, seasonType: 'beta', status: 'active' },
    select: { id: true, number: true, startedAt: true },
  })
  if (existingBeta) {
    const [clans, roster, players] = await Promise.all([
      prisma.leagueClan.findMany({
        where: { leagueId: league.id },
        select: { division: true, clan: { select: { name: true, slug: true } } },
        orderBy: [{ division: 'asc' }],
      }),
      prisma.leagueRosterMembership.count({ where: { leagueId: league.id } }),
      prisma.leaguePlayer.count({ where: { leagueId: league.id } }),
    ])
    return {
      ok: true,
      reason: '이미 열려 있는 베타 시즌을 그대로 쓴다',
      closedSeason: null,
      betaSeasonId: existingBeta.id,
      betaNumber: existingBeta.number,
      startedAtIso: existingBeta.startedAt.toISOString(),
      startedAtKst: toKst(existingBeta.startedAt),
      clans: clans.map((row) => ({
        division: row.division,
        name: row.clan.name,
        slug: row.clan.slug,
      })),
      rosterMemberships: roster,
      players,
    }
  }

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    select: { number: true, seasonType: true },
  })

  if (input.dryRun) {
    const preview = await previewSeasonStart(input.leagueSlug)
    log(
      `[dry-run] ${league.name} — 활성 시즌 ${active?.number ?? '없음'} 종료 후 ` +
        `Beta Season 시작 예정 (baseline ${SEASON_BASELINE})`,
    )
    log(`[dry-run] 데이터 시작 시각 ${toKst(startedAt)} (UTC ${startedAt.toISOString()})`)
    return { ...empty, ok: true, reason: `미리보기 — ${preview.reason || '실행 가능'}` }
  }

  /* 1) 현재 시즌을 닫는다 — 그 시점 상태가 시즌 카드로 굳는다 */
  let closedSeason: number | null = null
  if (active) {
    const closed = await closeSeason({ leagueSlug: input.leagueSlug })
    if (!closed.ok) return { ...empty, reason: `시즌을 닫지 못했다: ${closed.reason}` }
    closedSeason = closed.season
    log(`시즌 ${closed.season} 종료 — 클랜 카드 ${closed.clanRows} · 개인 카드 ${closed.playerRows}`)
  }

  /* 2) Beta 시작 — 번호 0 · 전원 baseline · 승강 없음 */
  const started = await startSeason({
    leagueSlug: input.leagueSlug,
    seasonType: 'beta',
    startedAt,
    skipPromotion: true,
  })
  if (!started.ok) return { ...empty, reason: `베타를 시작하지 못했다: ${started.reason}` }

  const beta = await prisma.season.findFirst({
    where: { leagueId: league.id, seasonType: 'beta', status: 'active' },
    select: { id: true, number: true, startedAt: true, seasonType: true },
  })
  if (!beta) return { ...empty, reason: '베타 시즌을 만들었는데 다시 읽지 못했다' }

  /* 3) 시작 시각이 9시간 밀리지 않았는지 확인한다 (정책 6장) */
  if (beta.startedAt.getTime() !== startedAt.getTime()) {
    warn(
      `시작 시각이 어긋났다 — 기대 ${startedAt.toISOString()} / 실제 ${beta.startedAt.toISOString()}`,
    )
  }

  const [clans, roster, players] = await Promise.all([
    prisma.leagueClan.findMany({
      where: { leagueId: league.id },
      select: { division: true, clan: { select: { name: true, slug: true } } },
      orderBy: [{ division: 'asc' }],
    }),
    prisma.leagueRosterMembership.count({ where: { leagueId: league.id } }),
    prisma.leaguePlayer.count({ where: { leagueId: league.id } }),
  ])

  log(
    `${seasonLabel(beta)} 시작 — ${toKst(beta.startedAt)} · 클랜 ${clans.length} · 로스터 ${roster}`,
  )

  return {
    ok: true,
    reason: '',
    closedSeason,
    betaSeasonId: beta.id,
    betaNumber: beta.number,
    startedAtIso: beta.startedAt.toISOString(),
    startedAtKst: toKst(beta.startedAt),
    clans: clans.map((row) => ({
      division: row.division,
      name: row.clan.name,
      slug: row.clan.slug,
    })),
    rosterMemberships: roster,
    players,
  }
}
