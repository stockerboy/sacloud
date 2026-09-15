/**
 * ★한 판 육각★ — 그 경기 열 명 각각을 ★이 한 판에서 뛴 것만★ 으로 잰다 (2026-09-15 사장님).
 *
 * > «이거 아티팩트처럼 매경기마다 이거 선수개개인 육각형 보여줄 수 있으면 진짜 좋겠는데 사이트터져?»
 *
 * ── 안 터진다 (실측)
 *   ```
 *   재료(MatchPlayerHex)가 IPL 1,148판 중 1,138판에 열 명 다 있다 (99.1%)
 *   ★읽는 값을 늘리지 않는다★ — 경기 상세는 이미 이 표를 세이브 때문에 읽고 있었다.
 *   칸만 더 받으므로 왕복은 그대로 한 번이고, 응답이 사람당 여섯 줄 늘어난다 (+1.7KB)
 *   ```
 *
 * ── ★문턱을 두지 않는다★
 *   사장님: «1번중 1번은 100퍼센트가 맞잖아».
 *   랭킹·깃발은 «1/1 = 100%» 가 «7/10 = 70%» 를 이기면 줄이 뒤집혀 문턱이 필요하다
 *   (`FLAG_GATE_RANKED`). 여기는 ★줄을 세우는 자리가 아니라 그 판을 설명하는 자리★ 라
 *   `FLAG_GATE_RAW`(=1) 를 쓰고, 대신 «몇 번 중 몇 번» 을 같이 실어 보낸다.
 *
 * ── 백분위는 ★그 판에 뛴 사람들 안에서★ 낸다
 *   시즌 분포로 그리면 «이 판에서 누가 잘했나» 가 아니라 «원래 잘하는 사람» 이 나온다.
 *   축 계산식은 계약(`dayAxisValues`)을 그대로 쓴다 — 여기서 지어내지 않는다.
 */
import {
  FLAG_AXIS_ORDER,
  FLAG_GATE_RAW,
  dayAxisParts,
  dayAxisValues,
  dayAxisScores,
  flagPercentileMid,
  saveScaleOf,
  playerHexLabelOf,
  type FlagDayTally,
  type MatchPlayerStat,
  type TraitAxisKey,
} from '@sacloud/contract'

/** 이 표에서 받아 오는 칸 — 경기 상세가 세이브 때문에 어차피 읽는 줄이다 */
export const MATCH_HEX_SELECT = {
  playerId: true,
  weapon: true,
  rounds: true,
  kills: true,
  firstKills: true,
  maxRoundKills: true,
  maxRoundTimes: true,
  burstRounds: true,
  aloneRounds: true,
  aloneWon: true,
  outRounds: true,
  outWon: true,
  duelWon: true,
  duelLost: true,
} as const

export interface MatchHexRow {
  playerId: string
  weapon: number | null
  rounds: number
  kills: number
  firstKills: number
  maxRoundKills: number
  maxRoundTimes: number
  burstRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  duelWon: number
  duelLost: number
}

/** 경기 상세가 이미 갖고 있는 참가자 줄 — 여기서 필요한 칸만 받는다 */
interface StatLike {
  playerId: string
  side: string
  weapon: number | null
  kill: number | null
  death: number | null
}

type Axis = MatchPlayerStat['hexagon'][number]

/** «판당 몇 번» 인 축 — 나머지는 퍼센트다 (깃발·오늘의 셋과 같은 구분) */
const PER_GAME = new Set<string>(['carry', 'opening', 'burst'])

/**
 * ★세이브만 백분위를 안 쓴다★ (2026-09-15 사장님) — 횟수 고정 눈금이다.
 *
 * > «세이브도 그냥 횟수로 넣어야할듯 퍼센트가 아니라 (…) 0회는 그래프가 움직이면 안되고»
 *
 * 한 판에 ★전원 0회★ 인 경기가 흔하다. 백분위로 그리면 그 열 명이 모두 가운데에 찍혀서
 * «아무도 못 한 판» 이 «다들 보통은 했다» 로 보인다. 횟수는 그런 거짓말을 안 한다.
 * 눈금은 계약의 `saveScaleOf` 가 정한다 (0회 중심 · 1회 중간테두리 · 4회 바깥테두리).
 */
