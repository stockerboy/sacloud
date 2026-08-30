/**
 * 클랜 지표 다섯이 **실데이터에서 실제로 계산되는지** 잰다
 * (`docs/SITE_SPEC_V2.md` 5-5절 · 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포).
 *
 * 운영 코드가 아니다. `roundStateProbe.ts` 와 같은 성격으로, 수집한 클랜 배틀로그를
 * 통째로 훑어 **몇 %의 경기·라운드에서 값이 나오는가** 를 숫자로 내놓는다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/clanRoundProbe.ts
 * ```
 *
 * ── 이 도구가 답해야 하는 질문
 *   다섯 지표는 전부 **라운드별 진영**을 알아야 시작된다. 진영은 폭탄 이벤트로만
 *   되짚을 수 있고(D-184), 폭탄이 없는 라운드는 그냥 모른다. 그래서 화면을 만들기 전에
 *   "진영을 모르는 라운드가 몇 %인가" 를 **재서** 알아야 한다. 지어내지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  clanRoundTallyOf,
  per5,
  rateOf,
  roundResultsOf,
  rosterOf,
  tempoOf,
  type ClanRoundEvent,
  type ClanRoundTally,
} from '@sacloud/nexon'

/** 클랜전은 5대5 다 */
const TEAM_SIZE = 5

interface ClanRow {
  matchKey: string
  subject: string
  payload: unknown
}

interface RawShape {
  battleLog?: ClanRoundEvent[]
  teamList?: { team_no?: string | null; clan_no?: string | null }[]
}

const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

const pct = (n: number, of: number): string => (of === 0 ? '-' : ((n / of) * 100).toFixed(1) + '%')
const fixed = (value: number | null, digits = 2): string =>
  value === null ? '측정중' : value.toFixed(digits)

