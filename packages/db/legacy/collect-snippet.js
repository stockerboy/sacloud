/**
 * 서플라이공식리그 Legacy 수집기 — 사람이 직접 돌리는 도구.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 자동 크롤러가 아니다. **요청을 새로 보내지 않는다.**
 * 사람이 연 페이지에 이미 그려져 있는 글자를 읽어 `localStorage`에 쌓을 뿐이다.
 * WAF/CAPTCHA를 우회하지 않는다. (`CLAUDE.md` 3-A 5번)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 왜 이렇게 만들었나
 *   5,000명 × 1페이지다. 페이지마다 CSV를 복사해 붙여넣게 하면 사람이 못 버틴다.
 *   그래서 **모아뒀다가 마지막에 한 번만 내보낸다.**
 *   페이지를 옮겨도 `localStorage`에 남으므로 중간에 쉬었다 다시 해도 된다.
 *
 * 쓰는 법
 *   0) 크롬 콘솔이 붙여넣기를 막으면 `allow pasting` 입력 후 Enter
 *   1) 이 파일 내용을 페이지에서 한 번 붙여넣으면 **그 페이지를 자동으로 인식해 모은다**
 *      - 개인랭킹 페이지  → 플레이어 목록(id, 닉네임)을 모은다
 *      - 지난시즌 페이지  → 시즌 카드를 모은다
 *   2) 북마크릿으로 저장해두면 페이지마다 **클릭 한 번**이면 된다 (아래 참고)
 *   3) 다 모았으면  __legacyExport()   → CSV 두 개를 콘솔에 출력 + 클립보드 복사
 *      진행 상황     __legacyStatus()
 *      처음부터      __legacyReset()
 *
 * 북마크릿으로 만들기
 *   북마크 추가 → URL 칸에 `javascript:` 를 붙이고 이 파일 내용을 한 줄로 넣는다.
 *   (콘솔에서 `__legacyBookmarklet()` 을 실행하면 만들어 준다)
 *
 * 대상은 **서플라이공식리그(`supply`)뿐이다.** 다른 리그는 수집하지 않는다.
 */
