import { prisma } from '@sacloud/db'
import { V2_RATING_CONSTANTS } from '@sacloud/rating'

import { log } from '../lib/log.js'

/**
 * ★★경기별 래더 증감을 받아 적는다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「★증감 미기록★ 이 왜있어 pl에 일단 이 사이트내에 있는 증감미기록 다 없애고
 * >  저거 다 원래대로 기록하고 ★다 기록남겨★」
 *
 * ── 무엇이 문제였나 (실측 2026-09-21)
 *
 *   ```
 *   9/3 이후 참가줄 · 증감이 있는 줄
 *     IPL   61,141 중 ★0★      열산  11,070 중 ★0★
 *     PL     8,846 중 ★0★      C1     8,030 중 ★0★
 *   ```
 *   경기 하나를 펼치면 래더 칸에 ★「증감 미기록」★ 이 적혔다.
 *
 *   ★값이 없어서가 아니었다.★ 30분마다 도는 집계가 경기별 증감을 ★전부 계산★ 하는데,
 *   `runSeason0` 이 `runRate` 를 ★dryRun★ 으로 부르는 바람에 ―
 *   ```
 *   if (ctx.dryRun) { … return result }   ← 「받아 적기」 바로 앞에서 돌아간다
 *   ```
 *   ★합계만 쓰고 경기별 증감은 버렸다.★ 이 잡이 그 버려지던 값을 받아 적는다.
 *
 * ── ★화면에 보이는 점수와 같은 잣대로 적는다★
 *
 *   내부 점수와 화면 점수는 눈금이 다르다. 그대로 적으면 ―
 *   ```
 *   경기마다 +13 · +9 …  그런데 래더는 3,138점      ← 더해도 안 맞는다
 *   ```
 *   사장님이 「기본정보 13.4점 vs 랭킹 3,307점」 으로 잡으신 그 병이다.
 *
 *   그래서 ★무기별 증감과 똑같은 비율(`shrink`)로 줄여서★ 적는다 —
 *   ```
 *   shrink = (표시 − 3000) / (내부 − 3000)
 *   ```
 *   한 선수의 ★경기별 증감을 전부 더하면 그 선수의 래더★ 가 된다.
 *   `season0Apply` 의 무기별 증감이 쓰는 식과 ★한 글자도 다르지 않다.★
 *
 * ── 지키는 것
 *
 *   ⚠ ★바뀐 줄만 쓴다★ (`IS DISTINCT FROM`). 30분마다 십만 줄을 다시 쓰면
 *     2GB VPS 가 못 버틴다. 첫 판만 무겁고 그 뒤로는 새 경기뿐이다.
 *   ⚠ ★`sourceRatingDelta`(원본 미러 값)는 한 칸도 안 건드린다.★ 9/3 이전 기록이다.
 *   ⚠ ★`formulaVersion` 을 적지 않는다★ — 이 값은 «받아 적은 것» 이지
 *     `rate` 가 비-dryRun 으로 쓴 정식 replay 가 아니다. 둘을 섞지 않는다.
 */

/**
 * ★되돌림 스위치★ (`CLAUDE.md` 1-4) — `false` 로 두면 옛 방식 그대로다.
 * 옛 방식은 «경기별 증감을 안 쓴다» 였고 화면에 「증감 미기록」 이 떴다.
 */
export const WRITE_MATCH_DELTA = true as boolean

/** 한 번에 몇 줄씩 쓰나 — 잠금을 오래 쥐지 않는 크기 */
const CHUNK = 1000

const INITIAL = V2_RATING_CONSTANTS.initialRating
const SCALE = V2_RATING_CONSTANTS.displayScale

export interface MatchDeltaStat {
  matchId: string
  playerId: string
  ratingBefore: number
  ratingUpdate: number
  ratingAfter: number
}

export interface MatchDeltaPlayer {
  playerId: string
  /** 화면에 보이는 점수 */
  display: number
  /** 공식이 굴린 내부 점수 */
  internal: number
}

