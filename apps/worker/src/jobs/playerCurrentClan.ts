/**
 * 선수의 **현재 소속 클랜**을 경기 기록에서 채운다 (D-161 규칙을 IPL 로 넓힌다).
 *
 * ── 왜 필요한가
 *   `LeaguePlayer.clanId` 는 개인랭킹 행의 클랜 칸이다. 3rd.supply 미러 리그는
 *   `supplyRollup` 이 D-161 규칙(**가장 최근 경기에 적힌 클랜**)으로 채워 준다.
 *   그런데 IPL(`nolink`)은 미러가 아니라 병영수첩 원문에서 왔고, 그 경로에는
 *   이 칸을 채우는 코드가 **하나도 없다.**
 *
 *   운영 실측 (2026-09-02): IPL 선수 1,456명 중 clanId 가 있는 사람 **0명**.
 *   그래서 IPL 개인랭킹은 전원 클랜 칸이 비어 있었다. 점수·승패는 멀쩡한데
 *   누가 어느 클랜인지가 안 보인다.
 *
 * ── 규칙은 D-161 그대로다
 *   그 선수의 **가장 늦은 경기**의 `MatchPlayerStat.matchTimeLeagueClanId` 를 쓴다.
 *   경기 당시 소속이 이미 그 칸에 들어 있으므로(IPL 참가행 15,620건 전부 채워져 있다)
 *   새로 판정하지 않는다 — 있는 값을 옮기기만 한다.
 *
 * ── 안 하는 것
 *   - `Player.clanId` 는 건드리지 않는다. D-161 이 그 칸은 `origin='3rd.supply'`
 *     선수만 손대라고 못박아 뒀고, IPL 선수는 병영수첩 출신이다.
 *   - 경기 당시 소속(`matchTime*`)을 다시 판정하지 않는다. 읽기만 한다.
 *   - `season0Apply` 와 다투지 않는다 — 그쪽은 `clanId` 를 **읽어서 그대로 되쓴다**
 *     (`season0Apply.ts` 의 `clanOf`). 그래서 이 잡이 채워 두면 시간당 도는
 *     `season0-apply` 가 그 값을 그대로 유지한다. 순서를 신경 쓸 필요가 없다.
 *
 * ── 결정적이다
 *   같은 DB 에서 몇 번을 돌려도 같은 값이 나온다. 바뀔 값이 없으면 한 줄도 쓰지 않는다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon player-current-clan                    # 미리보기
 * pnpm --filter @sacloud/worker nexon player-current-clan --confirm          # 반영
 * pnpm --filter @sacloud/worker nexon player-current-clan --league supply    # 다른 리그
 * ```
 */
import { prisma } from '@sacloud/db'
/* 「그 경기에서 뛴 팀」을 소속 근거에서 빼는 단일 기준 (2026-09-07 · 1순위 오염 차단) */
import { clanSourceTrusted, affiliationTrustEnabled } from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'

/** 기본 대상. 이 칸을 채우는 경로가 없는 유일한 리그다 */
const DEFAULT_LEAGUE = 'nolink'

export interface PlayerCurrentClanResult {
  league: string
  /** 리그 선수 수 */
  players: number
  /** 손대기 전에 이미 clanId 가 있던 선수 */
  before: number
  /** 경기 기록에서 소속을 찾아낸 선수 */
  resolved: number
  /** 값이 실제로 달라져 쓸 대상 */
  changed: number
  /** 경기가 없거나 경기 당시 소속을 모르는 선수 */
  unknown: number

  /* ── 소속 신뢰 판정 진단 (2026-09-07 · `affiliationTrust.ts`) ────────────
   *   이 잡은 IPL 을 채우려고 만들어졌는데, IPL 참가행은 **전부**
   *   `barracks-battlelog`(= 그 경기에서 뛴 팀)다. 그래서 신뢰 판정을 켜면
   *   **근거가 하나도 남지 않아 쓰기 0건**이 된다. 잡을 지우지 않고
   *   「무엇이 왜 비었는가」를 숫자로 남기는 진단 도구로 유지한다 (사장님 지시). */
  /** 「뛴 팀」이라 근거에서 뺀 **참가행** 수 */
  skippedTeamOnly: number
  /** 「뛴 팀」 행을 하나라도 제외당한 **선수** 수 */
  teamOnlyExcluded: number
  /** 최신 행이 제외됐지만 더 오래된 **신뢰 행**으로 소속을 정한 선수 */
  fallbackToTrustedClan: number
  /** 최신 행이 제외됐고 **신뢰 근거가 하나도 없어** 정하지 못한 선수 */
  noTrustedClan: number
  /** 신뢰 판정이 켜져 있나 (`SACLOUD_AFFILIATION_TRUST=off` 면 false) */
  trustEnabled: boolean
  confirmed: boolean
  /** 클랜별 인원 상위 (미리보기용) */
  top: Array<{ name: string; members: number }>
}

