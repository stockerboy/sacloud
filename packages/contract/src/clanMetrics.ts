/**
 * 클랜페이지 **지표** 중 배틀로그 없이 DB 만으로 되는 것들
 * (`docs/SITE_SPEC_V2.md` 5-3 · 5-4 · 5-5).
 *
 * ```
 * 티어별 승률   vs 1티어 51%(238판) · 2티어 58%(472판) …
 * 승률 추이     4월~현재를 보름 단위로 — n전 n승 n패 · 승률
 * 화력          이긴 판의 우리 팀 다섯 명 딜량 합, 그 평균
 * 최다연승      n연승 (펼치면 그때 멤버)
 * ```
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자 지시로 만든 신규 기능이고
 * `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 명시적 예외다 — 육각형(D-185)과 같은 취급이다.
 * 원본과 동일함이 검증되지 않았다 (3장 7번).
 *
 * ── 왜 계약에 두는가
 *   실제 서버(`apps/web/lib/server/queries/clanMetrics.ts`)와 Mock(`packages/mock`)이
 *   **같은 함수**를 부른다. 두 곳에서 따로 세면 mock↔live 대조가 조용히 어긋난다
 *   (`오늘 퍼포먼스`(D-182) · 육각형(D-185)과 같은 구조다).
 *
 * ── 모르는 값을 0 으로 채우지 않는다 (D-106)
 *   경기가 없는 보름 구간의 승률은 `0%` 가 아니라 `null` 이다. 0% 로 찍으면
 *   "그 보름 동안 다 졌다" 로 읽힌다. 실제로 말하려는 것은 **한 판도 안 했다** 이다.
 *   딜량이 결측인 참가자가 낀 경기도 마찬가지다 — 합이 거짓이 되므로 아예 뺀다 (D-034).
 *
 * ── 여기 **없는** 지표: 클린시트(반코트)
 *   원문은 `800판중 120회 n%` 다. 정의상 **라운드별 진영과 라운드 승패**가 있어야 한다
 *   (한 진영에서 5라운드를 전승했는가). 운영 스키마의 `Match` 에는 라운드 점수 칸이
 *   **아예 없고**(승패는 `winnerSide` 한 칸뿐), 라운드 복원은 배틀로그를 요구한다
 *   (`packages/nexon/src/roundSide.ts` · D-184).
 *   대체값으로 "완봉승" 을 세는 것도 같은 이유로 불가능하다 —
 *   상대가 딴 라운드 수를 DB 가 갖고 있지 않다. **지어내지 않고 만들지 않는다** (3장 7번).
 */
import { z } from 'zod'
import { Count, IsoDate, IsoDateTime, Percent } from './common'
import { PlayerSummary } from './entities/summaries'
import { winRate } from './derive'

/* -------------------------------------------------------------------------- */
/* 상수                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 추이 한 칸의 길이 — **보름 = 15일** (원문 "보름단위기록").
 *
 * 달의 상순/하순(1~15 · 16~말일)으로 자르지 않는다. 그렇게 자르면 칸 길이가
 * 15·16·13·14일로 들쭉날쭉해져 승률을 나란히 비교할 수 없다.
 * 대신 **시즌 창 시작에서 15일씩** 떨어진 고정 길이로 자른다 — 그래서 뒤로 갈수록
 * 칸 경계가 달 경계에서 밀린다(`5/31~6/14`). 길이가 같은 쪽을 골랐다.
 *
 * > `[미확인]` 원문은 "보름단위" 라고만 했고 경계를 정하지 않았다.
 */
export const CLAN_TREND_BUCKET_DAYS = 15

/**
 * 추이 칸 수의 상한.
 *
 * 칸 개수는 시즌 창 길이에서 나오므로 정상적으로는 열몇 개다. 창 끝이 잘못된 데이터
 * (미래 날짜 경기 한 건) 때문에 튀면 화면이 수백 칸으로 늘어나므로 여기서 막는다.
 * 상한에 걸리면 **뒤(최근)쪽을 남긴다** — 최근이 더 중요하다.
 */
