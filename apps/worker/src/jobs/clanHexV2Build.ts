/**
 * 클랜 육각형 V2 재료를 `MatchClanHexV2` 에 **경기 × 클랜** 단위로 쌓는다 (D-217 · D-235).
 *
 * ```
 * ① 스나싸움  ② 소수싸움  ③ 세이브  ④ 게임템포  ⑤ B어택성공  ⑥ A어택성공
 * ```
 *
 * 판정은 전부 `@sacloud/nexon` 의 순수 함수(`clanHexV2Of`)가 한다. 여기서는 DB 를
 * 읽고 쓰기만 한다 — `clanRoundBuild.ts`(D-201) · `playstyleBuild.ts`(D-211) 와 같은 꼴이다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-build                     # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-build --confirm           # 실제 저장
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-build --limit 20 --confirm
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-build --league sanply
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-build --rebuild --confirm
 * ```
 *
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다 — 같은 원문을 다시 돌려도
 * 행이 늘지 않고 값이 덮인다(`upsert` · `@@unique([matchId, leagueClanId])`).
 *
 * ── **비율을 저장하지 않는다** (D-235 「저장 방식」)
 *   `tally` 는 `ClanHexTally` 통째다. 분자와 분모만 들어 있고 비율은 없다.
 *   경기 상세는 두 행을 겹쳐 그리고(Q7), 클랜 페이지는 그 클랜 행을 **SUM 한 뒤
 *   한 번만 나눈다**(Q8). 비율을 저장해 두면 5라운드 경기가 18라운드 경기와 같은
 *   무게를 갖는다. 해석이 바뀌어도 **재수집 없이** 저장된 값에서 다시 만든다.
 *
 * ── **옛 판(`ClanRoundProfile`)을 건드리지 않는다**
 *   둘은 따로 산다. 축 이름 `게임템포` 가 겹치지만 **정의가 다른 지표**다
 *   (옛: 라운드 길이 중앙값 / 새: 레드일 때 상대 3명 지우기까지 걸린 초의 **하한**).
 *   한 화면에 나란히 놓지 않는다 (D-235 마지막 절).
 *
 * ── 원문은 **커서 배치로 흘려 읽는다** (D-225)
 *   경기 하나에 이벤트가 3,000여 개다. `findMany` 로 전량을 올리면 힙을 올려도
 *   Prisma 직렬화 한계(`Failed to convert rust String into napi string`)에서 다시 터진다.
 *   `id` 커서로 200행씩 읽고 **집계 결과만** 남긴다.
 *
 * ── 재개
 *   `--rebuild` 가 없으면 **이미 같은 `formulaVersion` 으로 만들어진 경기를 건너뛴다.**
 *   중간에 죽어도 같은 명령을 다시 돌리면 남은 것부터 이어서 돈다.
 *
 * ── 한 경기는 **응답 하나**로 읽는다
 *   같은 경기의 클랜 응답이 둘일 수 있다(양 클랜이 각자 조회). `win_flag` 는
 *   **그 응답을 받은 클랜 기준**이라(D-184) 두 응답을 섞으면 라운드 승패가 뒤집힌다.
 *   클랜 응답 하나에 양 팀 10명이 다 실려 오므로(D-184 실측) 한 응답이면 충분하다.
 *   `id` 오름차순으로 **먼저 만난 응답**을 쓴다 — 결정적이다.
 *
 * ── 짝짓기가 안 되면 **그 경기를 버린다**
 *   `team_no` 는 클랜 번호지 진영이 아니다 (D-184). 응답의 `teamList` 가
 *   `team_no → clan_no` 를 알려 주고, `BarracksClanNumber` 가 `clan_no → 우리 클랜`
 *   을 잇는다 (D-200). 그 사슬이 한 칸이라도 끊기면 **억지로 붙이지 않고** 사유를
 *   세어 보고한다. 잘못 붙인 행은 조용히 남아 두 클랜의 값을 바꿔 놓는다.
 *
 * ── 모집단을 여기서 좁히지 않는다
 *   `clanRoundBuild.ts` 는 래더 반영 + 시즌0 창으로 모집단을 좁히지만, 여기는
 *   **경기 단위 원재료**라 좁히지 않는다. 화면이 합칠 때 자기 모집단으로 거른다
 *   (D-235: 클랜 값 = 경기 행의 합). 리그를 골라 보고 싶으면 `--league` 를 쓴다.
 *
 * ── 못 재는 것 (전부 `null` 로 남는다. **0 으로 채우지 않는다** · D-106)
 *   1. `녹뒤` · `머리` 구역의 좌표가 없다 (D-235 Q6). ⑥ 은 `컨뒤` · `A설대` **둘만**으로 센다
 *   2. 라운드 시작 시각이 관측되지 않는다. ④ 는 **하한값**이다
 *   3. 상대 팀 스나를 한 명도 못 짚은 경기는 ①⑤⑥ 이 통째로 `null` 이다
 *   4. 양 팀 5명이 확인되지 않은 경기는 ②③④⑤ 가 `null` 이다
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import {
  A_ATTACK_ZONE_LABELS,
  B_LONG_ZONE_LABEL,
  clanByTeamNo,
  clanHexV2Of,
  zoneCellsOfLabels,
  type ClanHexEvent,
  type ClanHexTally,
  type ClanHexZones,
  type LabeledZoneFile,
} from '@sacloud/nexon'
import { REPO_ROOT } from '../lib/env.js'

/* 버전은 `../lib/clanHexV2Version` 한 곳에만 있다 — 나중에 화면도 그 파일을 읽는다 */
export { CLAN_HEX_V2_FORMULA_VERSION } from '../lib/clanHexV2Version.js'
import { CLAN_HEX_V2_FORMULA_VERSION } from '../lib/clanHexV2Version.js'

