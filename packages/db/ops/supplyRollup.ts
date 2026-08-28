/**
 * 3rd.supply 미러 → 리그 집계 (`LeaguePlayer` · `LeagueClan`).
 *
 * ── 왜 필요한가
 *   미러 적재는 `Match` 와 `MatchPlayerStat` 만 만든다. 랭킹 화면이 읽는 것은
 *   `LeaguePlayer` / `LeagueClan` 인데 그 행이 비어 있어 **랭킹에 아무도 뜨지 않았다.**
 *   이 잡이 참가 기록을 되짚어 그 두 표를 채운다.
 *
 * ── 점수는 원본값을 그대로 미러링한다 (D-153)
 *   시즌7 베타 화면은 **3rd.supply 가 보여 준 점수**를 쓴다. 우리 공식(D-145)이 계산한
 *   `ratingBefore` / `ratingUpdate` / `formulaVersion` 은 **읽지도 쓰지도 않는다.**
 *   이 잡이 그 값을 건드리면 그건 결함이다.
 *
 *   `MatchPlayerStat.sourceRating` 은 **경기 당시 값이 아니다.** 실측으로 확인했다 —
 *   한 선수의 5,978경기에서 distinct 값이 3개뿐이었다. 원본은 수집 시점의 현재 래더를
 *   모든 행에 그대로 붙인다. 그래서 **가장 최근 행의 값 = 그 선수의 현재 원본 래더**이고,
 *   그것 하나만 옮기면 원본 랭킹이 그대로 재현된다.
 *   평균을 내거나 증감(`sourceRatingDelta`)을 누적하면 원본과 어긋난다. 하지 않는다.
 *
 *   근거가 아예 없는 선수(모든 행이 `null`)는 **rating 을 건드리지 않는다.**
 *   3000(기본값)을 써 넣으면 "원본 점수가 3000이다"라는 거짓이 남는다 (3-A 8번).
 *
 * ── 누적값의 분모
 *   넥슨이 KDA 를 주지 않은 참가 기록이 있다 (D-034 · D-148). 그 행을 0킬로 세면
 *   평균이 내려간다. 그래서 **`null` 은 더하지 않고**, 아는 행이 하나도 없으면
 *   그 칸은 아예 쓰지 않는다(기존 값 보존).
 *   승패는 라인업만으로 알 수 있으므로 항상 센다.
 *
 * ── 선수의 **소속 클랜**은 가장 최근 경기에서 온다 (D-160)
 *   개인랭킹 화면은 닉네임 옆에 소속 클랜 마크를 띄운다. 그 값은 `LeaguePlayer.clanId`
 *   (전역 화면은 `Player.clanId`)인데 적재가 그 칸을 채우지 않아 **비어 있었다** —
 *   supply 10,388명 중 113명, sanply·daerule 은 0명이었다.
 *
 *   근거는 이미 참가 기록 안에 있다. `MatchPlayerStat.matchTimeClanSlug` 는
 *   원본이 그 선수 자리에 붙여 준 소속인데, **경기 당시가 아니라 수집 시점의 현재 소속**이다
 *   (실측: 3,322명 중 경기별로 소속이 달라진 사람 0명 — `supplyMirrorParse.ts` 머리말).
 *   원본 화면도 현재 소속을 보여 준다. 그래서 **가장 최근 경기의 값 하나**를 그대로 옮긴다.
 *   `sourceRating` 과 완전히 같은 규칙이다.
 *
 *   `MatchPlayerStat` 은 건드리지 않는다. 과거 경기 화면은 그 경기에 박힌 스냅샷을
 *   계속 쓴다 (D-131). 여기서 정하는 것은 **지금 소속**뿐이다.
 *
 *   **지어내지 않는다.**
 *     · 최신 경기에 클랜이 없으면 무소속이다 → 칸을 쓰지 않는다(새 행은 `null` 로 남는다)
 *     · 클랜 slug 는 있는데 `Clan` 표에 그 행이 없으면 **만들지 않는다** → 역시 쓰지 않는다
 *   `rating` · 킬뎃과 같은 규칙이다: 근거가 없는 칸은 아예 쓰지 않아 기존 값을 보존한다.
 *
 * ── 클랜은 경기에서 되짚지 않는다 (D-157)
 *   선수와 달리 **클랜 점수·승패·부리그는 수집 파일의 클랜 목록 값을 그대로 쓴다.**
 *   그 값이 원본 클랜랭킹 화면이 실제로 보여 주는 숫자다.
 *   경기 기록에서 되짚어 만들었더니 원본과 어긋났다 — `saint` 1,525 vs 원본 1,561,
 *   `One.PoinT` 1,117 vs 원본 1,079, `smite` 는 자기 진영 점수가 담긴 경기가 하나도 없어
 *   기본값 3,000 그대로 남았다(원본 1,718).
 *
 *   **랭킹 모집단도 그 목록이 정한다.** 상대 클랜으로만 등장한 클랜은 리그 등록 클랜이
 *   아니어서 원본 클랜랭킹에 없다. 우리도 빼야 한다 — supply 1부가 22개여야 하는데
 *   경기에서 되짚으니 31개가 됐다(부리그를 몰라 기본값 1로 들어간 9개가 섞였다).
 *
 *   반대 방향도 마찬가지다. **경기가 한 건도 없는 등록 클랜도 원본은 랭킹에 띄운다.**
 *   랭킹 값(점수·승패·부리그)이 전부 목록에서 오므로 경기가 0건이어도 값은 완전하다.
 *   막고 있던 것은 "경기가 없으면 `Clan`·`LeagueClan` 행이 아예 안 만들어진다" 하나뿐이라,
 *   목록에 있는데 행이 없으면 **여기서 만든다.** daerule 1부가 15개여야 하는데 9개였다.
 *   선수는 다르다 — 선수는 경기가 있어야 존재하는 것이 맞다. 그대로 둔다.
 *
 * ── 배치고사
 *   선수: 미러 경기가 있으면 `placement = false` 다. 원본은 이들을 전부 랭킹에
 *   올리고 있다 — 캡처한 4,891경기 중 `placement:true` 가 0건이었다 (D-154).
 *   클랜: **수집 파일 클랜 목록에 있으면** `false`, 없으면 `true` 다.
 *   `true` 는 랭킹에서만 빠지는 표시다. **경기를 지우지 않는다** — 기록실에는 그대로 남는다.
 *
 * ── 결정성
 *   누적하지 않고 **처음부터 다시 계산해 덮어쓴다.** 두 번 돌려도 값이 두 배가 되지 않는다.
 *
 * ── 증분 (`since`)
 *   전수 재계산은 supply 13만 · sanply 20만 경기를 매번 훑는다. 새 경기 한두 건 때문에
 *   그러는 것은 낭비라 **바뀐 경기가 건드린 선수만** 다시 계산한다.
 *
 *   위험한 것은 "증분 = 더하기" 로 만드는 것이다. 같은 경기가 두 번 들어오면 값이 두 배가 되고,
 *   한 번 어긋나면 원인을 찾을 수 없다. 그래서 **더하지 않는다** —
 *   영향받은 선수를 골라내기만 하고, 그 선수의 값은 **그 리그 전 경기에서 처음부터 다시 만든다.**
 *   집계 함수(`accumulatePlayerRollups`)도 전수 경로와 **같은 것 하나**를 쓴다.
 *   그래서 증분 결과는 전수 결과와 **같을 수밖에 없고**, 두 번 돌려도 값이 변하지 않는다.
 *
 *   클랜은 애초에 경기를 되짚지 않는다 (D-157). 수집 파일 목록 값을 그대로 쓰므로
 *   증분이든 전수든 **하는 일이 완전히 같다.**
 *
 *   전수 경로를 없애지 않는다. 값이 어긋났을 때 되돌릴 길이 있어야 한다 — `--full` 이 그것이다.
 */