export const CLAN_TREND_MAX_BUCKETS = 48

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/* -------------------------------------------------------------------------- */
/* 스키마                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 티어별 승률 한 줄 — `vs 2티어 58%(472판)`.
 *
 * `division` 은 **그 경기 당시 상대 클랜의 부리그**다 (`Match.{red,blue}DivisionAtMatch`).
 * 지금 부리그를 쓰면 승격·강등 뒤에 과거 경기가 통째로 오염된다 (`CLAUDE.md` 3-B 4번).
 *
 * 한 판도 안 한 티어도 **줄은 남긴다** — 원문 개인페이지가 `vs 4티어 0판 승률-` 을
 * 그대로 적어 두었기 때문이다. 그때 `win_rate` 는 `0` 이 아니라 `null` 이다.
 */
export const ClanTierRecord = z.object({
  /** 1티어 · 2티어 … (무소속리그는 1~6 · D-181) */
  division: z.number().int().min(1),
  games: Count,
  win: Count,
  lose: Count,
  /** 한 판도 없으면 `null` (D-106) */
  win_rate: Percent.nullable(),
})
export type ClanTierRecord = z.infer<typeof ClanTierRecord>

/** 승률 추이 한 칸 — 보름 */
export const ClanTrendBucket = z.object({
  /** 칸의 첫날 (KST) */
  start: IsoDate,
  /** 칸의 마지막 날 (KST · 포함) */
  end: IsoDate,
  /** 화면에 그대로 쓰는 표기 — `4/1~4/15` */
  label: z.string(),
  games: Count,
  win: Count,
  lose: Count,
  /** 그 보름에 경기가 없으면 `null`. **0% 로 채우지 않는다** (D-106) */
  win_rate: Percent.nullable(),
})
export type ClanTrendBucket = z.infer<typeof ClanTrendBucket>

/**
 * 화력 — 원문 "4월부터현재까지의 승리한 판의 팀 전체 딜량의 평균".
 *
 * 즉 **이긴 경기만**, 그 경기에서 **우리 클랜 다섯 명 딜량의 합**, 그것들의 평균이다.
 * 한 명이라도 딜량이 결측이거나 라인업이 다섯 명에 못 미치면 그 경기의 합은 거짓이라
 * 통째로 뺀다 (D-034 · D-148). 몇 판을 뺐는지도 함께 내보낸다 — 표본이 얼마나
 * 깎였는지 화면이 말할 수 있어야 한다.
 *
 * ── `[미확인]` 원문 예시(`ex950딜`)와 자릿수가 맞지 않는다
 *   글자 그대로 읽으면 **팀 합계**이고, 실측값은 7,800~7,900 이다.
 *   한 명 평균으로 읽으면 1,500~1,600 이다. 어느 쪽도 950 이 아니다.
 *   그래서 **원문대로 팀 합계를 기본값으로 두되**, 한 명 평균(`per_player_avg`)도
 *   함께 내보낸다. 사용자가 "950" 의 기준을 알려 주면 화면 표기만 바꾸면 된다.
 *   (사용자 지시 — "바꿀 때는 전 버전도 남긴다")
 */
export const ClanFirepower = z.object({
  /** 평균에 실제로 들어간 경기 수 */
  matches: Count,
  /** 딜량 결측·라인업 미완으로 뺀 승리 경기 수 */
  excluded: Count,
  /** 팀 전체 딜량의 평균. 셀 수 있는 경기가 하나도 없으면 `null` */
  team_damage_avg: z.number().min(0).nullable(),
  /**
   * 같은 표본을 **한 명 기준**으로 환산한 값 (`team_damage_avg / 5`).
   * 원문 예시가 팀 합계가 아니라 개인 딜량을 뜻했을 가능성 때문에 함께 낸다 `[미확인]`.
   */
  per_player_avg: z.number().min(0).nullable(),
})
export type ClanFirepower = z.infer<typeof ClanFirepower>

