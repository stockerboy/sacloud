/**
 * ★★오늘의 상대전적★★ — 클랜랭킹 맨 위 카드 (2026-09-22 · 사장님)
 *
 * > 「매일 특정 시간 구간 동안 ★등록된 클랜끼리 서로 가장 많은 경기를 치른 매치업★ 1개를
 * >  자동으로 찾아 클랜랭킹 상단에 실시간 상대전적으로 보여준다」
 *
 * ── ★하루의 경계★ — 매일 15:00 KST 에 새로 시작한다
 *   ```
 *   9/21 15:00 ~ 9/22 14:59:59  = 하나의 집계
 *   9/22 15:00 ~ 9/23 14:59:59  = 새로운 집계
 *   ```
 *   ★DB 를 지우지 않는다.★ 사장님이 못박으신 것 — 「15:00 이전 경기 기록을 DB에서
 *   삭제하는 것이 아니다 (…) 별도의 위험한 DELETE 작업은 하지 마」.
 *   ★여기서 바뀌는 것은 「어디서 어디까지 읽을까」 하나뿐이다.★
 *
 * ── ★등록된 클랜끼리만★
 *   등록 여부는 `Clan.active` 가 정한다 — 2026-09-22 아침 커밋 `ac5d499e` 가 세운 규칙이다
 *   (우리 클랜의 «상대» 로만 나온 클랜은 `active=false` 로 들어온다).
 *   ★새 칸을 만들지 않았다★ — 랭킹·목록이 이미 보는 그 칸을 그대로 본다.
 *
 * ── ★고정하지 않는다★
 *   「오후 3시에 한 번 선정하고 고정하는 방식이 아니다」 — 요청할 때마다 다시 센다.
 *   경기가 하나 들어와 1위가 바뀌면 ★카드 전체★ 가 그 매치업으로 갈린다.
 *
 * ── ★동률이면 흔들리지 않게★ (사장님: 「임의/random으로 선택하지 마」)
 *   ① 경기 수가 많은 쪽 → ② 마지막 경기가 더 최근인 쪽 → ③ 클랜 ID 를 이어 붙인 문자열
 *   ③ 까지 가면 값이 고정이라 새로고침해도 깜빡이지 않는다.
 *
 * ── ★같은 경기를 두 번 세지 않는다★
 *   `prisma.match` 의 `id` 가 곧 match id 이고 한 행이 한 번만 온다. 그 위에
 *   `seen` 집합으로 한 겹 더 막는다 — 위에서 쿼리가 바뀌어도 규칙이 남는다.
 *
 * ── ★없으면 없다고 낸다★ (`CLAUDE.md` 2장 1번)
 *   오늘 등록 클랜끼리의 경기가 없으면 `null` 이다. 가짜 매치업을 만들지 않는다.
 */
import { prisma } from '@sacloud/db'
import { toKstIso } from '../format'

/** 하루가 바뀌는 시각 — 사장님이 정하신 값 (KST 15:00) */
export const DAY_BOUNDARY_HOUR_KST = 15
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 지금이 속한 집계 구간 `[from, to)` 을 낸다.
 *
 * `now` 를 넘길 수 있게 열어 둔 것은 ★시험 때문★ 이다 — 15:00 을 넘기는 순간을
 * 시계를 돌리지 않고 확인할 수 있어야 한다.
 */
export function todayWindow(now: Date = new Date()): { from: Date; to: Date } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  /* KST 로 읽은 「오늘 15:00」 */
  const boundaryKst = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    DAY_BOUNDARY_HOUR_KST,
  )
  /* 아직 15:00 전이면 ★어제 15:00★ 이 시작이다 */
  const startKst = kst.getTime() >= boundaryKst ? boundaryKst : boundaryKst - 24 * 60 * 60 * 1000
  const from = new Date(startKst - KST_OFFSET_MS)
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) }
}

export interface TodayMatchupGame {
  match_id: string
  start_at: string
  /** `true` 면 A 가 이겼다. 승자를 모르는 경기는 아예 안 담는다 */
  a_won: boolean
}

export interface TodayMatchupClan {
  league_clan_id: string
  slug: string
  name: string
  mark_bg_url: string | null
  mark_front_url: string | null
}

