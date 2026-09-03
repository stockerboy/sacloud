/**
 * 수집 감시 — 수집이 이상해진 순간 **사람에게 닿는** 알림 (2026-09-02 · 지시 #18)
 *
 * ```
 * nexon collect-watchdog [--dry-run] [--state <경로>] [--fixture <숫자.json>] [--force-notify]
 *                        [--leagues supply,sanply,nolink] [--stale-min supply=60,sanply=60]
 *                        [--ingest-stale-min 30] [--ingest-alert] [--apply-max-hours 3] [--fail-streak 3]
 * ```
 *
 * ── 왜
 *   2026-08-31 05:18 이후 사흘 동안 IPL 수집이 0건이었는데 아무도 몰랐다. 화면은 멀쩡해 보였다.
 *   기록 사이트에서 「조용히 멈춤」은 가장 나쁜 고장이다. 그래서 **숫자로 판정하고, 바뀔 때만 알린다.**
 *
 * ── 무엇을 보는가 (전부 숫자다. 로그로 판정하지 않는다)
 *   ① 리그별 마지막 경기 시각이 지금보다 N분 이상 뒤처짐         SPL·10mountain 60분 · IPL 은 표시만 (아직 수동)
 *   ② 창구 배틀로그 행이 안 늚 — 마지막 적재가 30분 넘게 없음     기본은 표시만. 자동 수집이 살면 `--ingest-alert`
 *   ③ season0-apply 성공이 3시간 넘게 없음                        래더가 안 붙는다
 *   ④ 워크플로가 연속 3회 실패                                    supply-incremental · season0-apply · supply-rollup-full
 *
 *   ①② 는 운영 DB **읽기**(순차 · Promise.all 없음). ③④ 는 GitHub Actions API **읽기**.
 *   `--fixture` 를 주면 DB·GitHub 대신 그 파일의 숫자로 판정한다 — 접속 없이 문구를 시험하는 길이다.
 *
 * ── 같은 경보를 반복해 쏘지 않는다
 *   지난 실행의 판정을 `--state` 파일에 남기고, **상태가 바뀔 때만** 보낸다:
 *     정상 → 경보   [경보]  무엇이 · 언제부터 · 얼마나
 *     경보 → 정상   [복구]  얼마 동안 경보였는지
 *   「표시만」(watch) 은 절대 알리지 않는다. 숫자를 못 읽은 것(unknown)은 경보로 친다 — 감시가 눈을 감은 것도 고장이다.
 *
 * ── 어디로
 *   디스코드 웹훅. 주소는 환경변수 `DISCORD_WEBHOOK_URL` 로만 받고 **어디에도 찍지 않는다.**
 *   없으면 문구만 찍는다 — 웹훅 없이도 판정은 돈다.
 *
 * ── 임계값 60분에 대한 주의 (`jobs/syncFreshness.ts` 실측)
 *   supply 는 8일 실측에서 경기 공백 최대 18.0h, sanply 는 7.1h 였다. 60분이면 **새벽에 원본이 조용할 때 경보가 난다.**
 *   그것은 「우리가 멈춤」과 구별되지 않는다. 지시대로 60분을 기본으로 두되, 오경보가 쌓이면 `--stale-min` 으로 조정한다.
 *   무뎌진 알람은 없는 알람보다 나쁘다 (D-224).
 *
 * ── 읽기만 한다. 운영 DB 에 한 줄도 쓰지 않는다.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { prisma } from '@sacloud/db'

/* --------------------------------------------------------------- 형 --- */

export type WatchLevel = 'ok' | 'alert' | 'watch' | 'unknown'

export interface WatchCheck {
  id: string
  title: string
  level: WatchLevel
  /** 사람이 읽는 한 줄 — 무엇이 · 언제부터 · 얼마나. 「오류 발생」 같은 말은 쓰지 않는다 */
  line: string
}

