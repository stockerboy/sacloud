/**
 * 클랜 라운드 지표 집계를 `ClanRoundProfile` 에 쌓는다 (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * ```
 * 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트(반코트)
 * ```
 *
 * 판정은 전부 `@sacloud/nexon` 의 순수 함수(`clanRoundTallyOf` · `roundResultsOf` ·
 * `tempoOf`)가 한다. 여기서는 DB 를 읽고 쓰기만 한다 — `roundBuild.ts`(D-194)와 같은 꼴이다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-round-build            # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-round-build --confirm  # 실제 저장
 * ```
 *
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다 — 같은 원문을 다시 돌려도
 * 행이 늘지 않고 값이 덮인다.
 *
 * ── 모집단은 화면의 다른 수치와 **같다**
 *   래더 반영 경기(D-164 · D-178) + 시즌0 창(D-175 · D-178). 클랜페이지의
 *   `클랜 지표`(`clanMetrics.ts`)와 같은 경기를 봐야 한 화면 안에서 숫자가 어긋나지 않는다 —
 *   D-176 이 실제로 그 사고였다.
 *
 * ── 왜 `LeagueClan` 단위인가
 *   같은 물리 경기가 리그마다 다른 `Match` 행이 된다 (D-155). 클랜 단위로 묶으면
 *   공식리그 경기와 열산리그 경기가 한 칸에 섞여, 리그별 화면이 자기 모집단과
 *   다른 값을 보게 된다.
 *
 *   짝짓기는 `BarracksClanNumber`(클랜번호 → 우리 클랜 · D-200) → 그 경기의
 *   red/blue `LeagueClan.clanId` 순이다. **현재 부리그를 조인하지 않는다** —
 *   경기 당시 소속은 `Match` 가 이미 들고 있다 (`CLAUDE.md` 3-B 4번).
 *
 * ── 응답을 **섞지 않는다**
 *   `win_flag` 는 **그 응답을 받은 클랜 기준**이다 (D-184). 두 클랜의 응답을 합쳐서
 *   읽으면 라운드 승패가 뒤집힌다. 그래서 집계 단위는 `(경기, 클랜번호)` 한 쌍이고,
 *   그 쌍의 원문만 읽는다. 클랜 응답 하나에 양 팀 10명이 다 실려 오므로
 *   (D-184 실측) 라운드 복원에 필요한 것은 모자라지 않는다.
 *
 * ── 교대를 못 본 경기는 **버린다**
 *   진영 근거가 폭탄뿐이라(D-184), 전·후반 교대 지점을 못 찾으면 진영을 아는 라운드가
 *   **폭탄이 터진 라운드 그 자체**뿐이다. 그 라운드들은 정의상 설치 성공률이 100% 에
 *   가깝고 승률도 높아, 재려는 값이 표본을 고르는 셈이 된다
 *   (`packages/nexon/src/clanRound.ts` 머리말의 실측 참조).
 *   그래서 `switchRound` 가 `null` 이거나 근거가 어긋난 경기는 지표에서 뺀다.
 *   대신 **몇 판을 봤고 몇 판을 썼는지**를 함께 저장한다 (D-106).
 */
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  clanRoundTallyOf,
  roundClocksOf,
  roundResultsOf,
  roundSidesOf,
  tempoOf,
  type ClanRoundEvent,
  type RoundSide,
} from '@sacloud/nexon'
import { SEASON0_FROM, SEASON0_ORIGINS, SEASON0_TO } from '../lib/season0Window.js'

/* 버전은 `../lib/clanRoundBuilderVersion` 한 곳에만 있다 — 화면도 그 파일을 읽는다 */
export { CLAN_ROUND_BUILDER_VERSION } from '../lib/clanRoundBuilderVersion.js'
import { CLAN_ROUND_BUILDER_VERSION } from '../lib/clanRoundBuilderVersion.js'

/** 클랜전은 5대5 다. 인원이 다른 경기는 라운드 복원 대상이 아니다 */
const TEAM_SIZE = 5