import { prisma } from '../src/index'
// 적재 잡과 **같은 상수**를 쓴다. 출처 문자열이 두 곳에서 갈라지면 집계가 조용히 0건이 된다
import { SUPPLY_ORIGIN } from './supplyMirrorImport'

/* --------------------------------- 입력 형 --------------------------------- */

/** 집계에 필요한 경기 정보만 추린 것 */
export interface RollupMatch {
  id: string
  startAt: Date
  /** "red" | "blue" */
  winnerSide: string
  redLeagueClanId: string
  blueLeagueClanId: string
  /** 원본이 그 경기 화면에 보여 준 클랜 점수. 한 경기에 **한쪽만** 채워져 있다 (실측) */
  redSourceRating: number | null
  blueSourceRating: number | null
}

/** 집계에 필요한 참가 기록만 추린 것 */
export interface RollupStat {
  matchId: string
  playerId: string
  /** "red" | "blue" */
  side: string
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  sourceRating: number | null
  /** 원본이 그 선수 자리에 붙여 준 소속 clan slug. 무소속이면 `null` */
  matchTimeClanSlug: string | null
}

/**
 * 순수 집계의 입력 한 줄. 경기와 참가 기록을 미리 합쳐 둔다 —
 * 테스트가 DB 모양(join)을 흉내 내지 않아도 되게 하려는 것이다.
 */
export interface PlayerRollupRow {
  playerId: string
  won: boolean
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  sourceRating: number | null
  /**
   * 그 경기 참가 기록에 적힌 소속 clan slug. **무소속이면 `null` 이고 그것도 값이다** —
   * `sourceRating` 과 달리 결측과 무소속을 구분할 근거가 없으므로 최신 경기의 값을 그대로 쓴다.
   */
  clanSlug: string | null
  /** 최신 판정용. 동시각이면 matchId 로 순서를 고정한다 */
  matchId: string
  startAt: Date
}

/** 클랜용 입력 한 줄. 경기 하나가 red·blue 두 줄이 된다 */
export interface ClanRollupRow {
  leagueClanId: string
  won: boolean
  sourceRating: number | null
  matchId: string
  startAt: Date
}

/* --------------------------------- 결과 형 --------------------------------- */

/** 어느 경기에서 점수를 가져왔는지 — 최신 비교의 기준 */
interface RatingPick {
  startAt: Date
  matchId: string
}

export interface PlayerRollup {
  /** 그 리그에서 뛴 경기 수 */
  games: number
  win: number
  lose: number
  /** 그중 K/D/A 를 아는 경기. 킬·데스·어시의 **분모**다 */
  knownStatGames: number
  /** 헤드샷을 아는 경기 — 위와 분모가 다를 수 있다 */
  knownHeadshotGames: number
  kill: number
  death: number
  assist: number
  headshot: number
  /** 가장 최근 경기의 원본 래더. 근거가 없으면 `null` = 쓰지 않는다 */
  rating: number | null
  ratingFrom: RatingPick | null
  /**
   * **가장 최근 경기**에 적힌 소속 clan slug = 그 선수의 현재 소속 (D-160).
   * 그 경기에 클랜이 없었으면 `null` — 무소속이다.
   */
  clanSlug: string | null
  clanFrom: RatingPick | null
}

/**
 * 선수 한 명의 "현재 소속" 근거 한 줄 (D-160).
 *
 * 리그별 집계 결과를 **리그를 넘어** 합칠 때 쓴다. `Player.clanId` 는 전역 칸이라
 * 리그마다 다른 답을 쓰면 마지막에 돌린 리그가 이기고, 실행 순서에 따라 값이 흔들린다.
 * 그래서 리그별로 고른 근거를 모아 **전체에서 가장 최근인 것 하나**를 고른다.
 */
export interface PlayerClanPick {
  /** 무소속이면 `null`. 그것도 값이다 */
  clanSlug: string | null
  startAt: Date
  matchId: string
}

export interface ClanRollup {
  games: number
  win: number
  lose: number
  rating: number | null
  ratingFrom: RatingPick | null
}

/* ------------------------------- 순수 집계 -------------------------------- */

export function emptyPlayerRollup(): PlayerRollup {
  return {
    games: 0,
    win: 0,
    lose: 0,
    knownStatGames: 0,
    knownHeadshotGames: 0,
    kill: 0,
    death: 0,
    assist: 0,
    headshot: 0,
    rating: null,
    ratingFrom: null,
    clanSlug: null,
    clanFrom: null,
  }
}

export function emptyClanRollup(): ClanRollup {
  return { games: 0, win: 0, lose: 0, rating: null, ratingFrom: null }
}

/**
 * 후보가 지금 고른 것보다 더 최근인가.
 *
 * 시각이 같은 경기가 실제로 있다(초 단위까지 같은 경기). 그때 순서가 흔들리면
 * 같은 입력에 다른 결과가 나온다. `matchId` 로 순서를 고정한다.
 */
function isNewer(current: RatingPick | null, candidate: RatingPick): boolean {
  if (!current) return true
  const diff = candidate.startAt.getTime() - current.startAt.getTime()
  if (diff !== 0) return diff > 0
  return candidate.matchId > current.matchId
}

/**
 * 참가 기록 → 선수별 집계. `into` 에 이어서 누적할 수 있다(청크 읽기용).
 *
 * `null` 인 kill/death/assist/headshot 는 **더하지 않는다.** 0으로 취급하면
 * "0킬을 했다"는 거짓이 되고 평균이 내려간다.
 *
 * `sourceRating` 은 **값이 있는 행 중 가장 최근 것**을 고른다.
 * 원본이 수집 시점의 현재 래더를 모든 행에 붙이므로(위 파일 주석), 최신 행이 곧
 * 그 선수의 현재 원본 래더다. 값이 없는 행은 근거가 아니라 결측이므로 건너뛴다 —
 * 최신 경기가 하필 결측이라는 이유로 아는 점수까지 버리지 않는다.
 *
 * `clanSlug` 는 반대로 **행을 가리지 않고 가장 최근 경기**의 값을 쓴다 (D-160).
 * 래더와 달리 `null` 이 "무소속" 이라는 실제 정보라, 값이 있는 행만 골라 버리면
 * 클랜을 나온 선수가 영영 예전 클랜에 남는다.
 */
export function accumulatePlayerRollups(
  rows: Iterable<PlayerRollupRow>,
  into: Map<string, PlayerRollup> = new Map(),
): Map<string, PlayerRollup> {
  for (const row of rows) {
    const acc = into.get(row.playerId) ?? emptyPlayerRollup()

    acc.games += 1
    if (row.won) acc.win += 1
    else acc.lose += 1

    if (row.kill !== null || row.death !== null || row.assist !== null) {
      acc.knownStatGames += 1
      if (row.kill !== null) acc.kill += row.kill
      if (row.death !== null) acc.death += row.death
      if (row.assist !== null) acc.assist += row.assist
    }
    if (row.headshot !== null) {
      acc.knownHeadshotGames += 1
      acc.headshot += row.headshot
    }

    const pick = { startAt: row.startAt, matchId: row.matchId }
    if (row.sourceRating !== null && isNewer(acc.ratingFrom, pick)) {
      acc.rating = row.sourceRating
      acc.ratingFrom = pick
    }
    if (isNewer(acc.clanFrom, pick)) {
      acc.clanSlug = row.clanSlug
      acc.clanFrom = pick
    }

    into.set(row.playerId, acc)
  }
  return into
}