export interface WatchThresholds {
  /** 리그별 「마지막 경기」 허용 지연(분). 표에 없는 리그는 `watchLeagues` 가 아니면 `fallbackStaleMin` */
  leagueStaleMin: Record<string, number>
  fallbackStaleMin: number
  /** 판정하지 않고 표시만 하는 리그 (자동 수집이 없는 IPL) */
  watchLeagues: readonly string[]
  ingestStaleMin: number
  /**
   * 창구 정체를 경보로 올릴 것인가.
   *
   * ★2026-09-03 에 켰다★ — 그전까지는 «자동 수집이 살면 켠다» 로 꺼 두었고,
   * ★O-051 이 그 자동 수집을 만들었다★ (`barracks-collect.yml` · 15분 체인).
   * ⚠ ★알림을 먼저 켜고 체인을 켠다.★ 반대로 하면 ★안전장치 없이 밤을 넘긴다.★
   *   그래서 이 값과 체인 워크플로는 ★같은 배포로 나간다★ — 사이에 빈 시간이 없어야 한다.
   */
  ingestAlert: boolean
  applyMaxHours: number
  failStreak: number
}

export const WATCHDOG_DEFAULT_THRESHOLDS: WatchThresholds = {
  leagueStaleMin: { supply: 60, sanply: 60 },
  fallbackStaleMin: 60,
  watchLeagues: ['nolink'],
  ingestStaleMin: 30,
  /* ★켰다★ — 15분마다 도는 수집이 생겼으니 30분 정체는 진짜 고장이다 (O-051) */
  ingestAlert: true,
  applyMaxHours: 3,
  failStreak: 3,
}

/** 화면 이름. slug 는 그대로다 (CLAUDE.md 9장) */
const LEAGUE_NAME: Record<string, string> = { supply: 'SPL', sanply: '10mountain', nolink: 'IPL', daerule: 'daerule' }
const leagueName = (slug: string): string => LEAGUE_NAME[slug] ?? slug

/** 감시하는 워크플로. 파일 이름이 곧 GitHub API 의 키다 */
export const WATCHDOG_WORKFLOWS = ['supply-incremental.yml', 'season0-apply.yml', 'supply-rollup-full.yml'] as const
export const APPLY_WORKFLOW = 'season0-apply.yml'

/** 판정에 쓰는 **숫자 전부**. DB·GitHub 에서 읽거나 `--fixture` 파일로 받는다 */
export interface WatchNumbers {
  now: string
  leagues: {
    slug: string
    found: boolean
    newestStartAt: string | null
    newestIngestedAt: string | null
    error?: string
  }[]
  ingest: { rows: number | null; newestFetchedAt: string | null; error?: string }
  workflows: {
    file: string
    /** 완료된 run, 최신 먼저 */
    runs: { conclusion: string | null; createdAt: string; updatedAt: string }[]
    error?: string
  }[]
}

/* --------------------------------------------------------------- 읽기 --- */

const ORIGINS: Record<string, readonly string[]> = {
  supply: ['3rd.supply'],
  sanply: ['3rd.supply'],
  daerule: ['3rd.supply'],
  nolink: ['nexon_barracks'],
}

const short = (e: unknown): string => String((e as { message?: string })?.message ?? e).split('\n')[0]?.slice(0, 160) ?? ''

/**
 * 운영 DB 와 GitHub 에서 숫자를 읽는다. **순차로 · 읽기만.**
 * 한 항목이 실패해도 나머지는 읽는다 — 실패는 그 항목의 `error` 로 남아 unknown 판정이 된다.
 */
