import { prisma } from '@sacloud/db'
import {
  barracksUsnOf,
  clanAliasesOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  playerRefsFromBarracksUrl,
  searchClanNames,
  type ClanSummary,
  type GameMap,
  type LeagueSummary,
  type PlayerSearchItem,
} from '@sacloud/contract'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
} from '../mappers'
import { publicOriginWhere } from './publicScope'

/**
 * 통합검색 (플레이어 · 클랜 · 리그).
 *
 * Mock의 `store.ts`(`findXByName` / `searchX`)와 **같은 결과**를 내야 한다.
 * - `name/{name}` 은 **정확일치** 1건. 검색어를 그대로 제출했을 때 쓴다.
 * - `search/{q}` 는 **부분일치** 자동완성. 최대 10건.
 * - 빈 검색어는 조회하지 않고 빈 배열을 준다 (Mock과 동일).
 *
 * 정렬 기준 컬럼이 따로 없어 **고유 키(id) 오름차순**으로 고정한다 — 같은 검색어에 항상 같은 순서다.
 *
 * ── 대소문자를 구분하지 않는다
 *   예전에는 `contains` 기본값(대소문자 구분)을 썼다. JS `String.includes` 와 결과를
 *   맞추려던 것인데, **검색이 사실상 동작하지 않았다.** 사용자가 `Huwho` 를 넣었는데
 *   저장된 이름이 `huwho` 라 0건이 나왔다 (실측: `Huwho` 0건 · `huwho` 1건).
 *   닉네임을 사람이 손으로 치는 화면에서 이건 결함이다.
 *
 *   원본이 정확히 어떤 조건인지는 **[미확인]** 이다. 다만 "친 대로 안 나오면 안 된다"는
 *   쪽이 원본 동작에 더 가깝다고 보고 대소문자 무시로 정했다.
 *   Mock 쪽(`packages/mock`)도 같은 규칙으로 맞춰 두 모드의 응답이 어긋나지 않게 했다.
 */

/** 자동완성 노출 건수 (Mock 기본값과 동일). 원본의 실제 상한은 [미확인] */
const SEARCH_LIMIT = 10

/** 대소문자를 구분하지 않는 부분일치 조건 */
const ci = (value: string) => ({ contains: value, mode: 'insensitive' as const })
/**
 * 대소문자를 구분하지 않는 **접두어** 조건 (O-009 · 2026-09-02).
 *
 * `%q%` 는 두 글자에서 인덱스를 못 타는데(pg_trgm 은 세 글자로 조각을 만든다)
 * `q%` 는 앞을 공백으로 메워 조각이 생기므로 **몇 글자든 인덱스를 탄다.**
 */
const ciStarts = (value: string) => ({ startsWith: value, mode: 'insensitive' as const })

/**
 * 자동완성 여덟 칸 중 **부분일치에게 떼어 두는 자리** (O-009 · 2026-09-02).
 *
 * 접두어를 그냥 앞세우면 여덟 칸을 접두어가 다 먹는다 (`ts` 접두어 10건 · `xe` 11건).
 * 그러면 이름 뒤쪽으로 찾는 사람(23,562명 중 981명)이 한 줄도 안 나온다.
 * 화면 상한(`SUGGEST_MAX_ITEMS` = 8)과 짝이지만 **여기 값은 서버 몫**이라 따로 둔다.
 */
const RESERVED_FOR_CONTAINS = 3

/**
 * **화면이 실제로 그리는 줄 수** (`@sacloud/ui` 의 `SUGGEST_MAX_ITEMS` 와 같은 값).
 *
 * 서버는 10건을 주고 화면은 앞 8줄만 그린다. 이걸 모르고 10건 기준으로 자리를 떼면
 * **뗀 자리가 9·10번째에 놓여 아무에게도 안 보인다.** 실제로 그렇게 만들었다가
 * 로컬에서 재고 알았다 — `ts` 의 부분일치 전용이 3칸이 아니라 1칸이었다.
 *
 * ⚠ 두 곳에 같은 숫자가 있다. 화면 값을 바꾸면 여기도 바꾼다.
 *   서버가 `@sacloud/ui` 를 가져오지 않는 것이 이 저장소의 규칙이라 상수를 나눠 뒀다.
 */