/**
 * 리그별로 고른 "현재 소속" 근거를 합친다 — **전체에서 가장 최근인 것 하나**가 이긴다.
 *
 * 입력 순서에 결과가 흔들리면 안 된다. 시각이 같으면 `matchId` 로 순서를 고정한다
 * (`isNewer` 와 같은 규칙).
 */
export function mergePlayerClanPicks(
  into: Map<string, PlayerClanPick>,
  from: ReadonlyMap<string, PlayerClanPick>,
): Map<string, PlayerClanPick> {
  for (const [playerId, pick] of from) {
    const kept = into.get(playerId)
    if (!kept || isNewer({ startAt: kept.startAt, matchId: kept.matchId }, pick)) {
      into.set(playerId, pick)
    }
  }
  return into
}

/**
 * 경기 하나 → 클랜 두 줄.
 *
 * 원본은 한 경기에 **한쪽 진영의 점수만** 준다(실측: 양쪽 다 채워진 경기 0건).
 * 그래서 반대편은 `null` 이 되고, 그 클랜은 자기가 찍힌 다른 경기에서 점수를 얻는다.
 */
export function toClanRollupRows(match: RollupMatch): [ClanRollupRow, ClanRollupRow] {
  return [
    {
      leagueClanId: match.redLeagueClanId,
      won: match.winnerSide === 'red',
      sourceRating: match.redSourceRating,
      matchId: match.id,
      startAt: match.startAt,
    },
    {
      leagueClanId: match.blueLeagueClanId,
      won: match.winnerSide === 'blue',
      sourceRating: match.blueSourceRating,
      matchId: match.id,
      startAt: match.startAt,
    },
  ]
}

/** 클랜별 집계. 선수와 같은 규칙이다 — 최신 값 하나를 고르고 승패는 전부 센다 */
export function accumulateClanRollups(
  rows: Iterable<ClanRollupRow>,
  into: Map<string, ClanRollup> = new Map(),
): Map<string, ClanRollup> {
  for (const row of rows) {
    const acc = into.get(row.leagueClanId) ?? emptyClanRollup()

    acc.games += 1
    if (row.won) acc.win += 1
    else acc.lose += 1

    if (row.sourceRating !== null) {
      const pick = { startAt: row.startAt, matchId: row.matchId }
      if (isNewer(acc.ratingFrom, pick)) {
        acc.rating = row.sourceRating
        acc.ratingFrom = pick
      }
    }

    into.set(row.leagueClanId, acc)
  }
  return into
}

/* ------------------------------ 쓰기 데이터 준비 ------------------------------ */

/**
 * `LeaguePlayer` 에 쓸 값. **`undefined` 인 칸은 쓰지 않는다** — 기존 값을 보존한다.
 *
 * `ratingBefore` / `ratingUpdate` / `formulaVersion` / `baseRating` / `internalRating` 은
 * 여기 없다. 그건 우리 공식(D-145)의 값이고 이 잡의 소관이 아니다.
 */
export interface PlayerWriteData {
  rating?: number
  win: number
  lose: number
  kill?: number
  death?: number
  assist?: number
  headshot?: number
  /** 현재 소속 클랜 (D-160). 근거가 없으면 **칸 자체가 없다** */
  clanId?: string
  /** 점수 주인이 우리 공식이면 이 칸도 쓰지 않는다 (D-173) */
  placement?: false
}

/**
 * @param clanId 최신 경기의 클랜 slug 를 `Clan` 표에서 찾은 결과.
 *   무소속이거나 `Clan` 행이 없으면 `null`/`undefined` 를 넘긴다 — 칸을 쓰지 않는다.
 *   **여기서 클랜을 만들지 않는다** (3-A 8번).
 */
/**
 * 점수·배치 상태의 **주인이 우리 공식**일 때는 그 두 칸을 쓰지 않는다 (D-173).
 *
 * 시즌0부터 `LeaguePlayer.rating` 은 우리 공식(v2)이 계산한 값이다.
 * 이 잡은 30분마다 도는데, 그때마다 원본 점수로 되돌려 쓰면
 * **사이트가 30분 만에 원래대로 돌아간다.** 실제로 그 사고가 났다.
 *
 * 승패·킬데스 같은 **기록**은 계속 이 잡이 갱신한다. 점수만 손대지 않는다.
 */
export function ratingOwnedByFormula(): boolean {
  return process.env.SACLOUD_RATING_OWNER === 'formula'
}

export function toPlayerWriteData(
  rollup: PlayerRollup,
  clanId?: string | null,
): PlayerWriteData {
  /* 점수 주인이 우리 공식이면 `rating` · `placement` 를 쓰지 않는다 (D-173) */
  const formulaOwns = ratingOwnedByFormula()
  return {
    ...(!formulaOwns && rollup.rating !== null ? { rating: rollup.rating } : {}),
    ...(clanId ? { clanId } : {}),
    win: rollup.win,
    lose: rollup.lose,
    /* 아는 경기가 하나도 없으면 칸을 비워 둔다. 0을 써 넣으면 "0킬이다"가 된다 */
    ...(rollup.knownStatGames > 0
      ? { kill: rollup.kill, death: rollup.death, assist: rollup.assist }
      : {}),
    ...(rollup.knownHeadshotGames > 0 ? { headshot: rollup.headshot } : {}),
    // 미러 경기가 있으면 원본은 이미 랭킹에 올려 두었다 (D-154)
    ...(formulaOwns ? {} : { placement: false as const }),
  }
}

/**
 * 수집 파일 체크포인트의 클랜 한 줄 (D-157).
 *
 * `apps/worker/src/jobs/supplyMirror.ts` 의 `SupplyMirrorClan` 을 **읽기만** 한 것이다.
 * 원본 클랜랭킹 응답이 그대로 보여 주는 값이라 경기에서 되짚을 필요가 없다.
 */
export interface SupplyClanRegistryRow {
  /** 3rd.supply 클랜 slug. 우리 `Clan.slug` 와 같은 값이다 */
  slug: string
  name: string
  division: number
  rating: number | null
  win: number | null
  lose: number | null
  rank: number | null
  /** 원본 `clan.id` — `Clan.sourceClanId` 로 그대로 보존한다 (3-A 3번) */
  sourceClanId: string | null
  /** 원본 `league_clan.id` — `LeagueClan.sourceLeagueClanId` */
  sourceLeagueClanId: string | null
}

/** slug → 등록 클랜. **이 목록이 클랜랭킹의 모집단이다** */
export type SupplyClanRegistry = ReadonlyMap<string, SupplyClanRegistryRow>

/**
 * 등록 클랜에 쓸 값. `null` 인 칸은 쓰지 않는다 — 0으로 채우면 "0승 0패"라는 거짓이 남는다.
 *
 * `internalRating` / `compositionScore` / `activityPenalty` 는 여기 없다.
 * 그건 우리 공식(D-145)의 값이다.
 */
export interface ClanWriteData {
  rating?: number
  win?: number
  lose?: number
  division: number
  /** 점수 주인이 우리 공식이면 쓰지 않는다 (D-173) */
  placement?: false
}

