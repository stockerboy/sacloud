/**
 * ★배지를 가진 사람 전부★ — 배지 페이지가 쓰는 질의 (2026-09-17 사장님).
 *
 * > «뱃지 클릭하면 해당선수 그 뱃지 가진사람중 몇등이고 누구누구가 이 뱃지 가지고있는지
 * >  선수목록 나오게끔 만들어줘»
 *
 * ── 「가진 사람」 이 누구인가
 *   화면에 ★배지를 다는★ 기준은 좁다 — 스나싸움 3위 · 나머지 5위 이내 (`PLAYER_HEX_BADGE_RANK`).
 *   그런데 이 페이지는 사장님이 «누구누구가 이 뱃지 가지고있는지» 라고 하셨으니
 *   ★그 축을 잴 수 있는 사람 전부★ 를 순위대로 보여준다. 배지가 실제로 달린 사람은
 *   `hasBadge` 로 따로 표시한다.
 *
 * ── 지어내지 않는다
 *   축 값이 `null` 인 선수는 ★목록에 안 넣는다★. 표본이 모자라 못 잰 것을 0% 로 줄 세우면
 *   맨 아래가 전부 «측정중» 인 사람으로 찬다 (D-106).
 */
import { prisma, Prisma } from '@sacloud/db'
import {
  BADGES,
  /*
   * ★지금 쓰는 문턱★ — 모집단의 2% (`playerHex.ts` 한 곳이 정한다).
   * ⚠ 옛 고정 컷(`PLAYER_HEX_BADGE_RANK`·`..._DUEL`)은 ★계약에 그대로 살아 있다★
   *   (CLAUDE.md 1-4). 되돌리려면 그 둘을 다시 들여와 쓰면 된다.
   */
  playerHexBadgeCut,
  type BadgeKey,
  type BadgeWeapon,
  type TraitAxisKey,
} from '@sacloud/contract'

import { AXIS_COLUMNS } from './playerHex'

export interface BadgeOwnerRow {
  rank: number
  playerId: string
  leaguePlayerId: string
  nickname: string
  clanName: string | null
  clanSlug: string | null
  clanMarkBgUrl: string | null
  clanMarkFrontUrl: string | null
  weapon: BadgeWeapon
  /** 축 원값 (%) */
  value: number
  games: number
  /** 화면에 배지가 실제로 달리는 사람인가 (스나싸움 3위 · 나머지 5위 이내) */
  hasBadge: boolean
}

export interface BadgeOwners {
  key: BadgeKey
  label: string
  note: string
  art: string
  /** 잰 사람 수 — 「몇 명 중 몇 등」의 분모 */
  total: number
  rows: BadgeOwnerRow[]
}

/**
 * 그 배지의 축은 무기마다 다를 수 있다 (`defender` 는 스나 `safe` · 라플 `gap`).
 * ★배지 정의가 정한다★ — 여기서 짝을 다시 적지 않는다.
 */
function axisOf(key: BadgeKey, weapon: BadgeWeapon): TraitAxisKey | null {
  const badge = BADGES[key]
  if (!badge.weapons.includes(weapon)) return null
  if (badge.axes.length === 1) return badge.axes[0] as TraitAxisKey
  /* 디펜딩챔피언만 둘이다 — 스나는 A방어(`safe`), 라플은 방어율(`gap`) */
  return weapon === 1 ? 'safe' : 'gap'
}

