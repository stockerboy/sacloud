/**
 * 신원 연결 — **강한 넥슨 식별자**를 기준으로 (D-134가 D-109를 완화한다).
 *
 * ── 무엇이 바뀌었나
 *   예전(D-109)에는 **로스터에 같은 이름이 있어야만** 신원을 연결했다.
 *   그래서 무소속·용병·미등록 클랜 선수는 영원히 `unresolved` 로 남았고,
 *   그 사람이 나중에 공식 클랜에 들어와도 **다른 사람**으로 잡혔다.
 *
 *   이제 로스터는 **신원 생성의 조건이 아니다.**
 *   로스터는 오직 그 경기의 **본클랜원 / 용병 판정**에만 쓴다 (D-079 · D-073).
 *
 * ── 대신 요구하는 것 — 강한 넥슨 식별자
 *   `ouid` 는 넥슨이 직접 준 계정 식별자다. 그런데 닉네임 → ouid 만으로는 부족하다.
 *   실제로 틀린 적이 있다 — `/id` 로 얻은 계정의 매치 목록에 그 경기가 **없었다**(D-051).
 *
 *   그래서 **그 계정이 실제로 뛴 경기가 있어야** 신원으로 인정한다.
 *   `NexonMatchObservation` 은 그 계정 **본인의 매치 목록**에서 나온 기록이라
 *   "이 계정이 이 경기를 뛰었다"는 넥슨 자신의 진술이다.
 *
 * ── 누구와 이을 것인가 — 같은 경기 · 같은 닉네임 (D-132와 같은 근거)
 *   전역 닉네임 매칭은 하지 않는다. 두 출처가 **같은 경기 하나**를 각각 기술한 것을 맞춘다.
 *
 *     넥슨:      계정 O 가 경기 M 을 뛰었다 (본인 매치 목록) · O 의 닉네임은 N
 *     3rd.supply: 선수 P(닉네임 N) 가 경기 M 을 뛰었다 (라인업)
 *     ⇒ O 와 P 는 같은 사람이다
 *
 *   근거가 `minEvidence` 건 이상일 때만 잇는다.
 *
 * ── 짝을 못 찾으면 **새 선수를 만든다** (이것이 완화의 핵심)
 *   기존 선수와 이을 근거가 없으면 그 계정으로 새 `Player` 를 만든다.
 *   무소속·용병도 정상적으로 선수가 되고, 나중에 공식 클랜에 가입해도
 *   **같은 `Player` 행이 그대로 이어진다** (ouid 가 계정을 붙잡고 있다).
 *
 * ── 그래도 하지 않는 것
 *   - 닉네임이 **비슷하다**는 이유로 잇지 않는다 (fuzzy 금지 · D-036 유지)
 *   - 근거 없이 기존 선수에 갖다 붙이지 않는다. 애매하면 새로 만든다
 *   - 이미 다른 계정이 붙어 있는 선수를 빼앗지 않는다 (conflict 로 남긴다)
 *   - 연결 사유를 `linkReason` 에 문장으로 남긴다. 사람이 보고 끊을 수 있어야 한다
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'

export interface IdentityLinkCandidate {
  ouid: string
  userName: string
  /** 이 계정이 실제 경기에서 달고 나온 클랜 이름과 횟수 (참고용 — 판정 조건이 아니다) */
  guildCounts: [string, number][]
  /** 이었거나 만든 선수 */
  playerId: string | null
  verdict: 'link' | 'created' | 'already' | 'no_activity' | 'conflict'
  reason: string
}

export interface IdentityLinkResult {
  considered: number
  /** 기존 선수와 이은 수 */
  linked: number
  /** 새로 만든 선수 수 */
  created: number
  skipped: number
  conflicts: number
  candidates: IdentityLinkCandidate[]
}

/** 3rd.supply 라인업 — 경기별 (닉네임 → 선수 id) */
function loadLineupIndex(path: string | null): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>()
  if (!path) return index
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
    matches: { id: string; red: [number | null, string | null, number, number][]; blue: [number | null, string | null, number, number][] }[]
  }
  for (const match of snapshot.matches) {
    const byNickname = new Map<string, string>()
    let duplicate = false
    for (const [playerId, nickname] of [...match.red, ...match.blue]) {
      if (playerId == null || !nickname) continue
      if (byNickname.has(nickname)) {
        duplicate = true
        break
      }
      byNickname.set(nickname, String(playerId))
    }
    // 한 경기에 같은 닉네임이 둘이면 누가 누군지 모른다. 그 경기는 근거로 쓰지 않는다
    if (!duplicate && byNickname.size > 0) index.set(match.id, byNickname)
  }
  return index
}

