/**
 * 선수 **누적 전적**을 경기에서 직접 센다 (D-176).
 *
 * ── 왜 만들었나
 *   선수 프로필의 `상세정보` 는 `LeaguePlayer` 의 누적 칸(win/lose/kill/death/mvpCount)을
 *   그대로 읽었다. 그 칸은 화면이 아니라 **배치 집계가 채우는 값**이라, 집계가 훑는
 *   기간(시즌 창) 밖의 경기는 한 판도 들어가지 않는다.
 *
 *   실측(2026-08-29 · 로컬 DB, 운영과 같은 미러):
 *
 *     선수 `OBS-4d31283ebf60773a1296254f` (서든러#001088394) · `supply` 리그
 *       · 참가한 래더 경기            66건   (전부 2026-07-07 이후)
 *       · `LeaguePlayer.win/lose`      0 / 0
 *       · `LeaguePlayer.kill/death`    0 / 0
 *       · `LeaguePlayer.mvpCount`      0
 *
 *   같은 화면의 `최근매치` 는 `Match` 를 그 자리에서 세므로 `20전 11승 9패` 가 나왔다.
 *   **본문과 상세정보가 서로 다른 모집단을 세고 있었다.**
 *
 * ── 무엇을 기준으로 세는가
 *   `최근매치` 와 **똑같이** `ladderScope.ts` 의 "래더에 반영된 경기"(D-164) 이고,
 *   거기에 **현재 시즌(시즌0) 창**을 더한다 (`season0Scope.ts` · D-178).
 *
 *   창을 더한 이유는 D-176 이 남긴 숙제다 — 상세정보는 전 기간을 세는데 랭킹 표는
 *   시즌0 창(엔진 집계)이라 같은 선수의 두 숫자가 어긋났다. 사용자 지시로 **화면의 성적
 *   수치를 전부 시즌0 기준으로 통일**한다. 창 안에 경기가 없는 선수가 빈 성적 ·
 *   `배치고사` 로 보이는 것은 **정상**이다(사용자 확인).
 *
 *   **날짜 상수를 여기 적지 않는다.** 창의 단일 정의는
 *   `apps/worker/src/lib/season0Window.ts` 이고 `season0Scope.ts` 가 그대로 읽어 온다.
 *   2026-03 이전 기록은 지우지 않았고 기록실·매치 상세·지난시즌 카드에서 계속 보인다.
 *
 * ── 모르는 값을 0으로 채우지 않는다 (D-034 · D-106 · D-148)
 *   K/D/A 는 넥슨이 준다. 3rd.supply 라인업으로만 복원한 참가 기록은 `null` 이다.
 *   그래서 판수를 둘로 나눈다 (D-149 와 같은 정의).
 *
 *     games        그 리그의 래더 경기 중 참가한 경기 **전부**
 *     knownGames   그중 K/D 를 아는 경기 — **킬·데스·킬뎃·평균킬의 분모**
 *
 *   `knownGames === 0` 이면 킬·데스·킬뎃은 `0` 이 아니라 `null` 이다.
 *   승·패와 MVP 는 K/D 를 몰라도 아는 값이라 `games` 기준으로 센다.
 */
import { prisma, type Prisma } from '@sacloud/db'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

/** 무기 하나의 누적. 무기를 모르는 경기(`weapon = null`)는 어느 쪽에도 들어가지 않는다 */
export interface WeaponTotals {
  /** 그 무기로 뛴 래더 경기 전부 */
  games: number
  /** 그중 K/D 를 아는 경기 (킬·데스·킬뎃의 분모) */
  knownGames: number
  /** 아는 경기가 없으면 `null` — 0킬이 아니라 **모르는 것**이다 */
  kill: number | null
  death: number | null
  assist: number | null
  /** `킬 / (킬 + 데스) × 100`. 전체 킬뎃과 **같은 정의**다 (D-149 4장) */
  kdRate: number | null
}

export interface PlayerLadderTotals {
  games: number
  knownGames: number
  win: number
  lose: number
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  kdRate: number | null
  mvpCount: number
  /** `0 = 라이플` / `1 = 스나이퍼` (도메인 용어 — `CLAUDE.md` 6장) */
  rifle: WeaponTotals
  sniper: WeaponTotals
}