/** 최다연승 구간에 뛴 선수 한 명 */
export const ClanStreakMember = z.object({
  player: PlayerSummary,
  /** 그 연승 구간에서 몇 판 뛰었나 */
  games: Count,
})
export type ClanStreakMember = z.infer<typeof ClanStreakMember>

/**
 * 최다연승 — `n연승 (멤버보기)`.
 *
 * 같은 길이의 연승이 여러 번이면 **가장 최근 것**을 쓴다. 멤버를 펼쳐 보는 화면이라
 * 오래된 명단보다 최근 명단이 쓸모 있다.
 * > `[미확인]` 동률일 때 어느 것을 쓰는지 원문에 없다. 우리가 정했다.
 */
export const ClanWinStreak = z.object({
  count: Count,
  /** 연승 첫 경기 시각. 연승이 없으면 `null` */
  from: IsoDateTime.nullable(),
  /** 연승 마지막 경기 시각 */
  to: IsoDateTime.nullable(),
  /** 그 구간에 뛴 선수 — 많이 뛴 순 */
  members: z.array(ClanStreakMember),
})
export type ClanWinStreak = z.infer<typeof ClanWinStreak>

/** 클랜페이지가 한 번에 받는 지표 묶음 */
export const ClanMetrics = z.object({
  /** 집계에 들어간 경기 수 — 아래 값들이 몇 판을 보고 나온 것인지 */
  games: Count,
  win: Count,
  lose: Count,
  /** 1티어부터 차례로. 판수 0인 티어도 줄은 있다 */
  tiers: z.array(ClanTierRecord),
  /** 시즌 창 시작부터 보름씩. 경기가 없는 칸도 자리를 지킨다 */
  trend: z.array(ClanTrendBucket),
  firepower: ClanFirepower,
  best_win_streak: ClanWinStreak,
  /**
   * 읽을 수 있는 경기를 **다 읽었나**.
   *
   * 부르는 쪽이 상한(`SCAN_LIMIT`)을 걸어 자를 수 있다. 잘렸는데 아무 말도 안 하면
   * 승률 추이 마지막 칸들이 빈 칸으로 나가서 "그동안 쉬었다" 로 읽힌다 —
   * 실제로는 우리가 안 읽은 것이다. 그래서 잘렸다는 사실을 응답에 싣는다
   * (교차검증 [중간 4]).
   */
  truncated: z.boolean(),
})
export type ClanMetrics = z.infer<typeof ClanMetrics>

/* -------------------------------------------------------------------------- */
/* 입력 — 실제 서버와 Mock 이 **같은 모양**으로 맞춰 넣는다                          */
/* -------------------------------------------------------------------------- */

/**
 * 집계에 들어가는 경기 한 건.
 *
 * 모집단을 고르는 일(래더 반영 여부 · 시즌 창)은 **부르는 쪽**이 한다
 * (`withLadderMatch()` + `seasonWindowWhere()`). 여기 오는 것은 이미 골라진 경기다.
 */
export interface ClanMatchRow {
  id: string
  startAt: Date
  /** 우리 클랜이 이겼나 */
  won: boolean
  /** **그 경기 당시** 상대 클랜의 부리그 (3-B 4번) */
  opponentDivision: number
  /**
   * 우리 팀 다섯 명 딜량의 합. 한 명이라도 결측이거나 다섯이 아니면 `null`.
   *
   * 진 경기의 값은 쓰이지 않는다 — 화력은 이긴 판만 센다.
   */
  teamDamage: number | null
}

/** 최다연승 구간 — 어느 경기들이었는지까지 돌려준다(멤버를 그 경기들에서 읽는다) */
export interface ClanStreakSpan {
  count: number
  matchIds: string[]
  from: Date | null
  to: Date | null
}

/* -------------------------------------------------------------------------- */
/* 계산                                                                        */
/* -------------------------------------------------------------------------- */

/** 승률 — 한 판도 없으면 `null` 이다. `winRate(0,0)` 은 0 을 주므로 그대로 쓸 수 없다 */
function rateOrNull(win: number, lose: number): number | null {
  return win + lose === 0 ? null : winRate(win, lose)
}