export async function linkIdentitiesByEvidence(input: {
  leagueSlug: string
  /** 같은 사람이라는 근거(같은 경기·같은 닉네임) 최소 건수 */
  minEvidence?: number
  /** 3rd.supply 라인업 스냅샷 경로. 없으면 기존 선수와 잇는 근거가 없어 새로 만든다 */
  lineupPath?: string | null
  /** 대상을 좁힌다. 주지 않으면 미해결 신원 전체를 본다 */
  ouids?: readonly string[]
  confirm?: boolean
}): Promise<IdentityLinkResult> {
  const minEvidence = input.minEvidence ?? 1
  const result: IdentityLinkResult = {
    considered: 0,
    linked: 0,
    created: 0,
    skipped: 0,
    conflicts: 0,
    candidates: [],
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  const lineupIndex = loadLineupIndex(input.lineupPath ?? null)

  /* 아직 사람이 정해지지 않은 실제 신원만 본다 (E2E 자리표시자는 건드리지 않는다) */
  const identities = await prisma.nexonIdentity.findMany({
    where: {
      playerId: null,
      status: 'unresolved',
      NOT: { ouid: { startsWith: 'E2E-' } },
      ...(input.ouids?.length ? { ouid: { in: [...input.ouids] } } : {}),
    },
    select: { ouid: true, userName: true },
  })

  /* 이번 실행에서 이미 써 버린 선수 — 두 계정이 한 선수를 가져가지 않게 한다 */
  const claimed = new Set<string>()

  for (const identity of identities) {
    result.considered += 1
    const userName = identity.userName
    if (!userName) {
      result.skipped += 1
      continue
    }

    /* --- 1) 강한 넥슨 식별자: 이 계정이 **실제로 뛴 경기**가 있어야 한다 --- */
    const observations = await prisma.nexonMatchObservation.findMany({
      where: { ouid: identity.ouid },
      select: { nexonMatch: { select: { sourceMatchId: true } } },
    })

    const guildRows = await prisma.nexonMatchParticipant.findMany({
      where: { userName },
      select: { clanName: true },
    })
    const counts = new Map<string, number>()
    for (const row of guildRows) {
      if (row.clanName) counts.set(row.clanName, (counts.get(row.clanName) ?? 0) + 1)
    }
    const guildCounts = [...counts].sort((left, right) => right[1] - left[1])

    const base: IdentityLinkCandidate = {
      ouid: identity.ouid,
      userName,
      guildCounts,
      playerId: null,
      verdict: 'no_activity',
      reason: '',
    }

    if (observations.length === 0) {
      base.reason =
        '이 계정이 뛴 경기를 하나도 확인하지 못했다. 닉네임만으로는 사람을 정하지 않는다 (D-051)'
      result.candidates.push(base)
      result.skipped += 1
      continue
    }

    /* --- 2) 같은 경기·같은 닉네임으로 기존 선수와 잇기 (D-132와 같은 근거) --- */
    const sourceVotes = new Map<string, number>()
    for (const observation of observations) {
      const lineup = lineupIndex.get(observation.nexonMatch.sourceMatchId)
      const sourcePlayerId = lineup?.get(userName)
      if (sourcePlayerId) sourceVotes.set(sourcePlayerId, (sourceVotes.get(sourcePlayerId) ?? 0) + 1)
    }

    const ranked = [...sourceVotes.entries()].sort((left, right) => right[1] - left[1])
    /* 근거가 두 사람을 같은 무게로 가리키면 고르지 않는다 */
    const ambiguous = ranked.length > 1 && ranked[0]![1] === ranked[1]![1]
    const best = !ambiguous && ranked[0] && ranked[0][1] >= minEvidence ? ranked[0] : null

    if (ambiguous) {
      base.verdict = 'conflict'
      base.reason = `근거가 서로 다른 선수를 같은 무게로 가리킨다 (${ranked.slice(0, 2).map(([id, n]) => `${id}×${n}`).join(' ')})`
      result.candidates.push(base)
      result.conflicts += 1
      result.skipped += 1
      continue
    }

    if (best) {
      const [sourcePlayerId, votes] = best
      const player = await prisma.player.findFirst({
        where: { sourcePlayerId },
        select: { id: true, nexonOuid: true },
      })

      if (player) {
        if (player.nexonOuid && player.nexonOuid !== identity.ouid) {
          base.verdict = 'conflict'
          base.playerId = player.id
          base.reason = '그 선수에는 이미 다른 넥슨 계정이 연결돼 있다. 빼앗지 않는다'
          result.candidates.push(base)
          result.conflicts += 1
          result.skipped += 1
          continue
        }
        if (claimed.has(player.id)) {
          base.verdict = 'conflict'
          base.playerId = player.id
          base.reason = '이번 실행에서 다른 계정이 이미 그 선수를 가져갔다'
          result.candidates.push(base)
          result.conflicts += 1
          result.skipped += 1
          continue
        }

        base.verdict = 'link'
        base.playerId = player.id
        base.reason = `같은 경기·같은 닉네임 근거 ${votes}건 (3rd.supply 선수 ${sourcePlayerId})`
        claimed.add(player.id)

        if (input.confirm) {
          await prisma.nexonIdentity.update({
            where: { ouid: identity.ouid },
            data: {
              playerId: player.id,
              status: 'active',
              linkReason: `근거 기반 연결 — ${base.reason}`,
            },
          })
          await prisma.player.update({
            where: { id: player.id },
            data: { nexonOuid: identity.ouid },
          })
          result.linked += 1
          log(`연결: ${userName} → ${player.id} (${base.reason})`)
        } else {
          result.linked += 1
        }
        result.candidates.push(base)
        continue
      }
    }

    /* --- 3) 이을 곳이 없으면 **새 선수를 만든다** (D-134의 핵심) ---
       무소속·용병도 선수가 된다. 나중에 공식 클랜에 들어와도 같은 행이 이어진다. */
    base.verdict = 'created'
    base.reason =
      best !== null
        ? `근거가 가리키는 3rd.supply 선수(${best[0]})가 아직 우리 DB에 없다. 계정 기준으로 새로 만든다`
        : `실제 경기 ${observations.length}건이 확인된 계정이다. 이을 근거가 없어 새로 만든다`

    if (input.confirm) {
      const created = await prisma.player.create({
        data: {
          name: userName,
          origin: 'nexon',
          nexonOuid: identity.ouid,
          ...(best ? { sourcePlayerId: best[0] } : {}),
        },
        select: { id: true },
      })
      await prisma.nexonIdentity.update({
        where: { ouid: identity.ouid },
        data: {
          playerId: created.id,
          status: 'active',
          linkReason: `계정 기준 생성 — ${base.reason}`,
        },
      })
      base.playerId = created.id
      claimed.add(created.id)
      log(`생성: ${userName} → ${created.id}`)
    }
    result.created += 1
    result.candidates.push(base)
  }

  return result
}

/**
 * 실제 관측된 맵을 리그 기록 대상에 넣는다.
 *
 * 리그가 인정하는 맵 목록이 비어 있으면 그 리그는 **아무 경기도 기록하지 못한다**.
 * 없는 맵을 만들어내는 것이 아니라, **실제 경기에서 관측된 맵**만 등록한다.
 */
export async function registerObservedMaps(input: {
  leagueSlug: string
  from: Date
  to: Date
  confirm?: boolean
}): Promise<{ observed: string[]; added: string[] }> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, maps: { select: { map: { select: { id: true, name: true } } } } },
  })
  if (!league) return { observed: [], added: [] }

  const rows = await prisma.nexonMatch.findMany({
    where: {
      dateMatch: { gte: input.from, lt: input.to },
      matchType: { in: ['클랜전', '퀵매치 클랜전', '클랜 랭크전'] },
      matchMap: { not: null },
    },
    select: { matchMap: true },
  })
  const observed = [...new Set(rows.map((row) => row.matchMap!))].sort()
  const existing = new Set(league.maps.map((entry) => entry.map.name))
  const added: string[] = []

  for (const name of observed) {
    if (existing.has(name)) continue
    if (!input.confirm) {
      added.push(name)
      continue
    }
    const map =
      (await prisma.gameMap.findUnique({ where: { name }, select: { id: true } })) ??
      (await prisma.gameMap.create({ data: { name }, select: { id: true } }))
    await prisma.leagueMap.create({ data: { leagueId: league.id, mapId: map.id } })
    added.push(name)
  }

  return { observed, added }
}