const SUGGEST_VISIBLE = 8
/** 대소문자를 구분하지 않는 정확일치 조건 */
const ciEquals = (value: string) => ({ equals: value, mode: 'insensitive' as const })

/**
 * 검색어를 조회에 쓸 수 있게 다듬는다.
 *
 * 예전에는 `trim()` 하나였다. 붙여넣기에는 폭 없는 문자와 유니코드 공백이 딸려 오는데
 * 그것들이 남아 있으면 **정확일치가 조용히 0건**이 된다 (D-254).
 */
function keywordOf(query: string): string {
  return normalizePastedQuery(query)
}

/* -------------------------------- 플레이어 -------------------------------- */

/**
 * 닉네임이 유일하다는 보장이 없어(스키마에 `@unique` 없음) 동명이인이 있으면
 * id가 가장 앞선 1건을 준다. Mock이 배열에서 처음 찾은 항목을 주는 것과 같다.
 */
export async function findPlayerByName(name: string): Promise<PlayerSearchItem | null> {
  /* 붙여넣기에 딸려 온 공백·폭없는문자를 먼저 턴다. 이게 없으면 ` huwho ` 가 404 다 (D-254) */
  const keyword = keywordOf(name)
  if (!keyword) return null

  /* 병영수첩 주소를 그대로 붙여 넣으면 그 선수로 간다 (D-162).
     주소가 아니면 아래 닉네임 조회로 그대로 내려간다 */
  const fromUrl = await findPlayerByBarracksUrl(keyword)
  if (fromUrl) return fromUrl

  const player = await playerByName(keyword)
  if (player) return player

  /* 주소 없이 **계정 번호만** 붙여 넣은 경우 (`D9EBC75CCBD60C12SA`).
     닉네임 조회를 먼저 한 뒤에 본다 — 그런 닉을 쓰는 사람이 있다면 그쪽이 먼저다 (D-254) */
  const usn = barracksUsnOf(keyword)
  return usn ? playerByBarracksUsn(usn) : null
}