/** 클랜전은 5대5 다. 인원이 다른 경기는 라운드 복원 대상이 아니다 */
const TEAM_SIZE = 5

/**
 * 원문을 한 번에 몇 줄씩 읽을까 (D-225).
 *
 * 200 은 `battlelog.ts` 가 실측으로 자리 잡은 값이다. 페이로드가 커서 이보다
 * 크게 잡으면 커넥션이 끊기거나 Prisma 직렬화에서 죽는다.
 */
const BATCH = 200

/** 구역 파일의 기본 자리 — 사용자가 직접 칠한 좌표다 (D-183) */
const ZONE_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')

/**
 * ① 의 `A쪽` 으로 볼 구역 — **`컨뒤` + `A설대` 둘뿐이다** (D-235 Q2).
 *
 * ⑥ 이 쓰는 `A_ATTACK_ZONE_LABELS` 와 **같은 집합**이다. 사용자가 말한 이름 넷 중
 * 좌표가 있는 것이 이 둘뿐이라 그렇다. 없는 이름은 지어내지 않는다 (`CLAUDE.md` 3장 7번).
 *
 * ⚠ `data/barracks/sniper-lane.json` 은 **폐기 표시가 붙어 있다**(실제 사격 위치의
 * 16.2%만 덮는다). `A쪽`·`B롱` 으로 쓰지 않는다.
 */
const A_SIDE_ZONE_LABELS = A_ATTACK_ZONE_LABELS

/** 한 경기의 클랜 응답 원문 모양 */
interface RawShape {
  battleLog?: ClanHexEvent[]
  teamList?: { team_no?: string | null; clan_no?: string | null }[]
}

const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

/* -------------------------------------------------------------------------- */
/* 구역                                                                         */
/* -------------------------------------------------------------------------- */

export interface ZoneLoad {
  zones: ClanHexZones
  /** 어디서 읽었나 — 값의 출처를 보고에 함께 남긴다 */
  file: string | null
  /** 라벨별 칸 수. 0 이면 그 라벨이 파일에 없다는 뜻이다 */
  cells: Record<string, number>
}

/**
 * 구역 파일을 읽어 `clanHexV2Of` 에 넘길 셀 집합을 만든다.
 *
 * **파일이 없으면 아무것도 넘기지 않는다.** 그러면 자리를 나누는 칸이 `null` 로
 * 나오고(①의 `aSideKills`·`bLongKills`, ⑥ 통째), 화면에서 `측정중` 이 된다.
 * 좌표를 지어내서 채우지 않는다.
 */
