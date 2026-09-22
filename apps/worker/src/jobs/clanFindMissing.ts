import { prisma } from '@sacloud/db'

import { log, warn } from '../lib/log.js'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'

/**
 * ★★모르는 클랜의 주소를 병영에서 찾아온다★★ (2026-09-22 · 사장님 지시)
 *
 * > 「경기 40분 후에도 ★킬데스 수집조차 안 된★ 이런 경기들 싹다 명단채우고 분석 끝내놔」
 * > 「열산 3rd.supply에서 ★모든 3부 클랜들 다 열산고용가능클랜에 때려박고★」
 *
 * ── 무엇이 막고 있었나 (실측 2026-09-22)
 *
 *   ```
 *   40분 넘게 킬데스가 없는 경기   ★25건★
 *   그 25건이 막힌 까닭            ★전부 clan_unmapped★ (IPL 19 · 열산 6)
 *   ```
 *   ★상대 클랜을 우리가 모른다.★ 그래서 명단을 한 줄도 못 만들고,
 *   화면에는 영영 「킬데스 수집중」 이 떠 있었다.
 *
 * ── ⚠ ★경기 원문에는 상대 클랜 주소가 없다★
 *
 *   red_clan_name · red_clan_mark1/2 는 있고, red_clan_id 는 ★없다★.
 *   그래서 `sanply-clan-fill` 은 ★이미 아는 클랜을 명단에 올리는 데까지★ 만 했다.
 *   이름만으로 만들면 `＃chasepIay`(대문자 I)와 `＃chaseplay`(소문자 l)처럼
 *   눈으로 구별이 안 되는 ★가짜 클랜★ 이 하나 더 생긴다 (D-221).
 *
 * ── 이 잡이 그 주소를 찾아온다
 *
 *   POST /api/Search/GetSearchClanAll/{이름}/1
 *     → clan_id · clan_name · clan_mark1 · clan_mark2
 *
 *   ★clan_id 가 곧 우리가 쓰는 slug 다★ (`iplMarkFill.ts` 가 2026-08-31 에 확인했다).
 *
 *   ★이름이 같고 마크도 같은 하나★ 만 받아들인다:
 *     후보 0곳       → 못 찾았다 (세기만 한다)
 *     마크 맞음 1곳  → ★이것만 만든다★
 *     마크 맞음 2곳+ → 안 만든다 — 어느 쪽인지 모른다 (D-106)
 *
 * ── 지키는 것
 *
 *   ⚠ ★이름만 보고 만들지 않는다.★ 마크까지 같아야 한다
 *   ⚠ ★이미 있는 클랜은 안 건드린다★ — 이름·마크를 여기서 고치지 않는다
 *   ⚠ ★기록을 만들지 않는다★ — 클랜 한 줄과 명단 한 줄뿐이다.
 *     참가 기록은 `battlelog-lineup` 이 다음 판에 알아서 만든다
 *   ⚠ ★막히면(403/429) 그 자리에서 멈춘다★ — 우회하지 않는다 (D-266)
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-find-missing             # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-find-missing --confirm
 * pnpm --filter @sacloud/worker nexon clan-find-missing --limit 10
 * ```
 */