export interface MatchDeltaApplyResult {
  /** 받아 적을 후보 줄 */
  candidates: number
  /** 실제로 바뀐 줄 */
  written: number
  /** 선수의 표시 점수를 몰라 건너뛴 줄 */
  noScale: number
  confirmed: boolean
}

const round = (v: number): number => Math.round(v)

/**
 * 계산된 경기별 증감을 `MatchPlayerStat` 에 받아 적는다.
 *
 * @param stats   `runSeason0` 이 들고 온 경기별 증감 (내부 눈금)
 * @param players 그 리그 선수들의 표시·내부 점수 — 줄이는 비율을 여기서 얻는다
 */
export async function applyMatchDeltas(
  stats: MatchDeltaStat[],
  players: MatchDeltaPlayer[],
  options: { confirm?: boolean } = {},
): Promise<MatchDeltaApplyResult> {
  const confirm = options.confirm ?? false
  const result: MatchDeltaApplyResult = {
    candidates: stats.length,
    written: 0,
    noScale: 0,
    confirmed: confirm,
  }
  if (!WRITE_MATCH_DELTA || stats.length === 0) return result

  /*
   * ★선수마다 줄이는 비율★ — `season0Apply` 의 무기별 증감과 같은 식이다.
   *   내부가 시작점 그대로면(한 판도 안 뛴 사람) 나눌 수 없다 → 기본 배율을 쓴다.
   */
  const shrinkOf = new Map<string, number>()
  for (const p of players) {
    const internalAbove = p.internal - INITIAL
    const displayAbove = p.display - INITIAL
    shrinkOf.set(p.playerId, internalAbove !== 0 ? displayAbove / internalAbove : SCALE)
  }

  const rows: { matchId: string; playerId: string; before: number; upd: number; after: number }[] =
    []
  for (const s of stats) {
    const shrink = shrinkOf.get(s.playerId)
    if (shrink === undefined) {
      /* 이 선수의 표시 점수를 모른다 — ★추측해서 적지 않는다★ (D-106) */
      result.noScale += 1
      continue
    }
    rows.push({
      matchId: s.matchId,
      playerId: s.playerId,
      before: round(INITIAL + (s.ratingBefore - INITIAL) * shrink),
      upd: round(s.ratingUpdate * shrink),
      after: round(INITIAL + (s.ratingAfter - INITIAL) * shrink),
    })
  }

  if (!confirm) {
    log(
      `경기별 증감 — 후보 ${result.candidates} · 적을 수 있음 ${rows.length} · ` +
        `비율모름 ${result.noScale} (미리보기)`,
    )
    return result
  }

  /*
   * ★바뀐 줄만 쓴다★ — `IS DISTINCT FROM` 이 없으면 30분마다 십만 줄을 다시 쓴다.
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    const values = part
      .map(
        (_r, n) =>
          `($${n * 5 + 1}, $${n * 5 + 2}, $${n * 5 + 3}::int, $${n * 5 + 4}::int, $${n * 5 + 5}::int)`,
      )
      .join(', ')
    const params: (string | number)[] = []
    for (const r of part) params.push(r.matchId, r.playerId, r.before, r.upd, r.after)

    const sql =
      'UPDATE "MatchPlayerStat" s SET ' +
      '"ratingBefore" = v.before, "ratingUpdate" = v.upd, "ratingAfter" = v.after ' +
      `FROM (VALUES ${values}) AS v("matchId", "playerId", before, upd, after) ` +
      'WHERE s."matchId" = v."matchId" AND s."playerId" = v."playerId" ' +
      'AND (s."ratingUpdate" IS DISTINCT FROM v.upd OR s."ratingBefore" IS DISTINCT FROM v.before)'
    result.written += await prisma.$executeRawUnsafe(sql, ...params)
  }

  log(
    `경기별 증감 — 후보 ${result.candidates} · ★쓴 줄 ${result.written}★ · ` +
      `비율모름 ${result.noScale}`,
  )
  return result
}
