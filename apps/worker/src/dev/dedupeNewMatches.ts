/**
 * ★★한 실제 경기 = Match 정확히 1개★★ (2026-09-05 · 사장님 지시).
 *
 * ```
 * node scripts/prod-run.mjs dedupe-new            미리보기
 * node scripts/prod-run.mjs dedupe-new --confirm  적용 (되돌릴 파일을 먼저 쓴다)
 * node scripts/prod-run.mjs dedupe-new --revert   되돌린다
 * ```
 *
 * ══ ★무엇을 하나★ ══
 *
 * 기준시각(2026-09-03 07:00 KST) ★이후★ 에 같은 경기가 두 줄인 것을 찾아
 * ★올바른 리그의 줄 하나만 남기고★ 나머지에 ★숨김 표시★ 를 붙인다.
 *
 * ★지우지 않는다.★ 줄은 그대로 있고 세 칸만 채운다 —
 * `supersededAt`(언제) · `supersededBy`(무엇을 남겼나) · `supersededReason`(왜).
 *
 * ══ ★어느 줄을 남기나★ — 규칙 하나뿐이다 ══
 *
 * ★양쪽 클랜이 확정된 리그★ 를 보고, 그 리그에 있는 줄을 남긴다.
 * ```
 * 양쪽 다 SPL 확정   → supply 줄을 남긴다
 * 양쪽 다 열산 확정   → sanply 줄을 남긴다
 * 양쪽 다 IPL 활성   → nolink 줄을 남긴다   (D-210 — IPL끼리 경기는 열산 기록이 아니다)
 * 그 밖              → ★손대지 않는다★ 사유와 함께 세어서 보고한다
 * ```
 * ⚠ ★애매하면 안 건드린다.★ 임의로 고르면 그게 곧 조용한 오분류다.
 *
 * ══ ★과거는 안 건드린다★ ══
 *
 * 기준시각 ★이전★ 34,880건은 ★한 경기가 여러 리그에 있는 것이 정상★ 이었다 (D-155).
 * 사장님이 「동결」이라 하셨다. 이 도구는 `startAt >= 기준시각` 만 본다.
 *
 * ══ ★자식 데이터(MatchPlayerStat)는 손대지 않는다★ ══
 *
 * 숨긴 줄에 붙어 있던 라인업도 ★그대로 둔다.★ 지우면 되돌릴 수 없다.
 * 화면은 숨긴 줄을 안 보므로 두 배로 세어지지도 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'

const confirm = process.argv.includes('--confirm')
const revert = process.argv.includes('--revert')
const BACKUP = 'data/dedupe-new/superseded-backup.jsonl'

/** ★열산으로 확정된 6곳★ (2026-09-05 사장님). 나머지 37곳은 SPL */
const KEEP_SANPLY = ['flying-', 'immortals', '매너', '사신', '야부리！', '어린이']

interface Backup {
  id: string
  supersededAt: string | null
  supersededBy: string | null
  supersededReason: string | null
}

interface Row {
  sourceMatchId: string
  matchId: string
  leagueSlug: string
  origin: string
  redClanId: string
  blueClanId: string
  redName: string
  blueName: string
  stats: number
}

/* ─────────────────────────────────────────────────────────── 되돌리기 ─── */

async function doRevert(): Promise<void> {
  if (!existsSync(BACKUP)) {
    console.info(`★되돌릴 파일이 없다★ — ${BACKUP}`)
    return
  }
  const lines = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean)
  console.info(`되돌릴 줄 ${lines.length}개`)
  for (const line of lines) {
    const b = JSON.parse(line) as Backup
    await prisma.match.update({
      where: { id: b.id },
      data: {
        supersededAt: b.supersededAt === null ? null : new Date(b.supersededAt),
        supersededBy: b.supersededBy,
        supersededReason: b.supersededReason,
      },
    })
  }
  console.info('되돌렸다')
}

/* ───────────────────────────────────────────────────────────── 본체 ─── */

