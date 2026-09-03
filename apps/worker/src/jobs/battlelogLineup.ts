/**
 * 배틀로그 원문 → **`MatchPlayerStat`** (참가 기록). 저장소에 없던 마지막 한 칸이다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon battlelog-lineup                    # 미리보기
 * pnpm --filter @sacloud/worker nexon battlelog-lineup --confirm          # 실제 저장
 * pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --limit 200
 * ```
 *
 * ── 왜 필요한가
 *   IPL 경기 24,662건이 화면에 있는데 참가자가 **0명**이었다. 매치목록 원문의 칸 44개에
 *   선수 칸이 하나도 없어서다 (D-219). 라인업의 **유일한 출처가 클랜 배틀로그**이고,
 *   그것을 참가 기록으로 바꾸는 코드가 없었다 — `roundBuild`·`playstyleBuild`·`battlelog`
 *   는 각자 프로필만 만든다. 이 잡이 그 자리를 채운다.
 *
 * ── 무엇을 만드나
 *   ```
 *   Player            없으면 새로 만든다 (origin='nexon_barracks' · sourcePlayerId='BRK-<str_usn>')
 *   MatchPlayerStat   side · kill · death · weapon + 경기 당시 클랜 스냅샷
 *   ```
 *   `assist` · `damage` · `headshot` · `dropout` · `mvp` 는 **전부 null** 이다 —
 *   배틀로그에 그 칸이 없다. 0 으로 지어내지 않는다 (`CLAUDE.md` 3장 7번 · D-034 와 같은 원칙).
 *   래더 칸(`ratingBefore`/`ratingUpdate`/`ratingAfter`)도 건드리지 않는다. 그건 `rate` 의 일이다.
 *
 * ── 사람을 어떻게 알아보나 (순서가 곧 우선순위다)
 *   ```
 *   1순위  NexonIdentity.barracksUsn 이 이어 둔 playerId   ← 권위 있는 매핑 (D-221)
 *   2순위  Player.sourcePlayerId = 'BRK-<str_usn>'         ← 이 잡이 예전에 만든 선수
 *   3순위  새 Player 를 만든다
 *   ```
 *   닉네임으로 합치지 않는다. 위장닉이 섞여 있고(D-221) 닉은 물려받는다.
 *   키는 언제나 **계정(`str_usn`)** 이다.
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 쓰지 않는다. 기본은 미리보기다
 *   · 멱등하다 — `(matchId, playerId)` 로 upsert 하고 선수는 `sourcePlayerId` 로 찾는다.
 *     두 번 돌려도 행이 늘지 않는다 (`CLAUDE.md` 3-A 4번)
 *   · 요청을 한 건도 보내지 않는다. 저장된 원문만 읽는다
 *   · **10명이 다 확인된 경기만** 넣는다. 건너뛴 것은 사유별로 세어 보고한다
 *   · `payload` 를 한꺼번에 끌어오지 않는다 — 원문 하나가 90KB 안팎이라
 *     7천 건이면 600MB 다. 실제로 서버가 `out of memory (printtup)` 로 죽은 적이 있다
 */