;(() => {
  const LEAGUE_SLUG = 'supply'
  const KEY_SEASONS = 'sacloud.legacy.seasons'
  const KEY_PLAYERS = 'sacloud.legacy.players'

  const SEASON_COLUMNS = [
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

  const load = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}')
    } catch {
      return {}
    }
  }
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))

  /* ------------------------------------------------------------------ */
  /* 개인랭킹 페이지 → 플레이어 목록                                       */
  /* ------------------------------------------------------------------ */
  function collectRanking() {
    const store = load(KEY_PLAYERS)
    let added = 0

    for (const anchor of document.querySelectorAll('a[href]')) {
      const matched = new RegExp(`/league/${LEAGUE_SLUG}/player/(\\d+)`).exec(
        anchor.getAttribute('href') ?? '',
      )
      if (!matched) continue
      const id = matched[1]
      const nickname = flat(anchor)
      if (!nickname) continue
      if (!store[id]) added += 1
      // 닉네임이 바뀌었을 수 있으니 최신으로 덮어쓴다
      store[id] = nickname
    }

    save(KEY_PLAYERS, store)
    const total = Object.keys(store).length
    console.info(`플레이어 ${added}명 추가. 지금까지 ${total}명.`)
    if (added === 0) {
      console.warn('이 페이지에서 새로 찾은 플레이어가 없습니다. 개인랭킹 페이지가 맞나요?')
    }
    return total
  }

  /* ------------------------------------------------------------------ */
  /* 지난시즌 페이지 → 시즌 카드                                          */
  /* ------------------------------------------------------------------ */
  function collectSeasons() {
    const path = new RegExp(`/league/${LEAGUE_SLUG}/player/(\\d+)`).exec(location.pathname)
    if (!path) {
      console.warn(`서플라이공식리그(${LEAGUE_SLUG}) 지난시즌 페이지가 아닙니다.`)
      return 0
    }
    const sourcePlayerId = path[1]
    const url = location.href
    const nickname = flat(document.querySelector('h1, h2, .text-3xl, .text-2xl')) || ''

    // `시즌 N` 과 `승률 N%` 를 함께 가진 가장 안쪽 요소가 카드다
    const candidates = [...document.querySelectorAll('div, section, article, li')].filter((el) => {
      const text = flat(el)
      return /시즌\s*\d+/.test(text) && /승률\s*[\d.]+\s*%/.test(text)
    })
    const cards = candidates.filter(
      (el) => !candidates.some((other) => other !== el && el.contains(other)),
    )

    if (cards.length === 0) {
      console.warn('시즌 카드를 찾지 못했습니다. (이 플레이어에게 지난시즌 기록이 없을 수 있습니다)')
      return 0
    }

    const store = load(KEY_SEASONS)
    let added = 0

    for (const element of cards) {
      const text = flat(element)
      const season = /시즌\s*(\d+)/.exec(text)
      if (!season) continue

      const rankWithTotal = /([\d,]+)\s*명\s*중\s*([\d,]+)\s*위/.exec(text)
      const rankOnly = rankWithTotal ? null : /([\d,]+)\s*위/.exec(text)
      const record = /([\d,]+)\s*승\s*([\d,]+)\s*패/.exec(text)
      const winRate = /승률\s*([\d.]+)\s*%/.exec(text)
      const killDeath = /([\d,]+)\s*킬\s*([\d,]+)\s*데스/.exec(text)
      const kd = /킬뎃\s*([\d.]+)\s*%/.exec(text)

      const row = Object.fromEntries(SEASON_COLUMNS.map((c) => [c, '']))
      row['source_player_id'] = sourcePlayerId
      row['nickname'] = nickname
      row['league_slug'] = LEAGUE_SLUG
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
      // `final_rating` `division` `clan_name` 은 공식리그 시즌 카드에 없다. 비워 둔다.

      // 같은 사람의 같은 시즌은 한 번만
      const key = `${sourcePlayerId}|${row['season']}`
      if (!store[key]) added += 1
      store[key] = row
    }

    save(KEY_SEASONS, store)
    const total = Object.keys(store).length
    console.info(
      `${nickname || sourcePlayerId}: 시즌 ${cards.length}개 (새로 ${added}개). 누적 ${total}행.`,
    )
    return added
  }

  /* ------------------------------------------------------------------ */
  /* 내보내기 / 상태                                                      */
  /* ------------------------------------------------------------------ */
  window.__legacyStatus = () => {
    const players = Object.keys(load(KEY_PLAYERS)).length
    const seasons = load(KEY_SEASONS)
    const rows = Object.keys(seasons).length
    const done = new Set(Object.values(seasons).map((r) => r['source_player_id'])).size
    console.info(`모은 플레이어 ${players}명 / 시즌 기록 ${rows}행 (${done}명분)`)
    if (players > 0) console.info(`남은 플레이어: ${Math.max(0, players - done)}명`)
    return { players, rows, done }
  }

  /** 아직 시즌을 안 모은 플레이어의 URL 목록 (다음에 열 페이지) */
  window.__legacyTodo = (limit = 20) => {
    const players = load(KEY_PLAYERS)
    const seasons = load(KEY_SEASONS)
    const done = new Set(Object.values(seasons).map((r) => r['source_player_id']))
    const todo = Object.keys(players)
      .filter((id) => !done.has(id))
      .slice(0, limit)
      .map((id) => `${location.origin}/league/${LEAGUE_SLUG}/player/${id}/season`)
    todo.forEach((url) => console.info(url))
    console.info(`(위 ${todo.length}개. 전체는 __legacyTodo(9999))`)
    return todo
  }

  window.__legacyExport = () => {
    const seasons = Object.values(load(KEY_SEASONS))
    const players = load(KEY_PLAYERS)

    const seasonCsv = [
      SEASON_COLUMNS.join(','),
      ...seasons.map((row) => SEASON_COLUMNS.map((c) => csvCell(row[c])).join(',')),
    ].join('\n')

    const playerCsv = [
      'source_player_id,nickname',
      ...Object.entries(players).map(([id, nick]) => `${csvCell(id)},${csvCell(nick)}`),
    ].join('\n')

    console.info(`=== legacy_player_seasons.csv (${seasons.length}행) ===`)
    console.info(seasonCsv)
    console.info(`\n=== players.csv (${Object.keys(players).length}행) ===`)
    console.info(playerCsv)

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(seasonCsv)
        .then(() => console.info('\n시즌 CSV를 클립보드에 복사했습니다.'))
        .catch(() => console.info('\n클립보드 복사 실패 — 위 출력을 복사하세요.'))
    }
    return { seasonCsv, playerCsv }
  }

  window.__legacyReset = () => {
    localStorage.removeItem(KEY_SEASONS)
    localStorage.removeItem(KEY_PLAYERS)
    console.info('모은 데이터를 지웠습니다.')
  }

  window.__legacyBookmarklet = () => {
    console.info(
      '북마크 URL 칸에 넣으세요 (이 파일을 한 줄로 만든 뒤 앞에 javascript: 를 붙인 것입니다):\n' +
        'javascript:' +
        encodeURIComponent('/* collect-snippet.js 내용을 여기에 */'),
    )
  }

  /* ------------------------------------------------------------------ */
  /* 페이지 자동 인식                                                     */
  /* ------------------------------------------------------------------ */
  const isSeasonPage = new RegExp(`/league/${LEAGUE_SLUG}/player/\\d+/season`).test(
    location.pathname,
  )
  const isRankPage = /\/rank\/player/.test(location.pathname)

  if (isSeasonPage) collectSeasons()
  else if (isRankPage) collectRanking()
  else {
    console.info(
      '이 페이지에서는 모을 것이 없습니다.\n' +
        `- 개인랭킹:  /league/${LEAGUE_SLUG}/rank/player\n` +
        `- 지난시즌:  /league/${LEAGUE_SLUG}/player/<ID>/season\n` +
        '명령: __legacyStatus() · __legacyTodo() · __legacyExport() · __legacyReset()',
    )
  }

  window.__legacyStatus()
})()