/** 닉네임 정확일치 1건 */
async function playerByName(name: string): Promise<PlayerSearchItem | null> {
  const player = await prisma.player.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

/**
 * 병영수첩 계정 번호(`str_usn`) → 우리 선수 (D-254).
 *
 * ── 계산으로는 못 간다. **저장된 짝**을 쓴다
 *   `str_usn` 은 병영수첩 세계의 키이고 우리 `Player.sourcePlayerId` 는 **숫자**
 *   (`user_nexon_sn`)다. 둘 사이를 잇는 계산식은 **없다** — `str_usn` 은 암호화된
 *   8바이트로 보인다 (실측: 짝 11개에서 어떤 선형 관계도 안 나왔다).
 *   그래서 아래 두 표를 순서대로 본다.
 *
 * ── 덮는 범위가 좁다. 숨기지 않는다
 *   운영 실측 2026-09-01: 이어진 계정 **473개 / 공개 선수 22,141명 (2.1%)**.
 *   나머지는 **찾지 못하는 게 맞다** — 없는 선수를 닉네임 추측으로 만들어 내지 않는다
 *   (CLAUDE.md 3-A 8번). 범위를 넓히려면 배틀로그 원문이나 클랜원 명단을 운영에
 *   적재해야 한다 (지금 운영의 `BarracksBattleLogRaw` · `BarracksClanMember` 는 0행이다).
 */
async function playerByBarracksUsn(usn: string): Promise<PlayerSearchItem | null> {
  const playerId =
    (await identityPlayerId(usn)) ??
    (await positionProfilePlayerId(usn)) ??
    (await clanMemberPlayerId(usn))
  if (!playerId) return null

  const player = await prisma.player.findFirst({
    where: { id: playerId, ...publicOriginWhere() },
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

/**
 * ① 신원 표 — **이 다리의 제자리다** (D-221 이 이 칸을 만들었다).
 *
 * 여기 있는 값은 `user/basic` 으로 **되돌려 확인**까지 끝난 것이라 가장 믿을 만하다.
 * 다만 운영에는 아직 **0행**이다 (2026-09-01 실측). 채워지면 아래 ②보다 먼저 걸린다 —
 * 코드를 다시 고칠 필요가 없게 지금부터 여기를 먼저 본다.
 */
async function identityPlayerId(usn: string): Promise<string | null> {
  const identity = await prisma.nexonIdentity.findFirst({
    where: { barracksUsn: usn, playerId: { not: null } },
    orderBy: [{ barracksLinkedAt: 'desc' }],
    select: { playerId: true },
  })
  return identity?.playerId ?? null
}

/**
 * ② 포지션 분포 표 — 운영에서 **지금 실제로 답을 주는 유일한 다리**다.
 *
 * 배틀로그 적재가 `str_usn` 을 키로 쓰면서 그때 `playerId` 를 이어 두었다
 * (`apps/worker/src/jobs/battlelog.ts` 의 `resolvePlayerId`).
 * 부산물이지 제자리가 아니다. ①이 채워지면 이 갈래는 보험으로 남는다.
 */
async function positionProfilePlayerId(usn: string): Promise<string | null> {
  const profile = await prisma.playerPositionProfile.findFirst({
    where: { userNexonSn: ciEquals(usn), playerId: { not: null } },
    orderBy: [{ computedAt: 'desc' }],
    select: { playerId: true },
  })
  return profile?.playerId ?? null
}

/**
 * ③ 클랜원 명단을 **두 계정 형식 사이의 다리**로 쓴다 (2026-09-02).
 *
 * ── 먼저 알아야 할 것: `userNexonSn` 이라는 이름의 칸이 **두 가지 값을 담고 있다**
 * ```
 * PlayerPositionProfile.userNexonSn   D596137C144C183CSA   ← str_usn (주소에 쓰이는 것)
 * PlayerRoundProfile.userNexonSn      218670718            ← user_nexon_sn (숫자)
 * ```
 * 이름이 같아서 **같은 열쇠로 착각하기 쉽다.** 실제로 나도 그렇게 오해해서
 * 「라운드 집계 표를 보면 계정이 1,280 → 5,656 으로 는다」고 판단했다가
 * 값의 모양을 재고 **틀렸다는 걸 알았다** — 운영 실측으로 라운드 표의 4,381개는
 * **전부 숫자 형식**이라 병영수첩 주소에는 한 번도 안 걸린다. 늘어나는 것은 0이었다.
 *
 * ── 진짜 다리는 `BarracksClanMember` 다
 *   그 표만 **두 값을 한 행에** 들고 있다 (`strUsn` · `userNexonSn`). D-221 이
 *   `str_usn D9EBC75CCBD60C12SA = user_nexon_sn 470379822` 로 실측해 둔 그 대응이다.
 *
 * ```
 * 주소의 str_usn → BarracksClanMember → user_nexon_sn → PlayerRoundProfile → playerId
 * ```
 *
 * ── 늘어나는 양 (2026-09-02 · 운영 실측)
 * ```
 * 명단 짝 2,796  →  그중 운영 라운드 표에 선수까지 이어진 것 1,135
 *                    그중 이미 ②로 되던 것              512
 *                    ★새로 찾을 수 있게 되는 계정        623
 * 주소로 찾을 수 있는 계정  1,275 → 1,898  (+49%)
 * ```
 *
 * ⚠ **닉네임으로 잇지 않는다.** 명단에 `userNick` 이 있지만 위장닉이 섞여 있어
 *   (D-221) 표시에도 조회에도 쓰지 않는다. 계정 번호로만 잇는다 —
 *   그래야 **틀린 사람이 뜨지 않는다.**
 *
 * ⚠ 그래도 «없으면 없는 것»은 그대로다. 1,898 개 밖의 계정은 **찾지 못하는 게 맞다.**
 *   더 넓히려면 배틀로그 원문을 운영에 적재해야 한다 (지금 `BarracksBattleLogRaw` 는 0행).
 */
async function clanMemberPlayerId(usn: string): Promise<string | null> {
  const member = await prisma.barracksClanMember.findFirst({
    where: { strUsn: ciEquals(usn) },
    orderBy: [{ observedAt: 'desc' }],
    select: { userNexonSn: true },
  })
  if (!member) return null

  const profile = await prisma.playerRoundProfile.findFirst({
    where: { userNexonSn: member.userNexonSn, playerId: { not: null } },
    orderBy: [{ computedAt: 'desc' }],
    select: { playerId: true },
  })
  return profile?.playerId ?? null
}

/**
 * 넥슨 병영수첩 주소로 선수를 찾는다.
 *
 * 주소에서 뽑은 후보를 **순서대로** 시도한다 — 계정 번호(ouid)가 먼저다.
 * 그게 사람의 확정 키이고, 닉네임은 바뀌거나 겹칠 수 있다.
 * 주소가 아니거나 우리 DB 에 없으면 `null` 이다. **없는 선수를 만들어 내지 않는다.**
 */
async function findPlayerByBarracksUrl(input: string): Promise<PlayerSearchItem | null> {
  if (!isBarracksUrl(input)) return null

  for (const ref of playerRefsFromBarracksUrl(input)) {
    /* `str_usn` 은 표를 한 번 더 거쳐야 한다 — 선수 표에 그 칸이 없다 (D-254) */
    if (ref.kind === 'usn') {
      const found = await playerByBarracksUsn(ref.value)
      if (found) return found
      continue
    }
    const where =
      ref.kind === 'ouid'
        ? { nexonOuid: ref.value, ...publicOriginWhere() }
        : { name: ciEquals(ref.value), ...publicOriginWhere() }
    const player = await prisma.player.findFirst({
      where,
      orderBy: [{ id: 'asc' }],
      select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
    })
    if (player) {
      return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
    }
  }
  return null
}

export async function searchPlayers(query: string): Promise<PlayerSearchItem[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  /* 자동완성에도 주소를 받는다. 주소를 붙여 넣는 중에 부분일치가 엉뚱하게 뜨면
     오히려 방해가 되므로, 주소로 찾은 결과가 있으면 **그것만** 준다 (D-162) */
  if (isBarracksUrl(keyword)) {
    const found = await findPlayerByBarracksUrl(keyword)
    return found ? [found] : []
  }

  /* 계정 번호만 붙여 넣은 경우도 같다 — 부분일치가 끼어들 여지가 없다 (D-254) */
  const usn = barracksUsnOf(keyword)
  if (usn) {
    const found = await playerByBarracksUsn(usn)
    return found ? [found] : []
  }

  /*
   * ══ 2026-09-02 (O-009) — **접두어 먼저 보고, 자리를 남겨 부분일치로 채운다** ══
   *
   * ── 왜 둘로 나눴나 (로컬 실측 · 선수 23,562명 · `Player_name_trgm_idx` 있음)
   *   ```
   *   부분일치 `%q%`   2글자  6.7ms  Seq Scan   ← pg_trgm 은 3글자로 조각을 만든다.
   *                    3글자  0.41ms Index         2글자 이하는 조각이 안 나와 인덱스를 못 쓴다
   *                    4글자  0.05ms Index
   *   접두어  `q%`     2글자  0.07ms Index      ← 앞쪽은 공백으로 메워 조각이 생긴다
   *   ```
   *   접두어는 **몇 글자든 인덱스를 탄다.** 그래서 접두어를 먼저 던지고, 부분일치는
   *   그 뒤를 채우게 한다. 결과 집합은 예전과 같고 **순서만** 접두어가 앞선다.
   *
   * ── ★자리를 반드시 남긴다★ (강민재 실측 · 2026-09-02)
   *   접두어를 그냥 앞세우면 **접두어가 여덟 칸을 다 먹는다.** 로컬에서 세어 봤다.
   *   ```
   *   ts   접두어 10건 · 부분일치 50건      xe   접두어 11건 · 부분일치 20건
   *   ```
   *   그러면 `SC1..안현수` 같은 사람이 **한 줄도 안 나온다.** 친구는 「안현수」로 찾는데
   *   그 이름은 접두어로 0건이다. 이름 23,562개 중 **1,729명(7.3%)이 이 모양**이다 —
   *   특수문자로 시작하거나(748명) 부르는 이름이 뒤에 있다(981명).
   *   그래서 **부분일치 전용 자리 `RESERVED_FOR_CONTAINS` 칸을 떼어 둔다.**
   *   부분일치 전용이 없으면 그 자리는 다시 접두어로 채운다 — 빈 줄을 남기지 않는다.
   *
   * ── 두 번 던지는 값이 있나
   *   3글자 이상이면 둘 다 인덱스라 합쳐도 0.1ms 다. 2글자면 부분일치가 6.7ms 인데
   *   **그건 고치기 전과 같은 값**이다 — 느려지지 않는다.
   */
  const select = { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } }
  const [prefixRows, containsOnlyRows] = await Promise.all([
    prisma.player.findMany({
      where: { name: ciStarts(keyword), ...publicOriginWhere() },
      orderBy: [{ id: 'asc' }],
      take: SEARCH_LIMIT,
      select,
    }),
    /*
     * ★두 번째 질의는 **접두어가 아닌 것만** 뽑는다.★
     *
     * 그냥 `%q%` 로 열 줄을 받으면 그 열 줄이 접두어와 거의 겹친다. 실측 —
     * `ts` 로 받은 열 줄 중 아홉이 접두어였고 **부분일치 전용은 한 줄뿐**이었다.
     * 그러면 자리를 세 칸 떼어 둬도 채울 것이 없어 규칙이 헛돈다.
     * 처음부터 접두어를 빼고 뽑으면 `SC1..안현수` 같은 사람이 확실히 자리를 얻는다.
     */
    prisma.player.findMany({
      where: {
        name: ci(keyword),
        NOT: { name: ciStarts(keyword) },
        ...publicOriginWhere(),
      },
      orderBy: [{ id: 'asc' }],
      take: SEARCH_LIMIT,
      select,
    }),
  ])

  const players = mixPrefixFirst(prefixRows, containsOnlyRows, SEARCH_LIMIT)
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    clan: toClanSummaryOrNull(player.clan),
  }))
}

