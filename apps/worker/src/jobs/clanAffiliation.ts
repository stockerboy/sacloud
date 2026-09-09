/**
 * ★★선수의 현재 소속을 「병영수첩 클랜원 명부」로 맞춘다★★
 * (2026-09-09 · 사장님 지시 「1단계부터 가」)
 *
 * ── ★무엇이 달라지나★
 *   옛 잡(`playerCurrentClan`)은 ★「그 경기에서 뛴 팀」★ 을 소속으로 썼다.
 *   용병으로 뛰면 그 팀이 소속으로 박힌다 — 실측 16명이 어긋나 있었다.
 *   이 잡은 ★병영수첩 명부★ 만 본다. 명부에 없으면 ★무소속(구름)★ 이다.
 *
 *   > "어느 클랜에도 소속되어있지 않은 사람은 기본 구름표시 넣어" — 사장님, 2026-09-09
 *
 *   ⚠ ★옛 잡을 지우지 않았다★ (`CLAUDE.md` 1-4). `player-current-clan` 은 그대로 있다.
 *
 * ── ★어떻게 잇나★
 *   ```
 *   BarracksClanMember.strUsn  ←→  Player.sourcePlayerId = 'BRK-<str_usn>'
 *   BarracksClanMember.clanSlug ←→ Clan.slug
 *   ```
 *   ★닉네임으로 잇지 않는다.★ 위장닉이 섞인다 (D-221). 계정(`str_usn`)이 유일한 키다.
 *
 * ── ★세 갈래로 나눠 쓴다★
 *   ```
 *   채움   지금 비어 있는데 명부에 있다        → 명부의 클랜을 넣는다
 *   교정   지금 값과 명부가 다르다             → 명부 쪽으로 고친다
 *   비움   지금 클랜이 있는데 ★그 클랜 명부에도, 다른 어느 명부에도 없다★
 *          → 무소속으로 비운다 (구름)
 *   ```
 *
 *   ⚠ ★비움은 조심해서 한다.★ 이번 관측에서 그 사람의 옛 클랜 명부를 ★실제로 받아 왔을 때만★
 *     비운다. 요청이 실패해서 명부가 안 온 클랜의 사람을 비우면 ★멀쩡한 값이 날아간다.★
 *
 * ── ★경기 당시 소속은 한 칸도 안 건드린다★
 *   `MatchPlayerStat.matchTime*` 은 읽지도 쓰지도 않는다. 지금 소속을 과거에 뿌리면
 *   이적하는 순간 옛 기록이 통째로 바뀐다 (`schema.prisma` 의 경고 그대로).
 *
 * ── 결정적이다
 *   같은 명부·같은 DB 면 몇 번을 돌려도 같은 값이다. 바뀔 값이 없으면 한 줄도 안 쓴다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-affiliation                  # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-affiliation --confirm        # 반영
 * pnpm --filter @sacloud/worker nexon clan-affiliation --league nolink  # 한 리그만
 * pnpm --filter @sacloud/worker nexon clan-affiliation --no-clear       # 비우기는 안 한다
 * ```
 */
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/** 기본 대상 — 사장님: «IPL 이나 SPL 열산 셋 다» */
const DEFAULT_LEAGUES = ['nolink', 'supply', 'sanply'] as const

export interface ClanAffiliationResult {
  leagues: string[]
  /** 기준으로 삼은 명부 관측 시각 */
  observedAt: Date | null
  /** 그 관측에 들어 있던 클랜 수 · 사람 수 */
  rosterClans: number
  rosterPeople: number
  /** 대상 리그의 선수 수 */
  players: number
  /** 계정(str_usn)을 아는 선수 수 — 명부와 이을 수 있는 사람 */
  linkable: number
  /** 새로 채운 사람 */
  filled: number
  /** 값을 고친 사람 */
  corrected: number
  /** 무소속으로 비운 사람 */
  cleared: number
  /** 이미 맞아서 손대지 않은 사람 */
  unchanged: number
  /** 명부에 없어서 무소속으로 남는 사람 (구름) */
  noClan: number
  clearEnabled: boolean
  confirmed: boolean
  /** 고친 예시 (미리보기용) */
  samples: Array<{ nick: string; before: string; after: string }>
}

interface Row {
  leaguePlayerId: string
  nick: string
  usn: string | null
  nowClanId: string | null
  nowClanName: string | null
  rosterClanId: string | null
  rosterClanName: string | null
  /** 지금 소속 클랜의 명부를 이번 관측에서 실제로 받아 왔나 */
  nowClanObserved: boolean
}

