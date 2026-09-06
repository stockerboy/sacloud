/** ★`ipl-` 접두를 뗀 이름으로는 수집되고 있나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CASES = [
  { name: 'deluxe', slug: 'ferwfwfwfwf', bare: 'ferwfwfwfwf' },
  { name: 'crucialrz', slug: 'ipl-backspace00', bare: 'backspace00' },
  { name: 'NeedΒackup', slug: 'ipl-yoonsh1971', bare: 'yoonsh1971' },
]
for (const c of CASES) {
  const [r] = await prisma.$queryRawUnsafe<Array<{ n: number; ok: number; no: string | null }>>(
    `SELECT COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE "status"='ok')::int AS ok,
            (SELECT "payload"->>'clan_no' FROM "BarracksClanMatchRaw"
              WHERE "subject" = $1 AND "status"='ok' AND "payload"->>'clan_no' IS NOT NULL
              LIMIT 1) AS no
       FROM "BarracksClanMatchRaw" WHERE "subject" = $1`, c.bare)
  console.info(
    `  ${c.name.padEnd(12)} 우리 slug ${c.slug.padEnd(18)} · ★접두 뗀 «${c.bare}» 로 받은 줄 ${r?.n ?? 0}★ (성공 ${r?.ok ?? 0})` +
      ` · 클랜번호 ${r?.no ?? '★못 배움★'}`,
  )
}
console.info(
  '\n  ★`ipl-` 접두는 자리표다★ — 표를 만들 때 `ipl-<주체>` 로도 찾아본다 (`buildSubjectIndex`).\n' +
    '  그래서 접두 뗀 이름으로 수집이 되면 ★번호가 이어진다.★',
)
await prisma.$disconnect()