export function toClanWriteData(row: SupplyClanRegistryRow): ClanWriteData {
  /* 개인과 같은 이유다 — 30분마다 원본 점수로 되돌려 쓰면 안 된다 (D-173).
     등급(division)과 승패는 계속 갱신한다. 점수와 배치 상태만 손대지 않는다 */
  const formulaOwns = ratingOwnedByFormula()
  return {
    ...(!formulaOwns && row.rating !== null ? { rating: row.rating } : {}),
    ...(row.win !== null ? { win: row.win } : {}),
    ...(row.lose !== null ? { lose: row.lose } : {}),
    division: row.division,
    // 수집 파일 목록에 있다 = 리그 등록 클랜이다. 원본 클랜랭킹에 올라 있다
    ...(formulaOwns ? {} : { placement: false as const }),
  }
}

/**
 * 체크포인트 JSON 의 `clans` → 등록 클랜 목록. **파일을 읽지 않는다** — 이미 읽은 값을 받는다.
 *
 * 모르는 모양은 조용히 넘기지 않고 **버린 수를 돌려준다.** 목록이 반쪽이면 멀쩡한 클랜이
 * 랭킹에서 빠지므로, 0건이 아니면 호출부가 멈춰 세워야 한다.
 */
export function parseClanRegistry(raw: unknown): {
  registry: SupplyClanRegistry
  dropped: number
} {
  const registry = new Map<string, SupplyClanRegistryRow>()
  let dropped = 0
  const clans = (raw as { clans?: unknown })?.clans
  if (!clans || typeof clans !== 'object') return { registry, dropped }

  for (const [slug, value] of Object.entries(clans as Record<string, unknown>)) {
    const row = value as Partial<SupplyClanRegistryRow>
    if (typeof slug !== 'string' || slug === '' || typeof row?.division !== 'number') {
      dropped += 1
      continue
    }
    const asNumberOrNull = (input: unknown): number | null =>
      typeof input === 'number' && Number.isFinite(input) ? input : null
    /* 원본 id 는 `supplyMirrorParse` 와 **같은 규칙**으로 문자열화한다.
       규칙이 갈라지면 같은 클랜이 두 행이 된다 */
    const asSourceId = (input: unknown): string | null => {
      if (typeof input === 'number' && Number.isFinite(input)) return String(Math.trunc(input))
      if (typeof input === 'string' && input.trim() !== '') return input.trim()
      return null
    }
    const raw = value as { clanId?: unknown; leagueClanId?: unknown }
    registry.set(slug, {
      slug,
      name: typeof row.name === 'string' ? row.name : slug,
      division: row.division,
      rating: asNumberOrNull(row.rating),
      win: asNumberOrNull(row.win),
      lose: asNumberOrNull(row.lose),
      rank: asNumberOrNull(row.rank),
      sourceClanId: asSourceId(raw.clanId),
      sourceLeagueClanId: asSourceId(raw.leagueClanId),
    })
  }
  return { registry, dropped }
}

/**
 * 목록에 없는 클랜을 랭킹에서 빼는 값.
 *
 * **점수·승패를 건드리지 않는다.** 상대 클랜으로만 등장한 클랜은 등록 클랜이 아니라
 * 원본 클랜랭킹에 없을 뿐, 그 경기가 가짜인 것은 아니다. 기록실에는 그대로 남는다.
 */
export const UNRANKED_CLAN_WRITE = { placement: true } as const

/* --------------------------------- 실행 --------------------------------- */

export interface SupplyRollupLeague {
  leagueId: string
  leagueSlug: string
  leagueName: string
  /** 이 리그의 미러 경기 수 */
  matches: number
}

export interface SupplyRollupResult extends SupplyRollupLeague {
  /**
   * `full` — 리그 전 경기를 훑었다.
   * `incremental` — 바뀐 경기가 건드린 선수만 다시 계산했다. **그 선수들의 값은 전수와 같다.**
   */
  mode: 'full' | 'incremental'
  /** 증분에서 기준이 된 경기 수 (`Match.ingestedAt >= since`). 전수면 `null` */
  changedMatches: number | null
  /** 읽은 참가 기록 수 */
  stats: number
  players: {
    aggregated: number
    created: number
    updated: number
    /** 원본 점수 근거가 있어 rating 을 쓴 선수 */
    withRating: number
    /** 근거가 없어 rating 을 **건드리지 않은** 선수 */
    withoutRating: number
    /** K/D/A 를 아는 경기가 하나도 없어 킬뎃 칸을 비워 둔 선수 */
    withoutKnownStats: number
    /** 최신 경기의 클랜을 `Clan` 표에서 찾아 `clanId` 를 쓴 선수 (D-160) */
    withClan: number
    /** 최신 경기에 클랜이 없다 = 무소속. 칸을 쓰지 않는다 */
    clanless: number
    /** 클랜 slug 는 있는데 `Clan` 표에 행이 없어 손대지 않은 선수. **만들지 않는다** */
    clanNotInDb: number
  }
  /**
   * 선수별 "현재 소속" 근거 (D-160). `Player.clanId` 를 쓰는 쪽이 리그를 넘어 합친다.
   * 이 잡 자체는 `LeaguePlayer.clanId` 까지만 책임진다.
   */
  playerClans: Map<string, PlayerClanPick>
  clans: {
    /**
     * 미러 경기에 등장한 클랜 (등록 여부와 무관).
     * **증분에서는 세지 않는다(0).** 리그 전 경기를 훑어야 나오는 진단용 숫자다.
     */
    inMatches: number
    /** 수집 파일 클랜 목록의 크기 = 원본 클랜랭킹의 모집단 */
    registered: number
    /** 랭킹에 올린 행 (`placement=false`) */
    ranked: number
    /** 목록에 없어 랭킹에서 뺀 행 (`placement=true`). 경기는 그대로 남는다 */
    unranked: number
    /** 목록에 rating 이 있어 점수를 쓴 클랜 */
    withRating: number
    /** 목록에는 있는데 rating 이 `null` 이라 점수를 건드리지 않은 클랜 */
    withoutRating: number
    /** 행이 없어 새로 만든(만들) `Clan` 수 — 경기가 아직 없는 등록 클랜이다 */
    clansCreated: number
    /** 행이 없어 새로 만든(만들) `LeagueClan` 수 */
    leagueClansCreated: number
    /**
     * **이미 있던 행**에 원본 `league_clan` id 를 채운 수 (3-A 3번).
     *
     * 예전에는 행을 **만들 때만** 그 값을 넣었다. 이미 있던 행은 클랜랭킹 응답이
     * 사이클마다 그 값을 들고 와도 그냥 버렸다 — 원본 id 를 버리지 말라는 규칙 위반이다.
     * 게다가 그 값이 비어 있으면 수집이 클랜마다 `/clans/{slug}/show` 를 다시 물어야 한다.
     * 실측: `supply` 등록 클랜 49개 중 44개가 비어 있었다.
     */
    sourceIdsFilled: number
    /** 같은 slug 인데 원본 클랜 id 가 달라 손대지 않은 수. 사람이 봐야 한다 */
    conflicts: number
    /**
     * 경기에서 되짚은 값과 원본 값이 다른 클랜 수 — 되짚기를 버린 근거다.
     * **증분에서는 세지 않는다(항상 0).** 되짚기 값을 만들려면 전 경기를 훑어야 하는데
     * 그 값은 어디에도 쓰이지 않는 진단용 숫자다.
     */
    ratingDiffersFromDerived: number
    /** 수집 파일을 못 읽어 클랜을 통째로 건너뛴 경우 */
    registryMissing: boolean
  }
}