import { prisma, type Prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import {
  LINEUP_TEAM_SIZE,
  planLineup,
  type LineupEvent,
  type LineupPlayer,
  type LineupSkipReason,
  type LineupTeamEntry,
} from '../lib/battlelogLineup.js'
import { iplClanNumberMap } from './iplClanNumber.js'

const DEFAULT_LEAGUE_SLUG = 'nolink'
/** IPL 경기를 만든 잡이 남긴 값 (`jobs/iplProject.ts`) */
const MATCH_ORIGIN = 'nexon_barracks'
/** 이 잡이 만든 선수의 표식. `Player.origin` 에 그대로 들어간다 */
export const BARRACKS_PLAYER_ORIGIN = 'nexon_barracks'
/**
 * `Player.sourcePlayerId` 앞에 붙이는 표식.
 *
 * 그 칸은 원래 3rd.supply 의 숫자 ID 를 담는다. 접두어를 붙여 **어느 세계의 ID 인지**
 * 를 남긴다 — 나중에 원본과 대조할 때 뒤섞이면 안 된다 (`CLAUDE.md` 3-A 3번).
 */
export const BARRACKS_PLAYER_PREFIX = 'BRK-'
/** 경기 당시 클랜 스냅샷의 출처 표기 (`MatchPlayerStat.matchTimeClanSource`) */
const CLAN_SOURCE = 'barracks-battlelog'

/** 한 번에 다루는 경기 수. 원문이 커서 크게 잡으면 메모리가 터진다 */
const CHUNK = 40

export type LineupJobSkipReason = LineupSkipReason | 'no_match' | 'no_payload'

export interface BattlelogLineupResult {
  /** 클랜 배틀로그가 있는 고유 경기 */
  matchKeys: number
  /** 그중 우리 `Match` 와 이어진 경기 */
  matched: number
  /** 라인업을 만들 수 있는 경기 */
  planned: number
  statsCreated: number
  statsUpdated: number
  playersCreated: number
  /** 이미 있던 선수에 붙인 참가 기록 */
  playersReused: number
  /** `NexonIdentity` 가 이어 준 선수 */
  playersFromIdentity: number
  /**
   * ★미러 라인업이 이미 있어서 건너뛴 경기★ (2026-09-04 · D-273).
   *
   * ⚠ ★이 수가 크다고 나쁜 게 아니다.★ ★덧대지 않고 비켜 준 것★ 이다.
   */
  skippedMirrorLineup: number
  skipped: Record<LineupJobSkipReason, number>
  written: boolean
}

const emptySkips = (): Record<LineupJobSkipReason, number> => ({
  no_match: 0,
  no_payload: 0,
  no_events: 0,
  team_count: 0,
  roster_incomplete: 0,
  no_team_list: 0,
  team_no_mismatch: 0,
  clan_unmapped: 0,
  side_mismatch: 0,
})

/** 원문에서 우리가 보는 두 칸. `raw` 로 한 겹 싸여 있는 옛 형식도 받는다 */
interface BattleLogPayload {
  battleLog?: unknown
  teamList?: unknown
}

function payloadOf(value: Prisma.JsonValue): BattleLogPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const holder = value as { raw?: unknown; battleLog?: unknown; teamList?: unknown }
  if (holder.battleLog !== undefined || holder.teamList !== undefined) return holder
  if (typeof holder.raw === 'object' && holder.raw !== null) return holder.raw as BattleLogPayload
  return {}
}

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** 우리 경기 한 건에 대해 아는 것 */
interface MatchSide {
  matchId: string
  clanId: string
  leagueClanId: string
  clanName: string
  clanSlug: string
  markBgUrl: string | null
  markFrontUrl: string | null
  division: number
}

