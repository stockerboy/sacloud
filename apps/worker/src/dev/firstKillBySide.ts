/**
 * ★선짤을 진영별로 갈라 재기★ (2026-09-15 사장님: «선짤 부문이 스나수한테 너무 유리한데»).
 *
 * 이미 안 것: 스나가 라플보다 선짤 ★2.62배★ (킬은 1.34배 · 연속킬 1.17배).
 * 물음은 «그 유리함이 ★어느 진영★ 에서 오나» 다.
 *   레드(공격) 때 선짤 — 들어가면서 먼저 따는 것
 *   블루(수비) 때 선짤 — 롱에서 기다리다 먼저 따는 것 ← 스나의 자리
 *
 * 진영 판정은 지어내지 않고 `roundSidesOf`(C4 + 5승 규칙 · D-184 · D-208)를 그대로 쓴다.
 * 아무것도 쓰지 않는다 — 세어서 찍기만 한다.
 *
 * ── ⚠ ★선수 매핑으로는 못 잰다★ (2026-09-15 실측)
 *   배틀로그의 `str_usn` 을 우리 선수로 잇는 길은 `sourcePlayerId LIKE 'BRK-%'` 뿐인데
 *   26,029명 중 ★3,880명(15%)★ 만 그렇다. 그 길로 재니 표본이 504칸밖에 안 나왔다.
 *   ★그래서 배틀로그가 말하는 총을 그대로 쓴다★ — 이벤트마다 `weapon` 이 붙어 있고
 *   값은 `sniper` / `riple` 이다 (`playerHexBuild` 가 쓰는 그 값이다).
 *   «그 킬에 쓴 총» 이라 우리가 묻는 것(«선짤을 스나로 따나»)과 정확히 맞는다.
 *
 * ── 무엇을 잣대로 삼나
 *   «스나가 선짤을 많이 딴다» 만으로는 부족하다 — 스나가 킬 자체를 많이 딸 수도 있다.
 *   그래서 ★선짤에서의 몫 ÷ 전체 킬에서의 몫★ 을 본다.
 *   1.0 이면 «딴 만큼 선짤도 땄다» 이고, 1보다 크면 ★선짤에 몰린다★ 는 뜻이다.
 */
import { prisma } from '@sacloud/db'
import { clanByTeamNo, roundResultsOf, roundSidesOf, type RoundSideEvent } from '@sacloud/nexon'

/** 한 줄이 수 MB 라 크게 잡으면 연결이 끊긴다 (`matchFirstSideBuild` 와 같은 값) */
const CHUNK = 60

interface Cell {
  /** 그 진영에서 이 총으로 딴 ★선짤★ 수 */
  first: number
  /** 그 진영에서 이 총으로 딴 ★전체 킬★ — 견줄 바탕이다 */
  all: number
}

const zero = (): Cell => ({ first: 0, all: 0 })

