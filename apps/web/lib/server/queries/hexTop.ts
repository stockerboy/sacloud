/**
 * ★분야별 TOP5★ — 육각 여섯 축마다 그 리그의 다섯 손가락 (2026-09-14 사장님).
 *
 *   «추가로 페이지 하나 더 만들자 여기서는 클랜 , 개인6각 top5 보여주자 각 분야별 top5»
 *
 * ── 개인과 클랜이 등수를 구하는 길이 다르다
 *   ```
 *   개인   LeaguePlayerHex 에 축마다 `…Rank` 가 ★이미 저장돼 있다★ (워커가 잰다)
 *          → 그대로 다섯 줄만 꺼내면 된다. 여기서 다시 세지 않는다
 *   클랜   ClanHexV2Summary 는 ★원값★ 만 갖고 있다. 등수는 리그 분포를 봐야 나온다
 *          → 목록·뱃지와 ★같은 통로★(`clanHexV2`)를 쓴다. 두 곳에서 세면 어긋난다
 *   ```
 *
 * ── 못 잰 줄은 올리지 않는다 (D-106)
 *   표본이 모자라 `…Rank` 가 `null` 인 선수는 «5위 안» 이 아니라 «모른다» 다.
 *   다섯 자리가 안 차면 안 찬 대로 내린다 — 억지로 채우지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_HEX_V2_AXIS_KEYS,
  CLAN_HEX_V2_AXIS_LABELS,
  CLAN_HEX_V2_CONFIG,
  HEX_TOP_SIZE,
  PLAYER_HEX_AXIS_ORDER,
  buildClanHexV2Raw,
  normalizeByPercentile,
  playerHexLabelOf,
  type ClanHexTallyLike,
  type ClanHexV2,
  type HexTopAxis,
  type HexTopRow,
  type LeagueHexTop,
  type TraitAxisKey,
} from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
import { toClanSummary, toClanSummaryOrNull, toPlayerSummary } from '../mappers'

function tallyOf(value: unknown): ClanHexTallyLike | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ClanHexTallyLike
}

/**
 * 개인 축의 단위.
 *
 * ⚠ ★2026-09-15 — 캐리력이 «게임영향력» 이 되면서 퍼센트가 됐다.★
 *   옛 판은 «판당 킬» 이라 `${raw.toFixed(2)}킬` 로 적었다.
 *   지금은 «한 라운드에 적 다섯 중 몇 명» 이라 다른 축과 같은 % 다.
 */
function playerValueText(key: TraitAxisKey, raw: number | null): string {
  if (raw === null) return '알수없음'
  /*
   * ★선짤만 «판당 n.n회»★ 다 (2026-09-15 사장님). 나머지 다섯은 퍼센트다.
   *
   * ⚠ 같은 날 두 번 틀렸다 — ① 캐리력이 «판당 킬» 이라 «킬» 을 붙이던 것을
   *   게임영향력(%)으로 바꾸며 ★전부 %★ 로 만들었고, 그 바람에 선짤이 «2.0%» 가 됐다.
   *   축마다 단위가 다르다는 걸 한 줄로 뭉뚱그리면 이런 일이 난다.
   */
  if (key === 'opening') return `${raw.toFixed(1)}회`
  return `${raw.toFixed(1)}%`
}

/* -------------------------------------------------------------------------- */
/* 개인                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * ⚠ ★싸움 축은 무기를 섞으면 안 된다★ (2026-09-14 실측으로 찾은 버그).
 *
 *   싸움(`duel`)만 ★같은 무기끼리★ 견준다 (`playerHex.ts` 주석 — «IPL 스나수는
 *   141명뿐이다»). 그래서 스나 1위와 라플 1위가 ★둘 다 rank 1★ 이다.
 *   한 카드에 담았더니 이렇게 나왔다 —
 *   ```
 *     1  clarkk     69.4%
 *     1  십덕이:      64.4%   ← 1위가 둘
 *     2  [h].pinch  64.5%   ← 2위가 1위보다 높다
 *   ```
 *   ★두 카드로 나눈다.★ 스나싸움 · 라플싸움 각각 다섯 줄이다. 그래야 «160명 중»
 *   이라는 모집단 숫자도 그 카드의 진짜 모집단이 된다.
 */
const WEAPON_SPLIT: readonly TraitAxisKey[] = ['duel']
const WEAPONS: readonly (0 | 1)[] = [1, 0] /* 스나 먼저 — 사장님이 늘 스나를 앞에 두신다 */

async function playerTop(leagueId: string): Promise<HexTopAxis[]> {
  const out: HexTopAxis[] = []
  for (const key of PLAYER_HEX_AXIS_ORDER) {
    if (WEAPON_SPLIT.includes(key)) {
      for (const weapon of WEAPONS) out.push(await playerAxis(leagueId, key, weapon))
      continue
    }
    out.push(await playerAxis(leagueId, key, null))
  }
  return out
}

