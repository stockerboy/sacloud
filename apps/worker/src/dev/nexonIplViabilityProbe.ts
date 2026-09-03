/**
 * **넥슨 공식 API 로 IPL 을 재구성할 수 있나** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 이걸 재나 ══
 *
 * 병영수첩은 ★집 IP 에서만 200★ 이고 ★실행기에서는 403★ 이다 (D-269).
 * 그래서 「어디서 돌리느냐」가 문제가 됐는데 —
 * ★넥슨 공식 API 로 되면 그 문제가 통째로 사라진다.★ 공식 길이라 막힐 이유가 없고
 * ★어디서 돌리든 상관없다.★
 *
 * ══ 기록이 갈려 있다 ══
 * ```
 * 9230b73  「넥슨 API 로는 IPL 클랜전을 재구성할 수 없다」
 * 3ad4bfe  ★정정★ — 「IPL 경기가 넥슨에 있다. 유형이 ★퀵매치 클랜전★ 이었다」
 *          ⚠ 그런데 상세를 열어 보니 ★참가자 7명★ 이고 ★클랜 이름이 어긋났다★
 *            (한 경기만 봤다. ★거기서 멈췄다★)
 * ```
 * ★그래서 「그래서 재구성이 되는가」까지 안 갔다.★ 여기서 간다.
 *
 * ══ 재는 것 다섯 ══
 * ```
 * 1 ★한 경기에서 10명이 다 나오는가★   ← ★핵심★. 라인업이 없으면 못 쓴다
 * 2 어느 클랜 대 어느 클랜인지 나오는가
 * 3 킬·데스·무기가 나오는가
 * 4 ★IPL 경기만 골라낼 수 있는가★ — 일반 퀵매치가 섞이면 ★O-044 가 무너진다★
 * 5 얼마나 과거까지 되짚을 수 있는가
 * ```
 *
 * ══ 어떻게 재나 — ★정답지를 쓴다★ ══
 *
 * 병영수첩으로 ★이미 아는 IPL 경기★ 를 정답지로 삼는다. 그 경기의 선수를 넥슨에 물어
 * ★같은 경기가 오는지★ · ★같은 10명이 오는지★ · ★같은 두 클랜이 오는지★ 를 맞춰 본다.
 * ★맞춰 볼 답이 없으면 「그럴듯한데 틀린 것」을 못 가른다.★
 *
 * ⚠ ★키는 `test_` 라 초당 5건이다.★ 간격을 넉넉히 둔다. 429 가 나면 즉시 멈춘다.
 */
import { NexonClient, readNexonConfig, hasApiKey } from '@sacloud/nexon'
import { prisma } from '@sacloud/db'
import { loadEnvFiles } from '../lib/env.js'

const SLEEP_MS = 350
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

interface Truth {
  matchId: string
  matchKey: string
  startAt: Date
  redClan: string
  blueClan: string
  players: { playerId: string; name: string; sourcePlayerId: string | null }[]
}

/** 병영수첩으로 라인업까지 아는 IPL 경기 = ★정답지★ */
async function truthMatches(limit: number): Promise<Truth[]> {
  const rows = await prisma.$queryRaw<
    {
      matchId: string
      matchKey: string
      startAt: Date
      redClan: string
      blueClan: string
      players: unknown
    }[]
  >`
    SELECT m."id"            AS "matchId",
           m."sourceMatchId" AS "matchKey",
           m."startAt",
           rc."name"         AS "redClan",
           bc."name"         AS "blueClan",
           jsonb_agg(jsonb_build_object(
             'playerId', p."id", 'name', p."name", 'sourcePlayerId', p."sourcePlayerId"
           )) AS players
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "LeagueClan" rlc ON rlc."id" = m."redLeagueClanId"
      JOIN "Clan" rc ON rc."id" = rlc."clanId"
      JOIN "LeagueClan" blc ON blc."id" = m."blueLeagueClanId"
      JOIN "Clan" bc ON bc."id" = blc."clanId"
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
      JOIN "Player" p ON p."id" = s."playerId"
     WHERE m."startAt" >= now() - interval '20 days'
     GROUP BY 1, 2, 3, 4, 5
    HAVING count(*) = 10
     ORDER BY m."startAt" DESC
     LIMIT ${limit}
  `
  return rows.map((r) => ({ ...r, players: r.players as Truth['players'] }))
}

