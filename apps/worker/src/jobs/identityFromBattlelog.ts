import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/**
 * ★★계정을 배틀로그로 잇고, 닉을 따라간다★★ (2026-09-20 사장님)
 *
 * > 「엄웅도 이사람도 ★정보 싹 바꼈는데 그대로★ 네 이거 진짜 왜이래 어떡할래?」
 * > 「★급한 불 끄는 식 말고★ 정확히 어떻게 해야 이런 문제가 없을지 잘 생각해봐」
 *
 * ── 뿌리
 *
 *   병영수첩에서 ★안 바뀌는 것은 계정 번호(`str_usn`) 하나★ 다.
 *   닉네임 · 소속 클랜 · 클랜 이름 · 클랜 마크는 ★전부 바뀐다.★
 *
 *   ★계정을 알면 나머지를 따라갈 수 있고, 모르면 하나도 못 따라간다.★
 *
 *   실측 (2026-09-20) — 선수 26,497명 중 계정을 아는 사람이 ★4,347명(16%)★ 뿐이었다.
 *   그래서 고쳐도 고쳐도 옛 정보가 남는 선수가 계속 나왔다. 지금까지의 고침은
 *   전부 ★그 16% 안에서만★ 돈 것이다.
 *
 * ── 이 잡이 뿌리를 어떻게 뽑나
 *
 *   ★배틀로그에 계정과 닉이 ★함께★ 온다.★ 따로 요청할 것이 없다 — 공짜다.
 *
 *   ```
 *   "str_usn": "580E68CF4A7994F2SA",   "user_nick": "강남짱구"
 *    ↑ 안 바뀐다                         ↑ 지금 닉
 *   ```
 *
 *   실측 — 배틀로그 ★600건★ 에서 계정-닉 쌍 ★1,894개★ 가 나왔고
 *   그중 ★926개가 우리가 모르던 계정★ 이었다.
 *
 *   경기마다 이 쌍을 읽어 —
 *
 *     ① 그 계정을 이미 아는 선수가 있으면 → ★닉이 다르면 고친다★
 *     ② 없으면 → 그 닉을 가진 선수가 ★딱 한 명★ 일 때만 ★계정을 박아 잇는다★
 *     ③ 한 번 이어지면 ★그 뒤로는 계속 따라간다★
 *
 * ── ⚠ 안 하는 것
 *
 *   · ★같은 닉이 여럿이면 안 잇는다★ — 잘못 이으면 두 사람이 한 사람이 된다.
 *     그건 ★되돌리기가 가장 어려운 사고★ 다 (D-106 보다 더 나쁘다).
 *   · ★합쳐진 껍데기는 되살리지 않는다★ — 이름이 «(합쳐짐→…)» 인 줄에 닉을
 *     써 넣으면 그 분신이 검색에 부활한다.
 *   · ★남의 계정을 뺏지 않는다★ — 이미 다른 선수가 그 계정을 갖고 있으면 건너뛴다.
 *   · ★클랜은 여기서 안 건드린다★ — 소속은 `clanAffiliation` 한 곳이 정한다.
 *     여기서 같이 고치면 두 곳이 갈라진다.
 */

/** 한 번에 읽는 원문 수 — 한 줄이 수 MB 라 크게 잡으면 연결이 끊긴다 */
const CHUNK = 100

/** 합쳐진 껍데기 표시 — 이 이름이 든 선수는 건드리지 않는다 */
const MERGED_MARK = '(합쳐짐'

export interface IdentityFromBattlelogResult {
  /** 읽은 원문 수 */
  rows: number
  /** 원문에서 모은 계정-닉 쌍 */
  pairs: number
  /** 계정을 새로 박아 이은 선수 */
  linked: number
  /** 계정으로 찾아 닉을 고친 선수 */
  renamed: number
  /** 닉이 여럿이라 못 이은 계정 */
  ambiguous: number
  /** 그 닉을 가진 선수가 없어 못 이은 계정 */
  noPlayer: number
  samples: { usn: string; before: string; after: string; how: 'link' | 'rename' }[]
}