const EMPTY_WEAPON: WeaponTotals = {
  games: 0,
  knownGames: 0,
  kill: null,
  death: null,
  assist: null,
  kdRate: null,
}

/** `킬 / (킬 + 데스) × 100` — 아는 경기가 없으면 계산하지 않는다 */
function rate(kill: number, death: number, knownGames: number): number | null {
  if (knownGames === 0) return null
  const total = kill + death
  if (total === 0) return 0
  return Math.round((kill / total) * 1000) / 10
}

function weaponTotals(
  row: { _count: { _all: number; kill: number }; _sum: { kill: number | null; death: number | null; assist: number | null } } | undefined,
): WeaponTotals {
  if (!row || row._count._all === 0) return EMPTY_WEAPON
  const knownGames = row._count.kill
  const kill = row._sum.kill ?? 0
  const death = row._sum.death ?? 0
  return {
    games: row._count._all,
    knownGames,
    kill: knownGames === 0 ? null : kill,
    death: knownGames === 0 ? null : death,
    assist: row._sum.assist,
    kdRate: rate(kill, death, knownGames),
  }
}

/**
 * 그 리그에서 이 선수의 누적 전적 — **현재 시즌 창 안의 래더 경기만** (D-164 · D-178).
 *
 * `최근매치` 요약(`buildRecordSummary`)과 모집단이 같다.
 * 다른 점은 최근 20건으로 자르지 않는다는 것뿐이다.
 */
export async function playerLadderTotals(
  leagueId: string,
  playerId: string,
): Promise<PlayerLadderTotals> {
  /* `matchPlayerStat` 한 행 = 그 선수가 뛴 경기 한 판이다
     (`@@unique([matchId, playerId])`). 그래서 행을 세면 판수가 된다. */
  const statWhere: Prisma.MatchPlayerStatWhereInput = {
    playerId,
    match: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
  }

  const [agg, win, mvpCount, byWeapon] = await Promise.all([
    prisma.matchPlayerStat.aggregate({
      where: statWhere,
      _sum: { kill: true, death: true, assist: true, headshot: true },
      /* `_count.kill` 은 **`null` 이 아닌 행**만 센다 — 그게 `knownGames` 다 */
      _count: { _all: true, kill: true },
    }),
    /* 이긴 경기 — 내가 뛴 진영이 승리 진영과 같은 경기.
       현재 소속으로 판정하지 않는다. 이적·용병이면 어긋난다 (D-131 · D-135) */
    prisma.matchPlayerStat.count({
      where: {
        ...statWhere,
        OR: [
          { side: 'red', match: { winnerSide: 'red' } },
          { side: 'blue', match: { winnerSide: 'blue' } },
        ],
      },
    }),
    /* MVP 는 `null` 일 수 있다 (모름). `true` 만 센다 — `null` 을 "아니다"로 읽지 않는다 */
    prisma.matchPlayerStat.count({ where: { ...statWhere, mvp: true } }),
    prisma.matchPlayerStat.groupBy({
      by: ['weapon'],
      where: { ...statWhere, weapon: { in: [0, 1] } },
      _sum: { kill: true, death: true, assist: true },
      _count: { _all: true, kill: true },
    }),
  ])

  const games = agg._count._all
  const knownGames = agg._count.kill
  const kill = agg._sum.kill ?? 0
  const death = agg._sum.death ?? 0

  return {
    games,
    knownGames,
    win,
    /* `Match.winnerSide` 는 `red` 아니면 `blue` 다 (스키마상 non-null · 무승부가 없다).
       그래서 남는 경기는 전부 패배다 */
    lose: games - win,
    kill: knownGames === 0 ? null : kill,
    death: knownGames === 0 ? null : death,
    /* 어시·헤드샷은 아는 행이 한 줄도 없으면 Prisma 가 `null` 을 준다.
       그대로 넘긴다 — 0으로 바꾸면 "0어시를 했다"는 거짓이 된다 (D-034 · D-106) */
    assist: agg._sum.assist,
    headshot: agg._sum.headshot,
    kdRate: rate(kill, death, knownGames),
    mvpCount,
    rifle: weaponTotals(byWeapon.find((row) => row.weapon === 0)),
    sniper: weaponTotals(byWeapon.find((row) => row.weapon === 1)),
  }
}
