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

/* -------------------------------------------------------------------------- */
/* 원본(3rd.supply) 지난시즌 — 카드 형식                                         */
/* -------------------------------------------------------------------------- */

/**
 * 원본의 지난시즌은 **표가 아니라 카드**다. (2026-08-21 실제 화면 확인)
 *
 * ```
 * 서플라이공식리그      시즌 6
 *              6,934명중 140위
 * 218승 173패    승률  55.8%
 * 3,468킬 3,197데스  킬뎃  52%
 * ```
 *
 * 마크업이 아니라 **글자에서** 읽는다. Angular가 만든 div 구조는 언제든 바뀔 수 있지만,
 * `218승 173패` 같은 표기는 화면에 보이는 그대로라 더 안정적이다.
 *
 * 없는 항목은 `null`이다. 만들어내지 않는다.
 */
export interface SeasonCard {
  leagueName: string | null
  season: number | null
  finalRank: number | null
  rankCount: number | null
  wins: number | null
  losses: number | null
  winRate: number | null
  kills: number | null
  deaths: number | null
  kd: number | null
  finalRating: number | null
}

const toInt = (text: string | undefined): number | null => {
  if (text === undefined) return null
  const value = Number(text.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

const toFloat = toInt

export function parseSeasonCard(cardText: string): SeasonCard {
  const text = cardText.replace(/\s+/g, ' ').trim()

  // `시즌 6`
  const season = /시즌\s*(\d+)/.exec(text)
  // `6,934명중 140위`  (모집단이 없으면 `140위` 만 잡힌다)
  const rankWithTotal = /([\d,]+)\s*명\s*중\s*([\d,]+)\s*위/.exec(text)
  const rankOnly = rankWithTotal ? null : /([\d,]+)\s*위/.exec(text)
  // `218승 173패`
  const record = /([\d,]+)\s*승\s*([\d,]+)\s*패/.exec(text)
  // `승률 55.8%`
  const winRate = /승률\s*([\d.]+)\s*%/.exec(text)
  // `3,468킬 3,197데스`
  const killDeath = /([\d,]+)\s*킬\s*([\d,]+)\s*데스/.exec(text)
  // `킬뎃 52%`
  const kd = /킬뎃\s*([\d.]+)\s*%/.exec(text)
  // `938점` — 지난시즌 카드에 래더가 있는 경우에만
  const rating = /([\d,]+)\s*점/.exec(text)

  /**
   * 리그 이름은 카드 맨 앞에 온다. `시즌 N` 앞의 글자를 취한다.
   * **슬러그가 아니라 표시 이름**이다 (`서플라이공식리그`). 슬러그는 URL에서 얻는다.
   */
  const leagueName = season ? text.slice(0, season.index).trim() : null

  return {
    leagueName: leagueName || null,
    season: season ? toInt(season[1]) : null,
    finalRank: rankWithTotal ? toInt(rankWithTotal[2]) : rankOnly ? toInt(rankOnly[1]) : null,
    rankCount: rankWithTotal ? toInt(rankWithTotal[1]) : null,
    wins: record ? toInt(record[1]) : null,
    losses: record ? toInt(record[2]) : null,
    winRate: winRate ? toFloat(winRate[1]) : null,
    kills: killDeath ? toInt(killDeath[1]) : null,
    deaths: killDeath ? toInt(killDeath[2]) : null,
    kd: kd ? toFloat(kd[1]) : null,
    finalRating: rating ? toInt(rating[1]) : null,
  }
}

/**
 * 페이지 전체 텍스트 → 시즌 카드 조각들.
 *
 * 자동 수집기는 브라우저가 아니라 **HTML**을 받는다. 태그를 걷어내면 페이지 전체가
 * 한 덩어리 글자가 되고, 그대로 `parseSeasonCard`에 넣으면 시즌이 전부 섞인다.
 * 그래서 `시즌 N` 을 경계로 잘라 **카드 하나씩** 파서에 넘긴다.
 *
 * 마지막 카드가 사이드바까지 삼키지 않도록 **`킬뎃 N%` 에서 끊는다.**
 * (사이드바에도 `승률`·`킬뎃`이 있어서, 안 끊으면 마지막 시즌 값이 오염된다.)
 */
export function splitSeasonCards(pageText: string): string[] {
  const text = pageText.replace(/\s+/g, ' ')
  const marks = [...text.matchAll(/시즌\s*\d+/g)]

  const chunks: string[] = []
  for (const [index, mark] of marks.entries()) {
    if (mark.index === undefined) continue
    const nextIndex = marks[index + 1]?.index ?? text.length
    let chunk = text.slice(mark.index, nextIndex)

    // 카드의 마지막 항목은 킬뎃이다. 거기서 끊는다.
    const end = /킬뎃\s*[\d.]+\s*%/.exec(chunk)
    if (end) chunk = chunk.slice(0, end.index + end[0].length)

    // 시즌 카드가 아니면(예: "현재 시즌" 안내 문구) 버린다
    if (!/승률\s*[\d.]+\s*%/.test(chunk)) continue
    if (!/킬뎃\s*[\d.]+\s*%/.test(chunk)) continue

    chunks.push(chunk.trim())
  }
  return chunks
}

/**
 * HTML → 글자.
 *
 * DOM 라이브러리를 새로 넣지 않는다. 우리가 읽어야 하는 건
 * `218승 173패` 같은 **눈에 보이는 글자**뿐이라 태그만 걷어내면 충분하다.
 * `script`/`style` 안쪽은 화면에 안 보이므로 통째로 버린다.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 카드 파싱 결과 → CSV 행 */
export function seasonCardToRow(card: SeasonCard, context: ExtractContext): Record<string, string> {
  const row: Record<string, string> = Object.fromEntries(
    LEGACY_CSV_HEADER.map((column) => [column, '']),
  )
  const put = (column: string, value: number | null) => {
    row[column] = value === null ? '' : String(value)
  }

  row['source_player_id'] = context.sourcePlayerId
  row['nickname'] = context.nickname
  row['league_slug'] = context.leagueSlug
  row['source_url'] = context.sourceUrl

  put('season', card.season)
  put('wins', card.wins)
  put('losses', card.losses)
  put('win_rate', card.winRate)
  put('kills', card.kills)
  put('deaths', card.deaths)
  put('kd', card.kd)
  put('final_rating', card.finalRating)
  put('final_rank', card.finalRank)
  put('rank_count', card.rankCount)

  return row
}

export function toCsvLine(row: Record<string, string>): string {
  return LEGACY_CSV_HEADER.map((column) => {
    const value = row[column] ?? ''
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }).join(',')
}