export async function runClanAffiliation(input: {
  leagues?: string[]
  clear?: boolean
  confirm: boolean
}): Promise<ClanAffiliationResult> {
  const leagues = input.leagues?.length ? input.leagues : [...DEFAULT_LEAGUES]
  const clearEnabled = input.clear !== false

  /* ★가장 최근 관측 한 벌★ 을 기준으로 삼는다. 옛 관측과 섞지 않는다 */
  const head = await prisma.$queryRaw<Array<{ observedAt: Date | null }>>`
    SELECT MAX("observedAt") AS "observedAt" FROM "BarracksClanMember"`
  const observedAt = head[0]?.observedAt ?? null

  const result: ClanAffiliationResult = {
    leagues,
    observedAt,
    rosterClans: 0,
    rosterPeople: 0,
    players: 0,
    linkable: 0,
    filled: 0,
    corrected: 0,
    cleared: 0,
    unchanged: 0,
    noClan: 0,
    clearEnabled,
    confirmed: input.confirm,
    samples: [],
  }
  if (!observedAt) {
    log('명부가 하나도 없다 — 먼저 `barracks-roster --confirm` 을 돌려라')
    return result
  }

  const stat = await prisma.$queryRaw<Array<{ clans: number; people: number }>>`
    SELECT COUNT(DISTINCT "clanSlug")::int AS clans, COUNT(DISTINCT "strUsn")::int AS people
      FROM "BarracksClanMember" WHERE "observedAt" = ${observedAt}`
  result.rosterClans = stat[0]?.clans ?? 0
  result.rosterPeople = stat[0]?.people ?? 0

  /*
   * 한 방에 읽는다.
   *   `roster`      이번 관측의 명부 (계정 → 우리 Clan)
   *   `observed`    이번 관측에서 명부를 받아 온 클랜들 — ★비우기의 안전장치★
   */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH roster AS (
      SELECT DISTINCT ON (b."strUsn") b."strUsn" AS usn, c."id" AS "clanId", c."name" AS "clanName"
        FROM "BarracksClanMember" b
        JOIN "Clan" c ON c."slug" = b."clanSlug"
       WHERE b."observedAt" = ${observedAt}
       ORDER BY b."strUsn", b."clanSlug"
    ), observed AS (
      SELECT DISTINCT c."id" AS "clanId"
        FROM "BarracksClanMember" b
        JOIN "Clan" c ON c."slug" = b."clanSlug"
       WHERE b."observedAt" = ${observedAt}
    )
    SELECT lp."id" AS "leaguePlayerId",
           p."name" AS nick,
           CASE WHEN p."sourcePlayerId" LIKE 'BRK-%'
                THEN substring(p."sourcePlayerId" from 5) END AS usn,
           lp."clanId" AS "nowClanId",
           nc."name" AS "nowClanName",
           r."clanId" AS "rosterClanId",
           r."clanName" AS "rosterClanName",
           (lp."clanId" IS NOT NULL AND EXISTS (
              SELECT 1 FROM observed o WHERE o."clanId" = lp."clanId")) AS "nowClanObserved"
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
      LEFT JOIN "Clan" nc ON nc."id" = lp."clanId"
      LEFT JOIN roster r ON r.usn = CASE WHEN p."sourcePlayerId" LIKE 'BRK-%'
                                         THEN substring(p."sourcePlayerId" from 5) END
     WHERE l."slug" = ANY(${leagues})`

  result.players = rows.length

  const fills: Array<{ id: string; clanId: string }> = []
  const clears: string[] = []

  for (const row of rows) {
    if (row.usn) result.linkable += 1

    if (row.rosterClanId) {
      if (row.nowClanId === row.rosterClanId) {
        result.unchanged += 1
        continue
      }
      if (row.nowClanId === null) result.filled += 1
      else {
        result.corrected += 1
        if (result.samples.length < 15)
          result.samples.push({
            nick: row.nick,
            before: row.nowClanName ?? '(없음)',
            after: row.rosterClanName ?? '(?)',
          })
      }
      fills.push({ id: row.leaguePlayerId, clanId: row.rosterClanId })
      continue
    }

    /* 명부에 없다 */
    if (row.nowClanId === null) {
      result.noClan += 1
      continue
    }
    /*
     * ★비우기에는 조건이 둘이다★ (2026-09-09 실측에서 하나가 빠져 7,441명을 비울 뻔했다).
     *
     *   ① 그 사람의 계정(`str_usn`)을 안다 — ★모르면 명부에 있는지 없는지 판정 자체가 불가능하다★
     *   ② 그 사람의 지금 클랜 명부를 이번에 실제로 받아 왔다
     *
     * ①이 빠지면 «명부에 없다» 와 «찾아볼 수가 없다» 가 같은 뜻이 되어
     * ★멀쩡한 소속이 통째로 날아간다.★ 30,410명 중 계정을 아는 사람은 3,424명뿐이다.
     */
    if (clearEnabled && row.usn !== null && row.nowClanObserved) {
      result.cleared += 1
      clears.push(row.leaguePlayerId)
      if (result.samples.length < 15)
        result.samples.push({
          nick: row.nick,
          before: row.nowClanName ?? '(없음)',
          after: '무소속(구름)',
        })
      continue
    }
    result.unchanged += 1
  }

  if (input.confirm) {
    /* 같은 클랜으로 가는 사람끼리 묶어 한 번에 쓴다 */
    const byClan = new Map<string, string[]>()
    for (const f of fills) {
      const list = byClan.get(f.clanId)
      if (list) list.push(f.id)
      else byClan.set(f.clanId, [f.id])
    }
    for (const [clanId, ids] of byClan) {
      for (let i = 0; i < ids.length; i += 500) {
        await prisma.leaguePlayer.updateMany({
          where: { id: { in: ids.slice(i, i + 500) } },
          data: { clanId },
        })
      }
    }
    for (let i = 0; i < clears.length; i += 500) {
      await prisma.leaguePlayer.updateMany({
        where: { id: { in: clears.slice(i, i + 500) } },
        data: { clanId: null },
      })
    }
  }

  log(
    `선수 ${result.players}명 · 계정앎 ${result.linkable} · ` +
      `채움 ${result.filled} · 교정 ${result.corrected} · 비움 ${result.cleared} · ` +
      `그대로 ${result.unchanged} · 무소속 ${result.noClan}` +
      `${result.confirmed ? '' : ' (미리보기)'}`,
  )
  return result
}