/** 미러 경기가 있는 리그 목록 */
export async function listSupplyMirrorLeagues(): Promise<SupplyRollupLeague[]> {
  const grouped = await prisma.match.groupBy({
    by: ['leagueId'],
    where: { origin: SUPPLY_ORIGIN },
    _count: { _all: true },
  })
  if (grouped.length === 0) return []

  const leagues = await prisma.league.findMany({
    where: { id: { in: grouped.map((row) => row.leagueId) } },
    select: { id: true, slug: true, name: true },
  })
  const byId = new Map(leagues.map((row) => [row.id, row]))

  return grouped
    .flatMap((row) => {
      const league = byId.get(row.leagueId)
      if (!league) return []
      return [
        {
          leagueId: league.id,
          leagueSlug: league.slug,
          leagueName: league.name,
          matches: row._count._all,
        },
      ]
    })
    .sort((left, right) => right.matches - left.matches)
}

/** 한 번에 읽는 경기 수. 참가 기록은 그 10배쯤 된다 */
const MATCH_CHUNK = 2_000
/** 한 번에 보내는 쓰기 수 */
const WRITE_CHUNK = 500

export interface SupplyRollupInput {
  league: SupplyRollupLeague
  /**
   * 수집 파일 체크포인트의 클랜 목록 (D-157). **클랜랭킹의 모집단이자 점수의 출처다.**
   * 파일을 읽는 일은 호출부가 한다 — 이 모듈은 DB 말고 다른 IO 를 하지 않는다.
   * 없으면 클랜은 통째로 건너뛴다. 근거 없이 랭킹에서 빼 버리지 않기 위해서다.
   */
  clanRegistry?: SupplyClanRegistry
  confirm?: boolean
  /** 오래 걸리는 잡이라 진행 상황을 호출부가 찍을 수 있게 열어 둔다 */
  onProgress?: (done: number, total: number) => void
  /**
   * 증분 기준 시각. 이 시각 이후 **적재된**(`Match.ingestedAt`) 경기가 건드린 선수만
   * 다시 계산한다. `null`/생략이면 전수다.
   *
   * `startAt`(경기 시각)이 아니라 `ingestedAt`(우리가 넣은 시각)인 이유 —
   * 원본이 옛 경기를 뒤늦게 내줄 수 있고, 그때 기준이 경기 시각이면 그 경기는 영영 안 잡힌다.
   *
   * **넉넉하게 잡는 편이 안전하다.** 더 많이 잡으면 계산이 조금 늘 뿐이고,
   * 덜 잡으면 값이 조용히 낡는다. 사이클 하나가 실패해도 다음 사이클의 창이 겹쳐 스스로 낫는다.
   */
  since?: Date | null
}

/** 선수 집계에 필요한 참가 기록 + 그 경기 정보 (증분 경로용 join 결과) */
interface JoinedStatRow {
  playerId: string
  side: string
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  sourceRating: number | null
  matchTimeClanSlug: string | null
  match: { id: string; startAt: Date; winnerSide: string }
}

/**
 * 한 번에 `IN (...)` 으로 넘기는 선수 수.
 *
 * **500 이었다가 100 으로 내렸다.** 증분은 고른 선수의 *리그 전 경기*를 다시 읽는데,
 * 오래 뛴 선수는 한 명이 수천 경기다. 500명이면 한 번의 `findMany` 가 수십만 행이 되고
 * 그 상태로 Prisma 쿼리 엔진이 죽는다 — 실측으로 봤다:
 *
 *   daerule · 창에 걸린 경기 29,085건 · 영향 선수 4,094명
 *   → `memory allocation of 1605648 bytes failed` (프로세스 종료)
 *
 * 평소 사이클(창 24시간 · 영향 선수 수십 명)에서는 어느 값이든 한 배치로 끝나 차이가 없다.
 * 문제가 되는 것은 **오래 멈췄다가 한꺼번에 따라잡는 경우**뿐인데, 그때 죽지 않는 쪽이 낫다.
 * 배치를 잘게 나눠도 결과는 같다 — 누적 함수 하나에 이어서 넣을 뿐이다.
 */
const PLAYER_CHUNK = 100

/**
 * 후보 `LeagueClan` 중 **미러 경기에 실제로 나오는** 것만 골라낸다 (증분 경로용).
 *
 * 전수 경로는 경기를 다 훑으면서 알아내지만 증분은 그러지 않는다. 그렇다고 조건을
 * 빼 버리면 "경기가 한 건도 없는 미등록 클랜" 까지 랭킹에서 빼게 되어 전수와 답이 달라진다.
 * 후보 수는 리그당 수백 건이고 `[진영clanId, startAt desc]` 인덱스를 타므로 싸다.
 */