async function main(): Promise<void> {
  const rows = (await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, subject: true, payload: true },
  })) as ClanRow[]

  const byMatch = new Map<string, ClanRow[]>()
  for (const row of rows) {
    const list = byMatch.get(row.matchKey)
    if (list) list.push(row)
    else byMatch.set(row.matchKey, [row])
  }

  /* ── 집계통 ─────────────────────────────────────────────────────────── */
  let clanMatches = 0 /* 팀 번호를 정한 (경기, 클랜) 쌍 */
  let unresolvedTeam = 0 /* 팀 번호를 못 정해 버린 응답 */
  let tallied = 0 /* tally 가 나온 쌍 */
  let nullTally = 0
  let conflicts = 0

  let rounds = 0
  let sidedRounds = 0

  /* 지표별 "분모가 하나라도 있었나" — 한 경기에서 그 지표를 잴 수 있었는가 */
  const measurable = { defense: 0, attack: 0, plant: 0, organized: 0, burst: 0, tempo: 0 }

  interface Sum {
    clanMatches: number
    rounds: number
    sidedRounds: number
    defenseRounds: number
    defenseConceded: number
    attackRounds: number
    attackWon: number
    attackSideRounds: number
    plantRounds: number
    organizedRounds: number
    organizedHeld: number
    burstRounds: number
    bursts: number
    holds: number[]
    spans: number[]
    gaps: number[]
  }
  const newSum = (): Sum => ({
    clanMatches: 0,
    rounds: 0,
    sidedRounds: 0,
    defenseRounds: 0,
    defenseConceded: 0,
    attackRounds: 0,
    attackWon: 0,
    attackSideRounds: 0,
    plantRounds: 0,
    organizedRounds: 0,
    organizedHeld: 0,
    burstRounds: 0,
    bursts: 0,
    holds: [],
    spans: [],
    gaps: [],
  })

  /**
   * 두 덩어리로 나눠 잰다.
   *
   * `all`      — 진영을 아는 라운드 전부. **편향돼 있다** (아래 `switched` 설명 참조)
   * `switched` — 교대 지점을 본 경기만. 진영이 라운드 전체에 채워지므로
   *              "폭탄이 터진 라운드" 라는 선택 편향이 없다
   */
  const all = newSum()
  const switched = newSum()
  const add = (sum: Sum, tally: ClanRoundTally): void => {
    sum.clanMatches += 1
    sum.rounds += tally.rounds
    sum.sidedRounds += tally.sidedRounds
    sum.defenseRounds += tally.defenseRounds
    sum.defenseConceded += tally.defenseConceded
    sum.attackRounds += tally.attackRounds
    sum.attackWon += tally.attackWon
    sum.attackSideRounds += tally.attackSideRounds
    sum.plantRounds += tally.plantRounds
    sum.organizedRounds += tally.organizedRounds
    sum.organizedHeld += tally.organizedHeld
    sum.burstRounds += tally.burstRounds
    sum.bursts += tally.bursts
    sum.holds.push(...tally.holdSeconds)
    sum.spans.push(...tally.roundSpans)
    sum.gaps.push(...tally.roundGaps)
  }

  for (const [, group] of byMatch) {
    const events: ClanRoundEvent[] = []
    for (const row of group) events.push(...(rawOf(row.payload).battleLog ?? []))
    if (events.length === 0) continue

    const roster = rosterOf(events)

    /* 라운드 승패를 **팀 번호에 붙인다.** `win_flag` 는 조회 클랜 기준이라
       응답마다 따로 읽어야 한다. 두 응답이 어긋난 라운드는 버린다 (D-106) */
    const wonByTeam = new Map<number, Map<string, boolean>>()
    const broken = new Set<number>()
    /** 이 경기에서 팀 번호를 정한 클랜들 — `team_no` → 클랜 번호 */
    const myTeams = new Map<string, string>()

    for (const row of group) {
      const raw = rawOf(row.payload)
      const subjectEvents = raw.battleLog ?? []
      const teamOfClan = clanByTeamNo(raw.teamList ?? [])
      let myTeam = [...teamOfClan.entries()].find(([, clan]) => clan === row.subject)?.[0]
      if (myTeam === undefined) {
        /* `teamList` 가 없는 응답도 있다. `str_usn`(로그의 주인)은 조회 클랜의 선수들이다 */
        const subjects = new Set(
          subjectEvents
            .map((event) => event.str_usn)
            .filter((value): value is string => typeof value === 'string'),
        )
        const teams = new Set(
          [...subjects]
            .map((usn) => roster.teamOf.get(usn))
            .filter((value): value is string => Boolean(value)),
        )
        if (teams.size === 1) myTeam = [...teams][0]
      }
      if (myTeam === undefined || !roster.teams.includes(myTeam)) {
        unresolvedTeam += 1
        continue
      }
      myTeams.set(myTeam, row.subject)

      const foe = roster.teams.find((team) => team !== myTeam)
      if (foe === undefined) continue

      for (const [round, won] of roundResultsOf(subjectEvents as never)) {
        if (won === null) continue
        const known = wonByTeam.get(round) ?? new Map<string, boolean>()
        const before = known.get(myTeam)
        if (before !== undefined && before !== won) {
          broken.add(round)
          continue
        }
        known.set(myTeam, won)
        known.set(foe, !won)
        wonByTeam.set(round, known)
      }
    }

    for (const teamNo of myTeams.keys()) {
      clanMatches += 1
      const tally: ClanRoundTally | null = clanRoundTallyOf({
        events,
        teamNo,
        teamSize: TEAM_SIZE,
        wonRound: (round) => {
          if (broken.has(round)) return null
          const won = wonByTeam.get(round)?.get(teamNo)
          return won === undefined ? null : won
        },
      })
      if (tally === null) {
        nullTally += 1
        continue
      }
      tallied += 1
      if (tally.sideConflict) conflicts += 1

      rounds += tally.rounds
      sidedRounds += tally.sidedRounds

      if (tally.defenseRounds > 0) measurable.defense += 1
      if (tally.attackRounds > 0) measurable.attack += 1
      if (tally.attackSideRounds > 0) measurable.plant += 1
      if (tally.organizedRounds > 0) measurable.organized += 1
      if (tally.burstRounds > 0) measurable.burst += 1
      if (tally.roundSpans.length > 0) measurable.tempo += 1

      add(all, tally)
      if (tally.switchRound !== null) add(switched, tally)
    }
  }

  const report = (label: string, sum: Sum): void => {
    const spanTempo = tempoOf(sum.spans)
    const gapTempo = tempoOf(sum.gaps)
    const zeroSpans = sum.spans.filter((value) => value === 0).length
    /* 라운드 첫 이벤트가 이미 우리 죽음이면 0 이다 — 조직력이 원리적으로 못 잡히는 몫 */
    const holdTempo = tempoOf(sum.holds)
    const zeroHolds = sum.holds.filter((value) => value === 0).length
    const organizedRate = rateOf(sum.organizedHeld, sum.organizedRounds)

    console.info('')
    console.info(`── ${label} — 클랜-경기 ${sum.clanMatches}건 · 진영을 아는 라운드 ${sum.sidedRounds}`)
    console.info(
      '  블루방어율   수비',
      sum.defenseRounds,
      '라운드 중 허용',
      sum.defenseConceded,
      `→ 5라운드중 ${fixed(per5(sum.defenseConceded, sum.defenseRounds), 1)}라운드`,
    )
    console.info(
      '  어택성공률   공격',
      sum.attackRounds,
      '라운드 중 획득',
      sum.attackWon,
      `→ 5라운드중 ${fixed(per5(sum.attackWon, sum.attackRounds), 1)}라운드`,
    )
    console.info(
      '  폭탄설치     공격',
      sum.attackSideRounds,
      '라운드 중 설치',
      sum.plantRounds,
      `→ 5라운드중 ${fixed(per5(sum.plantRounds, sum.attackSideRounds), 1)}번`,
    )
    console.info(
      '  조직력       공격',
      sum.organizedRounds,
      '라운드 중 30초 초과',
      sum.organizedHeld,
      `(${fixed(organizedRate === null ? null : organizedRate * 100, 1)}%)`,
      `· 버틴 시간 중앙값 ${fixed(holdTempo?.median ?? null, 1)}초 · 0초인 라운드 ${zeroHolds} (${pct(zeroHolds, sum.holds.length)})`,
    )
    console.info(
      '  폭발력       공격',
      sum.burstRounds,
      '라운드 중 연속제거',
      sum.bursts,
      `→ 라운드당 ${fixed(rateOf(sum.bursts, sum.burstRounds), 3)}회`,
    )
    console.info(
      '  게임템포     구간(하한) n',
      spanTempo?.n ?? 0,
      '중앙값',
      fixed(spanTempo?.median ?? null, 1),
      '평균',
      fixed(spanTempo?.mean ?? null, 1),
      `· 0초인 라운드 ${zeroSpans} (${pct(zeroSpans, sum.spans.length)})`,
    )
    console.info(
      '               간격(상한) n',
      gapTempo?.n ?? 0,
      '중앙값',
      fixed(gapTempo?.median ?? null, 1),
      '평균',
      fixed(gapTempo?.mean ?? null, 1),
    )
  }

  console.info('클랜 응답이 있는 고유 경기 ', byMatch.size)
  console.info('팀 번호를 정한 클랜-경기   ', clanMatches, '· 못 정해 버린 응답', unresolvedTeam)
  console.info('지표를 잰 클랜-경기        ', tallied, `(${pct(tallied, clanMatches)})`, '· null', nullTally)
  console.info('진영 근거가 어긋난 클랜-경기', conflicts, `(${pct(conflicts, tallied)})`)
  console.info('교대 지점을 본 클랜-경기   ', switched.clanMatches, `(${pct(switched.clanMatches, tallied)})`)
  console.info('')
  console.info('라운드 전체               ', rounds)
  console.info('  진영을 아는 라운드       ', sidedRounds, `(${pct(sidedRounds, rounds)})`)
  console.info('  진영을 **모르는** 라운드 ', rounds - sidedRounds, `(${pct(rounds - sidedRounds, rounds)})`)
  console.info('')
  console.info('지표별로 값이 나온 클랜-경기 (분모 > 0 · 편향 보정 전)')
  console.info('  블루방어율              ', measurable.defense, `(${pct(measurable.defense, clanMatches)})`)
  console.info('  어택성공률(승패)        ', measurable.attack, `(${pct(measurable.attack, clanMatches)})`)
  console.info('  폭탄설치                ', measurable.plant, `(${pct(measurable.plant, clanMatches)})`)
  console.info('  조직력                  ', measurable.organized, `(${pct(measurable.organized, clanMatches)})`)
  console.info('  폭발력                  ', measurable.burst, `(${pct(measurable.burst, clanMatches)})`)
  console.info('  게임템포                ', measurable.tempo, `(${pct(measurable.tempo, clanMatches)})`)

  report('전체 (편향돼 있다 — 진영을 아는 라운드가 곧 폭탄이 터진 라운드다)', all)
  report('교대 지점을 본 경기만 (이쪽이 실제 값이다)', switched)

  await prisma.$disconnect()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
