/**
 * 선수 이름을 ★가장 최근 경기에서 부른 이름★ 으로 맞춘다 (2026-09-14 사장님).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon player-nick-sync             # 미리보기
 * pnpm --filter @sacloud/worker nexon player-nick-sync --confirm   # 실제 저장
 * pnpm --filter @sacloud/worker nexon player-nick-sync --days 3 --limit 200
 * ```
 *
 * ── 왜 필요한가
 *   사장님: «위장닉을 해도 무조건 본닉으로 뜨게 해줄 수 있어? 닉네임 변경했을때만 바뀌게»
 *   → «바꿀때마다 실시간 반영되는건 안되나»
 *
 *   ★옛 판은 이름이 영영 안 바뀌었다.★ `battlelog-lineup` 이 선수를 만들 때
 *   `upsert({ update: {} })` 라 ★처음 본 이름★ 이 그대로 굳는다. 그래서
 *   닉을 바꾼 사람도 옛 이름으로 남았다 — 최근 5일 실측 ★67명★ 이 그 상태였다.
 *
 * ── 위장닉은 어떻게 되나 (실측으로 정한 것)
 *   병영수첩은 ★본닉을 따로 주지 않는다.★ 배틀로그의 `user_nick` 도, 클랜원 명단의
 *   `user_nick` 도 «그때 보인 이름» 이다. 실측 —
 *   ```
 *   최근 5일 · 경기 900판 · 계정 1,012개
 *     닉이 바뀐 계정            69개
 *     그중 옛 닉으로 되돌아옴     2개   ← 위장닉은 이것뿐
 *   ```
 *   `♥서지윤♥ → 서지윤 → ♥서지윤♥` 처럼 ★되돌아오는 것★ 이 위장닉이고,
 *   나머지 67개는 한 번 바뀌고 유지되는 ★개명★ 이다.
 *   ⚠ 클랜원 명단도 그 두 건에서 ★가운데 이름★ 을 들고 있었다 — 명단을 믿어도 소용없다.
 *
 *   그래서 ★최근 이름을 그대로 따른다.★ 위장닉을 쓰면 그동안 그 이름으로 보이고,
 *   본닉으로 돌아오면 ★다음 경기에 저절로 되돌아온다.★ 69건 중 67건이 바로 맞고,
 *   2건이 잠깐 어긋난다. 반대로 고정해 두면 67건이 계속 틀린다.
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 안 쓴다. 기본은 미리보기다
 *   · ★바꾸기 전 이름을 파일로 남긴다★ (`backup/nick-sync-<시각>.json`) — 되돌릴 수 있다
 *   · 병영수첩에서 온 선수(`BRK-`)만 건드린다. 옛 거울(3rd.supply)·넥슨 줄은 안 만진다
 *   · 요청을 한 건도 안 보낸다. 저장된 원문만 읽는다
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'
import { log, warn } from '../lib/log.js'

export interface PlayerNickSyncOptions {
  confirm: boolean
  /** 며칠치 경기를 볼까 (기본 7) */
  days: number
  /** 한 번에 고칠 최대 인원 (기본 없음) */
  limit?: number
}

export interface PlayerNickSyncResult {
  matchesRead: number
  accounts: number
  changed: number
  skippedSameName: number
  notOurPlayer: number
  backupPath: string | null
  samples: { usn: string; before: string; after: string; at: string }[]
}

