/**
 * 클랜마크 주소를 **원본 사이트에서 넥슨으로 되돌린다** (D-227).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/clanMarkRestore.ts            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/clanMarkRestore.ts --confirm  # 실제 반영
 * node scripts/prod-run.mjs clan-mark-restore [--confirm]                      # 운영
 * ```
 *
 * ── 무엇을 바꾸나
 *   `Clan.markBgUrl` / `Clan.markFrontUrl` 이 `https://static.3rd.supply/marks/<base64>.png`
 *   를 물고 있다. 그 base64 를 풀면 넥슨 경로가 그대로 나온다 — 원본 사이트는 넥슨 CDN 을
 *   base64 이름으로 미러링한 중간 껍데기일 뿐이다. 자세한 것은 D-227.
 *
 *   변환 규칙은 **여기에 적지 않는다.** `@sacloud/contract` 의 `supplyMarkUrlToNexon()`
 *   하나가 단일 진실이고, 화면 매퍼도 같은 함수를 부른다. 두 벌로 적으면 어긋난다.
 *
 * ── `MatchPlayerStat` 은 **건드리지 않는다**
 *   경기 당시 스냅샷 180만 행도 같은 주소를 물고 있지만, 그것은 **과거 기록**이다
 *   (`CLAUDE.md` 5장 1번 — 원본 응답을 버리지 않는다 / 2번 — 과거는 원본값 그대로).
 *   대신 **화면으로 내보낼 때** 같은 함수로 변환한다(`queries/matches.ts`). 그러면
 *   저장된 원본은 그대로 남고, 브라우저는 넥슨 주소만 본다.
 *
 *   180만 행을 실제로 갈아엎으면 WAL 이 크게 불어난다 — D-216 이 그것 때문에 DB 가 죽은
 *   기록이다. 얻는 것 없이 위험만 지는 셈이라 하지 않는다.
 *
 * ── 되돌릴 수 있게 한다
 *   `--confirm` 이면 **쓰기 전에** `backups/clan-mark-restore-<건수>건.json` 을 남긴다.
 *   행별 원래 값과 **고유 주소 매핑표**가 함께 들어간다. `ipl-sanply-purge` 와 같은 방식이다.
 *
 * ── 안 풀리는 것은 손대지 않는다
 *   `supplyMarkUrlToNexon()` 이 `null` 을 주는 주소는 **두 갈래**다.
 *     ① `default.png`      원본 사이트의 자체 대체이미지. **`null` 로 비운다** —
 *                          남의 대체이미지 대신 우리가 그린 구름이 나온다 (D-227 5번)
 *     ② 그 밖의 못 푸는 것  **그대로 둔다.** 무엇인지 모르는 것을 지우지 않는다.
 *                          몇 건인지 세어서 보고한다
 */
import { supplyMarkUrlToNexon } from '@sacloud/contract'
import { prisma } from '@sacloud/db'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 백업이 떨어질 곳 — **저장소 루트의 `backups/`**.
 *
 * `process.cwd()` 를 쓰면 안 된다. `pnpm --filter @sacloud/worker exec` 로 부르면 cwd 가
 * `apps/worker` 라서 `apps/worker/backups/` 에 떨어지고, `node scripts/prod-run.mjs` 로
 * 부르면 루트에 떨어진다. **부르는 방법에 따라 백업 위치가 갈리면 되돌릴 때 못 찾는다.**
 * 이 파일 위치에서 거슬러 올라가 고정한다 (`src/dev` → `apps/worker` → 루트).
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const confirm = process.argv.includes('--confirm')

/** 원본 사이트의 자체 대체이미지. 「마크 없음」이라는 뜻이라 비운다 */
const SUPPLY_DEFAULT = 'https://static.3rd.supply/marks/default.png'

/** 원본 사이트 주소인가 (= 우리가 손댈 대상인가) */
const isSupplyMark = (url: string | null): url is string =>
  url !== null && url.startsWith('https://static.3rd.supply/marks/')

type Decision =
  | { kind: 'restore'; next: string }
  | { kind: 'clear' }
  | { kind: 'keep'; why: 'not-supply' | 'undecodable' }

function decide(url: string | null): Decision {
  if (!isSupplyMark(url)) return { kind: 'keep', why: 'not-supply' }
  if (url === SUPPLY_DEFAULT) return { kind: 'clear' }
  const next = supplyMarkUrlToNexon(url)
  if (next === null) return { kind: 'keep', why: 'undecodable' }
  return { kind: 'restore', next }
}

