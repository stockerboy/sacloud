/**
 * Legacy 자동 수집 — 서플라이공식리그 지난시즌.
 *
 *   pnpm legacy:collect --players <파일> --limit 20
 *   pnpm legacy:collect --resume
 *   pnpm legacy:collect --resume --limit 100
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 접근 통제를 **우회하지 않는다.**
 *
 * 하지 않는 것: CAPTCHA 자동 풀이 · CAPTCHA 서비스 · WAF 우회 · 프록시/IP 회전 ·
 * User-Agent 위장 · stealth · fingerprint 위장 · rate limit 우회 · 비공개 API · 인증 우회
 *
 * User-Agent는 **우리가 누구인지 밝히는 값**을 쓴다. 브라우저인 척하지 않는다.
 * 403 / 429 / WAF 챌린지를 만나면 **즉시 전체 작업을 멈추고** 체크포인트를 남긴다.
 * (`CLAUDE.md` 3-A 5번 · `docs/MIGRATION_GAPS.md`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 재개
 *   이미 `success`/`not_found` 로 끝난 플레이어는 건너뛴다.
 *   같은 플레이어·시즌을 다시 수집해도 `dedupeKey` upsert라 행이 늘지 않는다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/index.js'
import { parseCsv } from './csv.js'
import { htmlToText, parseSeasonCard, splitSeasonCards } from './extract.js'
import { buildDedupeKey } from './row.js'

const LEAGUE_SLUG = 'supply'
const ORIGIN = 'https://3rd.supply'
const SOURCE = '3rd.supply'

/** 우리가 누구인지 밝힌다. 브라우저인 척하지 않는다. */
const USER_AGENT = 'SACLOUD-legacy-migration/1.0 (operator-authorized; contact: sacloud@local.invalid)'

/** 요청 간 최소 간격(ms). 서버를 몰아붙이지 않는다. */
const DELAY_MS = 1500
/** 일시 오류(5xx·타임아웃)만 제한적으로 재시도한다 */
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 20_000