/** 한 번에 읽을 경기 수 — 원문 하나가 90KB 안팎이라 크게 잡으면 메모리로 죽는다 */
const LOG_BATCH = 150

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function playerNickSync(options: PlayerNickSyncOptions): Promise<PlayerNickSyncResult> {
  const days = Number.isFinite(options.days) && options.days > 0 ? Math.floor(options.days) : 7

  /*
   * ★경기 시각 오름차순★ 으로 훑는다. 뒤에 오는 줄이 앞을 덮으므로,
   * 다 돌고 나면 각 계정에 ★가장 최근 경기의 이름★ 이 남는다.
   */
  /**
   * ⚠ ★원문을 한꺼번에 끌어오지 않는다.★ 배틀로그 하나가 90KB 안팎이라
   *   7일치(수천 건)를 한 번에 뜨면 ★서버가 메모리로 죽는다★ — 실제로 죽었다 (exit 137).
   *   `battlelogLineup` 이 같은 이유로 150건씩 나눠 읽는다. 여기도 같게 한다.
   */
  const keys = (await prisma.$queryRawUnsafe(
    `SELECT b."matchKey", m."startAt"
       FROM "BarracksBattleLogRaw" b
       JOIN "Match" m ON m."sourceMatchId" = b."matchKey"
      WHERE b."subjectKind" = 'clan' AND b.status = 'ok'
        AND m."supersededAt" IS NULL
        AND m."startAt" > now() - ($1 || ' day')::interval
      ORDER BY m."startAt" ASC`,
    String(days),
  )) as { matchKey: string; startAt: Date }[]

  /** usn → 가장 최근에 부른 이름 */
  const latest = new Map<string, { nick: string; at: Date }>()
  const atOf = new Map(keys.map((k) => [k.matchKey, k.startAt]))
  let matchesRead = 0
  for (let i = 0; i < keys.length; i += LOG_BATCH) {
    const slice = keys.slice(i, i + LOG_BATCH).map((k) => k.matchKey)
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "matchKey", payload FROM "BarracksBattleLogRaw"
        WHERE "subjectKind" = 'clan' AND status = 'ok' AND "matchKey" = ANY($1)`,
      slice,
    )) as { matchKey: string; payload: { battleLog?: unknown[] } }[]
    /* 경기 시각 오름차순으로 덮어써야 «가장 최근» 이 남는다 */
    rows.sort(
      (a, b) => (atOf.get(a.matchKey)?.getTime() ?? 0) - (atOf.get(b.matchKey)?.getTime() ?? 0),
    )
    for (const row of rows) {
      matchesRead += 1
      const at = atOf.get(row.matchKey) ?? new Date(0)
      for (const raw of row.payload.battleLog ?? []) {
        const e = raw as Record<string, unknown>
        const put = (usn: unknown, nick: unknown) => {
          const u = str(usn)
          const n = str(nick)
          if (u === null || n === null) return
          latest.set(u, { nick: n, at })
        }
        put(e.str_usn, e.user_nick)
        put(e.target_str_usn, e.target_user_nick)
      }
    }
    if ((i / LOG_BATCH) % 5 === 0) log(`  ${Math.min(i + LOG_BATCH, keys.length)} / ${keys.length} 경기`)
  }

  const result: PlayerNickSyncResult = {
    matchesRead,
    accounts: latest.size,
    changed: 0,
    skippedSameName: 0,
    notOurPlayer: 0,
    backupPath: null,
    samples: [],
  }
  if (latest.size === 0) {
    warn(`최근 ${days}일 배틀로그가 없다 — 할 일이 없다`)
    return result
  }

  /* 우리 선수와 맞춘다. ★병영수첩에서 온 줄만★ 본다 */
  const players = await prisma.player.findMany({
    where: { sourcePlayerId: { in: [...latest.keys()].map((usn) => `BRK-${usn}`) } },
    select: { id: true, name: true, sourcePlayerId: true },
  })
  const byUsn = new Map(players.map((p) => [String(p.sourcePlayerId).slice(4), p]))

  const plan: { id: string; usn: string; before: string; after: string; at: string }[] = []
  for (const [usn, { nick, at }] of latest) {
    const player = byUsn.get(usn)
    if (!player) {
      result.notOurPlayer += 1
      continue
    }
    if (player.name === nick) {
      result.skippedSameName += 1
      continue
    }
    plan.push({ id: player.id, usn, before: player.name, after: nick, at: at.toISOString() })
  }

  const capped = options.limit !== undefined && options.limit > 0 ? plan.slice(0, options.limit) : plan
  result.changed = capped.length
  result.samples = capped.slice(0, 20).map(({ usn, before, after, at }) => ({ usn, before, after, at }))

  log(
    `경기 ${matchesRead}판 · 계정 ${latest.size}개 · 우리 선수 아님 ${result.notOurPlayer} · ` +
      `이름 그대로 ${result.skippedSameName} · ★바꿀 것 ${capped.length}★`,
  )
  for (const row of result.samples) {
    log(`  «${row.before}» → «${row.after}»  (${row.at.slice(0, 16)})`)
  }

  if (!options.confirm) {
    log('--confirm 없이 돌렸다 — 한 줄도 안 바꿨다')
    return result
  }
  if (capped.length === 0) return result

  /* ★되돌릴 수 있게 먼저 남긴다★ */
  const dir = join(REPO_ROOT, 'backup')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `nick-sync-${Date.now()}.json`)
  writeFileSync(file, JSON.stringify(capped, null, 1))
  result.backupPath = file
  log(`되돌리기 파일 — ${file}`)

  for (const row of capped) {
    await prisma.player.update({ where: { id: row.id }, data: { name: row.after } })
  }
  log(`이름 바꿈 ${capped.length}명`)
  return result
}