async function main() {
  const clans = await prisma.clan.findMany({
    where: {
      OR: [
        { markBgUrl: { startsWith: 'https://static.3rd.supply/' } },
        { markFrontUrl: { startsWith: 'https://static.3rd.supply/' } },
      ],
    },
    select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true },
    orderBy: { slug: 'asc' },
  })

  const tally = { restore: 0, clear: 0, undecodable: 0 }
  /** 고유 주소 매핑표. 되돌릴 때 이것만 있으면 된다 */
  const mapping = new Map<string, string | null>()
  const changes: Array<{
    id: string
    slug: string
    before: { bg: string | null; front: string | null }
    after: { bg: string | null; front: string | null }
  }> = []
  const undecodable: Array<{ slug: string; url: string }> = []

  for (const clan of clans) {
    const bg = decide(clan.markBgUrl)
    const front = decide(clan.markFrontUrl)

    for (const [url, d] of [
      [clan.markBgUrl, bg],
      [clan.markFrontUrl, front],
    ] as const) {
      if (d.kind === 'restore') {
        tally.restore += 1
        mapping.set(url as string, d.next)
      } else if (d.kind === 'clear') {
        tally.clear += 1
        mapping.set(url as string, null)
      } else if (d.why === 'undecodable') {
        tally.undecodable += 1
        undecodable.push({ slug: clan.slug, url: url as string })
      }
    }

    const after = {
      bg: bg.kind === 'restore' ? bg.next : bg.kind === 'clear' ? null : clan.markBgUrl,
      front:
        front.kind === 'restore' ? front.next : front.kind === 'clear' ? null : clan.markFrontUrl,
    }
    if (after.bg !== clan.markBgUrl || after.front !== clan.markFrontUrl) {
      changes.push({
        id: clan.id,
        slug: clan.slug,
        before: { bg: clan.markBgUrl, front: clan.markFrontUrl },
        after,
      })
    }
  }

  console.info(
    `\n원본 사이트 주소를 문 클랜 ${clans.length}곳 · 바뀔 클랜 ${changes.length}곳\n` +
      `  넥슨 주소로 복원  ${tally.restore}칸\n` +
      `  비움(default.png) ${tally.clear}칸\n` +
      `  못 풀어서 그대로  ${tally.undecodable}칸\n` +
      `  고유 주소 매핑    ${mapping.size}개`,
  )

  for (const u of undecodable) {
    console.info(`  ⚠못품  ${u.slug}  ${u.url}`)
  }
  for (const c of changes.slice(0, 5)) {
    console.info(`  예시  ${c.slug.padEnd(16)} ${c.before.bg} → ${c.after.bg}`)
  }
  if (changes.length > 5) console.info(`  … 그 밖 ${changes.length - 5}곳`)

  if (!confirm) {
    console.info('\n미리보기다. 실제로 바꾸려면 --confirm')
    return
  }

  /* 쓰기 전에 백업. 되돌릴 수 없는 작업을 근거 없이 하지 않는다 (CLAUDE.md 3-A) */
  const dir = path.join(REPO_ROOT, 'backups')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `clan-mark-restore-${changes.length}건.json`)
  writeFileSync(
    file,
    JSON.stringify(
      {
        what: 'D-227 — 클랜마크 주소를 static.3rd.supply → img.sa.nexon.com 으로 되돌린 기록',
        table: 'Clan',
        note: 'MatchPlayerStat 스냅샷은 건드리지 않았다. 화면으로 내보낼 때 변환한다',
        counts: { clans: clans.length, changed: changes.length, ...tally },
        /** 고유 주소 매핑표 — 되돌릴 때 이것만 있으면 된다 */
        mapping: Object.fromEntries(mapping),
        undecodable,
        rows: changes,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.info(`\n백업  ${file}`)

  let written = 0
  for (const c of changes) {
    await prisma.clan.update({
      where: { id: c.id },
      data: { markBgUrl: c.after.bg, markFrontUrl: c.after.front },
    })
    written += 1
  }

  /* 숫자 대조로 판정한다. 로그가 아니라 DB 를 다시 세어 본다 (CLAUDE.md 3-A 6번) */
  const left = await prisma.clan.count({
    where: {
      OR: [
        { markBgUrl: { startsWith: 'https://static.3rd.supply/' } },
        { markFrontUrl: { startsWith: 'https://static.3rd.supply/' } },
      ],
    },
  })
  const nexon = await prisma.clan.count({
    where: { markBgUrl: { startsWith: 'https://img.sa.nexon.com/' } },
  })
  console.info(
    `\n반영 ${written}곳 · 남은 원본 사이트 주소 ${left}곳 (못 푼 ${undecodable.length}칸이 여기 있다) · 넥슨 주소 ${nexon}곳`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