type Outcome =
  | { kind: 'success'; cards: string[]; nickname: string | null; html: string }
  | { kind: 'not_found' }
  | { kind: 'retryable'; errorType: string; message: string; httpStatus?: number }
  /** 접근 통제. **우회하지 않고 전체를 멈춘다.** */
  | { kind: 'blocked'; errorType: string; message: string; httpStatus?: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function seasonUrl(playerId: string): string {
  return `${ORIGIN}/league/${LEAGUE_SLUG}/player/${playerId}/season`
}

/**
 * 응답을 분류한다.
 *
 * WAF 챌린지는 상태 코드가 제각각이다(관측: **405** + `x-amzn-waf-action: captcha`).
 * 그래서 코드가 아니라 **헤더와 본문**으로 판단한다.
 */
function classify(status: number, headers: Headers, body: string): Outcome {
  const wafAction = headers.get('x-amzn-waf-action')
  const looksLikeChallenge =
    wafAction !== null ||
    /awsWafCookieDomainList|gokuProps/.test(body) ||
    /<title>\s*Human Verification\s*<\/title>/i.test(body)

  if (looksLikeChallenge) {
    return {
      kind: 'blocked',
      errorType: 'waf_captcha',
      message: `접근 확인(CAPTCHA) 페이지가 돌아왔다 (x-amzn-waf-action=${wafAction ?? 'none'})`,
      httpStatus: status,
    }
  }

  if (status === 404) return { kind: 'not_found' }
  if (status === 403) {
    return { kind: 'blocked', errorType: 'http_403', message: '접근이 거부됐다', httpStatus: 403 }
  }
  if (status === 429) {
    return { kind: 'blocked', errorType: 'http_429', message: '요청이 너무 많다', httpStatus: 429 }
  }
  if (status >= 500) {
    return { kind: 'retryable', errorType: `http_${status}`, message: '서버 오류', httpStatus: status }
  }
  if (status !== 200) {
    return { kind: 'retryable', errorType: `http_${status}`, message: '예상 밖 상태', httpStatus: status }
  }

  const text = htmlToText(body)
  const cards = splitSeasonCards(text)
  // 닉네임은 `<title>` 이나 본문 앞부분에서 찾는다. 못 찾으면 null로 둔다.
  const title = /<title>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? null

  return { kind: 'success', cards, nickname: title, html: body }
}

async function fetchSeasonPage(playerId: string): Promise<Outcome> {
  try {
    const response = await fetch(seasonUrl(playerId), {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    })
    const body = await response.text()
    return classify(response.status, response.headers, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { kind: 'retryable', errorType: 'network', message }
  }
}

/** 카드들을 `LegacyPlayerSeason` 으로 저장한다. 없는 값은 만들지 않는다. */
async function saveSeasons(
  playerId: string,
  nickname: string,
  cards: string[],
  url: string,
): Promise<number> {
  let saved = 0
  for (const cardText of cards) {
    const card = parseSeasonCard(cardText)
    if (card.season === null) continue

    const value = {
      source: SOURCE,
      sourcePlayerId: playerId,
      nickname,
      leagueSlug: LEAGUE_SLUG,
      season: card.season,
      division: null,
      clanName: null,
      wins: card.wins,
      losses: card.losses,
      winRate: card.winRate,
      kills: card.kills,
      deaths: card.deaths,
      kd: card.kd,
      finalRating: card.finalRating,
      finalRank: card.finalRank,
      rankCount: card.rankCount,
      sourceUrl: url,
      // 변환이 틀려도 다시 만들 수 있게 화면 글자를 그대로 남긴다
      rawSnapshot: { cardText },
      dedupeKey: buildDedupeKey({
        source: SOURCE,
        sourcePlayerId: playerId,
        nickname,
        leagueSlug: LEAGUE_SLUG,
        season: card.season,
      }),
    }

    await prisma.legacyPlayerSeason.upsert({
      where: { dedupeKey: value.dedupeKey },
      create: value,
      update: value,
    })
    saved += 1
  }
  return saved
}

/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2)
const resume = args.includes('--resume')
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length)
const limitFlagIndex = args.indexOf('--limit')
const limit = Number(limitArg ?? (limitFlagIndex >= 0 ? args[limitFlagIndex + 1] : '') ?? '')
const playersArg =
  args.find((a) => a.startsWith('--players='))?.slice('--players='.length) ??
  (args.indexOf('--players') >= 0 ? args[args.indexOf('--players') + 1] : undefined)

function resolveFromCallerCwd(file: string): string {
  return path.isAbsolute(file) ? file : path.resolve(process.env.INIT_CWD ?? process.cwd(), file)
}

