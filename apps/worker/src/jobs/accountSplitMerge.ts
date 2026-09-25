/**
 * ★★계정번호로 갈라진 선수를 전수 조사해 합친다★★ (2026-09-25 사장님
 *   「계정 갈라진거 엄청 많아 위장닉네임 하면 같은 병영수첩인데 사이트 내에서 기록이 두개생기는거 전수 조사해서 제발 고쳐줘」)
 *
 * ── 왜 아직도 갈라져 있었나 (2026-09-25 실측 · scratchpad/vps_census*.mjs)
 *   매시 도는 `barracks-identity-merge` 는 ★클랜 명단(`BarracksClanMember`)★ 에 있는 계정만 다리로 쓴다 (10,207명).
 *   명단에 없는 병영 선수(BRK)가 3,352명 — 그 사람들은 옛 3rd.supply 줄(SUP)과 이어 줄 다리가 없어서
 *   ★위장닉/개명한 채 병영수첩에 처음 보이면 새 줄이 생기고 그대로 둘★ 이 됐다.
 *   ```
 *   띠끼야  SUP-135336441   (3rd.supply · 9경기 · 마지막 09-03)   ← 옛 줄
 *   롯데월드몰 cuid BRK-386A… (병영수첩 · 308경기 · 09-24)         ← 같은 사람의 새 줄 (위장닉)
 *   ```
 *   실측 649쌍(1,298명). 445쌍은 양쪽 다 랭킹 줄이 있어 화면에 둘 다 떴고, 439쌍은 닉이 서로 달랐다.
 *
 * ── 다리를 어디서 더 얻나
 *   ★배틀로그 원문 한 줄에 `str_usn`(16진수)과 `user_nexon_sn`(10진수)이 같이 온다.★ 명단이 없어도 원문이 있다.
 *   다리 없는 BRK 선수의 최근 경기 2건씩만 원문에서 뽑으면(서버쪽 jsonb 질의 · 약 10초) 계정 짝이 다 나온다.
 *
 * ── 어떻게 묶나 (닉네임은 한 글자도 안 본다 · D-221)
 *   Player 마다 열쇠 — `sn:`(SUP-id · 숫자 sourcePlayerId) · `usn:`(BRK-/BRX- sourcePlayerId) · `ouid:`(nexonOuid · NX-id).
 *   다리(명단 · 배틀로그 · NexonIdentity)로 열쇠끼리 잇고, 같은 묶음에 ★살아 있는★ Player 가 둘이면 갈라진 것이다.
 *
 * ── 어느 쪽으로 합치나 · 무엇을 안 하나
 *   ★usn 을 가진 줄(병영수첩 줄)이 본줄★ 이다 (사장님 2026-09-19 「무조건 병영수첩 기준」). 옮기는 것은 `playerMergeSplit.applyMergePlan` 과 같다.
 *   · 묶음에 살아 있는 줄이 셋 이상 → 안 합친다 (센다)
 *   · 양쪽 다 usn 이 있거나 둘 다 없다 → 안 합친다 — 닉으로 잘못 이어진 줄일 수 있다 (실측 17+3쌍)
 *   · 한 sn 에 usn 이 둘, 한 usn 에 sn 이 둘 → 원문 오염. 안 합친다
 *   · ★미리보기가 기본★ — `--confirm` 없이는 한 줄도 안 쓴다. 되돌리기 파일은 `data/player-merge/account-<날짜>.jsonl`
 *
 * ```
 * pnpm --filter @sacloud/worker nexon account-split-merge                 # 미리보기
 * pnpm --filter @sacloud/worker nexon account-split-merge --confirm       # 합친다
 * pnpm --filter @sacloud/worker nexon account-split-merge --confirm --limit 50
 * pnpm --filter @sacloud/worker nexon player-merge-split --revert data/player-merge/account-2026-09-25.jsonl   # 되돌리기 (같은 형식)
 * ```
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import { applyMergePlan, MERGED_NOTE_PREFIX, planOf, type MergePair } from './playerMergeSplit.js'

interface PlayerRow { id: string; name: string; sp: string | null; ouid: string | null; note: string | null }
interface Bridge { usn: string; sn: string }

export interface AccountSplitPair extends MergePair {
  sn: string | null
  usn: string
  supName: string
}

export interface AccountSplitMergeResult {
  players: number
  live: number
  bridges: { clanMember: number; battlelog: number; identity: number }
  /** 살아 있는 줄이 둘 이상인 묶음 */
  groups: number
  /** 합칠 수 있다고 판정한 쌍 */
  pairs: number
  skipped: { size: number; usnSides: number; inconsistent: number }
  merged: number
  /** 두 번 해도 안 된 쌍 — 다음 예약이 다시 집어 든다 */
  failed: number
  movedStats: number
  movedLeagueRows: number
  deletedLeagueRows: number
  movedUserLinks: number
  confirmed: boolean
  backupPath: string | null
  ms: number
  samples: string[]
}