export async function badgeOwnersOf(
  leagueSlug: string,
  key: BadgeKey,
  limit = 200,
): Promise<BadgeOwners | null> {
  const badge = BADGES[key]
  if (!badge) return null
  const league = await prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true } })
  if (!league) return null

  /*
   * 무기마다 축(=DB 칸)이 다를 수 있어 ★무기별로 따로 읽고 합쳐서 줄을 세운다★.
   * 한 번에 읽으려면 칸 이름이 행마다 달라져야 해서 SQL 이 지저분해진다.
   */
  const rows: BadgeOwnerRow[] = []
  for (const weapon of badge.weapons) {
    const axis = axisOf(key, weapon)
    if (axis === null) continue
    const col = AXIS_COLUMNS[axis]
    const valueCol = Prisma.raw(`"${String(col.value)}"`)
    const got = await prisma.$queryRaw<
      {
        pid: string
        lpid: string
        nick: string
        clan: string | null
        slug: string | null
        bg: string | null
        front: string | null
        v: number
        g: number
      }[]
    >`
      SELECT p."id" AS pid, lp."id" AS lpid, p."name" AS nick,
             c."name" AS clan, c."slug" AS slug, c."markBgUrl" AS bg, c."markFrontUrl" AS front,
             h.${valueCol} AS v, h."games" AS g
        FROM "LeaguePlayerHex" h
        JOIN "LeaguePlayer" lp ON lp."id" = h."leaguePlayerId"
        JOIN "Player" p ON p."id" = lp."playerId"
        /* ⚠ LeaguePlayer 의 클랜 칸은 ★clanId★ 다 — leagueClanId 가 아니다.
           백틱은 이 SQL 템플릿 안에 쓸 수 없다 — 문장이 거기서 끝난다.
           2026-09-17 에 이 조인 하나로 배지 페이지가 통째로 500 이었다 */
        LEFT JOIN "Clan" c ON c."id" = lp."clanId"
       WHERE lp."leagueId" = ${league.id}
         AND h."weapon" = ${weapon}
         /* ★못 잰 사람은 안 넣는다★ — 0% 로 줄 세우지 않는다 */
         AND h.${valueCol} IS NOT NULL
       ORDER BY h.${valueCol} DESC, p."name" ASC
       LIMIT ${limit}`
    for (const r of got) {
      rows.push({
        rank: 0,
        playerId: r.pid,
        leaguePlayerId: r.lpid,
        nickname: r.nick,
        clanName: r.clan,
        clanSlug: r.slug,
        clanMarkBgUrl: r.bg,
        clanMarkFrontUrl: r.front,
        weapon,
        value: Number(r.v),
        games: Number(r.g),
        hasBadge: false,
      })
    }
  }

  /*
   * ★무기를 합쳐 한 줄로 세운다★ — 「소수싸움마스터」처럼 두 무기가 같이 받는 배지는
   * 한 목록이어야 «몇 명 중 몇 등» 이 말이 된다.
   * ⚠ 다만 배지가 ★실제로 달리는★ 기준은 무기 안에서의 등수다 (`duelRank` 등 워커가 매긴 값).
   *   여기서는 그 문턱을 ★무기별로 다시 센다★ — 그래야 화면의 배지와 목록의 표시가 맞는다.
   */
  rows.sort((a, b) => b.value - a.value || a.nickname.localeCompare(b.nickname))
  rows.forEach((r, i) => { r.rank = i + 1 })

  /*
   * ★★배지 문턱은 `playerHexBadgeCut` 하나가 정한다★★ (2026-09-20 비판 검수에서 잡았다)
   *
   * ── 무엇이 어긋나 있었나
   *
   *   2026-09-18 에 배지 기준이 ★상위 2%★ 로 바뀌었는데 ★이 파일에 안 닿았다.★
   *   여기는 옛 고정값(5위/3위)을 그대로 쓰고 있었다.
   *
   *   그래서 IPL 통합축 12위 선수가 —
   *     선수 페이지  배지 ★달림★ (2% = 18위까지)
   *     배지 목록    ★배지 없는 사람★ (12 > 5)
   *
   *   `rankColors.ts` 주석이 이 실패를 미리 적어 뒀다 —
   *   「두 곳이 갈라지면 «노란데 배지가 없네» 가 된다」. ★그대로 됐었다.★
   *
   * ⚠ ★무기마다 따로 센다★ — 배지는 무기 안에서의 등수로 달린다.
   *   그래서 문턱도 ★그 무기의 사람 수★ 로 낸다.
   * ⚠ ★`key` 는 축 이름으로 넘긴다★ — 계약은 축 이름(`duel`)으로 짝짓는데
   *   여기는 배지 이름(`snipeDuel`·`shotter`)으로 짝지어 왔다. 배지가 하나 더 생기면
   *   목록 쪽만 모른다.
   */
  const perWeapon: Record<number, number> = { 0: 0, 1: 0 }
  for (const r of rows) perWeapon[r.weapon] = (perWeapon[r.weapon] ?? 0) + 1
  /* ⚠ ★축은 무기마다 다를 수 있다★ (`axisOf(key, weapon)`) — 그래서 무기별로 구한다 */
  const cutOf: Record<number, number> = {
    0: playerHexBadgeCut(axisOf(key, 0) ?? key, perWeapon[0] ?? 0),
    1: playerHexBadgeCut(axisOf(key, 1) ?? key, perWeapon[1] ?? 0),
  }
  const seen: Record<number, number> = { 0: 0, 1: 0 }
  for (const r of rows) {
    seen[r.weapon] = (seen[r.weapon] ?? 0) + 1
    r.hasBadge = (seen[r.weapon] as number) <= (cutOf[r.weapon] ?? 0)
  }

  return {
    key,
    label: badge.label,
    note: badge.note,
    art: badge.art,
    total: rows.length,
    rows,
  }
}
