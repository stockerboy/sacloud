/**
 * 3rd.supply 지난시즌 → CSV 추출 스니펫.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 이건 **사람이 자기 브라우저에서 직접 실행하는 도구다.**
 *
 * 자동 크롤러가 아니다. WAF/CAPTCHA를 우회하지 않고, 요청을 새로 보내지도 않는다.
 * **이미 열려 있는 페이지에 그려진 글자를 읽어서** CSV로 바꿔줄 뿐이다.
 * (`CLAUDE.md` 3-A 5번 · `docs/MIGRATION_GAPS.md`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 쓰는 법
 *   1. 지난시즌 페이지를 연다
 *      https://3rd.supply/league/<리그>/player/<플레이어ID>/season
 *   2. F12 → Console
 *   3. 처음이면 `allow pasting` 을 먼저 입력하고 Enter (크롬이 붙여넣기를 막는다)
 *   4. 이 파일 내용을 붙여넣고 Enter
 *   5. CSV가 클립보드에 복사된다 (콘솔에도 출력)
 *   6. `legacy_player_seasons.csv` 에 이어 붙인다 (헤더는 맨 위 한 줄만)
 *      헤더만 필요하면 `__legacyHeader()`
 *   7. 저장소에서: pnpm legacy:import <파일.csv>
 *
 * 원본 화면 (2026-08-21 실측)
 *   지난시즌은 **표가 아니라 카드**다.
 *
 *     서플라이공식리그      시즌 6
 *                  6,934명중 140위
 *     218승 173패    승률  55.8%
 *     3,468킬 3,197데스  킬뎃  52%
 *
 *   그래서 마크업이 아니라 **글자**에서 읽는다. div 구조는 언제든 바뀌지만
 *   `218승 173패` 같은 표기는 화면에 보이는 그대로다.
 *
 * 값을 지어내지 않는다
 *   카드에 없는 항목은 **빈 칸**이다. 다른 값에서 역산하지 않는다.
 *   (원본 카드에는 래더·부리그·클랜이 없다 → 비어 있는 게 정상이다)
 */
;(() => {
  const COLUMNS = [
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
  ]

  const flat = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const int = (text) => (text === undefined ? '' : String(Number(text.replace(/,/g, ''))))

  const csvCell = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  /* ----------------------- 카드 찾기 ----------------------- */
  // `시즌 N` 과 `승률 N%` 를 함께 가진 요소가 카드다.
  const candidates = [...document.querySelectorAll('div, section, article, li')].filter((element) => {
    const text = flat(element)
    return /시즌\s*\d+/.test(text) && /승률\s*[\d.]+\s*%/.test(text)
  })

  // 가장 안쪽 것만 남긴다 (바깥 컨테이너가 같이 잡히기 때문)
  const cards = candidates.filter(
    (element) => !candidates.some((other) => other !== element && element.contains(other)),
  )

  if (cards.length === 0) {
    console.warn(
      '지난시즌 카드를 찾지 못했습니다.\n' +
        '- 지난시즌 탭이 열려 있는지 확인하세요.\n' +
        '- 이 플레이어에게 지난시즌 기록이 없을 수도 있습니다.\n' +
        '- 화면 모양이 예상과 다르면 알려주세요. 값을 임의로 만들지 않습니다.',
    )
    return
  }

  /* ----------------------- 공통 정보 ----------------------- */
  const url = location.href
  const path = /\/league\/([^/]+)\/player\/([^/]+)/.exec(location.pathname)
  const leagueSlug = path ? path[1] : ''
  const sourcePlayerId = path ? path[2] : ''

  // 닉네임은 카드에 없다. 페이지 제목에서 찾고, 못 찾으면 비워 두고 알린다.
  const nickname = flat(document.querySelector('h1, h2, .text-3xl, .text-2xl')) || ''
  if (!nickname) {
    console.warn('닉네임을 찾지 못했습니다. CSV의 nickname 칸을 직접 채워주세요.')
  }

  /* ----------------------- 파싱 ----------------------- */
  const lines = []
  const skipped = []

  for (const element of cards) {
    const text = flat(element)

    const season = /시즌\s*(\d+)/.exec(text)
    if (!season) {
      skipped.push(text.slice(0, 60))
      continue
    }

    const rankWithTotal = /([\d,]+)\s*명\s*중\s*([\d,]+)\s*위/.exec(text)
    const rankOnly = rankWithTotal ? null : /([\d,]+)\s*위/.exec(text)
    const record = /([\d,]+)\s*승\s*([\d,]+)\s*패/.exec(text)
    const winRate = /승률\s*([\d.]+)\s*%/.exec(text)
    const killDeath = /([\d,]+)\s*킬\s*([\d,]+)\s*데스/.exec(text)
    const kd = /킬뎃\s*([\d.]+)\s*%/.exec(text)
    const rating = /([\d,]+)\s*점/.exec(text)

    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']))
    row['source_player_id'] = sourcePlayerId
    row['nickname'] = nickname
    row['league_slug'] = leagueSlug
    row['source_url'] = url

    row['season'] = int(season[1])
    row['final_rank'] = rankWithTotal ? int(rankWithTotal[2]) : rankOnly ? int(rankOnly[1]) : ''
    row['rank_count'] = rankWithTotal ? int(rankWithTotal[1]) : ''
    row['wins'] = record ? int(record[1]) : ''
    row['losses'] = record ? int(record[2]) : ''
    row['win_rate'] = winRate ? winRate[1] : ''
    row['kills'] = killDeath ? int(killDeath[1]) : ''
    row['deaths'] = killDeath ? int(killDeath[2]) : ''
    row['kd'] = kd ? kd[1] : ''
    row['final_rating'] = rating ? int(rating[1]) : ''

    lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','))
  }

  const headerLine = COLUMNS.join(',')
  const csv = lines.join('\n')

  window.__legacyHeader = () => {
    console.info(headerLine)
    return headerLine
  }

  console.info(`시즌 ${lines.length}개를 읽었습니다.`)
  if (skipped.length > 0) console.warn(`건너뛴 카드 ${skipped.length}개:`, skipped)
  console.info(headerLine)
  console.info(csv)

  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(csv)
      .then(() => console.info('클립보드에 복사했습니다. 헤더는 __legacyHeader() 로 얻으세요.'))
      .catch(() => console.info('클립보드 복사 실패 — 위 출력을 직접 복사하세요.'))
  }

  return csv
})()