const isLive = (p: PlayerRow): boolean => !(p.name.startsWith('(합쳐짐→') || (p.note ?? '').startsWith(MERGED_NOTE_PREFIX))
const usnOf = (p: PlayerRow): string | null => /^BR[KX]-(.+)$/.exec(p.sp ?? '')?.[1] ?? null
const snOf = (p: PlayerRow): string | null => {
  const fromId = /^SUP(?:PLY)?-(\d+)$/.exec(p.id)?.[1]
  if (fromId) return fromId
  return p.sp && /^\d+$/.test(p.sp) ? p.sp : null
}
const kstDate = (): string => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** 다리 없는 BRK 선수의 최근 경기 원문에서 (str_usn, user_nexon_sn) 짝을 뽑는다 — 서버쪽 jsonb 질의 */
async function battlelogBridges(targetPlayerIds: string[], maxKeys: number): Promise<Bridge[]> {
  if (targetPlayerIds.length === 0) return []
  const keyRows = await prisma.$queryRawUnsafe<{ key: string }[]>(
    `SELECT key FROM (
        SELECT m."sourceMatchId" key, ROW_NUMBER() OVER (PARTITION BY s."playerId" ORDER BY m."startAt" DESC) rn
          FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
         WHERE s."playerId" = ANY($1::text[]) AND m."sourceMatchId" IS NOT NULL) t
      WHERE rn <= 2`,
    targetPlayerIds,
  )
  const keys = [...new Set(keyRows.map((r) => r.key))].slice(0, maxKeys)
  const out: Bridge[] = []
  for (let i = 0; i < keys.length; i += 150) {
    const rows = await prisma.$queryRawUnsafe<{ usn: string | null; sn: string | null }[]>(
      `WITH r AS (
         SELECT COALESCE((payload::jsonb)->'raw'->'battleLog', (payload::jsonb)->'battleLog') bl
           FROM "BarracksBattleLogRaw" WHERE "matchKey" = ANY($1::text[]) AND status = 'ok')
       SELECT DISTINCT e->>'str_usn' usn, e->>'user_nexon_sn' sn FROM r, jsonb_array_elements(r.bl) e
        WHERE jsonb_typeof(r.bl) = 'array' AND e ? 'str_usn'
       UNION
       SELECT DISTINCT e->>'target_str_usn', e->>'target_user_nexon_sn' FROM r, jsonb_array_elements(r.bl) e
        WHERE jsonb_typeof(r.bl) = 'array' AND e ? 'target_str_usn'`,
      keys.slice(i, i + 150),
    )
    for (const r of rows) if (r.usn && r.sn) out.push({ usn: r.usn, sn: String(r.sn) })
  }
  return out
}

