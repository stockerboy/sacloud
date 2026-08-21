/**
 * 지난시즌 화면의 텍스트 → CSV 한 줄.
 *
 * 브라우저 스니펫(`extract-snippet.js`)과 **같은 규칙**이다.
 * 스니펫은 콘솔에 붙여넣어야 해서 자체 완결형으로 두고, 규칙 자체는 여기서 테스트로 고정한다.
 * 둘이 어긋나면 `__tests__/legacy-extract.test.ts`가 잡는다.
 *
 * 값을 지어내지 않는다
 * - 못 알아본 열은 **비운다.**
 * - `배치고사`처럼 숫자가 아닌 순위도 비운다.
 * - 승/패 없이 승률만 있으면 승률만 담는다.
 */

export const LEGACY_CSV_HEADER = [
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

/** 화면의 열 이름 → CSV 열 */
export const HEADER_MAP: Record<string, string> = {
  시즌: 'season',
  순위: 'final_rank',
  부리그: 'division',
  클랜: 'clan_name',
  승리: 'wins',
  승: 'wins',
  패배: 'losses',
  패: 'losses',
  승률: 'win_rate',
  킬뎃: 'kd',
  킬: 'kills',
  데스: 'deaths',
  래더: 'final_rating',
}

/** `1,082점` → `1082` · `55%` → `55` · `시즌 7` → `7` · `배치고사` → `` */
export function toNumberText(text: string): string {
  const stripped = String(text ?? '')
    .replace(/,/g, '')
    .replace(/시즌/g, '')
    .replace(/[점%위승패명중부리그]/g, '')
    .trim()
  if (stripped === '' || !Number.isFinite(Number(stripped))) return ''
  return stripped
}

/** `360명중 8위` → `360` (없으면 빈 문자열) */
export function toRankCount(text: string): string {
  const matched = /(\d[\d,]*)\s*명/.exec(String(text ?? ''))
  return matched ? matched[1]!.replace(/,/g, '') : ''
}

export interface ExtractContext {
  sourcePlayerId: string
  nickname: string
  leagueSlug: string
  sourceUrl: string
}

/**
 * 머리글 텍스트와 한 줄의 칸 텍스트를 CSV 행 객체로 바꾼다.
 * 칸 수가 머리글보다 적으면 없는 칸은 빈 값으로 둔다.
 */
export function mapSeasonRow(
  headerTexts: readonly string[],
  cellTexts: readonly string[],
  context: ExtractContext,
): Record<string, string> {
  const row: Record<string, string> = Object.fromEntries(
    LEGACY_CSV_HEADER.map((column) => [column, '']),
  )

  row['source_player_id'] = context.sourcePlayerId
  row['nickname'] = context.nickname
  row['league_slug'] = context.leagueSlug
  row['source_url'] = context.sourceUrl

  headerTexts.forEach((name, index) => {
    const column = HEADER_MAP[name]
    if (!column) return
    const raw = cellTexts[index] ?? ''

    if (column === 'clan_name') {
      row[column] = raw
      return
    }

    row[column] = toNumberText(raw)
    if (column === 'final_rank') {
      const total = toRankCount(raw)
      if (total) row['rank_count'] = total
    }
  })

  return row
}

export function toCsvLine(row: Record<string, string>): string {
  return LEGACY_CSV_HEADER.map((column) => {
    const value = row[column] ?? ''
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }).join(',')
}
