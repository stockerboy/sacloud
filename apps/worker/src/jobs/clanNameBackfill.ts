import { prisma } from '@sacloud/db'

/**
 * ★원문의 클랜 이름을 칸으로 옮겨 채운다★ (2026-09-20)
 *
 * ── 왜 필요한가
 *
 *   `BarracksClanMatchRaw.payload` 는 ★행 안에 그대로★ 들어 있다 (toast 로 안 나간다).
 *   본체가 1,378MB · 760,000행이고, `payload->>'red_clan_name'` 을 꺼내려면
 *   ★행을 통째로 읽어야★ 한다 — 실측 ★초당 500행★ 이다.
 *
 *   정규화(`unifiedProject`)가 그걸 5분마다 하다가 Postgres 의 2분 벽
 *   (`statement_timeout`)에 걸려 매번 죽었고, 그래서 이런 일이 났다:
 *   ```
 *     Match 가 안 만들어짐      09-19 16:43 이후 ★0건★
 *     명단(MatchPlayerStat) 0줄  「기록은 찍히는데 명단이 없다」
 *     경기분석 0건               「Match 없음」 으로 88,241건 버려짐
 *     수집 게이트가 «무겁다»     health 가 느려져 ★45바퀴 통째로 건너뜀★
 *   ```
 *   이름을 칸으로 빼면 JSON 을 안 읽어도 되고, 그 질의는 ★1초 안★ 에 끝난다.
 *
 * ── 이 잡이 하는 일
 *
 *   아직 `null` 인 줄을 ★조금씩★ 읽어 두 칸을 채운다.
 *   ⚠ ★한 번에 다 하지 않는다★ — 그게 바로 사이트를 멈춰 세운 짓이다.
 *     `--limit` 만큼만 하고 끝낸다. 예약으로 여러 번 돌리면 언젠가 다 채워진다.
 *
 * ⚠ ★`payload` 를 안 건드리고 지나갈 수는 없다★ — 채우려면 한 번은 읽어야 한다.
 *   그래서 ★작게, 자주★ 한다. 한 판에 2,000행이면 실측 4초쯤이다.
 */
export interface ClanNameBackfillOptions {
  /** 한 번에 채울 줄 수. 기본 2,000 — 실측 4초쯤이다 */
  limit?: number
  confirm?: boolean
}

export interface ClanNameBackfillResult {
  /** 읽은 줄 */
  read: number
  /** 이름을 채운 줄 */
  filled: number
  /** ★이름표★ 에 넣어 본 쌍 (겹치면 안 들어간다) */
  aliases: number
  /** 원문에 이름이 아예 없던 줄 (그런 줄도 다시 안 읽게 표시한다) */
  empty: number
  /** 아직 남은 줄 (대략) */
  remaining: number
  ms: number
}

const DEFAULT_LIMIT = 2000

/**
 * ★한 판에 주는 시간★ (2026-09-20).
 *
 * 기본 2분으로는 ★한 판도 못 끝냈다.★ 디스크가 느린 날엔 300줄에 72초가 걸린다.
 * ⚠ 한 판이 끝나야 그만큼이 ★영영 채워진다★ — 중간에 끊기면 아무것도 안 남는다.
 */
const BACKFILL_TIMEOUT_MS = 600_000

/**
 * ★옛 방식이 쓰던 자★ (2026-09-20 이전) — ★지우지 않는다★ (CLAUDE.md 1-4).
 *
 * 옛 방식은 `payload` 를 ★여기로 실어 와★ 자바스크립트로 이름을 꺼냈다.
 * 그 길이 2,000줄에 8분 20초가 걸려 지금은 ★서버 안에서 끝낸다.★
 * 다시 그 길로 돌아가야 할 날이 오면 이 두 자가 그대로 있다.
 */