/** 갈라진 쌍을 찾는다. ★읽기만 한다★ */
export async function findAccountSplitPairs(options: { maxKeys?: number } = {}): Promise<{
  pairs: AccountSplitPair[]
  info: Pick<AccountSplitMergeResult, 'players' | 'live' | 'bridges' | 'groups' | 'skipped'>
}> {
  const players = await prisma.$queryRawUnsafe<PlayerRow[]>(
    `SELECT id, name, "sourcePlayerId" sp, "nexonOuid" ouid, note FROM "Player"`,
  )
  const statRows = await prisma.$queryRawUnsafe<{ pid: string; n: number }[]>(
    `SELECT "playerId" pid, COUNT(*)::int n FROM "MatchPlayerStat" GROUP BY "playerId"`,
  )
  const statOf = new Map(statRows.map((r) => [r.pid, r.n]))
  const clanMember = await prisma.$queryRawUnsafe<Bridge[]>(
    `SELECT DISTINCT "strUsn" usn, "userNexonSn" sn FROM "BarracksClanMember" WHERE "strUsn" <> '' AND "userNexonSn" <> ''`,
  )
  const identities = await prisma.nexonIdentity.findMany({
    where: { OR: [{ playerId: { not: null } }, { barracksUsn: { not: null } }, { barracksNexonSn: { not: null } }] },
    select: { ouid: true, playerId: true, barracksUsn: true, barracksNexonSn: true },
  })

  const bridged = new Set(clanMember.map((b) => b.usn))
  for (const r of identities) if (r.barracksUsn) bridged.add(r.barracksUsn)
  const unbridged = players
    .filter((p) => isLive(p) && usnOf(p) !== null && !bridged.has(usnOf(p) as string) && (statOf.get(p.id) ?? 0) > 0)
    .map((p) => p.id)
  const battlelog = await battlelogBridges(unbridged, options.maxKeys ?? 4000)

  /* ── union-find ── */
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    let c = x
    while (parent.get(c) !== r) { const n = parent.get(c) as string; parent.set(c, r); c = n }
    return r
  }
  const union = (a: string, b: string): void => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const p of players) {
    const node = 'p:' + p.id
    find(node)
    const sn = snOf(p); if (sn) union(node, 'sn:' + sn)
    const usn = usnOf(p); if (usn) union(node, 'usn:' + usn)
    const nx = /^NX-(.+)$/.exec(p.id)?.[1]; if (nx) union(node, 'ouid:' + nx)
    if (p.ouid) union(node, 'ouid:' + p.ouid)
  }
  const usnBySn = new Map<string, Set<string>>()
  const snByUsn = new Map<string, Set<string>>()
  for (const b of [...clanMember, ...battlelog]) {
    union('sn:' + b.sn, 'usn:' + b.usn)
    ;(usnBySn.get(b.sn) ?? usnBySn.set(b.sn, new Set()).get(b.sn) as Set<string>).add(b.usn)
    ;(snByUsn.get(b.usn) ?? snByUsn.set(b.usn, new Set()).get(b.usn) as Set<string>).add(b.sn)
  }
  for (const r of identities) {
    const k = 'ouid:' + r.ouid
    if (r.barracksUsn) union(k, 'usn:' + r.barracksUsn)
    if (r.barracksNexonSn) union(k, 'sn:' + r.barracksNexonSn)
    if (r.playerId) union(k, 'p:' + r.playerId)
  }

  const groups = new Map<string, PlayerRow[]>()
  for (const p of players) { const r = find('p:' + p.id); const g = groups.get(r); if (g) g.push(p); else groups.set(r, [p]) }

  const skipped = { size: 0, usnSides: 0, inconsistent: 0 }
  const pairs: AccountSplitPair[] = []
  let groupCount = 0
  for (const g of groups.values()) {
    const live = g.filter(isLive)
    if (live.length < 2) continue
    groupCount += 1
    if (live.length !== 2) { skipped.size += 1; continue }
    const withUsn = live.filter((p) => usnOf(p) !== null)
    if (withUsn.length !== 1) { skipped.usnSides += 1; continue }
    const brk = withUsn[0] as PlayerRow
    const sup = live.find((p) => p.id !== brk.id) as PlayerRow
    const usn = usnOf(brk) as string
    const sn = snOf(sup)
    /* 다리가 한 갈래여야 한다 — sn↔usn 이 1:1 이 아니면 원문 오염이다 */
    const snsOfUsn = snByUsn.get(usn)
    const usnsOfSn = sn ? usnBySn.get(sn) : undefined
    if ((snsOfUsn && snsOfUsn.size > 1) || (usnsOfSn && usnsOfSn.size > 1)) { skipped.inconsistent += 1; continue }
    if (sn && usnsOfSn && !usnsOfSn.has(usn)) { skipped.inconsistent += 1; continue }
    pairs.push({
      name: brk.name,
      supName: sup.name,
      supId: sup.id,
      brkId: brk.id,
      leagueSlug: '계정',
      clanName: sn ? `sn ${sn}` : 'ouid',
      supStats: statOf.get(sup.id) ?? 0,
      brkStats: statOf.get(brk.id) ?? 0,
      sn,
      usn,
    })
  }
  pairs.sort((a, z) => z.supStats + z.brkStats - (a.supStats + a.brkStats))
  return {
    pairs,
    info: {
      players: players.length,
      live: players.filter(isLive).length,
      bridges: { clanMember: clanMember.length, battlelog: battlelog.length, identity: identities.length },
      groups: groupCount,
      skipped,
    },
  }
}

