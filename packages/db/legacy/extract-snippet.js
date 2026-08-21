/**
 * 지난시즌 화면 → CSV 추출 스니펫.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 이건 **사람이 자기 브라우저에서 직접 실행하는 도구다.**
 *
 * 자동 크롤러가 아니다. WAF/CAPTCHA를 우회하지 않고, 요청을 새로 보내지도 않는다.
 * **이미 열려 있는 페이지의 화면 내용을 읽어서** CSV로 바꿔줄 뿐이다.
 * (`CLAUDE.md` 3-A 5번 · `docs/MIGRATION_GAPS.md`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 쓰는 법
 *   1. 브라우저에서 지난시즌 페이지를 연다
 *      예: https://3rd.supply/league/<리그>/player/<플레이어ID>/season
 *   2. F12 → Console 탭
 *   3. 이 파일 내용을 통째로 붙여넣고 Enter
 *   4. CSV가 클립보드에 복사된다 (콘솔에도 출력된다)
 *   5. `legacy_player_seasons.csv` 에 이어 붙인다 (헤더는 맨 위에 한 번만)
 *      헤더만 따로 필요하면 콘솔에서 `__legacyHeader()`
 *   6. 저장소에서: pnpm legacy:import <파일.csv>
 *
 * 왜 `<table>` 을 찾지 않나
 *   원본은 Angular + Tailwind로 그려서 표가 `<table>`이 아니라 div 격자일 수 있다.
 *   (우리 재현 화면이 실제로 그렇다.) 그래서 **열 이름 라벨로** 머리글 줄을 찾고,
 *   같은 칸 수를 가진 형제 줄을 데이터로 읽는다. 마크업 구조에 기대지 않는다.
 *
 * 값을 지어내지 않는다
 *   못 알아본 열은 **비워 둔다.** `배치고사` 처럼 숫자가 아닌 순위도 빈 칸이다.
 *   승/패 없이 승률만 있으면 승률만 담는다.
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

  /** 화면의 열 이름 → CSV 열 */
  const HEADER_MAP = {
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

  const clean = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

  /** `1,082점` → `1082`, `55%` → `55`, `시즌 7` → `7`, `배치고사` → `` */
  const num = (text) => {
    const stripped = String(text ?? '')
      .replace(/,/g, '')
      .replace(/시즌/g, '')
      .replace(/[점%위승패명중부리그]/g, '')
      .trim()
    if (stripped === '' || !Number.isFinite(Number(stripped))) return ''
    return stripped
  }

  /** `360명중 8위` 형태에서 모집단 */
  const rankCountOf = (text) => {
    const matched = /(\d[\d,]*)\s*명/.exec(String(text ?? ''))
    return matched ? matched[1].replace(/,/g, '') : ''
  }

  const csvCell = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  /* ------------------------- 머리글 줄 찾기 ------------------------- */
  const labels = Object.keys(HEADER_MAP)
  let header = null

  for (const element of document.querySelectorAll('*')) {
    const children = [...element.children]
    if (children.length < 3) continue
    const texts = children.map(clean)
    const matched = texts.filter((text) => labels.includes(text)).length
    // 열 이름이 3개 이상 붙어 있으면 머리글 줄로 본다
    if (matched >= 3 && texts.includes('시즌')) {
      header = { element, texts }
      break
    }
  }

  if (!header) {
    console.warn(
      '지난시즌 머리글을 찾지 못했습니다.\n' +
        '- 지난시즌 탭이 열려 있는지 확인하세요.\n' +
        '- 열 이름이 예상과 다를 수 있습니다. 화면의 열 이름을 알려주시면 매핑을 추가하겠습니다.',
    )
    return
  }

  const mapped = header.texts.map((name) => HEADER_MAP[name] ?? null)
  const unknown = header.texts.filter((name, i) => name !== '' && mapped[i] === null)
  if (unknown.length > 0) {
    console.warn(
      `모르는 열이라 비워 둡니다 → ${unknown.join(', ')}\n` +
        '이 이름을 알려주시면 매핑을 추가하겠습니다. 값을 임의로 채우지 않습니다.',
    )
  }

  /* --------------------- 같은 모양의 데이터 줄 --------------------- */
  const siblings = [...(header.element.parentElement?.children ?? [])]
  const rows = siblings.filter(
    (element) =>
      element !== header.element &&
      element.children.length === header.texts.length &&
      clean(element) !== '',
  )

  if (rows.length === 0) {
    console.warn('머리글은 찾았지만 시즌 줄이 없습니다. (지난시즌 기록이 없는 플레이어일 수 있습니다.)')
    return
  }

  /* ------------------------- 공통 정보 ------------------------- */
  const url = location.href
  const path = /\/league\/([^/]+)\/player\/([^/]+)/.exec(location.pathname)
  const leagueSlug = path ? path[1] : ''
  const sourcePlayerId = path ? path[2] : ''
  const nickname = clean(document.querySelector('h1, h2, .text-3xl, .text-2xl')) || ''

  if (!nickname) {
    console.warn('닉네임을 찾지 못했습니다. CSV의 nickname 칸을 직접 채워주세요.')
  }

  /* ------------------------- 변환 ------------------------- */
  const lines = rows.map((rowElement) => {
    const cells = [...rowElement.children].map(clean)
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']))

    row['source_player_id'] = sourcePlayerId
    row['nickname'] = nickname
    row['league_slug'] = leagueSlug
    row['source_url'] = url

    mapped.forEach((column, index) => {
      if (!column) return
      const raw = cells[index] ?? ''
      if (column === 'clan_name') {
        row[column] = raw
        return
      }
      row[column] = num(raw)
      if (column === 'final_rank') {
        const total = rankCountOf(raw)
        if (total) row['rank_count'] = total
      }
    })

    return COLUMNS.map((c) => csvCell(row[c])).join(',')
  })

  const headerLine = COLUMNS.join(',')
  const csv = lines.join('\n')

  window.__legacyHeader = () => {
    console.info(headerLine)
    return headerLine
  }

  console.info(`시즌 ${lines.length}행을 읽었습니다. (열: ${header.texts.join(' | ')})`)
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
