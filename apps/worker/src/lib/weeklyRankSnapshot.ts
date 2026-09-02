/**
 * 주간 순위 스냅샷 — **순수 부분** (지시 #19 · 2026-09-02).
 *
 * ── 왜 필요한가
 *   선수·클랜 카드의 「순위」 선을 못 그린다. 과거 순위는 그때의 **모든 선수 점수**를 알아야
 *   나오는데 저장한 적이 없다. 지금은 `rank: null` 이다 (옳다 — 지어내지 않았다).
 *
 * ── 어디서 재료가 나오나
 *   `jobs/rate.ts` 의 replay 가 전 경기를 시각 순으로 훑는다. 그 안에서 **주 경계를 지날 때마다**
 *   그 순간의 내부 점수·판수·승률·감점을 들고 있으므로, 표시 점수를 계산해 줄을 세우면
 *   그것이 그 경계 시점의 순위다. 시즌 시작부터 다시 재생하니 **과거분까지 소급**해 만들 수 있다.
 *
 *   replay 훅 자체(`rate.ts` 수정)는 여기 없다 — 총괄 승인 뒤 붙인다. 이 파일은 그 훅이 부를
 *   **줄 세우기**와, `season0Apply` 가 쓸 **차이 계산**만 갖는다. 둘 다 DB 를 모른다.
 *
 * ── 순위 정의는 화면과 같아야 한다
 *   `apps/web/lib/server/queries/leagues.ts` 의 `playerRankOf`:
 *     모집단 `placement=false` · **정수 rating** 내림차순 · 동점은 id 오름차순.
 *   그래서 여기서도 표시 점수를 **먼저 반올림**하고 정렬한다. 실수 그대로 정렬하면
 *   3000.4 와 3000.2 가 갈리는데 화면에서는 둘 다 3000 으로 같은 순위 자리다.
 *   동점 타이브레이커만 다르다 — 화면은 `LeaguePlayer.id`, 여기는 `playerId`. replay 안에서는
 *   `LeaguePlayer.id` 를 모른다. 정확히 같은 점수일 때만 한 자리 차이가 날 수 있다.
 *
 * ── 반올림은 `season0Apply` 와 같은 규칙이다 (half away from zero)
 */
import { WEEK_BOUNDARY, type WeekBoundaryKind } from '@sacloud/contract'

/** replay 가 경계 시점에 들고 있는 한 명(또는 한 클랜)의 상태 */
export interface WeeklyRankCandidate {
  /** 선수면 `playerId`, 클랜이면 `leagueClanId` */
  id: string
  /** 그 시점의 **표시 점수** (`displayScore().display` 또는 클랜 `internal + composition − penalty`) */
  display: number
  /** 그 시점까지 래더에 반영된 판수 */
  games: number
}

/** 스냅샷 한 줄 — 표에 그대로 들어가는 값 */
export interface WeeklyRankEntry {
  id: string
  rank: number
  /** 그 시점 랭킹 모집단 크기 — 화면의 「n / N 위」 분모 */
  rankCount: number
  /** 반올림한 표시 점수 — `LeaguePlayer.rating` 과 같은 자리 */
  rating: number
}

/** `season0Apply` 의 `round` 와 같다 — 0.5 는 0 에서 먼 쪽으로 */
export function roundRating(value: number): number {
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}

/**
 * 경계 시점의 상태 → 순위표.
 *
 * 배치고사 중(`games < placementMatches`)은 모집단에서 뺀다 — `season0.ts` 의 랭킹 표와 같다.
 * 한 판도 안 뛴 후보는 애초에 replay 상태에 없지만, 있어도 뺀다 (`games === 0`).
 */
export function rankAtBoundary(
  candidates: readonly WeeklyRankCandidate[],
  placementMatches: number,
): WeeklyRankEntry[] {
  const eligible = candidates
    .filter((c) => c.games > 0 && c.games >= placementMatches)
    .map((c) => ({ id: c.id, rating: roundRating(c.display) }))
    .sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rankCount = eligible.length
  return eligible.map((c, index) => ({ id: c.id, rank: index + 1, rankCount, rating: c.rating }))
}

/** 이미 표에 있는 한 줄 (읽어 온 것) */
export interface WeeklyRankStoredRow {
  subjectId: string
  rank: number
  rankCount: number
  rating: number
}

/**
 * 있는 것과 새로 계산한 것의 차이.
 *
 * 매시간 replay 가 같은 경계를 다시 계산한다. 결정적이라 **거의 항상 같은 값**이 나오고,
 * 그때는 한 줄도 쓰지 않아야 한다 — 운영은 `connection_limit=1` 이라 왕복이 곧 시간이다.
 * 값이 달라지는 경우는 실제로 있다: 미러가 20~30분 늦게 들어온 경기, 병영수첩으로 소급 적재한
 * IPL 경기. 그때는 **덮어쓴다** — 스냅샷은 「그때 화면에 보였던 값」이 아니라
 * 「지금 아는 전부로 다시 잰 그 시점의 순위」다. 래더 자체가 그렇게 정의돼 있다 (결정적 replay).
 */
export function diffWeeklyRank(
  existing: readonly WeeklyRankStoredRow[],
  computed: readonly WeeklyRankEntry[],
): { create: WeeklyRankEntry[]; update: WeeklyRankEntry[]; remove: string[] } {
  const before = new Map(existing.map((row) => [row.subjectId, row]))
  const create: WeeklyRankEntry[] = []
  const update: WeeklyRankEntry[] = []
  const seen = new Set<string>()
  for (const entry of computed) {
    seen.add(entry.id)
    const old = before.get(entry.id)
    if (!old) create.push(entry)
    else if (old.rank !== entry.rank || old.rankCount !== entry.rankCount || old.rating !== entry.rating) {
      update.push(entry)
    }
  }
  const remove = existing.filter((row) => !seen.has(row.subjectId)).map((row) => row.subjectId)
  return { create, update, remove }
}

/**
 * 스냅샷 행의 키 — 어느 리그 · 선수/클랜 · 어느 경계 규칙 · 어느 경계 시각.
 *
 * `boundary` 를 키에 넣는 이유: 사장님 확인으로 경계가 `wed00` 으로 바뀌면 옛 `thu00` 행과
 * 새 행이 **한 표에 같이 있어야** 옛 그래프를 대조할 수 있다 (`CLAUDE.md` 10-4).
 * 읽는 쪽은 언제나 `WEEK_BOUNDARY.current` 만 읽는다.
 */
export interface WeeklyRankKey {
  leagueId: string
  kind: 'player' | 'clan'
  boundary: WeekBoundaryKind
  weekStartAt: Date
}

export function weeklyRankKey(
  leagueId: string,
  kind: 'player' | 'clan',
  weekStartAt: Date,
  boundary: WeekBoundaryKind = WEEK_BOUNDARY.current,
): WeeklyRankKey {
  return { leagueId, kind, boundary, weekStartAt }
}

/**
 * 행 수 추정 — 「경계마다 그 시점 모집단 크기」의 합.
 *
 * 숫자를 지어내지 않으려고 함수로 둔다. 실측 모집단은 운영 DB 를 세서 넣는다
 * (보고서의 표가 그 값이다).
 */
export function estimateRows(populationPerBoundary: readonly number[]): number {
  return populationPerBoundary.reduce((sum, n) => sum + n, 0)
}