export function nameOf(payload: unknown, key: 'red_clan_name' | 'blue_clan_name'): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const v = (payload as Record<string, unknown>)[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * ★클랜 번호★ — 라인업 잡이 이걸로 «어느 클랜의 응답인가» 를 푼다.
 * ⚠ 옛 방식이 쓰던 자다 — `nameOf` 와 같이 ★남겨 둔다.★
 */
export function clanNoOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const v = (payload as Record<string, unknown>).clan_no
  if (typeof v === 'number') return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export async function runClanNameBackfill(
  options: ClanNameBackfillOptions = {},
): Promise<ClanNameBackfillResult> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const startedAt = Date.now()
  const out: ClanNameBackfillResult = { read: 0, filled: 0, aliases: 0, empty: 0, remaining: 0, ms: 0 }

  if (!options.confirm) {
    /* 미리보기 — 몇 줄이 남았는지만 센다 (인덱스만 읽는다) */
    out.remaining = await remainingRows()
    out.read = Math.min(limit, out.remaining)
    out.ms = Date.now() - startedAt
    return out
  }

  /*
   * ★★payload 를 여기로 실어 오지 않는다★★ (2026-09-20 두 번째 정정)
   *
   * ── 옛 방식이 왜 느렸나 (실측)
   *   `findMany({ select: { payload } })` 로 2,000줄을 받아 와서 자바스크립트로
   *   이름을 꺼내고 다시 `UPDATE` 로 돌려보냈다. 그런데 한 줄이 ★1.8KB★ 라
   *   2,000줄이면 ★3.6MB★ 가 오가고, 디스크가 붐비는 시간대엔 ★8분 20초★ 가
   *   걸려 ★한 판도 못 끝냈다★ (끊기면 아무것도 안 남는다).
   *
   * ── 지금 방식
   *   ★골라서 · 고치고 · 이름만 돌려받는다★ — 한 문장, 왕복 1번.
   *   `payload` 는 ★서버 안에서만★ 읽히고 우리 쪽으로 오지 않는다.
   *   돌려받는 것은 `subject` 와 클랜 이름뿐이라 몇 KB 다.
   *
   * ⚠ ★`rawClanNo` 를 반드시 비우지 않는다★ — 번호가 없는 줄은 빈 문자열을 넣는다.
   *   그래야 ★다음 판에서 또 안 고른다.★ 읽는 쪽은 `NULLIF(…, '')` 로 본다.
   * ⚠ ★이름 칸은 덮어쓰지 않는다★ — 이미 채운 값이 있으면 그대로 둔다.
   */
  await prisma.$executeRawUnsafe(`SET statement_timeout = ${BACKFILL_TIMEOUT_MS}`)
  const touched = await prisma.$queryRawUnsafe<
    { subject: string; red: string | null; blue: string | null; no: string }[]
  >(
    `WITH picked AS (
       SELECT "id" FROM "BarracksClanMatchRaw"
        WHERE "rawClanNo" IS NULL AND "status" = 'ok'
        ORDER BY "id" DESC
        LIMIT $1
     )
     UPDATE "BarracksClanMatchRaw" AS t
        SET "rawClanNo"    = COALESCE(t."payload"->>'clan_no', ''),
            "redClanName"  = COALESCE(t."redClanName",  t."payload"->>'red_clan_name'),
            "blueClanName" = COALESCE(t."blueClanName", t."payload"->>'blue_clan_name')
       FROM picked p
      WHERE t."id" = p."id"
     RETURNING t."subject" AS "subject",
               t."redClanName" AS "red",
               t."blueClanName" AS "blue",
               t."rawClanNo" AS "no"`,
    limit,
  )
  out.read = touched.length

  /*
   * ★이름표를 따로 쌓는다★ — 정규화(`unifiedProject`)가 이것만 읽는다.
   *   원문 표는 어느 칸을 읽든 1.38GB 를 훑지만, 이름표는 수천 줄이라 몇백 KB 다.
   */
  const aliases = new Map<string, Set<string>>()
  for (const row of touched) {
    const names = [row.red, row.blue].filter((n): n is string => n !== null && n.trim() !== '')
    if (names.length === 0) out.empty += 1
    else out.filled += 1
    for (const name of names) {
      const set = aliases.get(row.subject) ?? new Set<string>()
      set.add(name)
      aliases.set(row.subject, set)
    }
  }
  const aliasRows: { subject: string; name: string }[] = []
  for (const [subject, names] of aliases) for (const name of names) aliasRows.push({ subject, name })
  if (aliasRows.length > 0) {
    /* ⚠ 같은 쌍이 또 와도 괜찮다 — 유일키가 막고 `skipDuplicates` 가 넘긴다 */
    await prisma.barracksClanAlias.createMany({ data: aliasRows, skipDuplicates: true })
    out.aliases += aliasRows.length
  }

  out.remaining = await remainingRows()
  out.ms = Date.now() - startedAt
  return out
}

/**
 * ★몇 줄이 남았나★ — 부분 인덱스(`BCMR_backfill_idx`)만 읽는다.
 *
 * ⚠ ★`count(*)` 를 그냥 부르면 안 된다★ — 옛 판은 `redClanName IS NULL` 까지 봐서
 *   인덱스를 못 타고 2분 벽에 걸렸다. 조건을 ★인덱스와 글자 그대로★ 맞춘다.
 */
async function remainingRows(): Promise<number> {
  try {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM "BarracksClanMatchRaw"
        WHERE "rawClanNo" IS NULL AND "status" = 'ok'`,
    )
    return Number(r[0]?.n ?? 0)
  } catch {
    /* 못 세도 채우는 일은 계속한다 — 셈 때문에 본 작업이 멈추면 본말이 뒤집힌다 */
    return -1
  }
}