/**
 * ── ⚠⚠ ★★2026-09-22 — 이 잡은 기본으로 꺼져 있다★★ ⚠⚠
 *
 * > 「리그에 등록된 클랜끼리(IPL vs IPL · pl vs pl · 열산vs열산) 이런 퀵매치만
 * >  기록해야지 ★뭔 개잡사들이랑 한걸 다 기록하고 있어★」 — 사장님
 *
 * ★내가 방향을 잘못 잡았다.★ 「킬데스 수집중이 안 풀린다」 를 고치려고
 * ★상대 클랜을 만들어 리그에 등록★ 했는데, 그것이 ★기록하면 안 되는 경기를
 * 기록하게 만드는 문★ 이었다.
 *
 *   규칙은 원래 맞았다 — `verdictFromSides` 는 ★양쪽 다 등록 + 같은 리그★ 일 때만
 *   경기를 만든다. 등록 안 된 클랜과 한 경기는 ★안 만드는 것이 정답★ 이고,
 *   그래서 「킬데스 수집중」 으로 남는 것도 ★정답★ 이었다.
 *
 *   실측 — 내가 올린 등록 23줄 때문에 ★115경기★ 가 기록됐다 (되돌렸다).
 *
 * ★그래서 ①③④(클랜 만들기·리그에 올리기)는 꺼 둔다.★
 * ②(번호 받아 적기)만 남긴다 — 번호는 ★이미 등록된 클랜★ 의 것이라 문을 안 연다.
 *
 * ⚠ 지우지 않는다 (`CLAUDE.md` 1-4). 사장님이 「이 클랜은 등록해」 하시면
 *   `CLAN_FIND_CREATE=1` 로 한 판 돌리면 된다.
 */
export const CREATE_MISSING_CLANS = process.env.CLAN_FIND_CREATE === '1'

/** 병영에 물어보는 간격 — 수집과 같은 약속이다 */
const DELAY_MS = 1500

export interface ClanFindMissingResult {
  /** 클랜을 몰라 막혀 있는 경기 수 */
  strandedMatches: number
  /** 그 경기들에 나온 «우리가 모르는» 클랜 수 */
  unknownClans: number
  /** 병영 검색으로 주소를 찾아낸 수 */
  found: number
  /** 실제로 만든 클랜 */
  created: number
  /** 리그 명단에 올린 수 */
  joined: number
  /** 이름은 찾았는데 마크가 안 맞아 못 고른 수 */
  ambiguous: number
  /** 검색에 한 곳도 안 나온 수 */
  notFound: number
  /** 클랜 번호까지 받아 적은 수 — ★이게 있어야 명단이 이어진다★ */
  numbered: number
  /** ③ 번호는 아는데 그 리그 명단에 없어서 막히던 클랜을 올린 수 */
  joinedByNumber: number
  /** ④ 경기 원문으로 «이 번호는 저 클랜» 을 알아내 적은 수 */
  inferredNumbers: number
  blocked: boolean
  confirmed: boolean
  samples: string[]
}

interface Candidate {
  clanId: string
  clanName: string | null
  mark1: string | null
  mark2: string | null
}

const trimmed = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 병영 검색 응답에서 후보를 꺼낸다.
 *
 * ⚠ ★껍데기 이름을 모른다★ — 응답이 배열일 수도, 감싸인 객체일 수도 있다.
 *   그래서 ★clan_id 를 가진 객체를 통째로 훑어 모은다.★ 모양을 지어내지 않는다.
 */
export function candidatesOf(doc: unknown): Candidate[] {
  const out: Candidate[] = []
  const walk = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    const rec = node as Record<string, unknown>
    const id = trimmed(rec.clan_id)
    if (id !== null) {
      out.push({
        clanId: id,
        clanName: trimmed(rec.clan_name),
        mark1: trimmed(rec.clan_mark1),
        mark2: trimmed(rec.clan_mark2),
      })
    }
    for (const value of Object.values(rec)) walk(value, depth + 1)
  }
  walk(doc, 0)
  return out
}

/**
 * ★★클랜 번호를 같이 받아 적는다★★ (2026-09-22 실측으로 알았다)
 *
 * 클랜 22곳을 만들고 명단을 돌렸더니 ★그래도 clan_unmapped★ 였다.
 * 명단 잡은 클랜을 ★이름이 아니라 번호(`clanNo`)로 잇기 때문★ 이다 —
 * 새로 만든 클랜에는 번호가 없어서 여전히 못 이었다.
 *
 * ```
 * POST /api/ClanHome/GetClanInfo/{slug}  {}  →  { clan_no }
 * ```
 * ⚠ ★한 번호에 한 클랜★ 이다 (기본키). 이미 남의 것이면 ★덮지 않는다★ —
 *   같은 병영 클랜이 우리 DB 에 두 줄인 경우가 있다 (`barracksRoster.ts` 와 같은 규칙).
 */
