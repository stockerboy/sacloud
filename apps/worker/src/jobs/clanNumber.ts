/**
 * 병영수첩 **클랜 번호**를 우리 클랜에 이어 붙인다 (D-200).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-number            # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-number --confirm  # 실제 저장
 * ```
 *
 * ── 왜 필요한가
 *   배틀로그를 부르려면 `경기키 + 그 경기에 뛴 클랜의 번호` 가 있어야 한다.
 *   클랜 번호는 병영수첩만 아는 값이라 우리 `Clan.slug` 로는 못 부른다.
 *
 * ── 어떻게 잇나 — **참가 선수로 맞춘다**
 *   이미 받은 배틀로그에는 `teamList`(팀번호 → 클랜번호)와 선수들의 팀번호가 있다.
 *   그 선수들이 우리 DB 에서 그 경기의 어느 진영이었는지 보면 짝이 정해진다.
 *
 *   ```
 *   teamList: team 0 → clan_no A
 *   team 0 선수들이 우리 DB 에서 red 였다  →  A = 그 경기의 red 클랜
 *   ```
 *
 * ── 확신이 없으면 잇지 않는다
 *   같은 클랜 번호가 여러 클랜을 가리키면(응답이 어긋났거나 선수가 이적했거나)
 *   **8할 이상 한쪽으로 몰릴 때만** 잇는다. 다수결로 억지로 밀어 넣지 않는다 (D-106).
 */
import { prisma } from '@sacloud/db'

/** 이 비율 미만이면 잇지 않는다 */
const AGREEMENT = 0.8

interface Ev {
  str_usn?: string
  team_no?: string
  target_team_no?: string
  user_nexon_sn?: number
  target_user_nexon_sn?: number
}

interface Raw {
  battleLog?: Ev[]
  teamList?: { team_no?: string; clan_no?: string }[]
}

const rawOf = (payload: unknown): Raw => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  return (typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload) as Raw
}

export interface ClanNumberResult {
  responses: number
  /** 응답에서 본 클랜 번호 (짝을 못 지은 것 포함) */
  seen: number
  /** 참가 선수로 짝을 지은 번호 */
  matched: number
  /** 그중 8할 이상 일치해 실제로 이은 것 */
  linked: number
  written: boolean
}

export async function linkClanNumbers(input: { confirm: boolean }): Promise<ClanNumberResult> {
  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, payload: true },
  })

  const seen = new Set<string>()
  /** clanNo → 우리 clanId → 표 */
  const votes = new Map<string, Map<string, number>>()

  /* 경기키 → 우리 경기의 양 진영 클랜 */
  const keys = [...new Set(rows.map((row) => row.matchKey))]
  const sides = new Map<string, { red: string; blue: string }>()
  for (let i = 0; i < keys.length; i += 400) {
    const matches = await prisma.match.findMany({
      where: { sourceMatchId: { in: keys.slice(i, i + 400) } },
      select: { sourceMatchId: true, redLeagueClanId: true, blueLeagueClanId: true },
    })
    for (const match of matches) {
      if (match.sourceMatchId) {
        sides.set(match.sourceMatchId, {
          red: match.redLeagueClanId,
          blue: match.blueLeagueClanId,
        })
      }
    }
  }
  const leagueClanIds = [...new Set([...sides.values()].flatMap((s) => [s.red, s.blue]))]
  const clanOf = new Map<string, string>()
  for (let i = 0; i < leagueClanIds.length; i += 400) {
    for (const row of await prisma.leagueClan.findMany({
      where: { id: { in: leagueClanIds.slice(i, i + 400) } },
      select: { id: true, clanId: true },
    })) {
      clanOf.set(row.id, row.clanId)
    }
  }

  for (const row of rows) {
    const raw = rawOf(row.payload)
    for (const team of raw.teamList ?? []) if (team.clan_no) seen.add(String(team.clan_no))

    const side = sides.get(row.matchKey)
    if (!side || (raw.teamList ?? []).length !== 2) continue

    const stats = await prisma.matchPlayerStat.findMany({
      where: { match: { sourceMatchId: row.matchKey } },
      select: { side: true, player: { select: { sourcePlayerId: true } } },
    })
    const sideOfAccount = new Map<string, string>()
    for (const stat of stats) {
      if (stat.player?.sourcePlayerId) sideOfAccount.set(stat.player.sourcePlayerId, stat.side)
    }
    if (sideOfAccount.size === 0) continue

    /* 팀번호마다 그 팀 선수들의 진영을 센다 */
    const sideVotes = new Map<string, Map<string, number>>()
    const put = (team: unknown, account: unknown) => {
      if (typeof team !== 'string' || account === undefined || account === null) return
      const found = sideOfAccount.get(String(account))
      if (!found) return
      const inner = sideVotes.get(team) ?? new Map<string, number>()
      inner.set(found, (inner.get(found) ?? 0) + 1)
      sideVotes.set(team, inner)
    }
    for (const event of raw.battleLog ?? []) {
      put(event.team_no, event.user_nexon_sn)
      put(event.target_team_no, event.target_user_nexon_sn)
    }

    for (const team of raw.teamList ?? []) {
      if (!team.team_no || !team.clan_no) continue
      const inner = sideVotes.get(String(team.team_no))
      if (!inner) continue
      const best = [...inner.entries()].sort((a, b) => b[1] - a[1])[0]
      if (!best) continue
      const clanId = clanOf.get(best[0] === 'red' ? side.red : side.blue)
      if (!clanId) continue
      const bucket = votes.get(String(team.clan_no)) ?? new Map<string, number>()
      bucket.set(clanId, (bucket.get(clanId) ?? 0) + 1)
      votes.set(String(team.clan_no), bucket)
    }
  }

  const result: ClanNumberResult = {
    responses: rows.length,
    seen: seen.size,
    matched: votes.size,
    linked: 0,
    written: false,
  }

  const decided: { clanNo: string; clanId: string; votes: number }[] = []
  for (const [clanNo, bucket] of votes) {
    const sorted = [...bucket.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted[0]
    if (!top) continue
    const total = sorted.reduce((sum, [, count]) => sum + count, 0)
    /* 한쪽으로 몰리지 않으면 잇지 않는다 */
    if (top[1] / total < AGREEMENT) continue
    decided.push({ clanNo, clanId: top[0], votes: top[1] })
  }
  result.linked = decided.length

  if (!input.confirm) return result

  for (const row of decided) {
    await prisma.barracksClanNumber.upsert({
      where: { clanNo: row.clanNo },
      update: { clanId: row.clanId, votes: row.votes, source: 'roster' },
      create: { clanNo: row.clanNo, clanId: row.clanId, votes: row.votes, source: 'roster' },
    })
  }
  result.written = true
  return result
}