async function playerAxis(
  leagueId: string,
  key: TraitAxisKey,
  weapon: 0 | 1 | null,
): Promise<HexTopAxis> {
  {
    /*
     * ★저장된 등수를 그대로 믿는다.★ 워커가 잰 값이고, 선수 상세·랭킹 배지가
     * 같은 칸을 본다. 여기서 다시 세면 화면끼리 다른 말을 하게 된다.
     */
    const rows = await prisma.leaguePlayerHex.findMany({
      where: {
        leaguePlayer: { leagueId },
        ...(weapon === null ? {} : { weapon }),
        [`${key}Rank`]: { lte: HEX_TOP_SIZE, gt: 0 },
      },
      select: {
        leaguePlayerId: true,
        weapon: true,
        [key]: true,
        [`${key}Rank`]: true,
        [`${key}Pct`]: true,
        [`${key}Total`]: true,
        leaguePlayer: {
          select: { id: true, player: true, clan: true },
        },
      } as never,
      orderBy: { [`${key}Rank`]: 'asc' },
      take: HEX_TOP_SIZE,
    })

    const list = rows as unknown as {
      leaguePlayerId: string
      weapon: number | null
      leaguePlayer: { id: string; player: Parameters<typeof toPlayerSummary>[0]; clan: Parameters<typeof toClanSummaryOrNull>[0] }
      [k: string]: unknown
    }[]

    const built: HexTopRow[] = list.map((row) => ({
      rank: Number(row[`${key}Rank`] ?? 0),
      player: toPlayerSummary(row.leaguePlayer.player),
      clan: toClanSummaryOrNull(row.leaguePlayer.clan),
      league_player_id: row.leaguePlayerId,
      league_clan_id: null,
      value: playerValueText(key, (row[key] as number | null) ?? null),
      percentile: (row[`${key}Pct`] as number | null) ?? null,
    }))

    return {
      /* 무기로 나눈 축은 열쇠도 나눈다 — 화면이 두 카드를 같은 것으로 보면 안 된다 */
      key: weapon === null ? key : `${key}:${weapon}`,
      /* 이름은 무기가 정한다. 안 나눈 축은 첫 줄의 무기를 따르고, 모르면 스나 쪽 이름이다 */
      label: playerHexLabelOf(key, weapon ?? firstWeaponOf(list)),
      total: (list[0]?.[`${key}Total`] as number | null) ?? null,
      rows: built,
    }
  }
}

function firstWeaponOf(list: readonly { weapon: number | null }[]): 0 | 1 | null {
  const w = list[0]?.weapon
  return w === 0 || w === 1 ? w : null
}

/* -------------------------------------------------------------------------- */
/* 클랜                                                                         */
/* -------------------------------------------------------------------------- */

async function clanTop(leagueId: string): Promise<HexTopAxis[]> {
  const summaries = await prisma.clanHexV2Summary.findMany({
    where: { leagueId, formulaVersion: CLAN_HEX_V2_CONFIG.formulaVersion },
    select: { leagueClanId: true, tally: true, matches: true },
  })
  if (summaries.length === 0) return []

  const raw = new Map<string, ClanHexV2>()
  for (const row of summaries) {
    raw.set(row.leagueClanId, buildClanHexV2Raw({ tally: tallyOf(row.tally), matches: row.matches }))
  }
  const pool = [...raw.values()]

  const clans = await prisma.leagueClan.findMany({
    where: { leagueId, id: { in: [...raw.keys()] } },
    select: { id: true, clan: true },
  })
  const clanOf = new Map(clans.map((c) => [c.id, c.clan]))

  /** leagueClanId → 정규화된 육각 (축마다 `rank` 가 들어 있다) */
  const norm = new Map<string, ClanHexV2>()
  for (const [id, hex] of raw) norm.set(id, normalizeByPercentile(hex, pool))

  const out: HexTopAxis[] = []
  for (let i = 0; i < CLAN_HEX_V2_AXIS_KEYS.length; i += 1) {
    const key = CLAN_HEX_V2_AXIS_KEYS[i] as (typeof CLAN_HEX_V2_AXIS_KEYS)[number]
    const picked = [...norm.entries()]
      .map(([id, hex]) => ({ id, axis: hex.axes[i] ?? null }))
      .filter((x) => x.axis !== null && x.axis.rank !== null && x.axis.rank <= HEX_TOP_SIZE)
      .sort((a, b) => (a.axis?.rank ?? 0) - (b.axis?.rank ?? 0))
      .slice(0, HEX_TOP_SIZE)

    const rows: HexTopRow[] = []
    for (const { id, axis } of picked) {
      const clan = clanOf.get(id)
      if (clan === undefined || axis === null) continue
      rows.push({
        rank: axis.rank ?? 0,
        player: null,
        clan: toClanSummary(clan),
        league_player_id: null,
        league_clan_id: id,
        /* 축마다 단위가 다르다(비율 · 초 · 라운드당 킬수). 계약이 이미 글자로 만들어 뒀다 */
        value: axis.text,
        percentile: axis.value === null ? null : axis.value * 100,
      })
    }

    out.push({
      key,
      label: CLAN_HEX_V2_AXIS_LABELS[key],
      total: picked[0]?.axis?.total ?? null,
      rows,
    })
  }
  return out
}

/* -------------------------------------------------------------------------- */

export async function leagueHexTop(leagueSlug: string): Promise<LeagueHexTop | null> {
  const league = await prisma.league.findFirst({
    where: { slug: leagueSlug },
    select: { id: true },
  })
  if (league === null) return null

  /**
   * ★클랜 기록을 안 주는 리그는 클랜 자리를 비운다★ (2026-09-14 사장님:
   * «열산은 클랜 기록 미제공»). 화면이 또 판단하지 않게 서버가 빈 배열을 내린다.
   */
  const wantsClan = leagueScreen(leagueSlug).clanRank

  const [clan, player] = await Promise.all([
    wantsClan ? clanTop(league.id) : Promise.resolve<HexTopAxis[]>([]),
    playerTop(league.id),
  ])
  return { clan, player }
}