/**
 * 접두어로 찾은 것을 앞세우되 **부분일치 전용 자리를 남겨** 합친다 (O-009).
 *
 * 위 `searchPlayers` 주석의 「자리를 반드시 남긴다」가 여기 규칙이다.
 * 순수 함수라 DB 없이 테스트한다 (`apps/web/tests/searchMix.test.ts`).
 */
export function mixPrefixFirst<T extends { id: string }>(
  prefix: readonly T[],
  contains: readonly T[],
  limit: number,
  visible: number = SUGGEST_VISIBLE,
): T[] {
  const inPrefix = new Set(prefix.map((row) => row.id))
  const onlyContains = contains.filter((row) => !inPrefix.has(row.id))

  /* 부분일치 전용이 없으면 자리를 뗄 이유가 없다 — 접두어로 끝까지 채운다 */
  const reserve = Math.min(RESERVED_FOR_CONTAINS, onlyContains.length)
  /* ★자리는 **화면이 그리는 줄 수** 안에서 뗀다.★ limit(10) 기준으로 떼면
     그 자리가 9·10번째에 놓여 화면(8줄)에 아예 안 나온다 */
  const head = prefix.slice(0, Math.max(0, Math.min(limit, visible) - reserve))
  const out = [...head, ...onlyContains.slice(0, limit - head.length)]

  /* 부분일치가 자리를 다 못 채웠으면 남은 접두어로 메운다. 빈 줄을 남기지 않는다 */
  if (out.length < limit) {
    const taken = new Set(out.map((row) => row.id))
    for (const row of prefix) {
      if (out.length >= limit) break
      if (!taken.has(row.id)) out.push(row)
    }
  }
  return out.slice(0, limit)
}