export function loadClanHexZones(file: string | null): ZoneLoad {
  if (file === null || !existsSync(file)) {
    return { zones: {}, file: null, cells: {} }
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as LabeledZoneFile
  const aSide = zoneCellsOfLabels(parsed, A_SIDE_ZONE_LABELS)
  const bLong = zoneCellsOfLabels(parsed, [B_LONG_ZONE_LABEL])
  const attack = zoneCellsOfLabels(parsed, A_ATTACK_ZONE_LABELS)
  return {
    zones: {
      aSide: aSide.cells.length > 0 ? aSide : null,
      bLong: bLong.cells.length > 0 ? bLong : null,
      attack: attack.cells.length > 0 ? attack : null,
      attackLabels: A_ATTACK_ZONE_LABELS,
    },
    file,
    cells: {
      [`A쪽(${A_SIDE_ZONE_LABELS.join('+')})`]: aSide.cells.length,
      [`B롱(${B_LONG_ZONE_LABEL})`]: bLong.cells.length,
      [`⑥구역(${A_ATTACK_ZONE_LABELS.join('+')})`]: attack.cells.length,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* 축 세기                                                                      */
/* -------------------------------------------------------------------------- */

/** 여섯 축 중 **`null` 이 아닌** 개수 (0~6). 화면의 `측정중 N/6` 에 쓴다 */
export function axesMeasuredOf(tally: ClanHexTally): number {
  const axes = [
    tally.sniperFight,
    tally.outnumbered,
    tally.save,
    tally.tempo,
    tally.lastSniper,
    tally.attackZone,
  ]
  return axes.filter((axis) => axis !== null).length
}

/**
 * 축별로 **분모가 0이 아닌가** — 축이 `null` 이 아니어도 분모가 0이면 값이 안 나온다.
 *
 * 분모는 D-235 가 정한 것을 따른다.
 *
 * ```
 * ① 레드 라운드            ② 밀린 라운드        ③ 1명까지 몰린 라운드
 * ④ 3명 지운 레드 라운드    ⑤ 이긴 레드 라운드    ⑥ 이긴 레드 라운드
 * ```
 */
export function axisDenominators(tally: ClanHexTally): Record<string, boolean> {
  return {
    '① 스나싸움': (tally.sniperFight?.redRounds ?? 0) > 0,
    '② 소수싸움': (tally.outnumbered?.rounds ?? 0) > 0,
    '③ 세이브': (tally.save?.rounds ?? 0) > 0,
    '④ 게임템포': (tally.tempo?.redClearThreeRounds ?? 0) > 0,
    '⑤ B어택성공': (tally.lastSniper?.redWonRounds ?? 0) > 0,
    '⑥ A어택성공': (tally.attackZone?.redWonRounds ?? 0) > 0,
  }
}

/* -------------------------------------------------------------------------- */
/* 결과                                                                         */
/* -------------------------------------------------------------------------- */

/** 건너뛴 사유별 건수 — **원문 줄(응답) 단위**다 */
export interface ClanHexV2Skips {
  /** 응답 주인의 클랜 번호를 우리 클랜에 못 이었다 (`nexon clan-number` 가 잇는다 · D-200) */
  unlinkedClanNo: number
  /** 그 경기키에 해당하는 `Match` 가 없다 (`--league` 로 좁혔을 때도 여기 걸린다) */
  noMatch: number
  /** 같은 경기를 이미 다른 응답으로 읽었다 — 섞지 않는다 (D-184) */
  duplicateResponse: number
  /** 이미 같은 `formulaVersion` 으로 만들어져 있다 (`--rebuild` 로 다시 만든다) */
  alreadyBuilt: number
  /** `battleLog` 가 비었거나 라운드를 하나도 못 읽었다 */
  unreadable: number
  /** 응답의 `teamList` 로 **응답 주인**의 `team_no` 를 못 찾았다 */
  unknownTeamNo: number
  /** 팀이 둘로 안 잡혔다 — 상대 `team_no` 가 없으면 여섯 축이 전부 `null` 이다 */
  noFoeTeam: number
  /** `team_no → clan_no → 우리 클랜` 사슬이 끊겼다 (`teamList` 결측이거나 미연결 번호) */
  teamClanUnknown: number
  /** 클랜은 아는데 그 `Match` 의 어느 진영과도 맞지 않는다 */
  clanSideMismatch: number
}

export interface ClanHexV2BuildResult {
  /** 훑은 원문 줄 (클랜 응답) */
  rows: number
  /** 실제로 집계한 **경기** 수 */
  matches: number
  /** 쓸(쓴) 행 수 = 경기 × 클랜 */
  planned: number
  skips: ClanHexV2Skips
  /** `axesMeasured` 분포 — 첨자가 축 개수(0~6)다 */
  axesHistogram: number[]
  /** 축별로 **분모가 0이 아닌** 행 수 */
  axisRows: Record<string, number>
  /** 구역 파일 상태 */
  zones: ZoneLoad
  written: boolean
}

const zeroSkips = (): ClanHexV2Skips => ({
  unlinkedClanNo: 0,
  noMatch: 0,
  duplicateResponse: 0,
  alreadyBuilt: 0,
  unreadable: 0,
  unknownTeamNo: 0,
  noFoeTeam: 0,
  teamClanUnknown: 0,
  clanSideMismatch: 0,
})

/** 이 경기에서 이 클랜이 앉은 자리 한 줄 */
interface PlannedRow {
  matchId: string
  leagueClanId: string
  clanNo: string | null
  tally: ClanHexTally
}

/* -------------------------------------------------------------------------- */
/* 본체                                                                         */
/* -------------------------------------------------------------------------- */

export async function buildClanHexV2(input: {
  confirm: boolean
  /** 이만큼의 **경기**를 집계하면 멈춘다. 미리보기·소량 적재용 */
  limit?: number | null
  /** 리그 slug 로 좁힌다 (`supply` · `nolink` · `sanply`) */
  leagueSlug?: string | null
  /** 같은 `formulaVersion` 이 이미 있어도 다시 만든다 */
  rebuild?: boolean
  /** 구역 파일. 기본은 `data/barracks/style-zones.json`, `null` 이면 구역을 안 넘긴다 */
  zoneFile?: string | null
}): Promise<ClanHexV2BuildResult> {
  const zones = loadClanHexZones(input.zoneFile === undefined ? ZONE_FILE : input.zoneFile)
  const limit = input.limit ?? null
  const rebuild = input.rebuild === true

  /* 클랜번호 → 우리 클랜 (D-200). 못 이은 번호는 **버리지 않고 세어서 보고한다**.
     이 표는 수천 줄이라 통째로 올려도 안전하다 — 커지는 것은 원문 쪽이다 */
  const clanOfNumber = new Map<string, string>()
  for (const link of await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })) {
    clanOfNumber.set(link.clanNo, link.clanId)
  }

  const result: ClanHexV2BuildResult = {
    rows: 0,
    matches: 0,
    planned: 0,
    skips: zeroSkips(),
    axesHistogram: [0, 0, 0, 0, 0, 0, 0],
    axisRows: {
      '① 스나싸움': 0,
      '② 소수싸움': 0,
      '③ 세이브': 0,
      '④ 게임템포': 0,
      '⑤ B어택성공': 0,
      '⑥ A어택성공': 0,
    },
    zones,
    written: false,
  }

  /** 이미 읽은 경기키 — 같은 경기의 두 번째 응답은 섞지 않는다 (D-184) */
  const done = new Set<string>()

  let cursor: string | undefined
  let stop = false

  for (; !stop; ) {
    const rows = await prisma.barracksBattleLogRaw.findMany({
      where: { subjectKind: 'clan', status: 'ok' },
      select: { id: true, subject: true, matchKey: true, payload: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) break
    cursor = rows[rows.length - 1]?.id

    /* 이 배치가 건드리는 경기들만 읽는다. 같은 물리 경기가 여러 리그에 있다 (D-155) */
    const keys = [...new Set(rows.map((row) => row.matchKey))]
    const matches = await prisma.match.findMany({
      where: {
        sourceMatchId: { in: keys },
        ...(input.leagueSlug ? { league: { slug: input.leagueSlug } } : {}),
      },
      select: {
        id: true,
        sourceMatchId: true,
        redLeagueClanId: true,
        blueLeagueClanId: true,
        /* 클랜 **신원**만 읽는다. 부리그는 읽지 않는다 — 경기 당시 값은 `Match` 가
           스냅샷으로 들고 있고, 현재 부리그를 쓰면 승강 뒤 과거가 오염된다 (3-B 4번) */
        redClan: { select: { clanId: true } },
        blueClan: { select: { clanId: true } },
      },
    })
    const byKey = new Map<string, typeof matches>()
    for (const match of matches) {
      if (!match.sourceMatchId) continue
      const list = byKey.get(match.sourceMatchId)
      if (list) list.push(match)
      else byKey.set(match.sourceMatchId, [match])
    }

    /* 이미 만들어진 경기 — `--rebuild` 가 아니면 건너뛴다 (재개의 알맹이다) */
    const built = new Set<string>()
    if (!rebuild && matches.length > 0) {
      for (const row of await prisma.matchClanHexV2.findMany({
        where: {
          matchId: { in: matches.map((match) => match.id) },
          formulaVersion: CLAN_HEX_V2_FORMULA_VERSION,
        },
        select: { matchId: true },
      })) {
        built.add(row.matchId)
      }
    }

    for (const row of rows) {
      result.rows += 1
      if (done.has(row.matchKey)) {
        result.skips.duplicateResponse += 1
        continue
      }

      const clanId = clanOfNumber.get(row.subject)
      if (clanId === undefined) {
        result.skips.unlinkedClanNo += 1
        continue
      }
      const group = byKey.get(row.matchKey)
      if (group === undefined) {
        result.skips.noMatch += 1
        continue
      }
      /* 그 경기의 **모든** 리그 행이 이미 만들어져 있을 때만 건너뛴다.
         하나라도 비어 있으면 다시 계산해서 채운다 */
      if (!rebuild && group.every((match) => built.has(match.id))) {
        result.skips.alreadyBuilt += 1
        done.add(row.matchKey)
        continue
      }

      const raw = rawOf(row.payload)
      const events = raw.battleLog ?? []
      if (events.length === 0) {
        result.skips.unreadable += 1
        continue
      }

      /* `team_no` 는 클랜 번호지 진영이 아니다 (D-184). 응답이 짝을 알려 준다 */
      const clanByTeam = clanByTeamNo(raw.teamList ?? [])
      const teamNo = [...clanByTeam.entries()].find(([, no]) => no === row.subject)?.[0]
      if (teamNo === undefined) {
        result.skips.unknownTeamNo += 1
        continue
      }

      /* `wonRound` 를 넘기지 않는다 — 안 넘기면 `roundResultsOf(events)` 를 쓰고,
         `win_flag` 가 **이 응답 기준**이라 `teamNo` 와 짝이 맞는다 (D-184) */
      const hex = clanHexV2Of({ events, teamNo, teamSize: TEAM_SIZE, zones: zones.zones })
      if (hex === null) {
        result.skips.unreadable += 1
        continue
      }
      if (hex.foeTeamNo === null) {
        result.skips.noFoeTeam += 1
        continue
      }

      /* ── team_no ↔ LeagueClan 짝짓기.
         한 자리라도 못 이으면 **그 경기를 통째로 버린다.** 한쪽만 넣으면 경기 상세에서
         겹쳐 그릴 상대가 없고, 잘못 이으면 남의 클랜 값이 된다 */
      const planned: PlannedRow[] = []
      let failure: 'teamClanUnknown' | 'clanSideMismatch' | null = null
      for (const match of group) {
        for (const [tno, tally] of hex.byTeam) {
          const clanNo = clanByTeam.get(tno) ?? null
          const teamClanId = clanNo === null ? undefined : clanOfNumber.get(clanNo)
          if (teamClanId === undefined) {
            failure ??= 'teamClanUnknown'
            continue
          }
          let leagueClanId: string | null = null
          if (teamClanId === match.redClan.clanId) leagueClanId = match.redLeagueClanId
          else if (teamClanId === match.blueClan.clanId) leagueClanId = match.blueLeagueClanId
          if (leagueClanId === null) {
            failure ??= 'clanSideMismatch'
            continue
          }
          planned.push({ matchId: match.id, leagueClanId, clanNo, tally })
        }
      }
      /* 리그 행 하나당 클랜 둘 — 둘 다 안 나왔으면 짝짓기가 샌 것이다 */
      if (failure !== null || planned.length !== group.length * 2) {
        result.skips[failure ?? 'clanSideMismatch'] += 1
        continue
      }

      done.add(row.matchKey)
      result.matches += 1
      result.planned += planned.length
      for (const entry of planned) {
        const axes = axesMeasuredOf(entry.tally)
        result.axesHistogram[axes] = (result.axesHistogram[axes] ?? 0) + 1
        for (const [axis, live] of Object.entries(axisDenominators(entry.tally))) {
          if (live) result.axisRows[axis] = (result.axisRows[axis] ?? 0) + 1
        }
      }

      if (input.confirm) {
        for (const entry of planned) {
          const data = {
            clanNo: entry.clanNo,
            teamNo: entry.tally.teamNo,
            foeTeamNo: entry.tally.foeTeamNo,
            rounds: entry.tally.rounds,
            sidedRounds: entry.tally.sidedRounds,
            redRounds: entry.tally.redRounds,
            foeSnipers: entry.tally.foeSnipers,
            axesMeasured: axesMeasuredOf(entry.tally),
            /* `ClanHexTally` 통째. **비율은 없다** — 분자/분모만 둔다 (D-235) */
            tally: entry.tally as unknown as object,
            formulaVersion: CLAN_HEX_V2_FORMULA_VERSION,
            builtAt: new Date(),
          }
          await prisma.matchClanHexV2.upsert({
            where: {
              matchId_leagueClanId: {
                matchId: entry.matchId,
                leagueClanId: entry.leagueClanId,
              },
            },
            update: data,
            create: { matchId: entry.matchId, leagueClanId: entry.leagueClanId, ...data },
          })
        }
      }

      if (limit !== null && result.matches >= limit) {
        stop = true
        break
      }
    }
  }

  result.written = input.confirm
  return result
}