async function main(): Promise<void> {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? 400)

  const heads = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id
      FROM "BarracksBattleLogRaw" r
     WHERE r."subjectKind" = 'clan' AND r.status = 'ok'
     ORDER BY r."fetchedAt" DESC
     LIMIT ${limit}
  `
  console.log(`배틀로그 ${heads.length}줄`)

  const table = new Map<string, Cell>()
  const cell = (side: string, gun: string): Cell => {
    const key = `${side}|${gun}`
    const now = table.get(key)
    if (now) return now
    const made = zero()
    table.set(key, made)
    return made
  }

  let used = 0
  let noSide = 0
  /* 왜 버려지나 — 숫자가 작으면 «잰 것» 이 아니라 «못 잰 것» 이다 */
  let dropNoSide = 0

  for (let i = 0; i < heads.length; i += CHUNK) {
    const ids = heads.slice(i, i + CHUNK).map((h) => h.id)
    const rows = await prisma.barracksBattleLogRaw.findMany({
      where: { id: { in: ids } },
      select: { subject: true, payload: true },
    })
    for (const row of rows) {
      const p = row.payload as {
        battleLog?: Record<string, unknown>[]
        teamList?: { team_no?: unknown; clan_no?: unknown }[]
      }
      const log = p.battleLog ?? []
      if (log.length === 0) continue

      /* 이 응답이 어느 팀 것인가 — teamList 가 team_no ↔ clan_no 를 짝지어 준다 */
      const byTeam = clanByTeamNo((p.teamList ?? []) as never)
      const myClan = String(row.subject ?? '')
      let teamNo: string | null = null
      for (const [t, c] of byTeam) if (c === myClan) teamNo = t
      if (teamNo === null) continue

      const events = log as unknown as RoundSideEvent[]
      const totalRounds = Math.max(...log.map((e) => Number(e.round) || 0))
      const results = roundResultsOf(events as never)
      const sides = roundSidesOf(events, teamNo, totalRounds, (r) => results.get(r) ?? null)
      if (sides.conflict || sides.side.size === 0) {
        noSide += 1
        continue
      }
      used += 1

      /** 그 팀이 그 라운드에 무슨 진영이었나 — 공격은 한 라운드에 한 팀뿐이다 */
      const sideOf = (round: number, team: string): 'attack' | 'defense' | null => {
        const mine = sides.side.get(round)
        if (mine === undefined) return null
        return team === teamNo ? mine : mine === 'attack' ? 'defense' : 'attack'
      }

      const firstOf = new Map<number, { at: number; gun: string; team: string }>()
      for (const e of log) {
        const round = Number(e.round)
        if (!Number.isFinite(round)) continue
        if (String(e.event_type ?? '') !== 'kill') continue
        const gun = String(e.weapon ?? '')
        if (gun !== 'sniper' && gun !== 'riple') continue
        const m = /^(\d+):(\d+)$/.exec(String(e.event_time ?? ''))
        if (m === null) continue
        const at = Number(m[1]) * 60 + Number(m[2])
        const team = String(e.team_no ?? '')
        const side = sideOf(round, team)
        if (side === null) {
          dropNoSide += 1
          continue
        }
        cell(side, gun).all += 1
        const cur = firstOf.get(round)
        if (cur === undefined || at < cur.at) firstOf.set(round, { at, gun, team })
      }
      for (const [round, f] of firstOf) {
        const side = sideOf(round, f.team)
        if (side === null) continue
        cell(side, f.gun).first += 1
      }
    }
    process.stdout.write(`\r  ${Math.min(i + CHUNK, heads.length)}/${heads.length}`)
  }
  console.log(`\n진영을 안 응답 ${used} · 못 판정 ${noSide} · 진영 모를 킬 ${dropNoSide}\n`)

  const name = (s: string) => (s === 'attack' ? '레드(공격)' : '블루(수비)')
  const gunName = (w: string) => (w === 'sniper' ? '스나' : '라플')
  console.log('[진영 × 총 — 라운드 첫 킬(선짤)]')
  console.log('  진영          총    전체 킬     선짤    선짤 몫   전체 몫    ★쏠림★')
  for (const side of ['attack', 'defense']) {
    const sn = table.get(`${side}|sniper`) ?? zero()
    const rf = table.get(`${side}|riple`) ?? zero()
    const allKills = sn.all + rf.all
    const allFirst = sn.first + rf.first
    for (const [w, c] of [['sniper', sn], ['riple', rf]] as const) {
      const shareFirst = allFirst > 0 ? c.first / allFirst : 0
      const shareAll = allKills > 0 ? c.all / allKills : 0
      const skew = shareAll > 0 ? shareFirst / shareAll : 0
      console.log(
        `  ${name(side)}   ${gunName(w)}  ${String(c.all).padStart(8)}  ${String(c.first).padStart(7)}   ${(shareFirst * 100).toFixed(1)}%     ${(shareAll * 100).toFixed(1)}%     ${skew.toFixed(2)}배`,
      )
    }
  }
  await prisma.$disconnect()
}

void main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