/* ---------------------------------- 클랜 ---------------------------------- */

/* ── 클랜명 색인 — 한글 읽기·별칭 검색을 위해 **이름만** 들고 있는다 ──────────────
 *
 * ── 왜 DB 질의만으로는 안 되는가
 *   `veritas` 를 「베리타스」로, `lpcrew` 를 「미라지」로 찾으려면 **이름을 읽어 봐야** 한다.
 *   그건 SQL `LIKE` 로 못 한다 — 규칙이 `@sacloud/contract` 의 `clanSearch.ts` 안에 있고,
 *   별칭 표(`clanAliases.ts`)는 아예 코드 상수다. DB 는 둘 다 모른다.
 *
 * ── 그래서 «이름표» 만 메모리에 둔다
 *   `id · slug · name` 셋뿐이다(클랜마크·티어 따위는 안 담는다). 실측 903곳 규모라
 *   한 줌이고, 걸린 것만 나중에 제대로 조회해 요약을 만든다.
 *
 * ── 5분마다 다시 만든다
 *   클랜이 새로 생기거나 이름을 바꿔도 5분 안에 따라온다. 자동완성은 타자마다 오는데
 *   그때마다 전수 조회를 하면 DB 가 그걸 다 받는다 (D-240 이 캐시를 붙인 이유와 같다).
 *
 * ── **실패해도 검색은 죽지 않는다**
 *   색인 질의가 깨지면 옛 색인을, 그것도 없으면 **빈 색인**을 쓴다.
 *   그러면 아래 `searchClans` 는 예전과 똑같이 DB 부분일치만으로 답한다.
 */