export async function runAccountSplitMerge(
  options: { confirm?: boolean; limit?: number; maxKeys?: number; backupPath?: string } = {},
): Promise<AccountSplitMergeResult> {
  const startedAt = Date.now()
  const confirm = options.confirm ?? false
  const { pairs: all, info } = await findAccountSplitPairs({ maxKeys: options.maxKeys })
  const pairs = options.limit ? all.slice(0, options.limit) : all
  const backupPath = options.backupPath ?? `data/player-merge/account-${kstDate()}.jsonl`
  const out: AccountSplitMergeResult = {
    ...info,
    pairs: all.length,
    merged: 0,
    failed: 0,
    movedStats: 0,
    movedLeagueRows: 0,
    deletedLeagueRows: 0,
    movedUserLinks: 0,
    confirmed: confirm,
    backupPath: null,
    ms: 0,
    samples: pairs.slice(0, 20).map((p) => `${p.supName}(${p.supId.slice(0, 14)} · ${p.supStats}경기) → ${p.name}(${p.usn.slice(0, 8)}… · ${p.brkStats}경기)`),
  }
  log(
    `계정 갈라짐 — 선수 ${info.players.toLocaleString()} · 다리 명단 ${info.bridges.clanMember.toLocaleString()} 배틀로그 ${info.bridges.battlelog.toLocaleString()} · ` +
      `갈라진 묶음 ${info.groups} · 합칠 쌍 ${all.length} · 건너뜀(셋이상 ${info.skipped.size} · usn양쪽/없음 ${info.skipped.usnSides} · 다리모순 ${info.skipped.inconsistent})` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const pair of pairs) {
    /*
     * ★한 쌍이 실패해도 멈추지 않는다★ (2026-09-25 실측 — 168쌍 만에 풀 시간초과로 죽었다).
     *   한 번은 잠깐 쉬고 다시 해 보고, 그래도 안 되면 세어 두고 다음 쌍으로. 다음 시간 예약이 다시 집어 든다
     *   (합쳐진 줄은 note 로 표시되므로 두 번 합치지 않는다).
     */
    let done = false
    for (let attempt = 1; attempt <= 2 && !done; attempt += 1) {
      try {
        const plan = await planOf(pair)
        if (attempt === 1) {
          out.movedStats += plan.statsMove
          out.movedLeagueRows += plan.leagueMove.length
          out.deletedLeagueRows += plan.leagueDelete.length
          out.movedUserLinks += plan.ids.userLink?.length ?? 0
        }
        if (!confirm) { done = true; break }
        await applyMergePlan(pair, plan.ids, backupPath)
        out.merged += 1
        out.backupPath = backupPath
        log(`합침 ${pair.supName} → ${pair.name} · 참가 ${plan.statsMove}(겹침 ${plan.statsClash}) · LeaguePlayer 옮김 ${plan.leagueMove.length} 지움 ${plan.leagueDelete.length}${plan.ids.userLink?.length ? ' · 회원연동 옮김' : ''}`)
        done = true
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
        warn(`쌍 ${pair.supName} → ${pair.name} ${attempt}번째 실패 — ${message}`)
        if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 5_000))
        else out.failed += 1
      }
    }
  }
  if (info.skipped.usnSides + info.skipped.inconsistent > 0) {
    warn(`사람 판단이 필요한 묶음 ${info.skipped.usnSides + info.skipped.inconsistent}건은 안 건드렸다 — 닉으로 잘못 이어졌거나 다리가 모순인 줄이다`)
  }
  out.ms = Date.now() - startedAt
  return out
}