/**
 * 클린시트(반코트)로 세는 연속 라운드 수 — **5라운드** (원문 "한 진영에서 5라운드 전승").
 *
 * ── 왜 "전반 5라운드" 로 자르지 않았나 (2026-08-30 실측)
 *   전·후반이 5라운드씩이라는 전제가 **데이터와 맞지 않았다.** 진영이 바뀌기 직전까지
 *   확인된 마지막 라운드(`bracket[0]`)의 분포가 이랬다 —
 *   ```
 *   1:34  2:52  3:46  4:69  5:67  6:85  7:84  8:55  9:35
 *   ```
 *   전반이 5라운드라면 6 이상이 나올 수 없다. 실제로는 9까지 나온다.
 *   한 경기의 총 라운드도 5~18로 흩어져 있어 **판형을 하나로 못 박을 수 없다.**
 *
 *   그래서 반쪽을 라운드 번호로 자르지 않고, **같은 진영으로 연속 5라운드를 전승했는가**
 *   로 읽는다. 판형을 모르는 채로도 원문의 뜻("한 진영에서 5라운드 전승")을 지킨다.
 *
 * > `[미확인]` 원문이 "반쪽 5-0" 을 뜻했는지 "한 진영에서 5연승" 을 뜻했는지 확정되지
 * > 않았다. 판형이 확인되면 이 상수와 판정을 함께 고친다 (`builderVersion` 도 올린다).
 */
const CLEAN_SHEET_RUN = 5

/** 한 경기의 클랜 응답 원문 모양 */
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

/** 한 `LeagueClan` 의 누적 */
interface Accum {
  clanNo: string | null
  matches: number
  sidedMatches: number
  roundsTotal: number
  roundsKnown: number
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
  /**
   * 라운드 길이를 **이어 붙여서** 담는다. 경기별 중앙값의 평균은 중앙값이 아니다
   * (`tempoOf` 머리말).
   */
  spans: number[]
  gaps: number[]
  cleanSheetMatches: number
  cleanSheets: number
}

const zero = (): Accum => ({
  clanNo: null,
  matches: 0,
  sidedMatches: 0,
  roundsTotal: 0,
  roundsKnown: 0,
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
  spans: [],
  gaps: [],
  cleanSheetMatches: 0,
  cleanSheets: 0,
})

/**
 * 클린시트(반코트) — **같은 진영으로 연속 5라운드를 전승했나.**
 *
 * 진영과 승패를 **둘 다 아는** 라운드만 이어 붙여 구간을 만든다. 진영을 모르는
 * 라운드(교대 구간)나 승패가 갈린 라운드에서 구간을 끊는다 — 모르는 자리를
 * 이어 붙이면 없던 연승이 만들어진다 (D-106).
 *
 * `countable` 은 그런 구간이 5라운드 이상이라 **판정할 수 있었는가**다.
 * 판정 자체가 불가능한 경기는 분모에도 넣지 않는다. 한 경기에서 두 진영을 다 쓸어도
 * **한 번**이다 — 원문이 `800판중 120회` 라 경기 단위로 세는 표기다.
 */
function cleanSheetOf(
  sides: ReadonlyMap<number, RoundSide>,
  wonRound: (round: number) => boolean | null,
): { countable: boolean; swept: boolean } {
  const rounds = [...sides.keys()].sort((a, b) => a - b)
  let countable = false
  let swept = false
  /** 지금 이어지고 있는 구간 — 라운드 번호가 연속이고 진영이 같은 동안만 이어진다 */
  let run: { round: number; won: boolean }[] = []

  const close = () => {
    if (run.length >= CLEAN_SHEET_RUN) {
      countable = true
      let chain = 0
      for (const entry of run) {
        chain = entry.won ? chain + 1 : 0
        if (chain >= CLEAN_SHEET_RUN) swept = true
      }
    }
    run = []
  }

  for (const round of rounds) {
    const won = wonRound(round)
    /* 승패를 모르는 라운드는 이어 붙이지 않는다. 건너뛰면 그 자리가 없던 것이 된다 */
    if (won === null) {
      close()
      continue
    }
    const prev = run[run.length - 1]
    if (prev && (round !== prev.round + 1 || sides.get(round) !== sides.get(prev.round))) close()
    run.push({ round, won })
  }
  close()
  return { countable, swept }
}

export interface ClanRoundBuildResult {
  /** 클랜 단위 배틀로그 원문 줄 수 */
  rows: number
  /** 그중 클랜 번호를 우리 클랜에 못 이은 줄 (D-200 · `nexon clan-number` 가 잇는다) */
  unlinkedClanNo: number
  /** 모집단(래더 + 시즌 창) 안의 경기가 아니라 뺀 줄 */
  outOfScope: number
  /** 우리 `Match` 의 어느 진영과도 클랜이 맞지 않아 뺀 줄 */
  sideMismatch: number
  /** 응답의 `teamList` 로 그 클랜의 팀 번호를 못 찾아 뺀 줄 */
  unknownTeamNo: number
  /** 라운드를 하나도 못 읽어 뺀 줄 */
  unreadable: number
  /** 실제로 집계에 들어간 (경기 × LeagueClan) 쌍 */
  tallied: number
  /** 그중 진영 교대를 확인해 지표에 쓴 쌍 */
  sided: number
  /** 진영 근거가 서로 어긋난 쌍 — 아무것도 확정하지 않았다 */
  conflicts: number
  /** 만들어진 프로필 수 */
  profiles: number
  /** 본 라운드 / 그중 진영을 알아 실제로 쓴 라운드 */
  roundsTotal: number
  roundsKnown: number
  written: boolean
}