/** `source_player_id` 열을 가진 CSV에서 플레이어 ID를 읽는다 */
function readPlayerIds(file: string): { id: string; nickname: string | null }[] {
  const rows = parseCsv(readFileSync(resolveFromCallerCwd(file), 'utf8'))
  const seen = new Set<string>()
  const players: { id: string; nickname: string | null }[] = []
  for (const row of rows) {
    const id = (row['source_player_id'] ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    players.push({ id, nickname: (row['nickname'] ?? '').trim() || null })
  }
  return players
}

async function main() {
  /* ------------------------- 작업 준비 ------------------------- */
  let job = resume
    ? await prisma.legacyCollectionJob.findFirst({
        where: { leagueSlug: LEAGUE_SLUG, status: { in: ['running', 'stopped', 'blocked'] } },
        orderBy: { startedAt: 'desc' },
      })
    : null

  if (resume && !job) {
    console.info('이어서 할 작업이 없다. --players 로 새로 시작해라.')
    return
  }

  if (!job) {
    if (!playersArg) {
      console.error(
        '사용법:\n' +
          '  pnpm legacy:collect --players <플레이어CSV> [--limit N]\n' +
          '  pnpm legacy:collect --resume [--limit N]\n' +
          '\nCSV는 `source_player_id` 열이 있으면 된다 (nickname 있으면 함께 저장).',
      )
      process.exitCode = 1
      return
    }

    const players = readPlayerIds(playersArg)
    if (players.length === 0) {
      console.error('CSV에서 source_player_id 를 찾지 못했다.')
      process.exitCode = 1
      return
    }

    job = await prisma.legacyCollectionJob.create({
      data: { source: SOURCE, leagueSlug: LEAGUE_SLUG, totalPlayers: players.length },
    })
    await prisma.legacyCollectionPlayer.createMany({
      data: players.map((p) => ({
        jobId: job!.id,
        sourcePlayerId: p.id,
        nickname: p.nickname,
      })),
      skipDuplicates: true,
    })
    console.info(`새 작업 시작 — 대상 ${players.length}명`)
  } else {
    console.info(`작업 재개 — ${job.id} (처리 ${job.processedPlayers}/${job.totalPlayers})`)
    await prisma.legacyCollectionJob.update({
      where: { id: job.id },
      data: { status: 'running', stopReason: null },
    })
  }

  /* ------------------------- 처리 대상 ------------------------- */
  // 이미 끝난 사람은 건너뛴다
  const pending = await prisma.legacyCollectionPlayer.findMany({
    where: { jobId: job.id, status: { notIn: ['success', 'not_found'] } },
    orderBy: { createdAt: 'asc' },
    ...(Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
  })

  console.info(`이번에 처리할 대상: ${pending.length}명`)
  if (dryRun) {
    console.info('(dry-run — 요청을 보내지 않는다)')
    for (const player of pending.slice(0, 5)) console.info(`  ${seasonUrl(player.sourcePlayerId)}`)
    return
  }

  /* ------------------------- 순회 ------------------------- */
  const started = Date.now()
  const durations: number[] = []
  const tally = {
    success: 0,
    notFound: 0,
    parseFailed: 0,
    http403: 0,
    http429: 0,
    waf: 0,
    error: 0,
    rows: 0,
  }
  let blocked: { errorType: string; message: string } | null = null

  for (const [index, player] of pending.entries()) {
    const playerStarted = Date.now()
    let outcome: Outcome = { kind: 'retryable', errorType: 'unstarted', message: '' }

    // 일시 오류만 제한적으로 재시도한다
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      outcome = await fetchSeasonPage(player.sourcePlayerId)
      if (outcome.kind !== 'retryable') break
      if (attempt < MAX_ATTEMPTS) {
        const backoff = DELAY_MS * 2 ** attempt
        console.info(`  재시도 ${attempt}/${MAX_ATTEMPTS - 1} (${backoff}ms 대기) — ${outcome.message}`)
        await sleep(backoff)
      }
    }

    const durationMs = Date.now() - playerStarted
    durations.push(durationMs)

    /* --- 접근 통제 → 우회하지 않고 전체 중단 --- */
    if (outcome.kind === 'blocked') {
      if (outcome.errorType === 'waf_captcha') tally.waf += 1
      else if (outcome.errorType === 'http_403') tally.http403 += 1
      else if (outcome.errorType === 'http_429') tally.http429 += 1

      await prisma.legacyCollectionPlayer.update({
        where: { id: player.id },
        data: {
          status: 'blocked',
          attempts: { increment: 1 },
          errorType: outcome.errorType,
          errorMessage: outcome.message,
          httpStatus: outcome.httpStatus ?? null,
          durationMs,
          processedAt: new Date(),
        },
      })
      // 멈추더라도 **처리한 만큼은 기록에 남긴다.** 안 남기면 재개 시 진행률이 거짓이 된다.
      await prisma.legacyCollectionJob.update({
        where: { id: job.id },
        data: {
          processedPlayers: { increment: 1 },
          failedPlayers: { increment: 1 },
          lastPlayerId: player.sourcePlayerId,
        },
      })

      blocked = { errorType: outcome.errorType, message: outcome.message }
      console.info(`\n중단: ${outcome.message}`)
      console.info('접근 통제는 우회하지 않는다. 여기서 멈춘다.')
      break
    }

    if (outcome.kind === 'retryable') {
      tally.error += 1
      await prisma.legacyCollectionPlayer.update({
        where: { id: player.id },
        data: {
          status: 'error',
          attempts: { increment: 1 },
          errorType: outcome.errorType,
          errorMessage: outcome.message,
          httpStatus: outcome.httpStatus ?? null,
          durationMs,
          processedAt: new Date(),
        },
      })
    } else if (outcome.kind === 'not_found') {
      tally.notFound += 1
      await prisma.legacyCollectionPlayer.update({
        where: { id: player.id },
        data: { status: 'not_found', attempts: { increment: 1 }, durationMs, processedAt: new Date() },
      })
    } else if (outcome.cards.length === 0) {
      // 페이지는 열렸는데 카드가 없다 → 지난시즌 기록이 없거나 화면이 바뀐 것
      tally.parseFailed += 1
      await prisma.legacyCollectionPlayer.update({
        where: { id: player.id },
        data: {
          status: 'parse_failed',
          attempts: { increment: 1 },
          errorType: 'parse',
          errorMessage: '시즌 카드를 찾지 못했다',
          durationMs,
          processedAt: new Date(),
        },
      })
    } else {
      const nickname = player.nickname ?? outcome.nickname ?? player.sourcePlayerId
      const rows = await saveSeasons(
        player.sourcePlayerId,
        nickname,
        outcome.cards,
        seasonUrl(player.sourcePlayerId),
      )
      tally.success += 1
      tally.rows += rows
      await prisma.legacyCollectionPlayer.update({
        where: { id: player.id },
        data: {
          status: 'success',
          attempts: { increment: 1 },
          rowsCreated: rows,
          nickname,
          durationMs,
          processedAt: new Date(),
        },
      })
    }

    // 체크포인트 — 여기서 죽어도 이어서 할 수 있다
    await prisma.legacyCollectionJob.update({
      where: { id: job.id },
      data: {
        processedPlayers: { increment: 1 },
        successPlayers: outcome.kind === 'success' ? { increment: 1 } : undefined,
        failedPlayers: outcome.kind === 'success' ? undefined : { increment: 1 },
        rowsCreated: { increment: outcome.kind === 'success' ? tally.rows : 0 },
        lastPlayerId: player.sourcePlayerId,
      },
    })

    if ((index + 1) % 10 === 0) {
      console.info(`  진행 ${index + 1}/${pending.length} — 성공 ${tally.success} · 행 ${tally.rows}`)
    }

    // 서버를 몰아붙이지 않는다
    if (index < pending.length - 1) await sleep(DELAY_MS)
  }

  /* ------------------------- 마무리 ------------------------- */
  await prisma.legacyCollectionJob.update({
    where: { id: job.id },
    data: {
      status: blocked ? 'blocked' : 'done',
      stopReason: blocked ? `${blocked.errorType}: ${blocked.message}` : null,
      finishedAt: blocked ? null : new Date(),
    },
  })

  const elapsed = Date.now() - started
  const average = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

  console.info('\n── 결과 ──')
  console.info(`  대상          ${pending.length}`)
  console.info(`  성공          ${tally.success}`)
  console.info(`  저장된 시즌 행 ${tally.rows}`)
  console.info(`  404           ${tally.notFound}`)
  console.info(`  403           ${tally.http403}`)
  console.info(`  429           ${tally.http429}`)
  console.info(`  WAF/CAPTCHA   ${tally.waf}`)
  console.info(`  파싱 실패      ${tally.parseFailed}`)
  console.info(`  기타 오류      ${tally.error}`)
  console.info(`  평균 처리 시간 ${average}ms · 총 ${(elapsed / 1000).toFixed(1)}초`)

  if (blocked) {
    console.info(`\n작업 상태: blocked — ${blocked.message}`)
    console.info(`마지막 처리: ${job.lastPlayerId ?? '(없음)'}`)
    console.info('접근이 가능해지면 `pnpm legacy:collect --resume` 로 이어서 한다.')
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
