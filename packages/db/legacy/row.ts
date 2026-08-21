import type { CsvRow } from './csv'

/**
 * CSV 한 줄 → `LegacyPlayerSeason` 입력.
 *
 * **빈 칸은 `null`이다. 채워 넣지 않는다.**
 * 승률만 있으면 `winRate`만 담고 `wins`/`losses`는 null로 둔다.
 * 원본에 없던 값을 역산해서 만드는 순간 그건 우리가 지어낸 숫자다
 * (CLAUDE.md 3-A 8번).
 */

export const LEGACY_CSV_COLUMNS = [
  'source_player_id',
  'nickname',
  'league_slug',
  'season',
  'division',
  'clan_name',
  'wins',
  'losses',
  'win_rate',
  'kills',
  'deaths',
  'kd',
  'final_rating',
  'final_rank',
  'rank_count',
  'source_url',
] as const

export interface LegacySeasonInput {
  source: string
  sourcePlayerId: string | null
  nickname: string
  leagueSlug: string | null
  season: number
  division: number | null
  clanName: string | null
  wins: number | null
  losses: number | null
  winRate: number | null
  kills: number | null
  deaths: number | null
  kd: number | null
  finalRating: number | null
  finalRank: number | null
  rankCount: number | null
  sourceUrl: string | null
  rawSnapshot: CsvRow
  dedupeKey: string
}

export interface RowError {
  line: number
  message: string
}

/** 빈 문자열은 null. `-`, `null`, `N/A` 같은 자리표시자도 null로 본다. */
function text(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (trimmed === '' || trimmed === '-' || trimmed === 'null' || trimmed === 'N/A') return null
  return trimmed
}

/**
 * 숫자 파싱. 천 단위 쉼표(`1,082`)와 꼬리 단위(`점`, `%`, `위`, `승`, `패`)를 떼어낸다.
 * 화면에서 그대로 복사한 값이 들어올 수 있기 때문이다.
 * 숫자로 읽히지 않으면 **오류로 처리한다.** 조용히 0으로 만들지 않는다.
 */
function number(value: string | undefined): { ok: true; value: number | null } | { ok: false } {
  const raw = text(value)
  if (raw === null) return { ok: true, value: null }

  const cleaned = raw.replace(/,/g, '').replace(/[점%위승패명중]/g, '').trim()
  if (cleaned === '') return { ok: true, value: null }

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return { ok: false }
  return { ok: true, value: parsed }
}

function integer(value: string | undefined): { ok: true; value: number | null } | { ok: false } {
  const result = number(value)
  if (!result.ok) return result
  if (result.value === null) return { ok: true, value: null }
  return { ok: true, value: Math.round(result.value) }
}

/**
 * 중복 방지 키.
 *
 * `sourcePlayerId`가 있으면 그것으로, 없으면 닉네임으로 만든다.
 * 닉네임은 영구 식별자가 아니지만, **같은 CSV를 다시 넣었을 때 행이 늘어나지 않게 하는**
 * 용도로는 충분하다. 사람 식별에는 쓰지 않는다.
 */
export function buildDedupeKey(input: {
  source: string
  sourcePlayerId: string | null
  nickname: string
  leagueSlug: string | null
  season: number
}): string {
  const identity = input.sourcePlayerId ?? `nick:${input.nickname}`
  return [input.source, identity, input.leagueSlug ?? '-', String(input.season)].join('|')
}

export function toLegacySeason(
  row: CsvRow,
  line: number,
  source: string,
): { ok: true; value: LegacySeasonInput } | { ok: false; error: RowError } {
  const nickname = text(row['nickname'])
  if (!nickname) return { ok: false, error: { line, message: 'nickname 이 비어 있습니다' } }

  const season = integer(row['season'])
  if (!season.ok || season.value === null) {
    return { ok: false, error: { line, message: `season 을 숫자로 읽을 수 없습니다: "${row['season'] ?? ''}"` } }
  }

  const numeric: Record<string, number | null> = {}
  for (const [key, column, kind] of [
    ['division', 'division', 'int'],
    ['wins', 'wins', 'int'],
    ['losses', 'losses', 'int'],
    ['winRate', 'win_rate', 'float'],
    ['kills', 'kills', 'int'],
    ['deaths', 'deaths', 'int'],
    ['kd', 'kd', 'float'],
    ['finalRating', 'final_rating', 'int'],
    ['finalRank', 'final_rank', 'int'],
    ['rankCount', 'rank_count', 'int'],
  ] as const) {
    const parsed = kind === 'int' ? integer(row[column]) : number(row[column])
    if (!parsed.ok) {
      return { ok: false, error: { line, message: `${column} 을 숫자로 읽을 수 없습니다: "${row[column] ?? ''}"` } }
    }
    numeric[key] = parsed.value
  }

  const sourcePlayerId = text(row['source_player_id'])
  const leagueSlug = text(row['league_slug'])

  return {
    ok: true,
    value: {
      source,
      sourcePlayerId,
      nickname,
      leagueSlug,
      season: season.value,
      division: numeric['division'] ?? null,
      clanName: text(row['clan_name']),
      wins: numeric['wins'] ?? null,
      losses: numeric['losses'] ?? null,
      winRate: numeric['winRate'] ?? null,
      kills: numeric['kills'] ?? null,
      deaths: numeric['deaths'] ?? null,
      kd: numeric['kd'] ?? null,
      finalRating: numeric['finalRating'] ?? null,
      finalRank: numeric['finalRank'] ?? null,
      rankCount: numeric['rankCount'] ?? null,
      sourceUrl: text(row['source_url']),
      // 변환이 틀려도 다시 만들 수 있게 원문 줄을 그대로 보관한다
      rawSnapshot: row,
      dedupeKey: buildDedupeKey({
        source,
        sourcePlayerId,
        nickname,
        leagueSlug,
        season: season.value,
      }),
    },
  }
}
