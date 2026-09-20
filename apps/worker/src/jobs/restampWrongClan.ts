import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/**
 * ★★상대 팀 마크를 달고 있는 참가 기록을 고친다★★ (2026-09-20 사장님)
 *
 * > 「왜 소속이 sometimes인데 우리 사이트는 igloo소속으로 보여.
 * >  지금 sometimes 소속이면 저기서도 sometimes로 보여야지」
 *
 * ── 무슨 일이 있었나 (실측)
 *
 *   `stampPlayerClan` 은 참가 기록에 ★그 선수 본인의 소속★ 을 도장 찍는다.
 *   용병이 남의 팀 마크를 달고 나오는 것을 막으려고 만든 칸이다.
 *   ⚠ 그런데 그 도장은 ★찍을 당시의 `LeaguePlayer.clanId`★ 를 그대로 쓴다.
 *     우리 클랜원 명부가 ★11일 동안 멈춰 있어서★ 그 값이 낡아 있었다.
 *
 *   ```
 *     9/18 경기   sometimes 편에서 뛴 다섯 명
 *     9/19 도장   그중 넷이 ★igloo★ (= 상대 팀)      ← 9/9 명부를 봤다
 *     9/20 명부   그 넷은 이미 sometimes 소속
 *   ```
 *   그래서 화면에 ★같은 팀 다섯 명이 서로 다른 클랜★ 으로 나왔다.
 *
 * ── ★무엇을 「틀렸다」 고 보나★
 *
 *   ★도장이 그 경기의 「상대 팀」 을 가리키면 틀린 것이다.★
 *   용병은 ★제3의 클랜★ 사람이지, ★상대 클랜 사람일 수는 없다★ —
 *   상대 팀 소속인 채로 우리 편에서 뛰는 일은 없다.
 *   그래서 이 기준은 ★용병을 한 명도 건드리지 않는다.★
 *
 *   실측 (2026-09-20 · 도장 찍힌 68,955줄):
 *   ```
 *     자기 팀 도장    54,375줄   맞다 — 안 건드린다
 *     제3 클랜 도장   13,447줄   용병일 수 있다 — ★안 건드린다★
 *     ★상대 팀 도장    1,133줄★   ★틀렸다 — 이것만 고친다★
 *   ```
 *
 * ── ★무엇으로 다시 찍나★
 *
 *   ★그 경기에서 실제로 뛴 팀★ 으로 찍는다. 배틀로그가 증명하는 사실이라
 *   추측이 아니다. ⚠ 「지금 소속」 으로 찍지 않는다 — 그러면 그 사이 이적한
 *   사람의 과거 경기가 또 틀어진다 (도장의 본뜻이 깨진다).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon restamp-wrong-clan            # 미리보기
 * pnpm --filter @sacloud/worker nexon restamp-wrong-clan --confirm  # 반영
 * ```
 */

export interface RestampResult {
  /** 상대 팀 도장을 달고 있던 줄 */
  wrong: number
  /** 실제로 고친 줄 */
  fixed: number
  confirmed: boolean
}

/** 도장이 ★상대 팀★ 을 가리키는 줄만 고른다 — 용병(제3 클랜)은 걸리지 않는다 */
const WRONG_WHERE = `
      s."playerClanId" IS NOT NULL
  AND m."supersededAt" IS NULL
  AND s."playerClanId" = CASE WHEN s."side" = 'red' THEN bl."clanId" ELSE rl."clanId" END`

export async function runRestampWrongClan(input: { confirm: boolean }): Promise<RestampResult> {
  const counted = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n
       FROM "MatchPlayerStat" s
       JOIN "Match" m       ON m."id"  = s."matchId"
       JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
       JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
      WHERE ${WRONG_WHERE}`,
  )
  const out: RestampResult = {
    wrong: Number(counted[0]?.n ?? 0),
    fixed: 0,
    confirmed: input.confirm,
  }

  if (input.confirm && out.wrong > 0) {
    /* ★뛴 팀으로 다시 찍는다★ — 한 문장이다. 줄이 천 단위라 왕복을 늘리지 않는다 */
    out.fixed = await prisma.$executeRawUnsafe(
      `UPDATE "MatchPlayerStat" s
          SET "playerClanId" = CASE WHEN s."side" = 'red' THEN rl."clanId" ELSE bl."clanId" END,
              "playerClanStampedAt" = NOW()
         FROM "Match" m
         JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
         JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
        WHERE m."id" = s."matchId"
          AND ${WRONG_WHERE}`,
    )
  }

  log(
    `상대팀 도장 ${out.wrong.toLocaleString()}줄 · 고침 ${out.fixed.toLocaleString()}줄` +
      (input.confirm ? '' : ' (미리보기)'),
  )
  return out
}