async function main(): Promise<void> {
  if (revert) return doRevert()

  const cut = MIRROR_FREEZE_FROM
  console.info(`기준시각 ★${cut.toISOString()}★ 이후만 본다\n`)

  /* ① 확정 리그표를 만든다 — 클랜 하나가 어느 리그인지 */
  const sanplyClans = await prisma.clan.findMany({
    where: { name: { in: KEEP_SANPLY } },
    select: { id: true, name: true },
  })
  const sanplySet = new Set(sanplyClans.map((c) => c.id))
  if (sanplyClans.length !== KEEP_SANPLY.length) {
    throw new Error(`열산 6곳 중 ${sanplyClans.length}곳만 찾았다 — 이름이 바뀌었나`)
  }

  /* ② 중복을 모은다 (이미 숨긴 것은 뺀다 — 다시 돌려도 늘지 않는다) */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH dup AS (
      SELECT "sourceMatchId" FROM "Match"
      WHERE "startAt" >= ${cut} AND "sourceMatchId" IS NOT NULL AND "supersededAt" IS NULL
      GROUP BY 1 HAVING COUNT(*) > 1)
    SELECT m."sourceMatchId", m.id AS "matchId", l.slug AS "leagueSlug", m.origin,
           rl."clanId" AS "redClanId", bl."clanId" AS "blueClanId",
           rc.name AS "redName", bc.name AS "blueName",
           (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."matchId" = m.id) AS stats
    FROM "Match" m
    JOIN dup ON dup."sourceMatchId" = m."sourceMatchId"
    JOIN "League" l ON l.id = m."leagueId"
    JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId" JOIN "Clan" rc ON rc.id = rl."clanId"
    JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId" JOIN "Clan" bc ON bc.id = bl."clanId"
    WHERE m."supersededAt" IS NULL
    ORDER BY m."sourceMatchId", l.slug`

  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const list = groups.get(r.sourceMatchId) ?? []
    list.push(r)
    groups.set(r.sourceMatchId, list)
  }
  console.info(`중복 경기 ★${groups.size}개★ · 줄 ${rows.length}개\n`)

  /* ③ 어느 줄을 남길지 정한다 */
  const plans: Array<{ keep: Row; hide: Row[]; reason: string }> = []
  const untouched: Array<{ key: string; why: string }> = []

  for (const [key, list] of groups) {
    const slugs = new Set(list.map((r) => r.leagueSlug))
    const anySanply = list.some((r) => sanplySet.has(r.redClanId) || sanplySet.has(r.blueClanId))

    let wantSlug: string | null = null
    let reason = ''

    if (slugs.has('nolink')) {
      /* IPL 줄이 있다 = 양쪽 다 IPL 등록 클랜이라는 뜻이다 (투영이 그때만 만든다).
         D-210 — IPL끼리 경기는 열산 기록이 아니다 */
      wantSlug = 'nolink'
      reason = '양쪽 다 IPL 등록 클랜이다 — IPL끼리 경기는 열산 기록이 아니다 (D-210)'
    } else if (slugs.has('supply') && slugs.has('sanply')) {
      if (anySanply) {
        wantSlug = 'sanply'
        reason = '한쪽 이상이 열산으로 확정된 클랜이다 (2026-09-05 사장님)'
      } else {
        wantSlug = 'supply'
        reason = '양쪽 다 SPL 로 확정된 클랜이다 (2026-09-05 사장님)'
      }
    }

    const keep = wantSlug ? list.find((r) => r.leagueSlug === wantSlug) : undefined
    if (!keep) {
      untouched.push({ key, why: `고를 수 없다 (리그 ${[...slugs].join('+')})` })
      continue
    }
    plans.push({ keep, hide: list.filter((r) => r.matchId !== keep.matchId), reason })
  }

  /* ④ 무엇을 할지 전부 찍는다 — 「왜 남기고 왜 숨겼는지」가 남아야 한다 */
  console.info('══ 계획 ══')
  for (const p of plans) {
    console.info(
      `${p.keep.sourceMatchId}  ${p.keep.redName} vs ${p.keep.blueName}\n` +
        `    ★남긴다★ ${p.keep.leagueSlug.padEnd(7)} 라인업 ${p.keep.stats}명 · ${p.keep.matchId}\n` +
        p.hide
          .map((h) => `    숨긴다  ${h.leagueSlug.padEnd(7)} 라인업 ${h.stats}명 · ${h.matchId}`)
          .join('\n') +
        `\n    사유: ${p.reason}`,
    )
  }
  if (untouched.length > 0) {
    console.info('\n══ ★손대지 않은 것★ ══')
    for (const u of untouched) console.info(`  ${u.key} — ${u.why}`)
  }

  const hideCount = plans.reduce((a, p) => a + p.hide.length, 0)
  const statsHidden = plans.reduce((a, p) => a + p.hide.reduce((b, h) => b + h.stats, 0), 0)
  console.info(
    `\n남길 것 ${plans.length}줄 · ★숨길 것 ${hideCount}줄★ · 손 안 댄 것 ${untouched.length}개`,
  )
  console.info(`  숨기는 줄에 붙어 있는 라인업 ${statsHidden}명분 — ★지우지 않는다★`)

  if (!confirm) {
    console.info('\n미리보기다. 적용하려면 --confirm')
    return
  }

  /* ⑤ 되돌릴 파일을 ★먼저★ 쓴다 (clanMoveApply 가 배운 순서다) */
  const backups: Backup[] = plans.flatMap((p) =>
    p.hide.map((h) => ({ id: h.matchId, supersededAt: null, supersededBy: null, supersededReason: null })),
  )
  mkdirSync(dirname(BACKUP), { recursive: true })
  writeFileSync(BACKUP, backups.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8')
  const wrote = readFileSync(BACKUP, 'utf8').trim().split('\n').filter(Boolean).length
  if (wrote !== backups.length) throw new Error(`백업 줄 수가 안 맞는다 ${wrote} ≠ ${backups.length}`)
  console.info(`\n★되돌릴 파일 먼저 썼다★ ${BACKUP} · ${wrote}줄 (확인함)\n`)

  /* ⑥ 이제 표시를 붙인다 */
  const now = new Date()
  let done = 0
  for (const p of plans) {
    for (const h of p.hide) {
      await prisma.match.update({
        where: { id: h.matchId },
        data: { supersededAt: now, supersededBy: p.keep.matchId, supersededReason: p.reason },
      })
      done += 1
    }
  }
  console.info(`★숨겼다 ${done}줄★`)
}

main()
  .catch((e) => {
    console.error((e as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