export async function runPlayerCurrentClan(input: {
  league?: string
  confirm: boolean
}): Promise<PlayerCurrentClanResult> {
  const slug = input.league ?? DEFAULT_LEAGUE
  const league = await prisma.league.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${slug}`)

  const members = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { playerId: true, clanId: true },
  })
  const before = members.filter((m) => m.clanId !== null).length

  /* `LeagueClan.id` → `Clan.id`. 참가행이 들고 있는 것은 리그클랜 id 이고,
     `LeaguePlayer.clanId` 가 가리키는 것은 클랜 id 라 한 번 갈아 끼워야 한다 */
  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clanId: true, clan: { select: { name: true } } },
  })
  const clanOfLeagueClan = new Map(leagueClans.map((c) => [c.id, c.clanId]))
  const nameOfClan = new Map(leagueClans.map((c) => [c.clanId, c.clan.name]))

  /* 가장 늦은 경기 한 건씩. `startAt` 내림차순으로 훑으면서 처음 만난 것만 쓴다.
     같은 시각이 겹칠 때를 대비해 `matchId` 를 두 번째 키로 둔다 — 순서가 흔들리면
     돌릴 때마다 답이 달라진다 */
  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      match: { leagueId: league.id },
      matchTimeLeagueClanId: { not: null },
    },
    select: {
      playerId: true,
      matchTimeLeagueClanId: true,
      /* 그 값이 「선수 소속」인지 「뛴 팀」인지 가르는 유일한 근거 (2026-09-07).
         `where` 로 거르지 않고 **읽어서 세면서 건너뛴다** — 무엇이 왜 빠졌는지를
         숫자로 남기기 위해서다. 읽는 행 수는 예전과 똑같다 */
      matchTimeClanSource: true,
      matchId: true,
      match: { select: { startAt: true } },
    },
    orderBy: [{ match: { startAt: 'desc' } }, { matchId: 'desc' }],
  })

  const latest = new Map<string, string>()
  /** 그 선수의 **전체 최신 행**이 「뛴 팀」이라 밀렸는가 (진단용) */
  const newestWasTeamOnly = new Set<string>()
  /** 그 선수의 행을 하나라도 제외했는가 (진단용) */
  const hadTeamOnly = new Set<string>()
  const seenAnyRow = new Set<string>()
  let skippedTeamOnly = 0

  for (const s of stats) {
    const trusted = clanSourceTrusted(s.matchTimeClanSource)

    /* 출처를 가리지 않은 **전체 최신 행**을 먼저 본다 — 진단 전용이다.
       `stats` 가 최신순이라 그 선수를 처음 만나는 행이 곧 전체 최신 행이다 */
    if (!seenAnyRow.has(s.playerId)) {
      seenAnyRow.add(s.playerId)
      if (!trusted) newestWasTeamOnly.add(s.playerId)
    }

    /* 「그 경기에서 뛴 팀」일 뿐인 행은 소속 근거가 아니다. **행을 지우지는 않는다** —
       여기서 건너뛰기만 하면 더 오래된 신뢰 행이 그대로 답이 된다 */
    if (!trusted) {
      skippedTeamOnly += 1
      hadTeamOnly.add(s.playerId)
      continue
    }

    if (latest.has(s.playerId)) continue
    const clanId = clanOfLeagueClan.get(s.matchTimeLeagueClanId as string)
    /* 다른 리그의 리그클랜을 가리키는 참가행이 있으면 건너뛴다 — 만들어 내지 않는다 */
    if (!clanId) continue
    latest.set(s.playerId, clanId)
  }

  let fallbackToTrustedClan = 0
  let noTrustedClan = 0
  for (const playerId of newestWasTeamOnly) {
    if (latest.has(playerId)) fallbackToTrustedClan += 1
    else noTrustedClan += 1
  }

  const writes: Array<{ playerId: string; clanId: string }> = []
  let resolved = 0
  let unknown = 0
  for (const m of members) {
    const found = latest.get(m.playerId)
    if (!found) {
      unknown += 1
      continue
    }
    resolved += 1
    if (m.clanId !== found) writes.push({ playerId: m.playerId, clanId: found })
  }

  const counts = new Map<string, number>()
  for (const [, clanId] of latest) counts.set(clanId, (counts.get(clanId) ?? 0) + 1)
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([clanId, n]) => ({ name: nameOfClan.get(clanId) ?? clanId, members: n }))

  if (input.confirm && writes.length > 0) {
    /* 한 줄씩 쓴다. 1,500명 규모라 배치가 필요 없고, 중간에 끊겨도 다시 돌리면 이어진다 */
    let done = 0
    for (const w of writes) {
      await prisma.leaguePlayer.update({
        where: { leagueId_playerId: { leagueId: league.id, playerId: w.playerId } },
        data: { clanId: w.clanId },
      })
      done += 1
      if (done % 500 === 0) log(`  ${done}/${writes.length}`)
    }
  } else if (writes.length > 0) {
    warn(`--confirm 이 없다. ${writes.length}명은 그대로 둔다`)
  }

  return {
    league: league.name,
    players: members.length,
    before,
    resolved,
    changed: writes.length,
    unknown,
    skippedTeamOnly,
    teamOnlyExcluded: hadTeamOnly.size,
    fallbackToTrustedClan,
    noTrustedClan,
    trustEnabled: affiliationTrustEnabled(),
    confirmed: input.confirm,
    top,
  }
}