async function leagueClansWithMatches(
  leagueId: string,
  candidateIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  if (candidateIds.length === 0) return found
  const ids = [...candidateIds]
  const [red, blue] = await Promise.all([
    prisma.match.groupBy({
      by: ['redLeagueClanId'],
      where: { leagueId, origin: SUPPLY_ORIGIN, redLeagueClanId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.match.groupBy({
      by: ['blueLeagueClanId'],
      where: { leagueId, origin: SUPPLY_ORIGIN, blueLeagueClanId: { in: ids } },
      _count: { _all: true },
    }),
  ])
  for (const row of red) found.add(row.redLeagueClanId)
  for (const row of blue) found.add(row.blueLeagueClanId)
  return found
}

/**
 * 증분 — 바뀐 경기가 건드린 선수를 **처음부터 다시** 계산한다.
 *
 * 두 단계다.
 *   1. `ingestedAt >= since` 인 경기의 참가자 = 영향받은 선수
 *   2. 그 선수들의 **그 리그 전 경기** 참가 기록을 읽어 전수와 같은 함수로 누적
 *
 * 2단계가 핵심이다. 1단계 경기만 더하면 idempotent 가 아니다 —
 * 같은 경기를 두 번 넣으면 값이 두 배가 된다. 처음부터 다시 만들면 몇 번을 돌려도 같다.
 */
async function collectPlayersIncremental(input: {
  leagueId: string
  changedMatchIds: readonly string[]
  onProgress?: (done: number, total: number) => void
}): Promise<{ players: Map<string, PlayerRollup>; stats: number }> {
  const players = new Map<string, PlayerRollup>()
  let stats = 0
  if (input.changedMatchIds.length === 0) return { players, stats }

  /* 1) 영향받은 선수 */
  const touched = new Set<string>()
  const ids = [...input.changedMatchIds]
  for (let index = 0; index < ids.length; index += MATCH_CHUNK) {
    const rows = await prisma.matchPlayerStat.findMany({
      where: { matchId: { in: ids.slice(index, index + MATCH_CHUNK) } },
      select: { playerId: true },
      distinct: ['playerId'],
    })
    for (const row of rows) touched.add(row.playerId)
  }

  /* 2) 그 선수들의 리그 전 경기를 다시 읽는다.
     `MatchPlayerStat` 은 `[playerId, matchId]` 인덱스가 있어 선수 단위 조회가 싸다 */
  const playerIds = [...touched]
  for (let index = 0; index < playerIds.length; index += PLAYER_CHUNK) {
    const rows: JoinedStatRow[] = await prisma.matchPlayerStat.findMany({
      where: {
        playerId: { in: playerIds.slice(index, index + PLAYER_CHUNK) },
        match: { leagueId: input.leagueId, origin: SUPPLY_ORIGIN },
      },
      select: {
        playerId: true,
        side: true,
        kill: true,
        death: true,
        assist: true,
        headshot: true,
        sourceRating: true,
        matchTimeClanSlug: true,
        match: { select: { id: true, startAt: true, winnerSide: true } },
      },
    })
    stats += rows.length
    accumulatePlayerRollups(
      rows.map((row) => ({
        playerId: row.playerId,
        won: row.match.winnerSide === row.side,
        kill: row.kill,
        death: row.death,
        assist: row.assist,
        headshot: row.headshot,
        sourceRating: row.sourceRating,
        clanSlug: row.matchTimeClanSlug,
        matchId: row.match.id,
        startAt: row.match.startAt,
      })),
      players,
    )
    input.onProgress?.(Math.min(index + PLAYER_CHUNK, playerIds.length), playerIds.length)
  }

  return { players, stats }
}

/**
 * 리그 하나를 집계한다.
 *
 * 142만 행을 통째로 메모리에 올리지 않는다 — 경기를 `MATCH_CHUNK` 단위로 끊어 읽고
 * 그 청크의 참가 기록만 가져와 누적한다. 남는 것은 선수·클랜별 집계뿐이다.
 */
export async function rollupSupplyLeague(input: SupplyRollupInput): Promise<SupplyRollupResult> {
  const { league } = input
  const incremental = input.since instanceof Date
  let players = new Map<string, PlayerRollup>()
  const clans = new Map<string, ClanRollup>()
  let stats = 0
  let done = 0
  let changedMatches: number | null = null

  if (incremental) {
    /* 바뀐 경기 = 이 시각 이후 적재된 미러 경기. id 만 읽는다 */
    const changed = await prisma.match.findMany({
      where: {
        leagueId: league.leagueId,
        origin: SUPPLY_ORIGIN,
        ingestedAt: { gte: input.since as Date },
      },
      select: { id: true },
    })
    changedMatches = changed.length
    const collected = await collectPlayersIncremental({
      leagueId: league.leagueId,
      changedMatchIds: changed.map((row) => row.id),
      onProgress: input.onProgress,
    })
    players = collected.players
    stats = collected.stats
  }

  /* 전수 — 경기 id 커서로 끊어 읽는다. 정렬 기준이 유일 키라 청크 경계가 흔들리지 않는다.
     증분은 위에서 이미 끝났으므로 이 아래로 들어오지 않는다 */
  let cursor: string | null = null
  while (!incremental) {
    const matches: RollupMatch[] = await prisma.match.findMany({
      where: {
        leagueId: league.leagueId,
        origin: SUPPLY_ORIGIN,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: MATCH_CHUNK,
      select: {
        id: true,
        startAt: true,
        winnerSide: true,
        redLeagueClanId: true,
        blueLeagueClanId: true,
        redSourceRating: true,
        blueSourceRating: true,
      },
    })
    if (matches.length === 0) break
    cursor = matches[matches.length - 1]!.id

    const byId = new Map(matches.map((match) => [match.id, match]))
    for (const match of matches) accumulateClanRollups(toClanRollupRows(match), clans)

    const rows: RollupStat[] = await prisma.matchPlayerStat.findMany({
      where: { matchId: { in: matches.map((match) => match.id) } },
      select: {
        matchId: true,
        playerId: true,
        side: true,
        kill: true,
        death: true,
        assist: true,
        headshot: true,
        sourceRating: true,
        /* 현재 소속의 근거 (D-160). `MatchPlayerStat` 은 읽기만 하고 고치지 않는다 */
        matchTimeClanSlug: true,
      },
    })
    stats += rows.length

    accumulatePlayerRollups(
      rows.flatMap((row) => {
        const match = byId.get(row.matchId)
        if (!match) return []
        return [
          {
            playerId: row.playerId,
            won: match.winnerSide === row.side,
            kill: row.kill,
            death: row.death,
            assist: row.assist,
            headshot: row.headshot,
            sourceRating: row.sourceRating,
            clanSlug: row.matchTimeClanSlug,
            matchId: match.id,
            startAt: match.startAt,
          },
        ]
      }),
      players,
    )

    done += matches.length
    input.onProgress?.(done, league.matches)
    if (matches.length < MATCH_CHUNK) break
  }

  const result: SupplyRollupResult = {
    ...league,
    mode: incremental ? 'incremental' : 'full',
    changedMatches,
    stats,
    players: {
      aggregated: players.size,
      created: 0,
      updated: 0,
      withRating: 0,
      withoutRating: 0,
      withoutKnownStats: 0,
      withClan: 0,
      clanless: 0,
      clanNotInDb: 0,
    },
    playerClans: new Map(),
    clans: {
      inMatches: clans.size,
      registered: input.clanRegistry?.size ?? 0,
      ranked: 0,
      unranked: 0,
      withRating: 0,
      withoutRating: 0,
      clansCreated: 0,
      leagueClansCreated: 0,
      sourceIdsFilled: 0,
      conflicts: 0,
      ratingDiffersFromDerived: 0,
      registryMissing: !input.clanRegistry,
    },
  }

  for (const rollup of players.values()) {
    if (rollup.rating === null) result.players.withoutRating += 1
    else result.players.withRating += 1
    if (rollup.knownStatGames === 0) result.players.withoutKnownStats += 1
  }

  /* 현재 소속 (D-160). slug → `Clan.id` 는 **찾기만** 한다 — 없으면 만들지 않고 비워 둔다.
     클랜 수는 리그당 수백 건이라 한 번에 읽어도 된다 */
  for (const [playerId, rollup] of players) {
    if (rollup.clanFrom) {
      result.playerClans.set(playerId, {
        clanSlug: rollup.clanSlug,
        startAt: rollup.clanFrom.startAt,
        matchId: rollup.clanFrom.matchId,
      })
    }
  }
  const clanSlugs = [...new Set([...players.values()].flatMap((r) => (r.clanSlug ? [r.clanSlug] : [])))]
  const clanIdBySlugForPlayers = new Map<string, string>()
  if (clanSlugs.length > 0) {
    for (const row of await prisma.clan.findMany({
      where: { slug: { in: clanSlugs } },
      select: { id: true, slug: true },
    })) {
      clanIdBySlugForPlayers.set(row.slug, row.id)
    }
  }
  /** 그 선수에게 쓸 `clanId`. 근거가 없으면 `null` = 칸을 쓰지 않는다 */
  const clanIdOf = (rollup: PlayerRollup): string | null =>
    rollup.clanSlug ? (clanIdBySlugForPlayers.get(rollup.clanSlug) ?? null) : null

  for (const rollup of players.values()) {
    if (!rollup.clanSlug) result.players.clanless += 1
    else if (clanIdBySlugForPlayers.has(rollup.clanSlug)) result.players.withClan += 1
    else result.players.clanNotInDb += 1
  }

  const existingPlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.leagueId },
    select: { id: true, playerId: true },
  })
  const leaguePlayerOf = new Map(existingPlayers.map((row) => [row.playerId, row.id]))

  for (const playerId of players.keys()) {
    if (leaguePlayerOf.has(playerId)) result.players.updated += 1
    else result.players.created += 1
  }

  /* 클랜의 기준 집합은 **수집 파일 클랜 목록**이다 (D-157).
     경기가 하나도 없어도 원본은 등록 클랜을 랭킹에 띄운다. 그러니 경기 유무로 거르지 않는다.
     경기가 없으면 `Clan`·`LeagueClan` 행 자체가 없으므로 여기서 만든다.
     선수는 다르다 — 선수는 경기가 있어야 존재하는 것이 맞다. */
  const existingClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.leagueId },
    /* `sourceLeagueClanId` 도 읽는다 — 비어 있는 행을 채우기 위해서다 (3-A 3번) */
    select: {
      id: true,
      clanId: true,
      sourceLeagueClanId: true,
      clan: { select: { slug: true } },
    },
  })
  const leagueClanByClanId = new Map(existingClans.map((row) => [row.clanId, row.id]))
  const slugOfLeagueClan = new Map(existingClans.map((row) => [row.id, row.clan.slug]))
  /** 이미 원본 id 를 가진 행 — 비어 있는 것만 채운다 */
  const hasSourceId = new Set(
    existingClans.flatMap((row) => (row.sourceLeagueClanId === null ? [] : [row.id])),
  )

  /**
   * 원본 `league_clan` id 가 비어 있어 이번에 채울 행 (3-A 3번).
   *
   * 클랜랭킹 응답은 사이클마다 이 값을 들고 오는데, 예전에는 행을 **만들 때만** 넣고
   * 이미 있는 행에는 버렸다. 그 칸이 비면 수집이 클랜마다 `/clans/{slug}/show` 를
   * 다시 물어야 한다 — 실측으로 `supply` 등록 클랜 49개 중 44개가 비어 있었다.
   */
  const sourceIdFills: { id: string; sourceLeagueClanId: string }[] = []

  /** 이미 있는 행 → 원본 값으로 갱신 */
  const rankedWrites: { id: string; data: ClanWriteData }[] = []
  /** 행이 없어 새로 만들 등록 클랜 */
  const leagueClanCreates: { clanId: string | null; slug: string; data: ClanWriteData }[] = []
  /** `Clan` 행부터 없는 등록 클랜 */
  const clanCreates: { slug: string; name: string; sourceClanId: string | null }[] = []
  /** 목록에 없는데 경기에는 나온 클랜 → 랭킹에서만 뺀다 */
  const unrankedIds: string[] = []

  if (input.clanRegistry) {
    const registry = input.clanRegistry
    const slugs = [...registry.keys()]
    const sourceIds = [...registry.values()]
      .map((row) => row.sourceClanId)
      .filter((id): id is string => id !== null)

    /* `Clan` 은 전역 표다 — 다른 리그에서 이미 만들어졌을 수 있다. slug 와 원본 id 둘 다로 찾는다 */
    const clanRows = await prisma.clan.findMany({
      where: { OR: [{ slug: { in: slugs } }, { sourceClanId: { in: sourceIds } }] },
      select: { id: true, slug: true, sourceClanId: true },
    })
    const clanBySlug = new Map(clanRows.map((row) => [row.slug, row]))
    const clanBySourceId = new Map(
      clanRows.flatMap((row) => (row.sourceClanId ? [[row.sourceClanId, row] as const] : [])),
    )

    for (const [slug, row] of registry) {
      /* 원본 id 가 slug 보다 강한 근거다 — 클랜이 slug 를 바꿔도 같은 클랜이다 */
      const clan =
        (row.sourceClanId ? clanBySourceId.get(row.sourceClanId) : undefined) ??
        clanBySlug.get(slug)

      if (
        clan &&
        clan.sourceClanId &&
        row.sourceClanId &&
        clan.sourceClanId !== row.sourceClanId
      ) {
        /* 같은 slug 인데 원본 id 가 다르다. 어느 쪽이 맞는지 우리가 모른다 — 사람이 본다 */
        result.clans.conflicts += 1
        continue
      }

      const data = toClanWriteData(row)
      const leagueClanId = clan ? leagueClanByClanId.get(clan.id) : undefined
      if (leagueClanId) {
        rankedWrites.push({ id: leagueClanId, data })
        /* 원본 league_clan id 가 비어 있으면 이번에 채운다 (3-A 3번).
           이미 값이 있으면 **건드리지 않는다** — 원본 id 를 덮어쓰지 않는다 */
        if (!hasSourceId.has(leagueClanId) && row.sourceLeagueClanId !== null) {
          sourceIdFills.push({ id: leagueClanId, sourceLeagueClanId: row.sourceLeagueClanId })
        }
        /* 되짚기 값과 원본 값이 얼마나 어긋나는지 세어 둔다. 되짚기를 버린 근거다.
           증분에는 되짚기 값 자체가 없으므로 세지 않는다 — 0 과 "다르다" 를 혼동하면 안 된다 */
        if (!incremental && row.rating !== null && (clans.get(leagueClanId)?.rating ?? null) !== row.rating) {
          result.clans.ratingDiffersFromDerived += 1
        }
      } else {
        if (!clan) clanCreates.push({ slug, name: row.name, sourceClanId: row.sourceClanId })
        leagueClanCreates.push({ clanId: clan?.id ?? null, slug, data })
      }

      if (row.rating === null) result.clans.withoutRating += 1
      else result.clans.withRating += 1
    }

    /* 목록에 없는데 **경기에는 나오는** 클랜만 랭킹에서 뺀다.
       전수는 방금 훑은 경기에서 알고, 증분은 후보를 좁혀 DB 에 되묻는다 —
       "경기에 나온다" 라는 조건을 전수와 똑같이 지켜야 두 경로의 결과가 같아진다.
       (경기가 한 건도 없는 미등록 클랜은 전수도 건드리지 않는다) */
    const candidates = [...slugOfLeagueClan.entries()].flatMap(([id, slug]) =>
      registry.has(slug) ? [] : [id],
    )
    const inMatches = incremental
      ? await leagueClansWithMatches(league.leagueId, candidates)
      : new Set(clans.keys())
    for (const leagueClanId of candidates) {
      if (!inMatches.has(leagueClanId)) continue
      unrankedIds.push(leagueClanId)
    }

    result.clans.sourceIdsFilled = sourceIdFills.length
    result.clans.ranked = rankedWrites.length + leagueClanCreates.length
    result.clans.unranked = unrankedIds.length
    result.clans.clansCreated = clanCreates.length
    result.clans.leagueClansCreated = leagueClanCreates.length
  }

  if (!input.confirm) return result

  /* 새 선수부터 만든다. `createMany` 는 빠지는 칸에 스키마 기본값을 쓴다 —
     여기서는 "아직 모른다"와 기본값이 같은 자리라 그대로 둔다 */
  const toCreate = [...players]
    .filter(([playerId]) => !leaguePlayerOf.has(playerId))
    .map(([playerId, rollup]) => ({
      leagueId: league.leagueId,
      playerId,
      ...toPlayerWriteData(rollup, clanIdOf(rollup)),
    }))
  for (let index = 0; index < toCreate.length; index += WRITE_CHUNK) {
    await prisma.leaguePlayer.createMany({
      data: toCreate.slice(index, index + WRITE_CHUNK),
      skipDuplicates: true,
    })
  }

  const toUpdate = [...players].flatMap(([playerId, rollup]) => {
    const id = leaguePlayerOf.get(playerId)
    if (!id) return []
    return [
      prisma.leaguePlayer.update({ where: { id }, data: toPlayerWriteData(rollup, clanIdOf(rollup)) }),
    ]
  })
  for (let index = 0; index < toUpdate.length; index += WRITE_CHUNK) {
    await prisma.$transaction(toUpdate.slice(index, index + WRITE_CHUNK))
  }

  /* 없는 `Clan` 부터 만든다. **수집 파일이 준 값만 쓴다** —
     클랜마크·마스터·창단일은 이 목록에 없으므로 `null` 로 둔다 (3-A 8번 · D-034) */
  const clanIdBySlug = new Map<string, string>()
  for (const row of clanCreates) {
    const created = await prisma.clan.create({
      data: {
        slug: row.slug,
        name: row.name,
        ...(row.sourceClanId ? { sourceClanId: row.sourceClanId } : {}),
        origin: SUPPLY_ORIGIN,
      },
      select: { id: true },
    })
    clanIdBySlug.set(row.slug, created.id)
  }

  /* `sourceLeagueClanId` 는 **전역 unique** 다. 다른 리그가 이미 쓰고 있으면 비워 둔다 —
     남의 행을 뺏지도, 없는 값을 지어내지도 않는다 (D-155 와 같은 규칙).
     채우기와 만들기가 **같은 집합**을 봐야 서로 같은 값을 집지 않는다 */
  const taken =
    sourceIdFills.length > 0 || leagueClanCreates.length > 0
      ? new Set(
          (
            await prisma.leagueClan.findMany({
              where: { sourceLeagueClanId: { not: null } },
              select: { sourceLeagueClanId: true },
            })
          ).map((row) => row.sourceLeagueClanId as string),
        )
      : new Set<string>()

  /* 비어 있던 원본 league_clan id 를 채운다 (3-A 3번).
     `updateMany` + `sourceLeagueClanId: null` 조건으로 건다 — 읽은 뒤에 다른 잡이
     채웠으면 건드리지 않는다. 값이 이미 있는 행을 덮어쓰지 않기 위해서다 */
  for (const row of sourceIdFills) {
    if (taken.has(row.sourceLeagueClanId)) continue
    await prisma.leagueClan.updateMany({
      where: { id: row.id, sourceLeagueClanId: null },
      data: { sourceLeagueClanId: row.sourceLeagueClanId },
    })
    taken.add(row.sourceLeagueClanId)
  }

  if (leagueClanCreates.length > 0) {
    for (const row of leagueClanCreates) {
      const clanId = row.clanId ?? clanIdBySlug.get(row.slug)
      if (!clanId) {
        result.clans.conflicts += 1
        continue
      }
      const sourceLeagueClanId = input.clanRegistry?.get(row.slug)?.sourceLeagueClanId ?? null
      const usable = sourceLeagueClanId && !taken.has(sourceLeagueClanId) ? sourceLeagueClanId : null
      await prisma.leagueClan.create({
        data: {
          leagueId: league.leagueId,
          clanId,
          ...row.data,
          ...(usable ? { sourceLeagueClanId: usable } : {}),
        },
      })
      if (usable) taken.add(usable)
    }
  }

  const clanUpdates = [
    ...rankedWrites.map((row) => prisma.leagueClan.update({ where: { id: row.id }, data: row.data })),
    ...unrankedIds.map((id) =>
      prisma.leagueClan.update({ where: { id }, data: { ...UNRANKED_CLAN_WRITE } }),
    ),
  ]
  for (let index = 0; index < clanUpdates.length; index += WRITE_CHUNK) {
    await prisma.$transaction(clanUpdates.slice(index, index + WRITE_CHUNK))
  }

  return result
}