export async function runIdentityFromBattlelog(input: {
  confirm: boolean
  /** 최근 몇 건의 원문을 볼까. 안 주면 2,000건 */
  limit?: number
}): Promise<IdentityFromBattlelogResult> {
  const limit = input.limit ?? 2000
  const result: IdentityFromBattlelogResult = {
    rows: 0,
    pairs: 0,
    linked: 0,
    renamed: 0,
    ambiguous: 0,
    noPlayer: 0,
    samples: [],
  }

  /* ── ① 원문에서 (계정 → 지금 닉) 을 모은다 ───────────── */
  const index = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { id: true },
    orderBy: { fetchedAt: 'desc' },
    take: limit,
  })
  result.rows = index.length

  /** usn → 가장 최근에 본 닉 */
  const nickOf = new Map<string, string>()
  for (let i = 0; i < index.length; i += CHUNK) {
    const part = await prisma.barracksBattleLogRaw.findMany({
      where: { id: { in: index.slice(i, i + CHUNK).map((r) => r.id) } },
      select: { payload: true },
    })
    for (const row of part) {
      const raw = row.payload as { raw?: unknown } | null
      const holder = (typeof raw?.raw === 'object' && raw.raw !== null ? raw.raw : raw) as {
        battleLog?: Record<string, unknown>[]
      } | null
      for (const e of holder?.battleLog ?? []) {
        /*
         * ⚠ ★최근 것을 먼저 읽으므로 먼저 본 닉이 최신★ 이다.
         *   이미 담았으면 덮지 않는다 — 덮으면 옛 닉으로 되돌아간다.
         */
        for (const [u, n] of [
          [e.str_usn, e.user_nick],
          [e.target_str_usn, e.target_user_nick],
        ] as const) {
          const usn = typeof u === 'string' ? u.trim() : ''
          const nick = typeof n === 'string' ? n.trim() : ''
          if (usn === '' || nick === '') continue
          if (nickOf.has(usn)) continue
          nickOf.set(usn, nick)
        }
      }
    }
  }
  result.pairs = nickOf.size

  /* ── ② 이미 계정을 아는 선수 — 닉을 따라간다 ─────────── */
  const known = await prisma.player.findMany({
    where: { sourcePlayerId: { startsWith: 'BRK-' } },
    select: { id: true, name: true, sourcePlayerId: true },
  })
  /** usn → 그 계정을 가진 선수 */
  const playerOfUsn = new Map<string, { id: string; name: string }>()
  for (const p of known) {
    const usn = (p.sourcePlayerId ?? '').slice(4)
    if (usn !== '') playerOfUsn.set(usn, { id: p.id, name: p.name })
  }

  for (const [usn, nick] of nickOf) {
    const mine = playerOfUsn.get(usn)
    if (mine === undefined) continue
    if (mine.name === nick) continue
    if (mine.name.includes(MERGED_MARK)) continue
    result.renamed += 1
    if (result.samples.length < 25) {
      result.samples.push({ usn, before: mine.name, after: nick, how: 'rename' })
    }
    if (input.confirm) {
      await prisma.player.update({ where: { id: mine.id }, data: { name: nick } })
    }
  }

  /* ── ③ 모르는 계정 — 닉이 딱 하나일 때만 잇는다 ───────── */
  const unknown = [...nickOf.entries()].filter(([usn]) => !playerOfUsn.has(usn))
  if (unknown.length > 0) {
    const nicks = [...new Set(unknown.map(([, nick]) => nick))]
    /** 닉 → 그 닉을 가진 선수들 (계정을 아직 안 가진 사람만) */
    const byNick = new Map<string, { id: string; name: string }[]>()
    for (let i = 0; i < nicks.length; i += 500) {
      const found = await prisma.player.findMany({
        where: {
          name: { in: nicks.slice(i, i + 500) },
          /* ⚠ ★남의 계정을 뺏지 않는다★ — 이미 계정이 있는 선수는 건드리지 않는다 */
          OR: [{ sourcePlayerId: null }, { NOT: { sourcePlayerId: { startsWith: 'BRK-' } } }],
        },
        select: { id: true, name: true },
      })
      for (const p of found) {
        const list = byNick.get(p.name)
        if (list) list.push(p)
        else byNick.set(p.name, [p])
      }
    }

    for (const [usn, nick] of unknown) {
      const found = byNick.get(nick) ?? []
      if (found.length === 0) {
        result.noPlayer += 1
        continue
      }
      /* ★둘 이상이면 안 잇는다★ — 잘못 이으면 두 사람이 한 사람이 된다 */
      if (found.length > 1) {
        result.ambiguous += 1
        continue
      }
      const one = found[0] as { id: string; name: string }
      if (one.name.includes(MERGED_MARK)) continue
      result.linked += 1
      if (result.samples.length < 25) {
        result.samples.push({ usn, before: one.name, after: nick, how: 'link' })
      }
      if (input.confirm) {
        await prisma.player.update({
          where: { id: one.id },
          data: { sourcePlayerId: `BRK-${usn}` },
        })
        /*
         * ⚠ ★한 닉은 한 번만 잇는다★ — 같은 닉이 두 계정에 걸리면 둘째부터는
         *   그 선수가 이미 계정을 가진 것이 되어 ★두 계정이 한 사람에 붙는다.★
         */
        byNick.delete(nick)
      }
    }
  }

  log(
    `계정 잇기 — 원문 ${result.rows}건 · 계정 ${result.pairs}개 · ` +
      `새로 이음 ${result.linked} · 닉 고침 ${result.renamed} · ` +
      `닉 겹쳐 못 이음 ${result.ambiguous} · 선수 없음 ${result.noPlayer}` +
      (input.confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) {
    log(`  ${s.how === 'link' ? '이음' : '닉'} ${s.before} → ${s.after} (${s.usn.slice(0, 8)}…)`)
  }
  return result
}