async function main(): Promise<void> {
  loadEnvFiles()
  const config = readNexonConfig()
  if (!hasApiKey(config)) {
    console.error('★NEXON_API_KEY 가 없다★ — 키 값은 여기에 찍지 않는다')
    process.exitCode = 1
    return
  }
  const client = new NexonClient({ config })

  console.info('══ 0 · ★정답지★ — 병영수첩으로 10명을 다 아는 IPL 경기 ══\n')
  const truth = await truthMatches(3)
  if (truth.length === 0) {
    console.info('  ★정답지가 없다★ — 10명이 다 찬 IPL 경기를 못 찾았다')
    return
  }
  for (const t of truth) {
    const at = new Date(t.startAt.getTime() + 9 * 3600000).toISOString().slice(0, 16)
    console.info(`  ${at} KST  ★${t.redClan} vs ${t.blueClan}★  키 ${t.matchKey}`)
  }

  /* ── 1 · 그 경기의 선수 하나를 넥슨에 물어 같은 경기를 찾는다 ─── */
  console.info('\n══ 1 · ★넥슨에 같은 경기가 있나★ ══\n')
  const target = truth[0]!
  const withOuid = target.players.filter((p) => p.sourcePlayerId !== null)
  console.info(
    `  정답지 선수 10명 중 ★넥슨 식별자(ouid)를 아는 사람 ${withOuid.length}명★` +
      ` ${pc(withOuid.length, target.players.length)}`,
  )
  if (withOuid.length === 0) {
    console.info('  ★ouid 를 아는 사람이 없다 — 넥슨에 물어볼 수가 없다★')
    return
  }

  /*
   * ⚠ ★닉네임으로 묻지 않는다★ — `dsgx` 로 물었더니 ★400 (Please input valid parameter)★ 이었다.
   *   닉네임은 ★영구 식별자가 아니고★ 특수문자·개명 때문에 자주 실패한다.
   *   ★우리는 이미 10명의 `sourcePlayerId` 를 갖고 있다★ (병영수첩이 준 것) — 그걸 그대로 쓴다.
   *   ★그게 넥슨 ouid 와 같은 것인지도 이 조사가 같이 밝힌다★ —
   *   400 이 아니라 200 이 오면 「같은 것」이고, 400 이면 「다른 것」이다.
   */
  const who = target.players.find((p) => p.sourcePlayerId !== null)!
  const ouid = who.sourcePlayerId!
  console.info(`\n  ${who.name} 의 ★저장된 식별자★ 로 바로 묻는다 (닉네임으로 안 묻는다)`)

  /* ── 2 · 그 선수의 폭파미션 경기 목록 ────────────────────────── */
  console.info('\n══ 2 · ★그 선수의 최근 경기 목록★ (폭파미션) ══\n')
  const listRes = await client.getMatchList({ ouid, matchMode: '폭파미션' })
  await sleep(SLEEP_MS)
  if (listRes.httpStatus !== 200) {
    console.info(`  ★못 받았다★ — HTTP ${listRes.httpStatus}`)
    return
  }
  const list = listRes.data as { match?: { match_id?: string; match_type?: string; date_match?: string }[] }
  const matches = list.match ?? []
  console.info(`  경기 ★${matches.length}건★ (상한 1000 · 커서 없음)`)
  const byType = new Map<string, number>()
  for (const m of matches) byType.set(m.match_type ?? '(없음)', (byType.get(m.match_type ?? '(없음)') ?? 0) + 1)
  console.info('\n  ★유형별★')
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.info(`    ${t.padEnd(16)} ${n}건${t.includes('클랜') ? '  ★' : ''}`)
  }
  if (matches.length > 0) {
    const dates = matches.map((m) => m.date_match ?? '').filter(Boolean).sort()
    console.info(`\n  ★되짚을 수 있는 범위★  ${dates[0]} ~ ${dates[dates.length - 1]}`)
  }

  /* ── 3 · 정답지 경기와 같은 시각의 것을 찾아 상세를 연다 ───────── */
  console.info('\n══ 3 · ★★같은 경기의 상세 — 10명이 다 오는가★★ ══\n')
  const wantMs = target.startAt.getTime()
  let picked: { match_id?: string; match_type?: string; date_match?: string } | null = null
  let bestGap = Number.POSITIVE_INFINITY
  for (const m of matches) {
    if (!m.date_match) continue
    const gap = Math.abs(new Date(`${m.date_match}+09:00`).getTime() - wantMs)
    if (gap < bestGap) {
      bestGap = gap
      picked = m
    }
  }
  if (!picked || bestGap > 10 * 60 * 1000) {
    console.info(
      `  ★정답지 경기를 넥슨 목록에서 못 찾았다★ (제일 가까운 것과 ${Math.round(bestGap / 60000)}분 차이)`,
    )
    return
  }
  console.info(`  찾았다 — ${picked.date_match} · 유형 ★${picked.match_type}★ (차이 ${Math.round(bestGap / 1000)}초)`)

  const detRes = await client.getMatchDetail(picked.match_id!)
  await sleep(SLEEP_MS)
  if (detRes.httpStatus !== 200) {
    console.info(`  ★상세를 못 받았다★ — HTTP ${detRes.httpStatus}`)
    return
  }
  const det = detRes.data as {
    match_detail?: { user_name?: string; guild_name?: string; team?: number | string; kill?: number; death?: number }[]
  }
  const ps = det.match_detail ?? []
  console.info(`\n  ★참가자 ${ps.length}명★  (정답지는 10명)`)
  const teams = new Map<string, string[]>()
  for (const p of ps) {
    const k = String(p.team ?? '?')
    teams.set(k, [...(teams.get(k) ?? []), `${p.user_name}(${p.guild_name ?? '무소속'})`])
  }
  for (const [t, names] of teams) console.info(`    팀${t} ${names.length}명 — ${names.join(' · ')}`)

  const truthNames = new Set(target.players.map((p) => p.name))
  const gotNames = ps.map((p) => p.user_name ?? '')
  const hit = gotNames.filter((n) => truthNames.has(n)).length
  console.info(
    `\n  ★정답지 10명 중 넥슨에도 있는 사람 ${hit}명★ ${pc(hit, 10)}` +
      `${hit === 10 ? '  ★★열 명이 다 온다★★' : '  ★★모자란다 — 라인업을 못 만든다★★'}`,
  )
  const kd = ps.filter((p) => p.kill !== undefined && p.death !== undefined).length
  console.info(`  킬·데스가 있는 참가자 ${kd}/${ps.length}`)
  console.info(`\n  정답지 클랜: ★${target.redClan} vs ${target.blueClan}★`)
  console.info(`  넥슨 클랜명: ${[...new Set(ps.map((p) => p.guild_name ?? '무소속'))].join(' · ')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