/* ------------------------ 전역 현재 소속 (`Player.clanId`) ------------------------ */

export interface SupplyPlayerClanResult {
  /** 근거가 있는 선수 (리그를 합친 뒤) */
  candidates: number
  /** 최신 경기에 클랜이 있고 `Clan` 표에서도 찾은 선수 */
  withClan: number
  /** 최신 경기에 클랜이 없다 = 무소속. 칸을 쓰지 않는다 */
  clanless: number
  /** 클랜 slug 는 있는데 `Clan` 표에 행이 없어 손대지 않은 선수 */
  clanNotInDb: number
  /** `origin` 이 3rd.supply 가 아니어서 손대지 않은 선수 */
  otherOrigin: number
  /** 이미 같은 값이라 쓸 것이 없던 선수 */
  unchanged: number
  /** 실제로 바꾼(바꿀) 행 */
  updated: number
}

/** 한 번에 `IN (...)` 으로 넘기는 id 수 */
const LOOKUP_CHUNK = 1_000

/**
 * 선수별 "현재 소속" 근거 → `Player.clanId` (D-160).
 *
 * ── 왜 리그 집계와 나눠 두는가
 *   `Player` 는 **전역 표**다. 리그마다 답이 다르면 마지막에 돌린 리그가 이겨서
 *   `--league` 를 무엇으로 주느냐에 따라 값이 흔들린다. 그래서 리그별 근거를
 *   `mergePlayerClanPicks` 로 합친 뒤 **한 번만** 쓴다.
 *
 * ── 남의 행을 건드리지 않는다
 *   `origin='3rd.supply'` 인 선수만 대상이다. 넥슨 경로로 들어온 선수의 소속을
 *   미러 값으로 덮어쓰면 근거가 다른 두 출처가 조용히 섞인다.
 *   조건은 읽을 때와 쓸 때 **양쪽에** 건다 — 사이에 다른 잡이 돌아도 안전하다.
 *
 * ── 지어내지 않는다
 *   무소속이거나 `Clan` 표에 그 클랜이 없으면 **칸을 쓰지 않는다.**
 *   클랜을 새로 만들지 않는다 (3-A 8번).
 *
 * `confirm` 이 없으면 한 줄도 쓰지 않고 숫자만 돌려준다.
 */