const SAVE_BY_COUNT = true

/**
 * 열 명을 한꺼번에 접는다.
 *
 * 배틀로그 줄이 없는 선수는 ★아예 넣지 않는다★ — 빈 육각을 그리면
 * «못 잰 사람» 과 «못한 사람» 이 같아 보인다 (D-106).
 */
export function matchHexOf(
  rows: readonly MatchHexRow[],
  stats: readonly StatLike[],
  winnerSide: string | null,
): Map<string, Axis[]> {
  const out = new Map<string, Axis[]>()
  if (rows.length === 0) return out

  const statOf = new Map(stats.map((s) => [s.playerId, s]))
  const built: {
    playerId: string
    weapon: 0 | 1 | null
    values: Record<string, number | null>
    scores: Record<string, number | null>
    parts: ReturnType<typeof dayAxisParts>
  }[] = []

  for (const row of rows) {
    const stat = statOf.get(row.playerId)
    if (stat === undefined) continue
    /* 육각을 만든 무기가 먼저다 — 없으면 스코어보드의 무기를 본다 */
    const weapon: 0 | 1 | null =
      row.weapon === 0 || row.weapon === 1
        ? row.weapon
        : stat.weapon === 0 || stat.weapon === 1
          ? stat.weapon
          : null
    const won = winnerSide !== null && stat.side === winnerSide
    const tally: FlagDayTally = {
      games: 1,
      win: won ? 1 : 0,
      lose: won ? 0 : 1,
      kill: stat.kill ?? row.kills,
      death: stat.death ?? 0,
      rounds: row.rounds,
      firstKills: row.firstKills,
      maxRoundKills: row.maxRoundKills,
      maxRoundTimes: row.maxRoundTimes,
      burstRounds: row.burstRounds,
      aloneRounds: row.aloneRounds,
      aloneWon: row.aloneWon,
      outRounds: row.outRounds,
      outWon: row.outWon,
      /* 싸움은 무기 한 쪽에만 쌓인다 — 표에는 합쳐 있어서 여기서 나눈다 */
      sniperDuelWon: weapon === 1 ? row.duelWon : 0,
      sniperDuelLost: weapon === 1 ? row.duelLost : 0,
      rifleDuelWon: weapon === 0 ? row.duelWon : 0,
      rifleDuelLost: weapon === 0 ? row.duelLost : 0,
      weapon,
    }
    built.push({
      playerId: row.playerId,
      weapon,
      /* ★문턱 1★ — 한 번만 겪어도 적는다 (사장님: «1번중 1번은 100퍼센트가 맞잖아») */
      values: dayAxisValues(tally, FLAG_GATE_RAW),
      /* 줄 세우는 잣대는 따로다 — 캐리력·선짤은 적는 값과 다르다 (2026-09-15) */
      scores: dayAxisScores(tally, FLAG_GATE_RAW),
      parts: dayAxisParts(tally),
    })
  }
  if (built.length === 0) return out

  /* 모집단은 ★이 판에 뛴 사람들★ 이다 */
  const pools = new Map<string, number[]>()
  for (const key of FLAG_AXIS_ORDER) {
    pools.set(
      key,
      built
        .map((b) => b.scores[key])
        .filter((v): v is number => v !== null && v !== undefined)
        .sort((a, b) => a - b),
    )
  }

  for (const b of built) {
    out.set(
      b.playerId,
      FLAG_AXIS_ORDER.map((key) => {
        const value = b.values[key] ?? null
        const part = b.parts[key]
        /* 세이브는 «이긴 횟수» 를 그대로 값으로 쓰고, 자리도 고정 눈금이 정한다 */
        const saveCount = part.numerator ?? 0
        const isSave = SAVE_BY_COUNT && key === 'save'
        return {
          key,
          label: playerHexLabelOf(key as TraitAxisKey, b.weapon),
          value: isSave ? saveCount : value,
          pct: isSave ? saveScaleOf(saveCount) : flagPercentileMid(pools.get(key) ?? [], b.scores[key] ?? null),
          unit: isSave || PER_GAME.has(key) ? ('per_game' as const) : ('percent' as const),
          numerator: part.numerator,
          denominator: part.denominator,
        }
      }),
    )
  }
  return out
}
