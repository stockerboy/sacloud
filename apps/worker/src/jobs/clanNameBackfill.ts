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
  /** 원문에 이름이 아예 없던 줄 (그런 줄도 다시 안 읽게 표시한다) */
  empty: number
  /** 아직 남은 줄 (대략) */
  remaining: number
  ms: number
}

const DEFAULT_LIMIT = 2000

function nameOf(payload: unknown, key: 'red_clan_name' | 'blue_clan_name'): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const v = (payload as Record<string, unknown>)[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** ★클랜 번호★ — 라인업 잡이 이걸로 «어느 클랜의 응답인가» 를 푼다 */
function clanNoOf(payload: unknown): string | null {
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
  const out: ClanNameBackfillResult = { read: 0, filled: 0, empty: 0, remaining: 0, ms: 0 }

  /*
   * ⚠ ★`payload` 를 고른 뒤에야 읽는다★ — `WHERE` 가 먼저 좁혀 주므로
   *   읽는 행은 `limit` 만큼이다. 전체를 훑지 않는다.
   */
  const rows = await prisma.barracksClanMatchRaw.findMany({
    where: { status: 'ok', redClanName: null, blueClanName: null, rawClanNo: null },
    select: { id: true, payload: true },
    orderBy: { id: 'desc' },
    take: limit,
  })
  out.read = rows.length

  if (!options.confirm) {
    out.ms = Date.now() - startedAt
    return out
  }

  /*
   * ★한 줄씩 쓰면 너무 느리다★ — 실측 2,000줄에 78초(= 39ms/줄)였다.
   *   756,000줄이면 ★8시간★ 이다. 한 문장으로 묶어 쓴다.
   *
   * ⚠ `UPDATE ... FROM (VALUES ...)` 한 방이면 왕복이 1번이다.
   *   ⚠ 값에 작은따옴표가 섞일 수 있어 ★매개변수★ 로 넘긴다 (문자열을 잇지 않는다).
   */
  const ids: string[] = []
  const reds: string[] = []
  const blues: string[] = []
  const nos: string[] = []
  for (const row of rows) {
    const red = nameOf(row.payload, 'red_clan_name')
    const blue = nameOf(row.payload, 'blue_clan_name')
    ids.push(row.id)
    reds.push(red ?? '')
    blues.push(blue ?? '')
    nos.push(clanNoOf(row.payload) ?? '')
    if (red === null && blue === null) out.empty += 1
    else out.filled += 1
  }
  if (ids.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "BarracksClanMatchRaw" AS t
          SET "redClanName" = v.red, "blueClanName" = v.blue, "rawClanNo" = v.no
         FROM (SELECT UNNEST($1::text[]) AS id,
                      UNNEST($2::text[]) AS red,
                      UNNEST($3::text[]) AS blue,
                      UNNEST($4::text[]) AS no) AS v
        WHERE t."id" = v.id`,
      ids, reds, blues, nos,
    )
  }

  out.remaining = await prisma.barracksClanMatchRaw.count({
    where: { status: 'ok', redClanName: null, blueClanName: null, rawClanNo: null },
  })
  out.ms = Date.now() - startedAt
  return out
}