/** `YYYY-MM-DD` (KST). 버킷 경계는 하루 경계(오전 7시 · D-186)가 아니라 **절대 시각**이다 */
function kstDate(at: Date): string {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** `2026-04-01` → `4/1` */
function shortLabel(isoDate: string): string {
  const parts = isoDate.split('-')
  return `${Number(parts[1])}/${Number(parts[2])}`
}

/**
 * 티어별 승률.
 *
 * 줄은 `1 ~ max(divisionCount, 실제로 만난 최대 티어)` 까지 만든다.
 * 리그 설정보다 큰 티어가 기록에 있으면(승강 이력·리그 개편) 그 줄도 버리지 않는다.
 */
export function clanTierRecords(
  rows: readonly ClanMatchRow[],
  divisionCount: number,
): ClanTierRecord[] {
  const tally = new Map<number, { win: number; lose: number }>()
  let maxSeen = 0
  for (const row of rows) {
    const division = row.opponentDivision
    if (!Number.isInteger(division) || division < 1) continue
    if (division > maxSeen) maxSeen = division
    const entry = tally.get(division) ?? { win: 0, lose: 0 }
    if (row.won) entry.win += 1
    else entry.lose += 1
    tally.set(division, entry)
  }

  const last = Math.max(divisionCount, maxSeen, 1)
  const out: ClanTierRecord[] = []
  for (let division = 1; division <= last; division += 1) {
    const entry = tally.get(division) ?? { win: 0, lose: 0 }
    out.push({
      division,
      games: entry.win + entry.lose,
      win: entry.win,
      lose: entry.lose,
      win_rate: rateOrNull(entry.win, entry.lose),
    })
  }
  return out
}

/**
 * 승률 추이 — `windowFrom` 부터 보름씩, `windowUntil` 이 든 칸까지.
 *
 * `windowUntil` 은 **부르는 쪽이 데이터에서 뽑아 준다**(리그의 마지막 경기 시각).
 * `new Date()` 를 쓰지 않는다 — 요청마다 칸 수가 달라지면 같은 DB 에서도 화면이 흔들린다
 * (`season0Scope.ts` 가 창 끝을 열어 둔 것과 같은 이유다).
 */
export function clanTrendBuckets(
  rows: readonly ClanMatchRow[],
  windowFrom: Date,
  windowUntil: Date,
): ClanTrendBucket[] {
  const bucketMs = CLAN_TREND_BUCKET_DAYS * DAY_MS
  const startMs = windowFrom.getTime()
  const spanMs = Math.max(windowUntil.getTime() - startMs, 0)
  const wanted = Math.floor(spanMs / bucketMs) + 1
  const total = Math.min(wanted, CLAN_TREND_MAX_BUCKETS)
  /* 상한에 걸리면 최근 쪽을 남긴다 */
  const firstIndex = wanted - total

  const tally = new Map<number, { win: number; lose: number }>()
  for (const row of rows) {
    const offset = row.startAt.getTime() - startMs
    if (offset < 0) continue
    const index = Math.floor(offset / bucketMs)
    if (index < firstIndex || index >= wanted) continue
    const entry = tally.get(index) ?? { win: 0, lose: 0 }
    if (row.won) entry.win += 1
    else entry.lose += 1
    tally.set(index, entry)
  }

  const out: ClanTrendBucket[] = []
  for (let index = firstIndex; index < wanted; index += 1) {
    const entry = tally.get(index) ?? { win: 0, lose: 0 }
    const from = new Date(startMs + index * bucketMs)
    /* 칸의 마지막 **날** — 다음 칸 시작 1ms 전이 속한 날짜다 */
    const end = new Date(startMs + (index + 1) * bucketMs - 1)
    const startKey = kstDate(from)
    const endKey = kstDate(end)
    out.push({
      start: startKey,
      end: endKey,
      label: `${shortLabel(startKey)}~${shortLabel(endKey)}`,
      games: entry.win + entry.lose,
      win: entry.win,
      lose: entry.lose,
      win_rate: rateOrNull(entry.win, entry.lose),
    })
  }
  return out
}

/**
 * 화력 — 이긴 판의 팀 전체 딜량 평균.
 *
 * 소수점 1자리까지 남긴다. 정수로 반올림해 버리면 표본이 적은 클랜에서 값이 계단처럼 튄다.
 */
export function clanFirepower(rows: readonly ClanMatchRow[]): ClanFirepower {
  let matches = 0
  let excluded = 0
  let sum = 0
  for (const row of rows) {
    if (!row.won) continue
    if (row.teamDamage === null) {
      excluded += 1
      continue
    }
    matches += 1
    sum += row.teamDamage
  }
  const teamAvg = matches === 0 ? null : Math.round((sum / matches) * 10) / 10
  return {
    matches,
    excluded,
    team_damage_avg: teamAvg,
    /* 라인업이 정확히 다섯 명일 때만 합에 넣었으므로 나누는 수는 언제나 5 다 */
    per_player_avg: teamAvg === null ? null : Math.round((teamAvg / 5) * 10) / 10,
  }
}

/**
 * 최다연승 구간.
 *
 * `rows` 는 **시각 오름차순**이어야 한다. 같은 길이가 여러 번이면 뒤에 나온 것이 이긴다
 * (가장 최근 연승).
 */
export function clanBestWinStreak(rows: readonly ClanMatchRow[]): ClanStreakSpan {
  let best: ClanMatchRow[] = []
  let current: ClanMatchRow[] = []
  for (const row of rows) {
    if (row.won) {
      current.push(row)
      /* `>=` 라서 동률이면 나중 것으로 갈아탄다 */
      if (current.length >= best.length) best = [...current]
    } else {
      current = []
    }
  }
  const first = best[0]
  const last = best[best.length - 1]
  return {
    count: best.length,
    matchIds: best.map((row) => row.id),
    from: first ? first.startAt : null,
    to: last ? last.startAt : null,
  }
}

/**
 * 지표 묶음.
 *
 * `streakMembers` 는 `clanBestWinStreak(rows).matchIds` 의 경기들에서 **부르는 쪽이**
 * 읽어 온다 — 연승 구간은 보통 열몇 경기라, 전 경기의 라인업을 읽지 않으려고 나눴다.
 * 여기서 구간을 한 번 더 세지만 O(n) 이라 값이 두 벌 생기는 것보다 낫다.
 *
 * `toIso` 는 시각 표기를 부르는 쪽 규칙(KST 오프셋 표기)에 맞추기 위한 것이다 —
 * 계약이 날짜 포맷을 두 벌 갖지 않게 한다.
 */
export function buildClanMetrics(input: {
  /** 시각 **오름차순**. 모집단은 부르는 쪽이 이미 골라 놓았다 */
  rows: readonly ClanMatchRow[]
  divisionCount: number
  windowFrom: Date
  windowUntil: Date
  streakMembers: readonly ClanStreakMember[]
  toIso: (at: Date) => string
  /** 상한에 걸려 일부 경기를 못 읽었으면 `true`. 안 넘기면 `false` */
  truncated?: boolean
}): ClanMetrics {
  const { rows, divisionCount, windowFrom, windowUntil, streakMembers, toIso } = input
  const streak = clanBestWinStreak(rows)
  let win = 0
  for (const row of rows) if (row.won) win += 1

  return {
    truncated: input.truncated ?? false,
    games: rows.length,
    win,
    lose: rows.length - win,
    tiers: clanTierRecords(rows, divisionCount),
    trend: clanTrendBuckets(rows, windowFrom, windowUntil),
    firepower: clanFirepower(rows),
    best_win_streak: {
      count: streak.count,
      from: streak.from ? toIso(streak.from) : null,
      to: streak.to ? toIso(streak.to) : null,
      members: [...streakMembers],
    },
  }
}