export interface TodayTopMatchup {
  /** 집계 구간 — 화면이 X축을 그릴 때 쓴다 */
  from: string
  to: string
  a: TodayMatchupClan
  b: TodayMatchupClan
  a_win: number
  b_win: number
  total: number
  /** 시간순. 그래프는 이걸 그대로 훑어 누적 승률을 만든다 */
  games: TodayMatchupGame[]
}

/** 두 클랜을 ★차례에 상관없이★ 같은 열쇠로 묶는다 (A vs B = B vs A) */
function pairKey(x: string, y: string): string {
  return x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`
}

export async function todayTopMatchup(
  leagueId: string,
  now: Date = new Date(),
): Promise<TodayTopMatchup | null> {
  const { from, to } = todayWindow(now)

  const matches = await prisma.match.findMany({
    where: {
      leagueId,
      supersededAt: null,
      startAt: { gte: from, lt: to },
      /* ★등록된 클랜끼리만★ — 양쪽 다 `active` 여야 한다 */
      redClan: { clan: { active: true } },
      blueClan: { clan: { active: true } },
    },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      startAt: true,
      winnerSide: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
    },
  })

  interface Bucket {
    /** 열쇠에서 먼저 오는 쪽 (문자열 순서) — 이게 A 다 */
    aId: string
    bId: string
    aWin: number
    bWin: number
    last: Date
    games: TodayMatchupGame[]
  }
  const seen = new Set<string>()
  const buckets = new Map<string, Bucket>()

  for (const m of matches) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const red = m.redLeagueClanId
    const blue = m.blueLeagueClanId
    /* 자기 자신과의 경기는 매치업이 아니다 */
    if (red === blue) continue
    /* 승자를 모르는 경기는 승률을 못 만든다 — 담지 않는다 (지어내지 않는다) */
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue

    const key = pairKey(red, blue)
    let bucket = buckets.get(key)
    if (!bucket) {
      const [aId, bId] = red < blue ? [red, blue] : [blue, red]
      bucket = { aId, bId, aWin: 0, bWin: 0, last: m.startAt, games: [] }
      buckets.set(key, bucket)
    }
    const winnerId = m.winnerSide === 'red' ? red : blue
    const aWon = winnerId === bucket.aId
    if (aWon) bucket.aWin += 1
    else bucket.bWin += 1
    if (m.startAt > bucket.last) bucket.last = m.startAt
    bucket.games.push({
      match_id: m.id,
      start_at: toKstIso(m.startAt),
      a_won: aWon,
    })
  }

  if (buckets.size === 0) return null

  /* ★흔들리지 않는 고르기★ — 경기 수 → 마지막 경기 → 클랜 ID */
  let best: Bucket | null = null
  for (const bucket of buckets.values()) {
    if (best === null) {
      best = bucket
      continue
    }
    const mine = bucket.games.length
    const theirs = best.games.length
    if (mine !== theirs) {
      if (mine > theirs) best = bucket
      continue
    }
    if (bucket.last.getTime() !== best.last.getTime()) {
      if (bucket.last > best.last) best = bucket
      continue
    }
    if (`${bucket.aId}${bucket.bId}` < `${best.aId}${best.bId}`) best = bucket
  }
  if (best === null) return null

  const clans = await prisma.leagueClan.findMany({
    where: { id: { in: [best.aId, best.bId] } },
    select: {
      id: true,
      clan: { select: { slug: true, name: true, markBgUrl: true, markFrontUrl: true } },
    },
  })
  const pick = (id: string): TodayMatchupClan | null => {
    const row = clans.find((c) => c.id === id)
    if (!row) return null
    return {
      league_clan_id: row.id,
      slug: row.clan.slug,
      name: row.clan.name,
      mark_bg_url: row.clan.markBgUrl,
      mark_front_url: row.clan.markFrontUrl,
    }
  }
  const a = pick(best.aId)
  const b = pick(best.bId)
  /* 클랜 행이 없으면 ★이름을 지어내지 않는다★ — 카드를 안 그린다 */
  if (!a || !b) return null

  return {
    from: toKstIso(from),
    to: toKstIso(to),
    a,
    b,
    a_win: best.aWin,
    b_win: best.bWin,
    total: best.games.length,
    games: best.games,
  }
}