interface MatchInfo {
  matchId: string
  startAt: Date
  red: MatchSide
  blue: MatchSide
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

export async function runBattlelogLineup(
  options: { confirm?: boolean; leagueSlug?: string; limit?: number } = {},
): Promise<BattlelogLineupResult> {
  const leagueSlug = options.leagueSlug ?? DEFAULT_LEAGUE_SLUG
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그 ${leagueSlug} 이 없다`)

  /*
    클랜번호 → 우리 클랜. **그 리그에 등록된 클랜만** 담는다.

    같은 병영수첩 클랜이 우리 DB 에 두 행으로 있을 수 있다 (실측: `EVOA` 가 열산의
    `melody` 와 IPL 의 `idylic` 로 나뉘어 있다 — 그 사이에 개명했다).
    `BarracksClanNumber.clanNo` 는 기본키라 한 번호에 한 클랜만 담기므로, 그 표만
    믿으면 IPL 배틀로그의 팀번호가 **열산 클랜**으로 풀리고 경기가 통째로 버려진다.
    ① 저장된 표를 리그로 거르고 ② 매치목록 원문으로 다시 푼 리그 전용 표를 덮어씌운다.
  */
  const registered = new Set(
    (await prisma.leagueClan.findMany({ where: { leagueId: league.id }, select: { clanId: true } })).map(
      (row) => row.clanId,
    ),
  )
  const clanOfNumber = new Map<string, string>()
  for (const row of await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })) {
    if (registered.has(row.clanId)) clanOfNumber.set(row.clanNo, row.clanId)
  }
  /* ② 리그 전용 표가 이긴다 — 저장된 표는 리그를 모른다 */
  for (const [clanNo, clanId] of await iplClanNumberMap(league.id)) {
    clanOfNumber.set(clanNo, clanId)
  }
  if (clanOfNumber.size === 0) {
    warn(`${leagueSlug} 에 이어진 클랜번호가 하나도 없다 — 라인업을 만들 수 없다`)
  } else {
    log(`클랜번호 표 ${clanOfNumber.size}개 (리그 ${leagueSlug} 범위)`)
  }

  /* 배틀로그가 있는 고유 경기. **payload 는 여기서 안 읽는다** */
  const keyRows = await prisma.$queryRaw<Array<{ matchKey: string }>>`
    SELECT DISTINCT "matchKey"
    FROM "BarracksBattleLogRaw"
    WHERE "subjectKind" = 'clan' AND "status" = 'ok'
    ORDER BY "matchKey" ASC
  `
  const allKeys = keyRows.map((row) => row.matchKey)
  const keys =
    options.limit !== undefined && options.limit > 0 ? allKeys.slice(0, options.limit) : allKeys

  const result: BattlelogLineupResult = {
    matchKeys: keys.length,
    matched: 0,
    planned: 0,
    statsCreated: 0,
    statsUpdated: 0,
    playersCreated: 0,
    playersReused: 0,
    playersFromIdentity: 0,
    skippedMirrorLineup: 0,
    skipped: emptySkips(),
    written: options.confirm === true,
  }

  /* 계정 → 우리 선수. 실행 내내 재사용한다 (같은 사람이 수백 경기에 나온다) */
  const playerOfUsn = new Map<string, string>()
  /*
    미리보기에서 **선수를 사람 수로 세기 위한** 집합.

    미리보기는 선수를 만들지 않으므로 위 캐시가 영영 비어 있고, 그대로 두면 참가 슬롯
    하나하나를 새 선수로 세어 `1,562경기 × 10 = 15,620명` 같은 거짓 숫자가 나온다.
    실제로 처음 돌렸을 때 그 숫자가 나왔다. **셈이 거짓이면 미리보기의 의미가 없다.**
  */
  const previewPlayers = new Set<string>()

  for (const batch of chunked(keys, CHUNK)) {
    /* ── 1. 우리 경기 ------------------------------------------------------- */
    const matches = await prisma.match.findMany({
      where: { leagueId: league.id, origin: MATCH_ORIGIN, sourceMatchId: { in: batch } },
      select: {
        id: true,
        sourceMatchId: true,
        startAt: true,
        redDivisionAtMatch: true,
        blueDivisionAtMatch: true,
        redClan: {
          select: {
            id: true,
            clan: {
              select: { id: true, name: true, slug: true, markBgUrl: true, markFrontUrl: true },
            },
          },
        },
        blueClan: {
          select: {
            id: true,
            clan: {
              select: { id: true, name: true, slug: true, markBgUrl: true, markFrontUrl: true },
            },
          },
        },
      },
    })

    const infoOf = new Map<string, MatchInfo>()
    for (const match of matches) {
      if (!match.sourceMatchId) continue
      const side = (
        leagueClan: (typeof match)['redClan'],
        division: number,
      ): MatchSide => ({
        matchId: match.id,
        clanId: leagueClan.clan.id,
        leagueClanId: leagueClan.id,
        clanName: leagueClan.clan.name,
        clanSlug: leagueClan.clan.slug,
        markBgUrl: leagueClan.clan.markBgUrl,
        markFrontUrl: leagueClan.clan.markFrontUrl,
        division,
      })
      infoOf.set(match.sourceMatchId, {
        matchId: match.id,
        startAt: match.startAt,
        red: side(match.redClan, match.redDivisionAtMatch),
        blue: side(match.blueClan, match.blueDivisionAtMatch),
      })
    }

    /*
     * ── ★★이미 미러 라인업이 있는 경기는 건너뛴다★★ (2026-09-04 · D-273)
     *
     * ⚠ ★한 경기에 20명이 들어간 경기가 1,184건 있었다.★ 펼쳐 보니 —
     * ```
     * blue 고지슈    ★3rd.supply★      16킬 8데스
     * blue 슈한      ★nexon_barracks★  16킬 8데스   ← ★같은 사람이다★
     * red  mane☆    3rd.supply         9킬 10데스
     * red  mane☆    nexon_barracks     9킬 10데스   ← ★이름까지 같은데 둘로 갈렸다★
     * ```
     * ★미러가 이미 넣어 둔 라인업 위에 병영수첩 라인업을 또 넣고 있었다.★
     * 두 출처의 `Player` 가 서로 다른 행이라 ★겹치는 걸 아무도 못 막았다.★
     * ★그래서 킬·데스가 두 배로 잡혔다.★
     *
     * ⚠ ★★처음엔 「미러가 더 많이 안다」고 적었는데 재 보니 틀렸다★★ (2026-09-04 · 같은 날 고쳤다).
     *   IPL 에서는 ★세 출처 모두 어시·헤드샷·데미지가 0%★ 다 (`stat-richness` 로 실측).
     *   ★D-034 는 다른 리그 얘기였다.★ ★인용한 근거는 그 자리에서 다시 재야 한다.★
     *
     * ★그래도 덧대면 안 되는 것은 그대로다★ — 더 나아지는 게 아니라 ★두 배로 잡힌다.★
     * 어느 쪽을 남길지는 `lineup-dedupe` 가 ★경기마다 「10명인 쪽」★ 으로 정한다.
     *
     * ★없는 경기에만 넣는다.★ 그게 이 잡이 원래 하려던 일이다.
     */
    const mirrorFilled = new Set<string>()
    if (infoOf.size > 0) {
      const ids = [...infoOf.values()].map((i) => i.matchId)
      for (const row of await prisma.$queryRaw<Array<{ matchId: string }>>`
        SELECT DISTINCT s."matchId"
          FROM "MatchPlayerStat" s
          JOIN "Player" p ON p."id" = s."playerId"
         WHERE s."matchId" = ANY(${ids}::text[])
           AND p."origin" <> ${BARRACKS_PLAYER_ORIGIN}
      `) {
        mirrorFilled.add(row.matchId)
      }
      for (const [key, info] of [...infoOf]) {
        if (mirrorFilled.has(info.matchId)) {
          infoOf.delete(key)
          result.skippedMirrorLineup += 1
        }
      }
    }

    /* ── 2. 원문 — 경기당 한 줄만 (양쪽 응답이 같은 것을 담는다 · D-218) ------- */
    const raws = await prisma.$queryRaw<Array<{ matchKey: string; payload: Prisma.JsonValue }>>`
      SELECT DISTINCT ON ("matchKey") "matchKey", "payload"
      FROM "BarracksBattleLogRaw"
      WHERE "subjectKind" = 'clan' AND "status" = 'ok' AND "matchKey" = ANY(${batch}::text[])
      ORDER BY "matchKey" ASC, "fetchedAt" DESC, "id" ASC
    `
    const payloadOfKey = new Map(raws.map((row) => [row.matchKey, payloadOf(row.payload)]))

    /* ── 3. 판정 ------------------------------------------------------------ */
    const plans: Array<{ info: MatchInfo; players: LineupPlayer[] }> = []
    for (const key of batch) {
      const info = infoOf.get(key)
      if (!info) {
        result.skipped.no_match += 1
        continue
      }
      result.matched += 1
      const payload = payloadOfKey.get(key)
      if (!payload) {
        result.skipped.no_payload += 1
        continue
      }
      const planned = planLineup({
        events: asArray<LineupEvent>(payload.battleLog),
        teamList: asArray<LineupTeamEntry>(payload.teamList),
        resolveClanNo: (clanNo) => clanOfNumber.get(clanNo) ?? null,
        redClanId: info.red.clanId,
        blueClanId: info.blue.clanId,
        teamSize: LINEUP_TEAM_SIZE,
      })
      if (!planned.ok) {
        result.skipped[planned.reason] += 1
        continue
      }
      result.planned += 1
      plans.push({ info, players: planned.players })
    }
    if (plans.length === 0) continue

    /* ── 4. 사람 알아보기 — 계정으로만 잇는다 -------------------------------- */
    const unknownUsns = [
      ...new Set(
        plans.flatMap((plan) => plan.players.map((p) => p.usn)).filter((usn) => !playerOfUsn.has(usn)),
      ),
    ]
    if (unknownUsns.length) {
      /* 1순위 — 사람이 확인해 이어 둔 신원 (D-221) */
      for (const identity of await prisma.nexonIdentity.findMany({
        where: { barracksUsn: { in: unknownUsns }, playerId: { not: null } },
        select: { barracksUsn: true, playerId: true },
      })) {
        if (identity.barracksUsn && identity.playerId) {
          playerOfUsn.set(identity.barracksUsn, identity.playerId)
          result.playersFromIdentity += 1
        }
      }
      /* 2순위 — 이 잡이 예전에 만든 선수 */
      const stillUnknown = unknownUsns.filter((usn) => !playerOfUsn.has(usn))
      if (stillUnknown.length) {
        for (const player of await prisma.player.findMany({
          where: { sourcePlayerId: { in: stillUnknown.map((usn) => BARRACKS_PLAYER_PREFIX + usn) } },
          select: { id: true, sourcePlayerId: true },
        })) {
          if (player.sourcePlayerId?.startsWith(BARRACKS_PLAYER_PREFIX)) {
            playerOfUsn.set(player.sourcePlayerId.slice(BARRACKS_PLAYER_PREFIX.length), player.id)
          }
        }
      }
    }

    /* ── 5. 쓰기 ------------------------------------------------------------ */
    /*
      이미 있는 참가 기록을 **묶음당 한 번**에 읽는다.
      신규/갱신을 가르려고 행마다 `findUnique` 를 부르면 경기 하나에 왕복이 10번 더 붙는다
      (1,562경기면 15,620번). 셈 하나 때문에 그럴 이유가 없다.
    */
    const existingStats = new Set<string>()
    if (options.confirm) {
      for (const row of await prisma.matchPlayerStat.findMany({
        where: { matchId: { in: plans.map((plan) => plan.info.matchId) } },
        select: { matchId: true, playerId: true },
      })) {
        existingStats.add(`${row.matchId} ${row.playerId}`)
      }
    }

    for (const plan of plans) {
      for (const player of plan.players) {
        const side = player.side === 'red' ? plan.info.red : plan.info.blue
        const opponent = player.side === 'red' ? plan.info.blue : plan.info.red

        let playerId = playerOfUsn.get(player.usn) ?? null
        if (playerId === null) {
          if (!options.confirm) {
            /* 미리보기에서는 만들지 않는다. **사람 수로** 셈만 한다 */
            if (previewPlayers.has(player.usn)) result.playersReused += 1
            else {
              previewPlayers.add(player.usn)
              result.playersCreated += 1
            }
            result.statsCreated += 1
            continue
          }
          /* 3순위 — 새로 만든다. 닉을 모르면 계정값을 이름으로 둔다(지어내지 않는다) */
          const created = await prisma.player.upsert({
            where: { sourcePlayerId: BARRACKS_PLAYER_PREFIX + player.usn },
            update: {},
            create: {
              name: player.nickname ?? player.usn,
              origin: BARRACKS_PLAYER_ORIGIN,
              sourcePlayerId: BARRACKS_PLAYER_PREFIX + player.usn,
            },
            select: { id: true },
          })
          playerId = created.id
          playerOfUsn.set(player.usn, playerId)
          result.playersCreated += 1
        } else {
          result.playersReused += 1
        }

        const data = {
          side: player.side,
          kill: player.kill,
          death: player.death,
          /* 배틀로그에 없는 칸은 전부 null 이다. 0 으로 만들지 않는다 */
          assist: null,
          headshot: null,
          damage: null,
          weapon: player.weapon,
          dropout: null,
          mvp: null,
          /* 경기 당시 클랜 — **그 경기에서 뛴 팀**이다. 용병 여부는 아직 모른다 */
          matchTimeClanName: side.clanName,
          matchTimeLeagueClanId: side.leagueClanId,
          matchTimeClanSlug: side.clanSlug,
          matchTimeClanMarkBgUrl: side.markBgUrl,
          matchTimeClanMarkFrontUrl: side.markFrontUrl,
          matchTimeClanSource: CLAN_SOURCE,
          matchTimeClanObservedAt: plan.info.startAt,
          matchTimeClanConfidence: 'medium',
          playerDivisionAtMatch: side.division,
          opponentDivisionAtMatch: opponent.division,
        }

        if (!options.confirm) {
          result.statsCreated += 1
          continue
        }
        await prisma.matchPlayerStat.upsert({
          where: { matchId_playerId: { matchId: plan.info.matchId, playerId } },
          create: { matchId: plan.info.matchId, playerId, ...data },
          update: data,
        })
        if (existingStats.has(`${plan.info.matchId} ${playerId}`)) result.statsUpdated += 1
        else result.statsCreated += 1
      }
    }
  }

  log(
    `배틀로그 라인업 ${options.confirm ? '적재' : '미리보기'} — ` +
      `배틀로그 있는 경기 ${result.matchKeys.toLocaleString()} · ` +
      `우리 경기와 이어짐 ${result.matched.toLocaleString()} · ` +
      `라인업 가능 ${result.planned.toLocaleString()} · ` +
      `★미러 라인업이 있어 비켜 준 경기 ${result.skippedMirrorLineup.toLocaleString()}★`,
  )
  log(
    `참가 기록 신규 ${result.statsCreated.toLocaleString()} · 갱신 ${result.statsUpdated.toLocaleString()} · ` +
      `선수 신규 ${result.playersCreated.toLocaleString()} · 재사용 ${result.playersReused.toLocaleString()} · ` +
      `신원으로 이음 ${result.playersFromIdentity.toLocaleString()}`,
  )
  log(
    `건너뜀 — 우리경기없음 ${result.skipped.no_match.toLocaleString()} · ` +
      `원문없음 ${result.skipped.no_payload} · 이벤트없음 ${result.skipped.no_events} · ` +
      `팀수이상 ${result.skipped.team_count} · 명단미달 ${result.skipped.roster_incomplete.toLocaleString()} · ` +
      `팀목록없음 ${result.skipped.no_team_list} · 팀번호불일치 ${result.skipped.team_no_mismatch} · ` +
      `클랜번호모름 ${result.skipped.clan_unmapped.toLocaleString()} · 진영불일치 ${result.skipped.side_mismatch}`,
  )
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')

  return result
}