export async function buildClanRoundProfiles(input: {
  confirm: boolean
}): Promise<ClanRoundBuildResult> {
  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, subject: true, payload: true },
  })

  /* 클랜번호 → 우리 클랜 (D-200). 못 이은 번호는 **버리지 않고 세어서 보고한다** */
  const clanOfNumber = new Map<string, string>()
  for (const link of await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })) {
    clanOfNumber.set(link.clanNo, link.clanId)
  }

  /* 모집단 — 래더 반영 경기(D-164 · D-178) ∧ 시즌0 창(D-175).
     화면(`apps/web/lib/server/queries/{ladderScope,season0Scope}.ts`)이 거는 조건과
     **같은 뜻**이다. worker 는 그 파일들을 가져올 수 없어 여기서 같은 모양으로 적는다 */
  const keys = [...new Set(rows.map((row) => row.matchKey))]
  const matches: {
    sourceMatchId: string | null
    redLeagueClanId: string
    blueLeagueClanId: string
    redClan: { clanId: string }
    blueClan: { clanId: string }
  }[] = []
  for (let i = 0; i < keys.length; i += 1000) {
    const slice = keys.slice(i, i + 1000)
    matches.push(
      ...(await prisma.match.findMany({
        where: {
          AND: [
            {
              OR: [
                { redRatingUpdate: { not: null } },
                { origin: { in: [...SEASON0_ORIGINS] } },
              ],
            },
            { startAt: { gte: SEASON0_FROM, ...(SEASON0_TO ? { lt: SEASON0_TO } : {}) } },
            { sourceMatchId: { in: slice } },
          ],
        },
        select: {
          sourceMatchId: true,
          redLeagueClanId: true,
          blueLeagueClanId: true,
          /* 클랜 **신원**만 읽는다. 부리그는 읽지 않는다 — 경기 당시 값은 `Match` 에
             스냅샷으로 있고, 현재 부리그를 쓰면 승강 뒤 과거가 오염된다 (3-B 4번) */
          redClan: { select: { clanId: true } },
          blueClan: { select: { clanId: true } },
        },
      })),
    )
  }

  /** 경기키 → 그 경기의 리그별 `Match` 들 (같은 경기가 여러 리그에 있다 · D-155) */
  const byKey = new Map<string, typeof matches>()
  for (const match of matches) {
    if (!match.sourceMatchId) continue
    const list = byKey.get(match.sourceMatchId)
    if (list) list.push(match)
    else byKey.set(match.sourceMatchId, [match])
  }

  const totals = new Map<string, Accum>()
  const result: ClanRoundBuildResult = {
    rows: rows.length,
    unlinkedClanNo: 0,
    outOfScope: 0,
    sideMismatch: 0,
    unknownTeamNo: 0,
    unreadable: 0,
    tallied: 0,
    sided: 0,
    conflicts: 0,
    profiles: 0,
    roundsTotal: 0,
    roundsKnown: 0,
    written: false,
  }

  for (const row of rows) {
    const clanId = clanOfNumber.get(row.subject)
    if (clanId === undefined) {
      result.unlinkedClanNo += 1
      continue
    }
    const group = byKey.get(row.matchKey)
    if (group === undefined) {
      result.outOfScope += 1
      continue
    }

    /* 그 경기에서 이 클랜이 앉은 `LeagueClan` 들. 리그를 겸하면 둘 이상이다 */
    const leagueClanIds: string[] = []
    for (const match of group) {
      if (match.redClan.clanId === clanId) leagueClanIds.push(match.redLeagueClanId)
      else if (match.blueClan.clanId === clanId) leagueClanIds.push(match.blueLeagueClanId)
    }
    if (leagueClanIds.length === 0) {
      result.sideMismatch += 1
      continue
    }

    const raw = rawOf(row.payload)
    const events = raw.battleLog ?? []
    if (events.length === 0) {
      result.unreadable += 1
      continue
    }

    /* `team_no` 는 클랜 번호지 진영이 아니다 (D-184). 응답이 짝을 알려 준다 */
    const clanByTeam = clanByTeamNo(raw.teamList ?? [])
    const teamNo = [...clanByTeam.entries()].find(([, no]) => no === row.subject)?.[0]
    if (teamNo === undefined) {
      result.unknownTeamNo += 1
      continue
    }

    /* 라운드 승패는 **이 응답 기준**이다. 다른 클랜의 응답과 섞지 않는다 (D-184) */
    const results = roundResultsOf(events as never)
    const wonRound = (round: number): boolean | null => results.get(round) ?? null

    const tally = clanRoundTallyOf({ events, teamNo, teamSize: TEAM_SIZE, wonRound })
    if (tally === null) {
      result.unreadable += 1
      continue
    }
    result.tallied += 1
    if (tally.sideConflict) result.conflicts += 1

    const usable = tally.switchRound !== null && !tally.sideConflict
    if (usable) result.sided += 1
    result.roundsTotal += tally.rounds
    if (usable) result.roundsKnown += tally.sidedRounds

    /* 클린시트는 **라운드별 진영**이 있어야 센다. `clanRoundTallyOf` 는 합계만 돌려주므로
       같은 순수 함수를 한 번 더 부른다 — 계산을 두 벌 만들지 않으려는 의도다 */
    let sheet = { countable: false, swept: false }
    if (usable) {
      const clocks = roundClocksOf(events)
      const totalRounds = Math.max(...clocks.keys())
      sheet = cleanSheetOf(roundSidesOf(events, teamNo, totalRounds).side, wonRound)
    }

    for (const leagueClanId of leagueClanIds) {
      const accum = totals.get(leagueClanId) ?? zero()
      accum.clanNo = row.subject
      accum.matches += 1
      accum.roundsTotal += tally.rounds
      totals.set(leagueClanId, accum)
      /* 교대를 못 본 경기는 여기서 끊는다 — 분모에도 넣지 않는다 */
      if (!usable) continue

      accum.sidedMatches += 1
      accum.roundsKnown += tally.sidedRounds
      accum.defenseRounds += tally.defenseRounds
      accum.defenseConceded += tally.defenseConceded
      accum.attackRounds += tally.attackRounds
      accum.attackWon += tally.attackWon
      accum.attackSideRounds += tally.attackSideRounds
      accum.plantRounds += tally.plantRounds
      accum.organizedRounds += tally.organizedRounds
      accum.organizedHeld += tally.organizedHeld
      accum.burstRounds += tally.burstRounds
      accum.bursts += tally.bursts
      accum.spans.push(...tally.roundSpans)
      accum.gaps.push(...tally.roundGaps)
      if (sheet.countable) {
        accum.cleanSheetMatches += 1
        if (sheet.swept) accum.cleanSheets += 1
      }
    }
  }

  result.profiles = totals.size
  if (!input.confirm) return result

  for (const [leagueClanId, accum] of totals) {
    const span = tempoOf(accum.spans)
    const gap = tempoOf(accum.gaps)
    const data = {
      clanNo: accum.clanNo,
      matches: accum.matches,
      sidedMatches: accum.sidedMatches,
      roundsTotal: accum.roundsTotal,
      roundsKnown: accum.roundsKnown,
      defenseRounds: accum.defenseRounds,
      defenseConceded: accum.defenseConceded,
      attackRounds: accum.attackRounds,
      attackWon: accum.attackWon,
      attackSideRounds: accum.attackSideRounds,
      plantRounds: accum.plantRounds,
      organizedRounds: accum.organizedRounds,
      organizedHeld: accum.organizedHeld,
      burstRounds: accum.burstRounds,
      bursts: accum.bursts,
      tempoSpanRounds: span?.n ?? 0,
      /* 표본이 없으면 `null` 이다. **0 초로 채우지 않는다** — 0 초는 "가장 빠르다" 다 */
      tempoSpanMedian: span?.median ?? null,
      tempoGapRounds: gap?.n ?? 0,
      tempoGapMedian: gap?.median ?? null,
      cleanSheetMatches: accum.cleanSheetMatches,
      cleanSheets: accum.cleanSheets,
      computedAt: new Date(),
    }
    await prisma.clanRoundProfile.upsert({
      where: {
        leagueClanId_builderVersion: {
          leagueClanId,
          builderVersion: CLAN_ROUND_BUILDER_VERSION,
        },
      },
      update: data,
      create: { leagueClanId, builderVersion: CLAN_ROUND_BUILDER_VERSION, ...data },
    })
  }
  result.written = true
  return result
}
