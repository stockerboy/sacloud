/**
 * 라운드 복원이 **실데이터에서 실제로 되는지** 잰다 (D-194).
 *
 * 운영 코드가 아니다. `src/dev/` 의 다른 도구들과 같은 성격으로, 수집분을 훑어
 * "몇 %의 경기에서 복원이 되는가" 를 숫자로 내놓는다.
 * 사양(D-184)이 남긴 `[미확인]` — 표본 3건으로 세운 가정 — 을 여기서 검증한다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/roundStateProbe.ts
 * ```
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  clanByTeamNo,
  isRestorable,
  lastRoundTopKiller,
  rosterOf,
  roundResultsOf,
  roundStatesOf,
  roundTallyOf,
  type RoundStateEvent,
} from '@sacloud/nexon'

const DIR = path.resolve(process.cwd(), 'reports/clan-battlelog')
const TEAM_SIZE = 5

interface Row {
  matchKey: string
  clanNo: string
  raw: { battleLog?: RoundStateEvent[]; teamList?: { team_no?: string; clan_no?: string }[] }
}

function main(): void {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.json'))

  /** 같은 경기를 두 클랜이 각각 보내면 이벤트를 합친다 — 그래야 10명이 채워진다 */
  const byMatch = new Map<string, { events: RoundStateEvent[]; clanNos: Set<string>; teamList: Map<string, string> }>()

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as { rows?: Row[] }
    for (const row of parsed.rows ?? []) {
      const events = row.raw?.battleLog ?? []
      if (events.length === 0) continue
      let entry = byMatch.get(row.matchKey)
      if (!entry) {
        entry = { events: [], clanNos: new Set(), teamList: new Map() }
        byMatch.set(row.matchKey, entry)
      }
      entry.events.push(...events)
      entry.clanNos.add(row.clanNo)
      for (const [team, clan] of clanByTeamNo(row.raw?.teamList ?? [])) entry.teamList.set(team, clan)
    }
  }

  let restorable = 0
  let rosterTen = 0
  let matchMan = 0
  let rounds = 0
  let roundsWithResult = 0
  const teamSizes = new Map<number, number>()
  let alone = 0
  let aloneWon = 0
  let outnumbered = 0
  let outnumberedWon = 0
  let taliedPlayers = 0
  let teamListResolved = 0
  let subjectResolved = 0
  let bothAgree = 0
  let bothDisagree = 0

  for (const [, entry] of byMatch) {
    const roster = rosterOf(entry.events)
    for (const size of roster.sizeOf.values()) teamSizes.set(size, (teamSizes.get(size) ?? 0) + 1)
    if (roster.teamOf.size === TEAM_SIZE * 2) rosterTen += 1

    const ok = isRestorable(roster, TEAM_SIZE)
    if (!ok) continue
    restorable += 1

    if (lastRoundTopKiller(entry.events) !== null) matchMan += 1

    const states = roundStatesOf(entry.events)
    rounds += states.size
    /* `roundResultsOf` 는 **조회 클랜 기준**이다. 두 클랜이 섞이면 뜻이 갈리므로
       한 클랜이 보낸 것만 있을 때에 한해 승패를 읽는다 */
    const single = entry.clanNos.size === 1
    const results = single ? roundResultsOf(entry.events as never) : new Map<number, boolean | null>()
    for (const value of results.values()) if (value !== null) roundsWithResult += 1

    if (!single) continue
    const myClan = [...entry.clanNos][0] as string
    /* 방법 A — `teamList` 가 `team_no` 와 `clan_no` 를 짝지어 준다 (D-184) */
    const byTeamList = [...entry.teamList.entries()].find(([, clan]) => clan === myClan)?.[0]
    /* 방법 B — `str_usn`(그 로그의 주인)은 **조회 클랜의 선수들**이다 (D-184).
       그들이 전부 한 팀이면 그 팀이 조회 클랜이다. teamList 가 없는 응답의 대비책이다 */
    const subjects = new Set(entry.events.map((e) => e.str_usn).filter(Boolean) as string[])
    const subjectTeams = new Set([...subjects].map((usn) => roster.teamOf.get(usn)).filter(Boolean))
    const bySubject = subjectTeams.size === 1 ? ([...subjectTeams][0] as string) : undefined

    if (byTeamList !== undefined) teamListResolved += 1
    if (bySubject !== undefined) subjectResolved += 1
    if (byTeamList !== undefined && bySubject !== undefined) {
      if (byTeamList === bySubject) bothAgree += 1
      else bothDisagree += 1
    }
    /* 둘이 어긋나면 그 경기는 승패를 읽지 않는다 — 다수결하지 않는다 (D-106) */
    const myTeam =
      byTeamList !== undefined && bySubject !== undefined && byTeamList !== bySubject
        ? undefined
        : (byTeamList ?? bySubject)

    for (const [usn, team] of roster.teamOf) {
      const isMine = myTeam !== undefined && team === myTeam
      const tally = roundTallyOf({
        events: entry.events,
        usn,
        teamSize: TEAM_SIZE,
        wonRound: (round) => {
          const won = results.get(round)
          if (won === undefined || won === null) return null
          return isMine ? won : !won
        },
      })
      if (!tally) continue
      taliedPlayers += 1
      alone += tally.alone
      aloneWon += tally.aloneWon
      outnumbered += tally.outnumbered
      outnumberedWon += tally.outnumberedWon
    }
  }

  const total = byMatch.size
  const pct = (n: number) => (total === 0 ? '0' : ((n / total) * 100).toFixed(1))

  console.info('수집된 고유 경기        ', total)
  console.info('10명이 다 나온 경기      ', rosterTen, `(${pct(rosterTen)}%)`)
  console.info('복원 가능(5:5 확인)      ', restorable, `(${pct(restorable)}%)`)
  console.info('마지막 라운드 최다킬 판정 ', matchMan, `(${pct(matchMan)}%)`)
  console.info('복원된 라운드            ', rounds, '· 승패까지 아는 라운드', roundsWithResult)
  console.info('팀 인원 분포             ', [...teamSizes.entries()].sort((a, b) => a[0] - b[0]))
  console.info('조회팀 판정 teamList     ', teamListResolved, '· str_usn', subjectResolved)
  console.info('두 방법 일치 / 불일치     ', bothAgree, '/', bothDisagree)
  console.info('집계된 선수-경기          ', taliedPlayers)
  console.info('혼자 남은 라운드          ', alone, '· 그중 승', aloneWon)
  console.info('둘이 남은 라운드          ', outnumbered, '· 그중 승', outnumberedWon)
}

main()