interface ClanIndexRow {
  id: string
  slug: string
  name: string
}

const CLAN_INDEX_TTL_MS = 5 * 60_000

let clanIndex: { rows: ClanIndexRow[]; expiresAt: number } | null = null
/** 같은 순간에 여러 요청이 들어와도 전수 조회는 한 번만 나간다 */
let clanIndexInFlight: Promise<ClanIndexRow[]> | null = null

async function clanNameIndex(): Promise<ClanIndexRow[]> {
  const cached = clanIndex
  if (cached && cached.expiresAt > Date.now()) return cached.rows
  if (clanIndexInFlight) return clanIndexInFlight

  clanIndexInFlight = prisma.clan
    .findMany({
      where: { ...publicOriginWhere() },
      orderBy: [{ id: 'asc' }],
      select: { id: true, slug: true, name: true },
    })
    .then((rows) => {
      clanIndex = { rows, expiresAt: Date.now() + CLAN_INDEX_TTL_MS }
      return rows
    })
    .catch(() => cached?.rows ?? [])
    .finally(() => {
      clanIndexInFlight = null
    })

  return clanIndexInFlight
}

/**
 * 이름 부분일치로는 안 걸리는 것들을 **더한다** — 한글 읽기 · 초성 · 별칭.
 *
 * **거르는 함수가 아니다.** 이미 나온 결과(`excludeIds`)는 손대지 않고 뒤에 붙일 것만 만든다.
 */
async function clansByReadingOrAlias(
  keyword: string,
  excludeIds: ReadonlySet<string>,
  take: number,
): Promise<ClanSummary[]> {
  if (take <= 0) return []

  const rows = await clanNameIndex()
  if (rows.length === 0) return []

  const hits = searchClanNames(
    rows,
    keyword,
    (row) => row.name,
    (row) => clanAliasesOf(row.slug),
  )
    .filter((row) => !excludeIds.has(row.id))
    .slice(0, take)
  if (hits.length === 0) return []

  /* 색인에는 요약에 필요한 칸이 없다. 걸린 것만 제대로 조회한다 */
  const found = await prisma.clan.findMany({
    where: { id: { in: hits.map((row) => row.id) }, ...publicOriginWhere() },
    select: CLAN_SUMMARY_SELECT,
  })
  const byId = new Map(found.map((clan) => [clan.id, clan]))

  /* 순서는 색인이 매긴 순서(잘 맞는 것부터)를 그대로 지킨다 */
  return hits.flatMap((row) => {
    const clan = byId.get(row.id)
    return clan ? [toClanSummary(clan)] : []
  })
}

/**
 * 클랜명 조회.
 *
 * ── 2026-09-01: **정확일치로 못 찾으면 한 번 더 본다**
 *   홈 통합검색은 엔터를 치면 이 함수를 부른다. 예전에는 여기서 정확일치만 봐서
 *   「베리타스」를 치면 아무 일도 일어나지 않았다 — 검색창 밑에 «한글로 읽어서 쳐도
 *   찾습니다» 라고 써 놓고 **실제로는 안 되던 상태**였다.
 *   이제 정확일치가 없을 때만 읽기·별칭으로 한 번 더 찾아 **가장 잘 맞는 1건**을 준다.
 *   정확일치가 있으면 그게 먼저다 — 기존 동작은 바뀌지 않는다.
 */
