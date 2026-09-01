/**
 * **로컬** DB 에 `str_usn ↔ 우리 Player` 다리를 놓을 재료가 얼마나 있나 (D-254 후속).
 *
 * 운영에는 배틀로그 원문도 클랜원 명단도 없다(0행). 로컬에는 있다.
 * 그래서 "운영으로 밀면 몇 명이 이어지는가" 를 **여기서 미리 센다.**
 *
 * ── 짝짓기는 **숫자로만** 한다. 닉네임으로 잇지 않는다
 *   배틀로그 이벤트가 `str_usn` 과 `user_nexon_sn` 을 **함께** 준다(실측).
 *   그리고 우리 `Player.sourcePlayerId` 가 곧 `user_nexon_sn` 이다.
 *   그래서 추측할 자리가 없다 — 닉네임 동명이인·개명 위험을 아예 만나지 않는다 (D-036).
 *
 * **아무것도 쓰지 않는다.**
 */
import { prisma } from '@sacloud/db'

const isUsn = (v: string) => /^[0-9A-Fa-f]{16}SA$/.test(v)

const [members, battlelogs, clanMatch, players] = await Promise.all([
  prisma.barracksClanMember.count(),
  prisma.barracksBattleLogRaw.count({ where: { status: 'ok' } }),
  prisma.barracksClanMatchRaw.count(),
  prisma.player.count(),
])
console.info('── 로컬 표 크기')
console.info({ BarracksClanMember: members, BarracksBattleLogRaw: battlelogs, BarracksClanMatchRaw: clanMatch, Player: players })

/** str_usn → user_nexon_sn. 두 출처에서 모은다 */
const snOf = new Map<string, string>()
/** str_usn → 관측된 닉네임(참고용. 짝짓기에 쓰지 않는다) */
const nickOf = new Map<string, string>()

/* ① 클랜원 명단 — 한 줄에 둘이 같이 온다 */
const memberRows = await prisma.barracksClanMember.findMany({
  distinct: ['strUsn'],
  select: { strUsn: true, userNexonSn: true, userNick: true },
})
for (const r of memberRows) {
  if (isUsn(r.strUsn) && r.userNexonSn) snOf.set(r.strUsn.toUpperCase(), r.userNexonSn)
  if (r.userNick) nickOf.set(r.strUsn.toUpperCase(), r.userNick)
}
console.info(`① BarracksClanMember 고유 str_usn ${memberRows.length} · sn 짝 ${snOf.size}`)

/* ② 배틀로그 원문 — 이벤트마다 str_usn + user_nexon_sn 이 함께 온다 (battlelog.ts 와 같은 규칙) */
const fromMembers = snOf.size
let scanned = 0
let cursor: string | undefined
for (;;) {
  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { status: 'ok' },
    select: { id: true, payload: true },
    orderBy: { id: 'asc' },
    take: 100,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  if (rows.length === 0) break
  cursor = rows[rows.length - 1]?.id
  scanned += rows.length
  for (const row of rows) {
    const holder = row.payload as { raw?: { battleLog?: unknown[] }; battleLog?: unknown[] }
    const events = ((holder.raw ?? holder).battleLog ?? []) as Record<string, unknown>[]
    for (const e of events) {
      const put = (usn: unknown, sn: unknown, nick: unknown) => {
        if (typeof usn !== 'string' || !isUsn(usn)) return
        const key = usn.toUpperCase()
        if (sn !== null && sn !== undefined && sn !== '') snOf.set(key, String(sn))
        if (typeof nick === 'string' && nick !== '') nickOf.set(key, nick)
      }
      put(e.str_usn, e.user_nexon_sn, e.user_nick)
      put(e.target_str_usn, e.target_user_nexon_sn, e.target_user_nick)
    }
  }
  if (rows.length < 100) break
}
console.info(`② BarracksBattleLogRaw ${scanned}행 훑음 · 누적 str_usn ${snOf.size} (배틀로그가 더한 것 ${snOf.size - fromMembers})`)

/* ③ 숫자 계정번호로 우리 Player 와 잇는다 — 추측 없음 */
const sns = [...new Set(snOf.values())]
const found = new Map<string, { id: string; name: string }>()
for (let i = 0; i < sns.length; i += 1000) {
  const rows = await prisma.player.findMany({
    where: { sourcePlayerId: { in: sns.slice(i, i + 1000) } },
    select: { id: true, name: true, sourcePlayerId: true },
  })
  for (const r of rows) if (r.sourcePlayerId) found.set(r.sourcePlayerId, { id: r.id, name: r.name })
}
const linked = [...snOf.entries()].filter(([, sn]) => found.has(sn))
console.info('')
console.info('── 숫자(user_nexon_sn)로 이어지는가 — 닉네임은 쓰지 않는다')
console.info(`고유 str_usn ${snOf.size} · 고유 sn ${sns.length} · Player 로 이어지는 str_usn ${linked.length}`)

/* ④ 닉네임으로 짝지었다면 얼마나 위험했나 — 하지 않기로 한 판단의 근거를 숫자로 남긴다 */
const nicks = [...new Set([...nickOf.values()])]
let ambiguous = 0
let missing = 0
for (let i = 0; i < nicks.length; i += 500) {
  const chunk = nicks.slice(i, i + 500)
  const rows = await prisma.player.groupBy({
    by: ['name'],
    where: { name: { in: chunk } },
    _count: { _all: true },
  })
  const byName = new Map(rows.map((r) => [r.name, r._count._all]))
  for (const n of chunk) {
    const c = byName.get(n) ?? 0
    if (c === 0) missing += 1
    else if (c > 1) ambiguous += 1
  }
}
console.info('')
console.info('── 닉네임으로 짝지었다면 (하지 않는다. 위험 크기를 재는 것뿐이다)')
console.info(`관측 닉 ${nicks.length} · 우리에게 없는 닉 ${missing} · **동명이인이 있는 닉 ${ambiguous}**`)

/* ⑤ 표본 몇 개 */
console.info('')
console.info('── 표본')
for (const [usn, sn] of linked.slice(0, 8)) {
  console.info(`${usn}  sn=${sn}  →  ${found.get(sn)!.id} (${found.get(sn)!.name})  관측닉 ${nickOf.get(usn) ?? '-'}`)
}
/* 사용자가 지금 보낸 그 주소 */
const POM = 'D9EBC75CCBD60C12SA'
console.info('')
console.info(`사용자 주소 ${POM} → sn ${snOf.get(POM) ?? '없음'} · Player ${snOf.has(POM) ? (found.get(snOf.get(POM)!)?.id ?? '못 이음') : '-'}`)
await prisma.$disconnect()
