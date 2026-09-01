/**
 * 로컬 IPL **참가 기록**을 운영 반영용 파일로 뽑는다 (D-255 후속).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplLineupExport.ts [--out <파일>]
 * ```
 *
 * ── 무엇을 담고 무엇을 안 담나
 *   ```
 *   담는다   경기 키(sourceMatchId) · 계정(str_usn · user_nexon_sn) · 닉 · 진영 · 킬 · 데스 · 무기
 *   안 담는다 **id 라는 id 는 전부.** 로컬과 운영은 다른 DB 다 —
 *            playerId · matchId · leagueClanId · clanId 를 옮기면 남의 행을 가리킨다
 *   ```
 *   진영별 클랜·부리그·클랜마크는 **운영 쪽에서 그 경기(`Match`)를 보고 다시 만든다.**
 *   `dev/iplProjectPush.ts` 가 division 과 map 을 그렇게 다룬 것과 같은 원칙이다.
 *
 * ── 집계(`LeaguePlayer`)는 담지 않는다
 *   래더·승패·킬데스 누적은 **운영에서 다시 계산하는 것이 맞다.**
 *   숫자를 옮기면 어느 DB 의 어느 경기로 나온 값인지 알 수 없게 되고, 되돌릴 근거도 없다.
 *   참가 기록을 넣은 뒤 운영에서 `season0-apply --leagues nolink` 를 돌린다 —
 *   그쪽은 백업을 뜨고 불변식(통합 = 기본 + 스나 + 라플)까지 확인한다.
 *
 * **읽기만 한다.** 한 줄도 쓰지 않는다.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { BARRACKS_PLAYER_PREFIX } from '../jobs/battlelogLineup.js'

const LEAGUE_SLUG = 'nolink'
const MATCH_ORIGIN = 'nexon_barracks'

const argIndex = process.argv.indexOf('--out')
const out =
  (argIndex >= 0 ? process.argv[argIndex + 1] : undefined) ??
  join(process.cwd(), 'ipl-lineup-export.json')

export interface IplLineupExportPlayer {
  /** 병영수첩 계정 (`str_usn`). 우리 `Player.sourcePlayerId` 는 `BRK-` + 이 값이다 */
  usn: string
  /** 병영수첩 숫자 계정값. **3rd.supply 의 `player.id` 와 같은 값이다** (D-255 4장) */
  nexonSn: string | null
  /** 관측된 닉. 모르면 null — 지어내지 않는다 */
  name: string | null
}

export interface IplLineupExportStat {
  sourceMatchId: string
  usn: string
  side: string
  kill: number | null
  death: number | null
  weapon: number | null
}

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
    select: { id: true },
  })
  if (!league) throw new Error(`리그 ${LEAGUE_SLUG} 이 없다`)

  const rows = await prisma.matchPlayerStat.findMany({
    where: { match: { leagueId: league.id, origin: MATCH_ORIGIN } },
    select: {
      side: true,
      kill: true,
      death: true,
      weapon: true,
      match: { select: { sourceMatchId: true } },
      player: { select: { name: true, sourcePlayerId: true } },
    },
    orderBy: [{ matchId: 'asc' }, { playerId: 'asc' }],
  })

  const players = new Map<string, IplLineupExportPlayer>()
  const stats: IplLineupExportStat[] = []
  let skippedNoKey = 0

  for (const row of rows) {
    const sourceMatchId = row.match.sourceMatchId
    const source = row.player.sourcePlayerId
    if (!sourceMatchId || !source?.startsWith(BARRACKS_PLAYER_PREFIX)) {
      /* 이 잡이 만들지 않은 선수·경기는 옮기지 않는다. 남의 행을 건드리지 않는다 */
      skippedNoKey += 1
      continue
    }
    const usn = source.slice(BARRACKS_PLAYER_PREFIX.length)
    if (!players.has(usn)) {
      players.set(usn, { usn, nexonSn: null, name: row.player.name })
    }
    stats.push({
      sourceMatchId,
      usn,
      side: row.side,
      kill: row.kill,
      death: row.death,
      weapon: row.weapon,
    })
  }

  /*
    숫자 계정값(`user_nexon_sn`)을 원문에서 채운다.

    **이 값이 이 파일에서 가장 중요한 칸이다.** 운영에는 3rd.supply 에서 온 선수가
    이미 22,000명 넘게 있고, 그쪽 `Player.sourcePlayerId` 가 바로 이 숫자다 (D-255 4장 실측).
    이것으로 먼저 찾아 붙이지 않으면 **같은 사람이 두 줄**이 된다.
  */
  const usns = [...players.keys()]
  for (let index = 0; index < usns.length; index += 500) {
    const batch = usns.slice(index, index + 500)
    const found = await prisma.$queryRaw<Array<{ usn: string; sn: string }>>`
      SELECT DISTINCT e->>'str_usn' AS "usn", e->>'user_nexon_sn' AS "sn"
      FROM "BarracksBattleLogRaw" b, LATERAL jsonb_array_elements(b."payload"->'battleLog') e
      WHERE b."subjectKind" = 'clan' AND e->>'str_usn' = ANY(${batch}::text[])
        AND e->>'user_nexon_sn' IS NOT NULL
      UNION
      SELECT DISTINCT e->>'target_str_usn' AS "usn", e->>'target_user_nexon_sn' AS "sn"
      FROM "BarracksBattleLogRaw" b, LATERAL jsonb_array_elements(b."payload"->'battleLog') e
      WHERE b."subjectKind" = 'clan' AND e->>'target_str_usn' = ANY(${batch}::text[])
        AND e->>'target_user_nexon_sn' IS NOT NULL
    `
    /* 한 계정이 숫자값 둘로 나오면 **둘 다 버린다.** 추측해서 잇지 않는다 (D-106) */
    const seen = new Map<string, Set<string>>()
    for (const row of found) {
      if (!seen.has(row.usn)) seen.set(row.usn, new Set())
      seen.get(row.usn)?.add(row.sn)
    }
    for (const [usn, sns] of seen) {
      const player = players.get(usn)
      if (!player || sns.size !== 1) continue
      player.nexonSn = [...sns][0] as string
    }
  }

  const withSn = [...players.values()].filter((p) => p.nexonSn !== null).length
  const doc = {
    leagueSlug: LEAGUE_SLUG,
    origin: MATCH_ORIGIN,
    exportedAt: new Date().toISOString(),
    counts: {
      players: players.size,
      playersWithNexonSn: withSn,
      stats: stats.length,
      matches: new Set(stats.map((s) => s.sourceMatchId)).size,
    },
    players: [...players.values()].sort((a, b) => a.usn.localeCompare(b.usn)),
    stats,
  }
  writeFileSync(out, JSON.stringify(doc))

  console.info(`선수 ${players.size} (숫자 계정값 있는 사람 ${withSn}) · 참가 ${stats.length} · 경기 ${doc.counts.matches}`)
  if (skippedNoKey) console.info(`건너뜀 ${skippedNoKey} — 이 잡이 만들지 않은 행이다`)
  console.info(`파일: ${out}`)
  await prisma.$disconnect()
}

void main()