export async function applySupplyPlayerClans(input: {
  picks: ReadonlyMap<string, PlayerClanPick>
  confirm?: boolean
}): Promise<SupplyPlayerClanResult> {
  const result: SupplyPlayerClanResult = {
    candidates: input.picks.size,
    withClan: 0,
    clanless: 0,
    clanNotInDb: 0,
    otherOrigin: 0,
    unchanged: 0,
    updated: 0,
  }
  if (input.picks.size === 0) return result

  const slugs = [...new Set([...input.picks.values()].flatMap((p) => (p.clanSlug ? [p.clanSlug] : [])))]
  const clanIdBySlug = new Map<string, string>()
  for (let index = 0; index < slugs.length; index += LOOKUP_CHUNK) {
    for (const row of await prisma.clan.findMany({
      where: { slug: { in: slugs.slice(index, index + LOOKUP_CHUNK) } },
      select: { id: true, slug: true },
    })) {
      clanIdBySlug.set(row.slug, row.id)
    }
  }

  /** clanId → 그 값으로 바꿀 선수 id. 같은 값끼리 묶어 `updateMany` 한 번에 보낸다 */
  const byClanId = new Map<string, string[]>()
  const playerIds = [...input.picks.keys()]
  for (let index = 0; index < playerIds.length; index += LOOKUP_CHUNK) {
    const chunk = playerIds.slice(index, index + LOOKUP_CHUNK)
    const rows = await prisma.player.findMany({
      where: { id: { in: chunk } },
      select: { id: true, origin: true, clanId: true },
    })
    const known = new Map(rows.map((row) => [row.id, row]))
    for (const playerId of chunk) {
      const pick = input.picks.get(playerId)
      const row = known.get(playerId)
      if (!row) continue
      if (row.origin !== SUPPLY_ORIGIN) {
        result.otherOrigin += 1
        continue
      }
      if (!pick?.clanSlug) {
        result.clanless += 1
        continue
      }
      const clanId = clanIdBySlug.get(pick.clanSlug) ?? null
      if (!clanId) {
        result.clanNotInDb += 1
        continue
      }
      result.withClan += 1
      if (row.clanId === clanId) {
        result.unchanged += 1
        continue
      }
      result.updated += 1
      const bucket = byClanId.get(clanId)
      if (bucket) bucket.push(playerId)
      else byClanId.set(clanId, [playerId])
    }
  }

  if (!input.confirm) return result

  for (const [clanId, ids] of byClanId) {
    for (let index = 0; index < ids.length; index += WRITE_CHUNK) {
      await prisma.player.updateMany({
        // `origin` 조건을 쓸 때도 다시 건다 — 읽은 뒤에 바뀌었어도 남의 행을 건드리지 않는다
        where: { id: { in: ids.slice(index, index + WRITE_CHUNK) }, origin: SUPPLY_ORIGIN },
        data: { clanId },
      })
    }
  }

  return result
}
