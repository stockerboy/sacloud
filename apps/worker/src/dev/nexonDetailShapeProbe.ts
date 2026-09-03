/**
 * **선수를 이어도 넥슨 공식 길이 열리는가** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 이걸 먼저 재나 ══
 *
 * 선수 잇기(`barracks-link`)가 ★170명 중 159명(94%)★ 을 이었다.
 * 전부 돌리면 ★5,069명 · 10,138호출 · 약 1.4시간★ 이다.
 * ★그걸 쓰기 전에 「그래서 되는가」를 봐야 한다.★
 *
 * ══ ⚠ 스키마가 경고하고 있다 ══
 *
 * `schema.prisma:1671` —
 * > ★넥슨은 참가자 ouid를 주지 않는다(닉네임만).★ 그래서 안정 키는 **응답 배열 순서(slot)** 뿐이다.
 *
 * ★그러면 선수를 이어도 「경기 안의 누가 누구인지」를 ouid 로 못 맞춘다.★
 * ★닉네임으로 맞춰야 하고, 닉네임은 바뀐다.★
 *
 * 그리고 앞선 조사(`3ad4bfe`)에서 ★참가자가 7명★ 이었다 (10명이 아니다).
 * ★한 경기만 본 것이라 확정이 아니다.★ ★여기서 여러 경기를 본다.★
 *
 * ══ 재는 것 ══
 * ```
 * 이어진 선수의 경기 상세를 여러 건 열어서
 *   ① ★참가자가 몇 명 오나★        10명이 아니면 라인업을 못 만든다
 *   ② ★클랜 이름이 오나★           경기 당시인가 현재인가
 *   ③ ★킬·데스·무기가 오나★
 *   ④ ★유형이 무엇인가★            IPL 경기만 골라낼 수 있나
 * ```
 */
import { NexonClient, readNexonConfig, hasApiKey } from '@sacloud/nexon'
import { prisma } from '@sacloud/db'
import { loadEnvFiles } from '../lib/env.js'

const SLEEP_MS = 350
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  loadEnvFiles()
  const config = readNexonConfig()
  if (!hasApiKey(config)) {
    console.error('★NEXON_API_KEY 가 없다★ — 키 값은 찍지 않는다')
    process.exitCode = 1
    return
  }
  const client = new NexonClient({ config })

  /* 이어진 IPL 선수 하나 */
  const linked = await prisma.$queryRaw<{ ouid: string; name: string; playerId: string }[]>`
    SELECT ni."ouid", p."name", p."id" AS "playerId"
      FROM "NexonIdentity" ni
      JOIN "Player" p ON p."id" = ni."playerId"
      JOIN "LeaguePlayer" lp ON lp."playerId" = p."id"
      JOIN "League" l ON l."id" = lp."leagueId" AND l."slug" = 'nolink'
     WHERE ni."playerId" IS NOT NULL
     ORDER BY ni."linkedAt" DESC NULLS LAST
     LIMIT 5
  `
  console.info(`══ 이어진 IPL 선수 ★${linked.length}명★ 을 골랐다 ══\n`)
  if (linked.length === 0) {
    console.info('  ★이어진 IPL 선수가 없다★ — 먼저 `barracks-link` 를 돌려야 한다')
    return
  }

  for (const who of linked.slice(0, 2)) {
    console.info(`\n── ${who.name} ──`)
    const listRes = await client.getMatchList({ ouid: who.ouid, matchMode: '폭파미션' })
    await sleep(SLEEP_MS)
    if (listRes.httpStatus !== 200) {
      console.info(`  경기 목록 ★HTTP ${listRes.httpStatus}★`)
      continue
    }
    const list = listRes.data as {
      match?: { match_id?: string; match_type?: string; date_match?: string }[]
    }
    const matches = list.match ?? []
    const byType = new Map<string, number>()
    for (const m of matches) {
      byType.set(m.match_type ?? '(없음)', (byType.get(m.match_type ?? '(없음)') ?? 0) + 1)
    }
    console.info(`  경기 ${matches.length}건 · 유형: ${[...byType].map(([t, n]) => `${t} ${n}`).join(' · ')}`)

    /* ★클랜전으로 보이는 것부터★ 상세를 연다 */
    const clanish = matches.filter((m) => (m.match_type ?? '').includes('클랜'))
    const pick = clanish.slice(0, 3)
    if (pick.length === 0) {
      console.info('  ★클랜전 유형이 하나도 없다★')
      continue
    }
    for (const m of pick) {
      const detRes = await client.getMatchDetail(m.match_id!)
      await sleep(SLEEP_MS)
      if (detRes.httpStatus !== 200) {
        console.info(`    ${m.date_match} ★상세 HTTP ${detRes.httpStatus}★`)
        continue
      }
      const det = detRes.data as {
        match_detail?: {
          user_name?: string
          guild_name?: string
          team?: number | string
          kill?: number
          death?: number
          weapon?: string
        }[]
      }
      const ps = det.match_detail ?? []
      const teams = new Map<string, number>()
      for (const p of ps) teams.set(String(p.team ?? '?'), (teams.get(String(p.team ?? '?')) ?? 0) + 1)
      const clans = [...new Set(ps.map((p) => p.guild_name ?? '무소속'))]
      const kd = ps.filter((p) => p.kill !== undefined && p.death !== undefined).length
      const wp = ps.filter((p) => p.weapon !== undefined && p.weapon !== null).length
      console.info(
        `    ${m.date_match} · ${m.match_type} · ★참가자 ${ps.length}명★` +
          `${ps.length === 10 ? ' ★★10명★★' : ' ★모자란다★'}` +
          ` · 팀 ${[...teams].map(([t, n]) => `${t}:${n}`).join('/')}`,
      )
      console.info(`       클랜 ${clans.length}개 — ${clans.join(' · ')}`)
      console.info(`       킬데스 ${kd}/${ps.length} · 무기 ${wp}/${ps.length}`)
    }
  }

  console.info(
    '\n★읽는 법★ — ★10명이 안 오면 넥슨 공식 길로는 라인업을 못 만든다.★\n' +
      '           선수를 다 이어도(1.4시간) ★그 벽은 그대로다★.\n' +
      '           ⚠ 그리고 ★참가자를 닉네임으로만 준다★ (schema.prisma:1671) —\n' +
      '             ★이어 놓은 ouid 로 「경기 안의 누구」를 맞출 수가 없다★',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