async function fillClanNumber(clanId: string, slug: string): Promise<boolean> {
  try {
    const res = await barracksBrowser().call(
      'POST',
      `/api/ClanHome/GetClanInfo/${encodeURIComponent(slug)}`,
      '{}',
    )
    if (res.status !== 200) return false
    const clanNo = trimmed((JSON.parse(res.body) as { clan_no?: unknown }).clan_no)
    if (clanNo === null) return false
    await prisma.$executeRaw`
      INSERT INTO "BarracksClanNumber" ("clanNo","clanId","source","votes","linkedAt")
      VALUES (${clanNo}, ${clanId}, 'clanhome', 1, NOW())
      ON CONFLICT ("clanNo") DO NOTHING`
    return true
  } catch {
    return false
  }
}

interface Missing {
  name: string
  bg: string | null
  front: string | null
  leagueIds: string[]
}

export async function runClanFindMissing(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<ClanFindMissingResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? 40

  const result: ClanFindMissingResult = {
    strandedMatches: 0,
    unknownClans: 0,
    found: 0,
    created: 0,
    joined: 0,
    ambiguous: 0,
    notFound: 0,
    numbered: 0,
    joinedByNumber: 0,
    inferredNumbers: 0,
    blocked: false,
    confirmed: confirm,
    samples: [],
  }

  /*
   * 클랜을 몰라 막힌 경기의 원문에서 ★양쪽 클랜★ 을 뽑는다.
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  const rows = await prisma.$queryRaw<
    { name: string | null; bg: string | null; front: string | null; leagueid: string }[]
  >`
    SELECT r."payload"->>'red_clan_name'   AS name,
           r."payload"->>'red_clan_mark1'  AS bg,
           r."payload"->>'red_clan_mark2'  AS front,
           m."leagueId"                    AS leagueid
      FROM "Match" m
      JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId"
     WHERE m."supersededAt" IS NULL AND m."lineupSkipReason" = 'clan_unmapped'
    UNION
    SELECT r."payload"->>'blue_clan_name'  AS name,
           r."payload"->>'blue_clan_mark1' AS bg,
           r."payload"->>'blue_clan_mark2' AS front,
           m."leagueId"                    AS leagueid
      FROM "Match" m
      JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId"
     WHERE m."supersededAt" IS NULL AND m."lineupSkipReason" = 'clan_unmapped'
  `

  const stranded = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Match" m
     WHERE m."supersededAt" IS NULL AND m."lineupSkipReason" = 'clan_unmapped'
  `
  result.strandedMatches = stranded[0]?.n ?? 0

  /* 우리가 이미 아는 이름은 뺀다 — 그건 `sanply-clan-fill` 의 몫이다 */
  const known = new Set((await prisma.clan.findMany({ select: { name: true } })).map((c) => c.name))

  const missing = new Map<string, Missing>()
  for (const row of rows) {
    const name = trimmed(row.name)
    if (name === null || known.has(name)) continue
    const got = missing.get(name)
    if (got === undefined) {
      missing.set(name, {
        name,
        bg: trimmed(row.bg),
        front: trimmed(row.front),
        leagueIds: [row.leagueid],
      })
    } else if (!got.leagueIds.includes(row.leagueid)) {
      got.leagueIds.push(row.leagueid)
    }
  }
  result.unknownClans = missing.size

  if (!useChromeFetch()) {
    warn('★이 잡은 서버(크롬)에서만 돈다★ — 병영 검색이 노트북에서는 막힌다')
    log(`모르는 클랜 ${result.unknownClans}곳 · 막힌 경기 ${result.strandedMatches}건 (미리보기)`)
    return result
  }

  let done = 0
  for (const item of missing.values()) {
    if (done >= limit || result.blocked) break
    done += 1

    let body: string
    try {
      const path = `/api/Search/GetSearchClanAll/${encodeURIComponent(item.name)}/1`
      const res = await barracksBrowser().call('POST', path, '{}')
      if (res.status === 403 || res.status === 429) {
        warn(`병영수첩이 막았다 (HTTP ${res.status}) — 멈춘다. 우회하지 않는다`)
        result.blocked = true
        break
      }
      if (res.status !== 200) {
        result.notFound += 1
        await sleep(DELAY_MS)
        continue
      }
      body = res.body
    } catch {
      result.notFound += 1
      await sleep(DELAY_MS)
      continue
    }

    let candidates: Candidate[]
    try {
      candidates = candidatesOf(JSON.parse(body))
    } catch {
      result.notFound += 1
      await sleep(DELAY_MS)
      continue
    }

    /* ★이름이 똑같고 마크도 똑같은 하나★ 만 받아들인다 */
    const sameName = candidates.filter((c) => c.clanName === item.name)
    const byMark = sameName.filter((c) => c.mark1 === item.bg && c.mark2 === item.front)
    const pick = byMark.length === 1 ? byMark[0] : undefined

    if (sameName.length === 0) {
      result.notFound += 1
      if (result.samples.length < 25) result.samples.push(`★검색에 없다★ ${item.name}`)
      await sleep(DELAY_MS)
      continue
    }
    if (pick === undefined) {
      /* ★어느 쪽인지 모르면 안 만든다★ — 틀린 클랜을 만드느니 비워 둔다 (D-106) */
      result.ambiguous += 1
      if (result.samples.length < 25) {
        result.samples.push(
          `★못 가림★ ${item.name} — 이름 같은 곳 ${sameName.length} · 마크 맞는 곳 ${byMark.length}`,
        )
      }
      await sleep(DELAY_MS)
      continue
    }

    result.found += 1
    const slug = pick.clanId
    if (result.samples.length < 25) result.samples.push(`찾음 ${item.name} → ${slug}`)

    if (confirm && CREATE_MISSING_CLANS) {
      /* ★이미 그 주소로 있으면 안 건드린다★ — 이름만 다를 수 있다 */
      const existing = await prisma.clan.findUnique({ where: { slug }, select: { id: true } })
      let clanId: string
      if (existing === null) {
        /*
         * ── ⚠ ★랭킹에는 올리지 않는다★ (2026-09-22 사장님)
         *
         *   > 「얘넨 또 뭐야 ★이상한애들 IPL에 왜 들어와있아★」
         *
         *   이 클랜들은 ★우리 리그에 등록한 곳이 아니다.★ 우리 클랜의 ★상대★ 로
         *   경기에 나왔을 뿐이다. 명단(누가 몇 킬 했나)을 만들려면 리그에 있어야 해서
         *   넣은 것인데, 그러자 ★클랜랭킹에도 같이 올라갔다★ — 1승 0패짜리가 22등에.
         *
         *   ★`active=false` 로 만든다.★ 그러면 —
         *     · 랭킹·목록에는 ★안 나온다★ (화면 질의가 `clan.active = true` 를 본다)
         *     · 명단 잡은 ★그대로 이 클랜을 푼다★ (거기선 active 를 안 본다)
         *   즉 ★기록은 다 남고 순위표만 깨끗하다.★
         *
         *   ⚠ ★지우지 않았다★ — 사장님이 「얘는 올려」 하시면 한 칸만 true 로.
         */
        const made = await prisma.clan.create({
          data: {
            slug,
            name: item.name,
            markBgUrl: item.bg,
            markFrontUrl: item.front,
            active: false,
          },
          select: { id: true },
        })
        clanId = made.id
        result.created += 1
      } else {
        clanId = existing.id
      }
      /* ★번호가 없으면 명단이 못 잇는다★ — 만들자마자 같이 받아 적는다 */
      if (await fillClanNumber(clanId, slug)) result.numbered += 1
      await sleep(DELAY_MS)

      for (const leagueId of item.leagueIds) {
        const has = await prisma.leagueClan.findFirst({
          where: { leagueId, clanId },
          select: { id: true },
        })
        if (has !== null) continue
        await prisma.leagueClan.create({ data: { leagueId, clanId, division: 1 } })
        result.joined += 1
      }
    }
    await sleep(DELAY_MS)
  }

  /*
   * ── ★★②단계 — 번호가 없는 클랜에 번호를 채운다★★ (2026-09-22)
   *
   *   ①단계에서 만든 클랜뿐 아니라, ★전에 만들어 두고 번호가 없던 클랜★ 도 있다.
   *   명단 잡은 ★번호로만★ 클랜을 이으므로, 번호가 없으면 아무리 등록해도 못 잇는다.
   *
   *   ⚠ ★리그에 올라 있는 클랜만★ 본다 — 우리 화면에 안 나오는 클랜까지 물어볼 까닭이 없다.
   *   ⚠ 한 판에 `limit` 곳까지만. 병영을 몰아치지 않는다.
   */
  if (confirm && !result.blocked) {
    const needNumber = await prisma.$queryRaw<{ id: string; slug: string; name: string }[]>`
      SELECT DISTINCT c."id", c."slug", c."name"
        FROM "Clan" c
        JOIN "LeagueClan" lc ON lc."clanId" = c."id"
       WHERE c."active" = true
         AND NOT EXISTS (SELECT 1 FROM "BarracksClanNumber" n WHERE n."clanId" = c."id")
       LIMIT ${limit}
    `
    for (const clan of needNumber) {
      if (result.blocked) break
      if (await fillClanNumber(clan.id, clan.slug)) {
        result.numbered += 1
        if (result.samples.length < 40) result.samples.push(`번호 채움 ${clan.name}`)
      }
      await sleep(DELAY_MS)
    }
    log(`②번호 없는 클랜 ${needNumber.length}곳 중 ${result.numbered}곳에 번호를 적었다`)
  }

  /*
   * ── ★★③단계 — 「번호는 아는데 그 리그 명단에 없다」 를 푼다★★ (2026-09-22)
   *
   *   ①②를 하고도 111건이 그대로 막혀 있었다. 파 보니 —
   *   ```
   *   배틀로그 teamList 의 clan_no  →  번호표에는 있다
   *   그런데 ★그 경기의 리그 명단에는 그 클랜이 없다★
   *   ```
   *   명단 잡은 ★그 리그에 등록된 클랜만★ 번호표에 담는다 (같은 병영 클랜이 우리 DB 에
   *   두 줄인 경우를 막으려는 장치다). 그래서 ★등록만 안 돼 있으면 영영 못 푼다.★
   *
   *   ★그 클랜은 그 리그 경기에 실제로 나왔다.★ 그러니 그 리그 명단에 올리는 것이 맞다
   *   (`sanply-clan-fill` 이 이름으로 하던 일을 ★번호로★ 하는 것이다 — 더 안전하다).
   *
   *   ⚠ ★기록을 만들지 않는다★ — 명단 한 줄뿐이다.
   *   ⚠ 번호조차 모르는 클랜은 ★여기서 만들지 않는다★ — ①단계가 이름으로 찾는다.
   */
  if (confirm && !result.blocked && CREATE_MISSING_CLANS) {
    const pairs = await prisma.$queryRaw<{ leagueid: string; clanid: string; name: string }[]>`
      SELECT DISTINCT m."leagueId" AS leagueid, n."clanId" AS clanid, c."name"
        FROM "Match" m
        JOIN "BarracksBattleLogRaw" b
          ON b."matchKey" = m."sourceMatchId" AND b."subjectKind" = 'clan'
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(b."payload"->'teamList', '[]'::jsonb)) AS e(v)
        JOIN "BarracksClanNumber" n ON n."clanNo" = e.v->>'clan_no'
        JOIN "Clan" c ON c."id" = n."clanId"
       WHERE m."supersededAt" IS NULL
         AND m."lineupStatus" = 'incomplete'
         AND c."active" = true
         AND NOT EXISTS (
               SELECT 1 FROM "LeagueClan" lc
                WHERE lc."clanId" = n."clanId" AND lc."leagueId" = m."leagueId")
    `
    for (const pair of pairs) {
      await prisma.leagueClan.create({
        data: { leagueId: pair.leagueid, clanId: pair.clanid, division: 1 },
      })
      result.joinedByNumber += 1
      if (result.samples.length < 60) result.samples.push(`번호로 명단에 올림 ${pair.name}`)
    }
    log(`③번호로 리그 명단에 올린 클랜 ${result.joinedByNumber}곳`)
  }

  /*
   * ── ★★④단계 — 경기 원문으로 «이 번호는 저 클랜» 을 알아낸다★★ (2026-09-22)
   *
   *   ③이 0 이었다. 막고 있던 것은 ★번호 자체를 모르는 클랜★ 이었다.
   *   `GetClanInfo` 는 주소를 줘야 번호를 준다 — ★번호에서 거꾸로는 못 간다.★
   *
   *   ── 그런데 한 경기 안에 답이 다 있다
   *   ```
   *   경기 원문   red_clan_name · blue_clan_name        ← 두 클랜의 ★이름★
   *   배틀로그    teamList 의 clan_no 두 개 · subject   ← 두 클랜의 ★번호★
   *   ```
   *   ★subject 는 우리가 아는 번호★ 다 (그 클랜에서 받아 온 배틀로그다).
   *   그러면 ★나머지 번호는 나머지 이름의 클랜★ 이다. 추측이 아니라 소거다.
   *
   *   ⚠ ★한 군데라도 흔들리면 안 적는다★ —
   *     · 번호가 정확히 둘이어야 한다
   *     · 그중 하나만 알아야 한다 (둘 다 알면 할 일이 없고, 둘 다 모르면 못 가린다)
   *     · 아는 쪽 클랜 이름이 원문의 두 이름 중 하나와 ★똑같아야★ 한다
   *     · 나머지 이름을 가진 ★활성 클랜이 정확히 하나★ 여야 한다
   *     하나라도 어긋나면 ★건너뛴다★ (D-106 · D-221)
   *   ⚠ ★한 번호에 한 클랜★ — 이미 남의 것이면 덮지 않는다
   */
  if (confirm && !result.blocked) {
    const guesses = await prisma.$queryRaw<
      { clanno: string; clanid: string; name: string; leagueid: string }[]
    >`
      WITH cand AS (
        SELECT m."id"        AS match_id,
               m."leagueId"  AS leagueid,
               b."subject"   AS subject,
               r."payload"->>'red_clan_name'   AS red_name,
               r."payload"->>'blue_clan_name'  AS blue_name,
               ARRAY(
                 SELECT DISTINCT e.v->>'clan_no'
                   FROM jsonb_array_elements(
                          COALESCE(b."payload"->'teamList', '[]'::jsonb)) AS e(v)
                  WHERE e.v->>'clan_no' IS NOT NULL
               ) AS nos
          FROM "Match" m
          JOIN "BarracksBattleLogRaw" b
            ON b."matchKey" = m."sourceMatchId" AND b."subjectKind" = 'clan'
          JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId"
         WHERE m."supersededAt" IS NULL
           AND m."lineupStatus" = 'incomplete'
           AND m."startAt" > NOW() - INTERVAL '30 days'
      ),
      two AS (
        SELECT * FROM cand
         WHERE array_length(nos, 1) = 2
           AND subject = ANY(nos)
           AND red_name IS NOT NULL AND blue_name IS NOT NULL
      ),
      solved AS (
        SELECT t.leagueid,
               (SELECT x FROM unnest(t.nos) AS x WHERE x <> t.subject) AS other_no,
               known.name AS known_name,
               t.red_name, t.blue_name
          FROM two t
          JOIN "BarracksClanNumber" n ON n."clanNo" = t.subject
          JOIN "Clan" known ON known."id" = n."clanId"
         WHERE NOT EXISTS (
                 SELECT 1 FROM "BarracksClanNumber" n2
                  WHERE n2."clanNo" = (SELECT x FROM unnest(t.nos) AS x WHERE x <> t.subject))
      )
      SELECT DISTINCT s.other_no AS clanno, c."id" AS clanid, c."name", s.leagueid
        FROM solved s
        JOIN "Clan" c
          ON c."name" = CASE WHEN s.known_name = s.red_name THEN s.blue_name
                             WHEN s.known_name = s.blue_name THEN s.red_name
                             ELSE NULL END
       WHERE c."active" = true
         AND (SELECT COUNT(*) FROM "Clan" d WHERE d."name" = c."name" AND d."active" = true) = 1
    `
    for (const g of guesses) {
      const wrote = await prisma.$executeRaw`
        INSERT INTO "BarracksClanNumber" ("clanNo","clanId","source","votes","linkedAt")
        VALUES (${g.clanno}, ${g.clanid}, 'match-raw', 1, NOW())
        ON CONFLICT ("clanNo") DO NOTHING`
      if (wrote > 0) {
        result.inferredNumbers += 1
        if (result.samples.length < 80) result.samples.push(`번호 알아냄 ${g.name} → ${g.clanno}`)
      }
      /*
       * ⚠ ★리그에 올리지 않는다★ (2026-09-22) — 번호만 적는다.
       *   등록은 ★사장님이 정하는 것★ 이고, 우리가 올리면 등록 안 된 클랜과 한 경기가
       *   기록돼 버린다. 번호는 적어 둬도 문을 안 연다 — 이미 등록된 클랜의 경기를
       *   풀 때만 쓰인다.
       */
      if (CREATE_MISSING_CLANS) {
        const has = await prisma.leagueClan.findFirst({
          where: { leagueId: g.leagueid, clanId: g.clanid },
          select: { id: true },
        })
        if (has === null) {
          await prisma.leagueClan.create({
            data: { leagueId: g.leagueid, clanId: g.clanid, division: 1 },
          })
          result.joinedByNumber += 1
        }
      }
    }
    log(`④경기 원문으로 알아낸 번호 ${result.inferredNumbers}개`)
  }

  /*
   * ★막힌 표시를 지운다★ — 클랜이 생겼으니 명단 잡이 다시 봐야 한다.
   *   지우지 않으면 `battlelog-lineup` 이 「다시 안 볼 사유」 로 걸러 영영 건너뛴다.
   */
  if (
    confirm &&
    (result.created > 0 ||
      result.joined > 0 ||
      result.joinedByNumber > 0 ||
      result.inferredNumbers > 0)
  ) {
    const cleared = await prisma.match.updateMany({
      where: { supersededAt: null, lineupSkipReason: 'clan_unmapped' },
      data: { lineupSkipReason: null },
    })
    log(`막힘 표시를 지운 경기 ${cleared.count}건 — 다음 명단 판이 다시 본다`)
  }

  if (useChromeFetch()) closeBarracksBrowser()

  log(
    `모르는 클랜 찾기 — 막힌 경기 ${result.strandedMatches} · 모르는 클랜 ${result.unknownClans} · ` +
      `찾음 ${result.found} · 만듦 ${result.created} · 명단에 올림 ${result.joined} · ` +
      `번호받음 ${result.numbered} · 알아낸번호 ${result.inferredNumbers} · ` +
      `번호로올림 ${result.joinedByNumber} · 못 가림 ${result.ambiguous} · 검색에 없음 ${result.notFound}` +
      (result.blocked ? ' · ★막힘★' : '') +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