export async function readWatchNumbers(input: {
  leagues: readonly string[]
  repo: string | null
  token: string | null
  now?: Date
  fetchImpl?: typeof fetch
}): Promise<WatchNumbers> {
  const now = input.now ?? new Date()
  const fetchImpl = input.fetchImpl ?? fetch
  const out: WatchNumbers = { now: now.toISOString(), leagues: [], ingest: { rows: null, newestFetchedAt: null }, workflows: [] }

  for (const slug of input.leagues) {
    try {
      const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
      if (league === null) {
        out.leagues.push({ slug, found: false, newestStartAt: null, newestIngestedAt: null })
        continue
      }
      const where = { leagueId: league.id, origin: { in: [...(ORIGINS[slug] ?? ['3rd.supply'])] } }
      const byStart = await prisma.match.findFirst({ where, orderBy: { startAt: 'desc' }, select: { startAt: true } })
      const byIngest = await prisma.match.findFirst({ where, orderBy: { ingestedAt: 'desc' }, select: { ingestedAt: true } })
      out.leagues.push({
        slug,
        found: true,
        newestStartAt: byStart?.startAt?.toISOString() ?? null,
        newestIngestedAt: byIngest?.ingestedAt?.toISOString() ?? null,
      })
    } catch (error) {
      out.leagues.push({ slug, found: false, newestStartAt: null, newestIngestedAt: null, error: short(error) })
    }
  }

  try {
    const rows = await prisma.barracksBattleLogRaw.count({ where: { subjectKind: 'clan' } })
    const newest = await prisma.barracksBattleLogRaw.findFirst({
      where: { subjectKind: 'clan' },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    })
    out.ingest = { rows, newestFetchedAt: newest?.fetchedAt?.toISOString() ?? null }
  } catch (error) {
    out.ingest = { rows: null, newestFetchedAt: null, error: short(error) }
  }

  for (const file of WATCHDOG_WORKFLOWS) {
    if (!input.repo || !input.token) {
      out.workflows.push({ file, runs: [], error: input.repo ? 'GitHub 토큰이 없다' : 'GITHUB_REPOSITORY 가 없다' })
      continue
    }
    try {
      const res = await fetchImpl(
        `https://api.github.com/repos/${input.repo}/actions/workflows/${file}/runs?status=completed&per_page=10`,
        { headers: { Authorization: `Bearer ${input.token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) },
      )
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
      const json = (await res.json()) as { workflow_runs?: { conclusion: string | null; created_at: string; updated_at: string }[] }
      out.workflows.push({
        file,
        runs: (json.workflow_runs ?? []).map((r) => ({ conclusion: r.conclusion, createdAt: r.created_at, updatedAt: r.updated_at })),
      })
    } catch (error) {
      out.workflows.push({ file, runs: [], error: short(error) })
    }
  }

  return out
}

/* --------------------------------------------------------------- 판정 --- */

const KST = (iso: string | null): string =>
  iso === null ? '—' : new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().replace('T', ' ').slice(5, 16) + ' KST'
const minutesSince = (iso: string, now: Date): number => Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
const fmtMin = (m: number): string => (m >= 120 ? `${(m / 60).toFixed(1)}시간` : `${m}분`)

/** 숫자 → 판정. 순수 함수다 — 여기서는 아무것도 읽지 않는다 */
export function evaluateWatch(n: WatchNumbers, t: WatchThresholds): WatchCheck[] {
  const now = new Date(n.now)
  const checks: WatchCheck[] = []

  for (const l of n.leagues) {
    const name = leagueName(l.slug)
    const id = `league:${l.slug}`
    const watchOnly = t.watchLeagues.includes(l.slug)
    if (l.error) {
      checks.push({ id, title: `${name} 수집`, level: 'unknown', line: `${name} 마지막 경기를 못 읽었다 — ${l.error}` })
      continue
    }
    if (!l.found) {
      checks.push({ id, title: `${name} 수집`, level: 'unknown', line: `${name} 리그(${l.slug})를 DB 에서 못 찾았다` })
      continue
    }
    if (l.newestStartAt === null) {
      checks.push({ id, title: `${name} 수집`, level: watchOnly ? 'watch' : 'unknown', line: `${name} 경기가 0건이다` })
      continue
    }
    const age = minutesSince(l.newestStartAt, now)
    const limit = t.leagueStaleMin[l.slug] ?? t.fallbackStaleMin
    const ingest = l.newestIngestedAt ? ` · 마지막 적재 ${KST(l.newestIngestedAt)}` : ''
    if (watchOnly) {
      checks.push({ id, title: `${name} 수집`, level: 'watch', line: `${name} 마지막 경기 ${KST(l.newestStartAt)} · ${fmtMin(age)} 전 (표시만)${ingest}` })
      continue
    }
    const bad = age > limit
    checks.push({
      id,
      title: `${name} 수집`,
      level: bad ? 'alert' : 'ok',
      line: `${name} 마지막 경기 ${KST(l.newestStartAt)} · ${fmtMin(age)} 전 (임계 ${limit}분)${ingest}`,
    })
  }

  {
    const id = 'ingest:barracks'
    const title = '병영수첩 창구'
    if (n.ingest.error) {
      checks.push({ id, title, level: 'unknown', line: `병영수첩 창구 행 수를 못 읽었다 — ${n.ingest.error}` })
    } else if (n.ingest.newestFetchedAt === null) {
      checks.push({ id, title, level: t.ingestAlert ? 'alert' : 'watch', line: `병영수첩 배틀로그 ${n.ingest.rows ?? 0}행 · 적재 기록 없음` })
    } else {
      const age = minutesSince(n.ingest.newestFetchedAt, now)
      const bad = age > t.ingestStaleMin
      const level: WatchLevel = t.ingestAlert ? (bad ? 'alert' : 'ok') : 'watch'
      checks.push({
        id,
        title,
        level,
        line: `병영수첩 배틀로그 ${(n.ingest.rows ?? 0).toLocaleString('en-US')}행 · 마지막 적재 ${KST(n.ingest.newestFetchedAt)} · ${fmtMin(age)} 전 (임계 ${t.ingestStaleMin}분${t.ingestAlert ? '' : ' · 표시만'})`,
      })
    }
  }

  for (const w of n.workflows) {
    const base = w.file.replace(/\.yml$/, '')
    if (w.error) {
      checks.push({ id: `workflow:${base}`, title: `${base} 실행`, level: 'unknown', line: `${base} 실행 기록을 못 읽었다 — ${w.error}` })
      if (w.file === APPLY_WORKFLOW) checks.push({ id: 'apply:success', title: '시즌0 반영', level: 'unknown', line: `season0-apply 성공 기록을 못 읽었다 — ${w.error}` })
      continue
    }
    // 연속 실패 — cancelled · skipped 는 세지도 끊지도 않는다 (대기 자리 하나뿐이라 취소는 흔하다 · D-224)
    let streak = 0
    let lastFailAt: string | null = null
    for (const r of w.runs) {
      if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') continue
      if (r.conclusion === 'failure' || r.conclusion === 'timed_out') {
        streak += 1
        lastFailAt = lastFailAt ?? r.createdAt
        continue
      }
      break
    }
    const counted = w.runs.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped').length
    checks.push({
      id: `workflow:${base}`,
      title: `${base} 실행`,
      level: counted === 0 ? 'watch' : streak >= t.failStreak ? 'alert' : 'ok',
      line:
        counted === 0
          ? `${base} 완료된 실행이 없다`
          : `${base} 연속 실패 ${streak}회 (임계 ${t.failStreak}회)${lastFailAt ? ` · 최근 실패 ${KST(lastFailAt)}` : ''}`,
    })

    if (w.file === APPLY_WORKFLOW) {
      const ok = w.runs.find((r) => r.conclusion === 'success')
      if (!ok) {
        checks.push({ id: 'apply:success', title: '시즌0 반영', level: counted === 0 ? 'watch' : 'alert', line: `season0-apply 최근 ${w.runs.length}회 중 성공이 없다` })
      } else {
        const age = minutesSince(ok.updatedAt, now)
        checks.push({
          id: 'apply:success',
          title: '시즌0 반영',
          level: age > t.applyMaxHours * 60 ? 'alert' : 'ok',
          line: `season0-apply 마지막 성공 ${KST(ok.updatedAt)} · ${fmtMin(age)} 전 (임계 ${t.applyMaxHours}시간)`,
        })
      }
    }
  }

  return checks
}

/* --------------------------------------------------------------- 상태 · 전이 --- */

export interface WatchState {
  version: 1
  updatedAt: string
  checks: Record<string, { level: WatchLevel; since: string; line: string }>
}

export interface WatchEvent {
  kind: 'alert' | 'recover'
  check: WatchCheck
  /** 복구면 경보가 이어진 시간(분) */
  lastedMin?: number
}

const isBad = (level: WatchLevel): boolean => level === 'alert' || level === 'unknown'

/**
 * 지난 상태와 이번 판정을 견줘 **바뀐 것만** 사건으로 만든다.
 *   좋음 → 나쁨 : alert  ·  나쁨 → 좋음 : recover  ·  같은 쪽에 머무름 : 사건 없음
 * 첫 실행(prev 없음)은 나쁜 것만 알린다 — 정상인 것을 굳이 알리지 않는다.
 */
export function transitionWatch(prev: WatchState | null, checks: readonly WatchCheck[], now: Date): { next: WatchState; events: WatchEvent[] } {
  const events: WatchEvent[] = []
  const next: WatchState = { version: 1, updatedAt: now.toISOString(), checks: {} }
  for (const c of checks) {
    const before = prev?.checks[c.id] ?? null
    const wasBad = before ? isBad(before.level) : false
    const nowBad = isBad(c.level)
    const since = before && isBad(before.level) === nowBad ? before.since : now.toISOString()
    next.checks[c.id] = { level: c.level, since, line: c.line }
    if (!wasBad && nowBad) events.push({ kind: 'alert', check: c })
    else if (wasBad && !nowBad) events.push({ kind: 'recover', check: c, lastedMin: before ? minutesSince(before.since, now) : undefined })
  }
  return { next, events }
}

export async function loadWatchState(path: string): Promise<WatchState | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as WatchState
    return parsed && parsed.version === 1 && typeof parsed.checks === 'object' ? parsed : null
  } catch {
    return null
  }
}

export async function saveWatchState(path: string, state: WatchState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8')
}

/* --------------------------------------------------------------- 문구 --- */

const LEVEL_MARK: Record<WatchLevel, string> = { ok: '정상', alert: '경보', watch: '표시만', unknown: '확인불가' }

/** 로그용 표 */
export function formatWatchReport(checks: readonly WatchCheck[], now: Date): string {
  const lines = [`수집 감시 ${KST(now.toISOString())}`]
  for (const c of checks) lines.push(`  [${LEVEL_MARK[c.level].padEnd(4, ' ')}] ${c.line}`)
  const alert = checks.filter((c) => c.level === 'alert').length
  const unknown = checks.filter((c) => c.level === 'unknown').length
  lines.push(`  지금 상태 = ${alert + unknown > 0 ? `경보 ${alert}건 · 확인불가 ${unknown}건` : '정상'}`)
  return lines.join('\n')
}

/**
 * 디스코드로 보낼 본문. **바뀐 것만** 적고, 마지막 줄에 나머지 상태를 한 줄로 요약한다.
 * `force` 면 사건이 없어도 전체 상태를 적는다 (웹훅이 사는지 시험할 때).
 */
export function formatWatchMessage(events: readonly WatchEvent[], checks: readonly WatchCheck[], now: Date, force = false): string | null {
  if (events.length === 0 && !force) return null
  const alerts = events.filter((e) => e.kind === 'alert')
  const recovers = events.filter((e) => e.kind === 'recover')
  const head =
    alerts.length > 0 ? `[경보] SACLOUD 수집 감시 · ${KST(now.toISOString())}` : recovers.length > 0 ? `[복구] SACLOUD 수집 감시 · ${KST(now.toISOString())}` : `[상태] SACLOUD 수집 감시 · ${KST(now.toISOString())}`
  const lines = [head]
  for (const e of alerts) lines.push(`- ${e.check.level === 'unknown' ? '확인불가' : '경보'}: ${e.check.line}`)
  for (const e of recovers) lines.push(`- 복구: ${e.check.line}${e.lastedMin !== undefined ? ` · 경보 ${fmtMin(e.lastedMin)} 만에` : ''}`)
  if (force) {
    const touched = new Set(events.map((e) => e.check.id))
    for (const c of checks) if (!touched.has(c.id)) lines.push(`- ${LEVEL_MARK[c.level]}: ${c.line}`)
  } else {
    const rest = checks.filter((c) => !events.some((e) => e.check.id === c.id))
    const stillBad = rest.filter((c) => isBad(c.level))
    lines.push(`나머지 ${rest.length}건: ${stillBad.length > 0 ? `경보 계속 ${stillBad.length}건 · ` : ''}정상/표시만 ${rest.length - stillBad.length}건`)
  }
  const text = lines.join('\n')
  return text.length > 1900 ? `${text.slice(0, 1890)}\n…(잘림)` : text
}

/** 디스코드 웹훅 한 번. 주소는 여기서도 찍지 않는다 */
export async function sendDiscord(webhookUrl: string, content: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number }> {
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15_000),
  })
  return { ok: res.ok, status: res.status }
}

/** `--stale-min supply=60,sanply=30` 꼴을 푼다. 형식이 틀리면 throw */
export function parseStaleMin(text: string | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const pair of (text ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [slug, v] = pair.split('=')
    const n = Number(v)
    if (!slug || !Number.isFinite(n) || n <= 0) throw new Error(`--stale-min 은 <slug>=<분> 형식이다: ${pair}`)
    out[slug] = n
  }
  return out
}
