/**
 * 닉네임 → 병영수첩 계정(`str_usn`) 찾기 (D-199).
 *
 * 포지션 정답 라벨을 받을 때 쓴다. 사용자가 병영수첩 주소를 찾아 줄 필요 없이
 * **닉네임만 주면** 되도록 하려고 만들었다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/positionLabelLookup.ts "닉1" "닉2"
 * ```
 *
 * ── 조심할 것
 *   **닉네임은 바뀐다.** 같은 닉이 여러 계정에 걸리거나, 지금 닉으로는 옛 기록을
 *   못 찾을 수 있다. 그래서 여러 개가 잡히면 **고르지 않고 전부 보여준다** —
 *   사람이 판단할 일이다 (D-036 과 같은 원칙).
 */
import { prisma } from '@sacloud/db'

interface Row {
  str_usn?: string | null
  user_nick?: string | null
  target_str_usn?: string | null
  target_user_nick?: string | null
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (wanted.length === 0) {
  console.info('닉네임을 인자로 주세요. 예: tsx src/dev/positionLabelLookup.ts "누검" "쨔잉나"')
  process.exit(0)
}

const rows = await prisma.barracksBattleLogRaw.findMany({
  where: { subjectKind: 'clan', status: 'ok' },
  select: { payload: true },
})

/** 닉네임 → 계정들. 여러 개면 그대로 여러 개다 */
const byNick = new Map<string, Map<string, number>>()
const put = (nick: unknown, usn: unknown) => {
  if (typeof nick !== 'string' || nick.trim() === '') return
  if (typeof usn !== 'string' || usn.trim() === '') return
  const inner = byNick.get(nick) ?? new Map<string, number>()
  inner.set(usn, (inner.get(usn) ?? 0) + 1)
  byNick.set(nick, inner)
}
for (const row of rows) {
  const holder = row.payload as { raw?: { battleLog?: Row[] }; battleLog?: Row[] }
  for (const event of (holder.raw ?? holder).battleLog ?? []) {
    put(event.user_nick, event.str_usn)
    put(event.target_user_nick, event.target_str_usn)
  }
}

/** 그 계정에 좌표 분포가 있나 — 없으면 정답으로 써도 학습에 안 들어간다 */
const profiles = new Map(
  (
    await prisma.playerPositionProfile.findMany({
      select: { userNexonSn: true, position: true, games: true, margin: true },
    })
  ).map((p) => [p.userNexonSn, p]),
)

console.info('배틀로그에서 찾은 닉네임', byNick.size, '개')
console.info('')
for (const nick of wanted) {
  const found = byNick.get(nick)
  if (!found) {
    console.info(`✗ ${nick} — 배틀로그에 없다 (수집분에 그 선수 경기가 없다)`)
    continue
  }
  const list = [...found.entries()].sort((a, b) => b[1] - a[1])
  for (const [usn, seen] of list) {
    const profile = profiles.get(usn)
    const state = profile
      ? `분포 있음 (${profile.games}판 · 지금 판정 ${profile.position} · margin ${profile.margin.toFixed(3)})`
      : '분포 없음 — 좌표가 모자라 학습에 못 들어간다'
    console.info(`${list.length > 1 ? '⚠' : '✓'} ${nick}  ${usn}  이벤트 ${seen}건 · ${state}`)
  }
  if (list.length > 1) console.info(`   ↑ ${nick} 에 계정이 ${list.length}개 걸린다. 사람이 골라야 한다`)
}

await prisma.$disconnect()