export async function findClanByName(name: string): Promise<ClanSummary | null> {
  const keyword = keywordOf(name)
  if (!keyword) return null

  /* 병영수첩 **클랜** 주소를 그대로 붙여 넣으면 그 클랜으로 간다 (D-254).
     우리 `Clan.slug` 가 곧 병영수첩 slug 다(스키마 주석). 선수 쪽은 D-162 로
     이미 되던 것이, 클랜 쪽은 규칙이 리그 관리 화면 안에만 있어서 안 됐다 */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) return clanBySlug(slug)

  const clan = await prisma.clan.findFirst({
    where: { name: ciEquals(keyword), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  if (clan) return toClanSummary(clan)

  const fallback = await clansByReadingOrAlias(keyword, EMPTY_IDS, 1)
  return fallback[0] ?? null
}

/** 병영수첩 slug 정확일치 1건 */
async function clanBySlug(slug: string): Promise<ClanSummary | null> {
  const clan = await prisma.clan.findFirst({
    where: { slug: ciEquals(slug), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  return clan ? toClanSummary(clan) : null
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

/**
 * 클랜 자동완성.
 *
 * ── 순서
 *   ① 지금까지 하던 **이름·slug 부분일치** (원본 주소를 그대로 붙여 넣는 흐름도 여기서 걸린다)
 *   ② 그다음에 **한글 읽기 · 초성 · 별칭**으로 걸린 것을 뒤에 붙인다
 *
 *   ①이 먼저이고 ②는 더하기만 한다 — **기존 결과는 하나도 사라지지 않는다.**
 */
export async function searchClans(query: string): Promise<ClanSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  /* 주소를 붙여 넣는 중에 부분일치가 끼어들면 방해가 된다 — 주소면 그 결과만 준다 (D-254).
     선수 자동완성이 D-162 부터 하던 것과 같은 규칙이다 */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) {
    const found = await clanBySlug(slug)
    return found ? [found] : []
  }

  const clans = await prisma.clan.findMany({
    where: { OR: [{ name: ci(keyword) }, { slug: ci(keyword) }], ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: CLAN_SUMMARY_SELECT,
  })
  const base = clans.map(toClanSummary)
  if (base.length >= SEARCH_LIMIT) return base

  const extra = await clansByReadingOrAlias(
    keyword,
    new Set(clans.map((clan) => clan.id)),
    SEARCH_LIMIT - base.length,
  )
  return [...base, ...extra]
}

/* ---------------------------------- 리그 ---------------------------------- */

export async function findLeagueByName(name: string): Promise<LeagueSummary | null> {
  /* 선수·클랜과 같은 규칙으로 다듬는다 — 세 갈래가 서로 다르게 굴면 안 된다 (D-254) */
  const keyword = keywordOf(name)
  if (!keyword) return null

  const league = await prisma.league.findFirst({
    where: { name: ciEquals(keyword), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: LEAGUE_SUMMARY_SELECT,
  })
  if (league) return toLeagueSummary(league)

  /*
   * ── 두 번째 시도: **slug 로도 한 번 더 본다** (O-003 · 2026-09-02)
   *
   * 화면 이름과 slug 가 다르다 — `SPL`/`supply` · `IPL`/`nolink` · `10mountain`/`sanply`.
   * 그런데 **주소창에는 slug 가 보인다.** 그것을 복사해 검색창에 치면 지금까지 404 였다
   * (B 운영 실측 2026-09-02 — `SPL` 200 · `supply` **404**).
   *
   * **이름이 먼저다.** slug 는 이름으로 못 찾았을 때만 본다 — 어떤 리그의 slug 가
   * 다른 리그의 이름과 같아지는 날이 와도 이름 쪽이 이긴다.
   * 자동완성(`searchLeagues`)은 이미 둘 다 보고 있었다. 여기만 안 보고 있었다.
   */
  const bySlug = await prisma.league.findFirst({
    where: { slug: ciEquals(keyword), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: LEAGUE_SUMMARY_SELECT,
  })
  return bySlug ? toLeagueSummary(bySlug) : null
}

export async function searchLeagues(query: string): Promise<LeagueSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const leagues = await prisma.league.findMany({
    where: { OR: [{ name: ci(keyword) }, { slug: ci(keyword) }], ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: LEAGUE_SUMMARY_SELECT,
  })
  return leagues.map(toLeagueSummary)
}

/* ------------------------------- 맵 목록 --------------------------------- */

/**
 * 리그 만들기 폼의 맵 선택 목록.
 *
 * 실제 맵 목록은 원본 조사 범위 밖이라 [미확인]이고, 시드에는 자리표시자 이름이 들어 있다.
 * 목록 자체가 소수(관측 규모 8개)라 페이지네이션 없이 전량을 준다 (Mock과 동일).
 */
export async function listMaps(): Promise<GameMap[]> {
  return prisma.gameMap.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  })
}
