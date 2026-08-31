/**
 * IPL **클랜원 명단 적재** — 브라우저가 받은 JSON 을 DB 에 넣는다 (D-219).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplMemberImport.ts --file <경로>
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplMemberImport.ts --file <경로> --confirm
 * ```
 *
 * ── 재료
 *   `scripts/ipl-clan-members-snippet.js` 가 병영수첩 콘솔에서 받아 내린 파일.
 *   `POST /api/ClanHome/GetClanUserList` 의 원문이 클랜별로 들어 있다.
 *
 * ── 왜 이게 중요한가
 *   원문 어디에도 **선수별 소속 클랜이 없었다.** 배틀로그는 "이 팀으로 뛰었다" 까지만 알려 준다.
 *   이 명단이 그 빈칸을 채운다. 그리고 `str_usn`·`user_nexon_sn` 이 **배틀로그와 같은 값**이라
 *   닉네임으로 추측하던 계정 연결이 통째로 필요 없어진다.
 *
 * ── 관측으로 넣는다
 *   명단은 바뀐다. 그래서 `observedAt` 을 함께 박고, 같은 사람을 여러 번 관측하면 줄이 늘어난다.
 *   "지금 명단" 이 아니라 **"그때 본 명단"** 이다.
 *
 * ── raw SQL 을 쓰는 이유
 *   다른 세션의 dev 서버가 Prisma 엔진 DLL 을 잡고 있어 `prisma generate` 가 안 된다
 *   (Windows EPERM). 생성된 클라이언트에 새 모델이 없어도 돌아가게 raw 로 넣는다.
 *   나중에 재생성되면 그때 모델을 써도 된다 — 표는 같다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'

const fileIndex = process.argv.indexOf('--file')
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined
const confirm = process.argv.includes('--confirm')
if (!file) {
  console.error('--file <경로> 가 필요하다')
  process.exit(1)
}

interface Member {
  str_usn?: string
  user_nexon_sn?: number | string
  user_nick?: string
  clan_level?: string
  clan_exp?: string
  conn_flag?: number | string
  punish_flag?: number | string
  auth_flag?: string
}

const doc = JSON.parse(readFileSync(file, 'utf8')) as {
  collectedAt?: string
  clans?: Array<{ barracks: string; name?: string; raw?: { resultClanUserList?: Member[] } }>
}

const observedAt = doc.collectedAt ? new Date(doc.collectedAt) : new Date()
const clans = doc.clans ?? []

interface Row {
  clanSlug: string
  clanName: string | null
  strUsn: string
  userNexonSn: string
  userNick: string | null
  clanLevel: string | null
  clanExp: string | null
  connFlag: number
  punishFlag: number
  authFlag: string | null
}

const rows: Row[] = []
const skipped: string[] = []
let online = 0
const masters: string[] = []

for (const c of clans) {
  const list = c.raw?.resultClanUserList ?? []
  if (!list.length) {
    skipped.push(c.barracks)
    continue
  }
  for (const m of list) {
    /* 계정 고유값이 없으면 넣지 않는다 — 신원의 기준이 그것이다 (D-220) */
    if (!m.str_usn || m.user_nexon_sn === undefined || m.user_nexon_sn === null) continue
    const conn = Number(m.conn_flag ?? 0)
    if (conn === 1) online += 1
    if (m.clan_level === '클랜마스터') masters.push(`${c.name ?? c.barracks}:${m.user_nick ?? '?'}`)
    rows.push({
      clanSlug: c.barracks,
      clanName: c.name ?? null,
      strUsn: String(m.str_usn),
      userNexonSn: String(m.user_nexon_sn),
      userNick: m.user_nick ?? null,
      clanLevel: m.clan_level ?? null,
      clanExp: m.clan_exp ?? null,
      connFlag: Number.isFinite(conn) ? conn : 0,
      punishFlag: Number(m.punish_flag ?? 0) || 0,
      authFlag: m.auth_flag ?? null,
    })
  }
}

console.info(`파일 ${file}`)
console.info(`관측 시각 ${observedAt.toISOString()}`)
console.info(`클랜 ${clans.length} · 클랜원 ${rows.length.toLocaleString()} · 접속중 ${online.toLocaleString()}`)
console.info(`클랜마스터 ${masters.length}명`)
if (skipped.length) console.info(`⚠ 명단이 비어 있던 클랜 ${skipped.length}곳: ${skipped.join(', ')}`)

const usns = [...new Set(rows.map((r) => r.strUsn))]
console.info(`고유 계정 ${usns.length.toLocaleString()}`)

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 쓰지 않았다')
  await prisma.$disconnect()
  process.exit(0)
}

/* 묶어서 넣는다. 같은 (클랜, 계정, 관측시각) 이 이미 있으면 건너뛴다 (멱등) */
const CHUNK = 200
let inserted = 0
for (let i = 0; i < rows.length; i += CHUNK) {
  const part = rows.slice(i, i + CHUNK)
  const values = part
    .map(
      (r) =>
        `(gen_random_uuid()::text, ${q(r.clanSlug)}, ${q(r.clanName)}, ${q(r.strUsn)}, ${q(r.userNexonSn)}, ` +
        `${q(r.userNick)}, ${q(r.clanLevel)}, ${q(r.clanExp)}, ${r.connFlag}, ${r.punishFlag}, ${q(r.authFlag)}, ` +
        `'${observedAt.toISOString()}'::timestamp)`,
    )
    .join(',')
  const sql =
    `INSERT INTO "BarracksClanMember" ` +
    `("id","clanSlug","clanName","strUsn","userNexonSn","userNick","clanLevel","clanExp","connFlag","punishFlag","authFlag","observedAt") ` +
    `VALUES ${values} ON CONFLICT ("clanSlug","strUsn","observedAt") DO NOTHING`
  inserted += await prisma.$executeRawUnsafe(sql)
  console.info(`  ... ${Math.min(i + CHUNK, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`)
}

console.info(`\n적재 완료 — 새로 들어간 줄 ${inserted.toLocaleString()}`)
await prisma.$disconnect()

/** 작은따옴표를 이스케이프한다. 값이 없으면 NULL */
function q(v: string | null): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}
