/**
 * ★★참가 기록에 「그 선수 본인의 소속」을 도장 찍는다★★
 * (2026-09-09 · 사장님 «ㅇㅇ 나 로 하고»)
 *
 * ── ★왜 필요한가★
 *   > "용병도 무조건 같은 클랜마크가 달려있는데 이상한거같아. 베리타스 3명
 *   >  아마릴리스 2명 용병인데 5명 다 아마릴리스로 뜨는 그런 상황이 있는거같아"
 *   >   — 사장님, 2026-09-09
 *
 *   배틀로그에는 ★선수 개인의 소속이 아예 없다.★ 팀(`clan_no`)까지만 있다.
 *   그래서 `matchTimeLeagueClanId` 는 `barracks-battlelog` 에서 ★그 경기에서 뛴 팀★ 이고,
 *   한 진영 5명이 전부 같은 값이다 (실측 100%). 용병이 남의 마크를 달고 나온다.
 *
 *   실측 (시즌0 IPL 참가 21,736줄):
 *   ```
 *   지금 소속을 아는 줄        21,068
 *   ★뛴 팀 ≠ 본인 소속 (용병)  1,774줄 (8.4%)★
 *   ```
 *
 * ── ★도장이다. 참조가 아니다★ (사장님이 ㉯를 고르셨다)
 *   화면이 그때그때 「지금 소속」을 읽으면 ★이적하는 순간 과거 경기가 전부 바뀐다.★
 *   그래서 값을 ★박아 둔다.★ 한 번 찍힌 줄은 ★다시 안 건드린다★ —
 *   이 잡은 `playerClanId IS NULL` 인 줄만 채운다.
 *
 * ── ⚠ ★지난 경기는 「그때 소속」을 알 길이 없다★
 *   병영수첩은 ★지금★ 만 알려 준다. 과거 소속을 주는 곳이 없다.
 *   그래서 이미 치러진 경기(시즌0 시작 ~ 2026-09-09)는
 *   ★2026-09-09 값으로 한 번 찍고 굳힌다.★ 그 뒤 경기는 수집 직후에 찍히므로 정확하다.
 *   ★이 한계를 숨기지 않는다★ — `playerClanStampedAt` 이 언제 찍었는지 말해 준다.
 *
 * ── ★경기 당시 팀(`matchTime*`)은 한 칸도 안 건드린다★
 *   그건 「어느 편에서 뛰었나」이고 이 칸은 「그 사람이 어느 클랜 사람인가」다.
 *   둘 다 필요하다. 하나로 합치지 않는다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon stamp-player-clan               # 미리보기
 * pnpm --filter @sacloud/worker nexon stamp-player-clan --confirm     # 반영
 * pnpm --filter @sacloud/worker nexon stamp-player-clan --all         # 시즌0 밖도
 * ```
 */
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

const DEFAULT_LEAGUES = ['nolink', 'supply', 'sanply'] as const

/** 시즌0 시작 (KST 2026-09-03 07:00) */
const SEASON0_START = new Date('2026-09-02T22:00:00.000Z')

export interface StampPlayerClanResult {
  leagues: string[]
  /** 도장이 없는 참가 줄 */
  pending: number
  /** 그중 지금 소속을 알아서 찍을 수 있는 줄 */
  stampable: number
  /** 실제로 찍은 줄 */
  stamped: number
  /** 찍고 보니 ★뛴 팀과 다른★ 줄 — 용병이다 */
  mercenary: number
  /** 소속을 몰라 못 찍은 줄 — 화면은 옛 방식(팀 마크)으로 둔다 */
  unknown: number
  confirmed: boolean
}

export async function runStampPlayerClan(input: {
  leagues?: string[]
  all?: boolean
  confirm: boolean
}): Promise<StampPlayerClanResult> {
  const leagues = input.leagues?.length ? input.leagues : [...DEFAULT_LEAGUES]
  const since = input.all ? new Date(0) : SEASON0_START

  const counts = await prisma.$queryRaw<
    Array<{ pending: number; stampable: number; mercenary: number }>
  >`
    SELECT COUNT(*)::int AS pending,
           COUNT(lp."clanId")::int AS stampable,
           COUNT(*) FILTER (WHERE lp."clanId" IS NOT NULL
                              AND lp."clanId" IS DISTINCT FROM lc."clanId")::int AS mercenary
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
      LEFT JOIN "LeagueClan" lc ON lc."id" = s."matchTimeLeagueClanId"
      LEFT JOIN "LeaguePlayer" lp
             ON lp."playerId" = s."playerId" AND lp."leagueId" = m."leagueId"
     WHERE l."slug" = ANY(${leagues})
       AND m."supersededAt" IS NULL
       AND m."startAt" >= ${since}
       AND s."playerClanId" IS NULL`

  const head = counts[0] ?? { pending: 0, stampable: 0, mercenary: 0 }
  const result: StampPlayerClanResult = {
    leagues,
    pending: head.pending,
    stampable: head.stampable,
    stamped: 0,
    mercenary: head.mercenary,
    unknown: head.pending - head.stampable,
    confirmed: input.confirm,
  }

  if (input.confirm && head.stampable > 0) {
    /*
     * ★한 번에 쓴다.★ 줄이 2만이라 한 줄씩 돌면 왕복이 2만 번이다.
     * ⚠ `playerClanId IS NULL` 조건이 ★반드시 있어야 한다★ —
     *   이미 찍힌 도장을 덮으면 「안 바뀐다」는 약속이 깨진다.
     */
    const stamped = await prisma.$executeRaw`
      UPDATE "MatchPlayerStat" s
         SET "playerClanId" = lp."clanId",
             "playerClanStampedAt" = NOW()
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "LeaguePlayer" lp ON lp."leagueId" = m."leagueId"
       WHERE m."id" = s."matchId"
         AND lp."playerId" = s."playerId"
         AND l."slug" = ANY(${leagues})
         AND m."supersededAt" IS NULL
         AND m."startAt" >= ${since}
         AND s."playerClanId" IS NULL
         AND lp."clanId" IS NOT NULL`
    result.stamped = stamped
  }

  log(
    `도장 없는 줄 ${result.pending.toLocaleString()} · 찍을 수 있음 ${result.stampable.toLocaleString()} · ` +
      `찍음 ${result.stamped.toLocaleString()} · 용병 ${result.mercenary.toLocaleString()} · ` +
      `소속모름 ${result.unknown.toLocaleString()}${result.confirmed ? '' : ' (미리보기)'}`,
  )
  return result
}
