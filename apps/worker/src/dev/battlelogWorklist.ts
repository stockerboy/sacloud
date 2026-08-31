/**
 * 배틀로그 **전수조사 작업목록** 생성기 (D-218).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogWorklist.ts [옵션]
 *   --out <디렉터리>    기본 data/barracks/battlelog-worklist
 *   --chunk <숫자>      한 파일에 담을 짝 수. 기본 4000
 *   --plimit <숫자>     인원 제한으로 거른다. **기본 0 = 거르지 않는다** (아래 주석 참조)
 *   --priority <1..4>   이 우선순위만 뽑는다. 없으면 전부
 *   --both-sides        **옛 방식.** 경기마다 양쪽 클랜번호를 다 낸다 (아래 참조)
 * ```
 *
 * ── 왜 필요한가 (병목이 하나다)
 * ```
 * 배틀로그가 있는 경기   전체의 1.4%
 * 포지션 판정            1,227명 (26%)
 * 세이브·소수싸움 분모   8~10 라운드
 * 1티어 분석 표본        4명
 * ```
 * 축이 부실한 게 아니라 **재료가 없다.** `BarracksClanMatchRaw` 에 고유 경기
 * **130,260건**(2026-04-01~08-31 · 제3보급창고)이 이미 쌓여 있고, 그 하나하나에
 * 배틀로그가 딸려 있다. 이 파일은 "무엇을 아직 안 받았나" 를 계산해 목록으로 떨어뜨린다.
 *
 * ── **수집은 여기서 하지 않는다**
 *   서버에서 병영수첩을 부르면 403(WAF)이다. UA·헤더를 위조해 뚫지 않는다
 *   (`CLAUDE.md` 3-A 5번). 수집은 사용자의 로그인된 브라우저가 한다:
 *   `scripts/battlelog-collect-snippet.js`
 *
 * ── 짝(pair)은 `(matchKey, clanNo)` 다 — 그리고 **경기당 하나면 된다** (D-218)
 *   `POST /api/BattleLog/GetBattleLogClan/{matchKey}/{clanNo}`
 *
 *   예전에는 "한 응답에 한 클랜분만 온다" 고 보고 경기마다 두 짝을 냈다. **틀렸다.**
 *   같은 경기(`260831001112124001`)를 양쪽 클랜번호로 각각 불러 본 결과 (2026-08-31 실측):
 *
 * ```
 *   clan_no 070704095687   내 팀 사망 42 + 내가 죽인 것 40  →  사망사건 82개
 *   clan_no 130703000757   내 팀 사망 40 + 내가 죽인 것 42  →  사망사건 82개
 *   두 집합이 (라운드, 죽은사람, event_key) 기준으로 **완전히 일치**
 *   등장 인물 10명 전원 · 라운드 12개 전부 · 좌표 결측 0
 * ```
 *
 *   `event_type=kill` 행이 **상대 팀**의 사망을, `event_type=death` 행이 **우리 팀**의 사망을
 *   담는다. 즉 **한 번 호출로 양 팀 10명의 좌표·무기·시각이 전부 온다.** 두 번 부르면
 *   같은 것을 두 번 받는다 — 원본에 쓸데없는 요청을 보내는 셈이다 (`CLAUDE.md` 3-A 5번).
 *
 * ```
 *   옛 방식   짝 173,590 · 호출 약 268,000 · 200ms 로 약 15시간
 *   지금      경기당 1회                    → 호출이 절반이 된다
 * ```
 *
 *   ⚠ 옛 방식은 **지우지 않았다** (`CLAUDE.md` 10-4). `--both-sides` 로 살아 있다.
 *   양쪽이 정말 같은지 다시 검산하고 싶을 때만 쓴다. 전수수집에는 쓰지 마라.
 *
 * ── 어느 클랜번호로 부를까 (규칙)
 *   **우리가 실제로 가진 번호**여야 한다. 매치목록 원문의 `clan_no` 는 *조회 주체*의 번호라
 *   그 경기가 목록에 있는 이상 **항상 있다.** 그래서 순서는 이렇다:
 *     1) 매치목록에서 본 `clan_no` (`info.clanNos`) 중 **사전순으로 가장 앞선 것**
 *     2) 그것이 하나도 없으면 저장된 배틀로그 `teamList` 에서 배운 번호
 *   사전순 고정은 취향이 아니라 **재실행해도 같은 짝이 나오게** 하려는 것이다(멱등).
 *

 * ── ⚠ 여기서 밝혀진 것: `red_clan_no` / `blue_clan_no` 는 **없다**
 *   지시문에는 매치목록 행에 양 팀 클랜번호가 있다고 적혀 있었으나, 실제 payload 를
 *   열어 보면 있는 것은 **조회한 클랜의 `clan_no` 하나**와 양 팀의 **이름**뿐이다
 *   (2026-08-29 실측 · 스니펫 주석에도 같은 기록이 있다).
 *
 *   그래서 상대 클랜 번호는 두 곳에서 온다:
 *     1) 같은 경기가 **다른 클랜의 목록에도** 있으면 그쪽 `clan_no`  ← 여기서 계산한다
 *     2) 배틀로그 응답의 **`teamList`**(팀번호 ↔ 클랜번호 짝)      ← 스니펫이 그 자리에서 배운다
 *   그래서 짝에 `discover` 표시를 달아 둔다. 1 이면 "받고 나서 상대도 이어 받아라" 다.
 *
 * ── "이미 있다" 의 기준 (멱등)
 *   `BarracksBattleLogRaw` 에서 `subjectKind = 'clan'` 인 행의 `matchKey`.
 *   **한 건이라도 있으면 그 경기는 끝난 것이다** — 응답 하나에 양 팀이 다 들어 있으므로.
 *   그래서 판정은 두 갈래뿐이다: `받음` / `안 받음`.
 *   이미 한쪽을 받아 둔 경기(2026-08-31 기준 6,367건)는 **다시 받지 않는다.**
 *   옛 대조기가 그것을 `한 팀만 받음` 으로 셌는데, **그 표현부터 틀렸다.**
 *
 *   `--both-sides` 일 때만 옛 세 갈래 판정(둘 다 / 한쪽만 / 없음)을 쓴다.
 *
 * ── 우선순위 (파일이 갈린다)
 * ```
 * ① 1티어 선수가 낀 경기        특성 분석이 4명에서 막혀 있다. 여기서 먼저 성과가 난다
 * ② 개인랭킹 1~30등이 낀 경기   사용자 지시. 정답 집단이라 검산에도 쓴다
 * ③ IPL 등록 클랜끼리의 경기    IPL 기록의 신뢰도가 직접 걸려 있다
 * ④ 나머지 전부                 전수조사
 * ```
 *   ⚠ **선수 단위로 거를 수 없다.** 매치목록 payload 에는 선수 이름이 없고 **클랜 이름만**
 *     있다. 우리 `Match` 표와 겹치는 것은 1,340건(1%)뿐이라 그쪽만 봐서는 ①②가 거의
 *     비어 버린다. 그래서 ①②는 **그 선수의 클랜이 뛴 경기**로 넓힌다.
 *     넓히는 것은 근사(近似)다 — 그 선수가 실제로 뛰었는지는 받아 봐야 안다.
 *     좁히는 것보다 낫다: 한 번 부르면 그 클랜 다섯 명분 좌표가 한꺼번에 온다.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { ACES, foldNick } from '../lib/aces.js'

/* --------------------------------------------------------------- 옵션 --- */

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : fallback
}

function boolFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const OUT_DIR = flag('out', join(process.cwd(), '..', '..', 'data', 'barracks', 'battlelog-worklist'))
const CHUNK = Math.max(500, Number(flag('chunk', '4000')))
/**
 * 인원 제한으로 거를지 — **기본은 거르지 않는다(0).**
 *
 * ── 왜 5 가 아닌가 (2026-08-31 · 수집 원문 전량 실측)
 *   예전 기본값은 `5` 였다. "클랜전은 5대5" 라는 전제였는데 **원문이 그렇지 않다.**
 *   IPL 43곳의 매치목록 원문에서 `plimit` 분포는 이렇다:
 *
 * ```
 *   5   96.94%      4   3.00% (6,419줄)      6  0.04%      8  0.03%      7  0.00%
 * ```
 *
 *   고유 경기로 세면 **6,090건(4.02%)이 `plimit != 5`** 다. 그리고 이것이 핵심인데 —
 *   **43곳 중 `plimit` 이 전부 5 인 클랜은 한 곳도 없다.** 특정 클랜에 몰려 있다:
 *
 * ```
 *   terry9532   39.7%   ← 기록의 40% 가 사라진다
 *   WebClanGood 21.2%     DooLii 14.6%     wweqeqtd123 9.5%     tjdwlsqhrdl 8.0%
 * ```
 *
 *   `docs/DECISIONS.md` 의 열산 판별 조사도 같은 결론에 닿았다 —
 *   **"4대4를 하는 클랜이 따로 있는 것이지 경기 종류 표시가 아니다"** (methodcrew 안에서 p=0.196).
 *   즉 `plimit` 으로 거르면 경기 종류가 걸러지는 게 아니라 **특정 클랜이 통째로 깎인다.**
 *
 * ── 왜 하필 여기서 거르면 안 되는가
 *   이 파일은 "무엇을 받을지" 를 정한다. 여기서 뺀 경기는 **배틀로그를 아예 안 받는다.**
 *   안 받은 것은 나중에 판단을 바꿔도 **복구가 안 된다.** 받아 두고 나중에 거르는 것은 되지만
 *   그 반대는 안 된다. 그래서 수집 단계에서는 거르지 않는다.
 *
 *   5대5를 가정하는 것은 `jobs/roundBuild.ts` · `jobs/playstyleBuild.ts` 의 `TEAM_SIZE` 다.
 *   그쪽은 **복원 단계**라 언제든 되돌릴 수 있으므로 그대로 둔다.
 *
 *   거르고 싶으면 `--plimit 5` 를 명시한다.
 */
const PLIMIT = Number(flag('plimit', '0'))
const ONLY = Number(flag('priority', '0'))
/**
 * **옛 방식** — 경기마다 양쪽 클랜번호를 다 낸다 (`CLAUDE.md` 10-4 로 남겨 둔 것).
 *
 * 기본은 꺼져 있다. 한 응답에 양 팀이 다 들어 있다는 것이 실측으로 확인됐기 때문이다
 * (D-218 · 파일 첫머리 주석의 숫자). 켜면 호출이 두 배가 되고, 받는 내용은 같다.
 */
const BOTH_SIDES = boolFlag('both-sides')

/** 우선순위 이름 — 파일과 보고에 같은 말을 쓴다 */
const PRIORITY_LABEL: Record<number, string> = {
  1: '1티어 선수의 클랜이 낀 경기',
  2: '개인랭킹 1~30등의 클랜이 낀 경기',
  3: 'IPL 등록 클랜끼리의 경기',
  4: '나머지 전부',
}

/* --------------------------------------------------------------- 형 --- */

/**
 * 매치목록 원문(`BarracksClanMatchRaw.payload.raw`)에서 우리가 쓰는 칸.
 *
 * ⚠ **이 형으로 행을 읽지 마라.** `payload` 를 통째로 select 하면 로컬 PostgreSQL 이
 * `out of memory (printtup)` 로 죽는다 (2026-08-31 실측 — 17만 행 × 최대 8KB).
 * 지금은 SQL 쪽에서 필요한 칸만 투영해 온다. 이 형은 **원문에 무엇이 들어 있는지**
 * 를 남겨 두는 문서 역할이다 (`CLAUDE.md` 10-4 — 옛 방식을 지우지 않는다).
 */
export interface ClanMatchPayload {
  clan_no?: string
  plimit?: number | string
  map_name?: string
  red_clan_name?: string | null
  blue_clan_name?: string | null
}

/** 한 경기에 대해 우리가 아는 것 */
interface MatchInfo {
  matchKey: string
  /** 매치목록에서 직접 확인된 클랜번호들 (최대 2개) */
  clanNos: Set<string>
  names: Set<string>
  plimit: number
}

/* --------------------------------------------------------------- 본체 --- */

async function main(): Promise<void> {
  /* ── 1. 이미 받은 것 ------------------------------------------------- */
  /* ⚠ **`payload` 를 통째로 끌어오지 않는다.** 배틀로그 원문 하나가 90KB 안팎이라
     7천 행이면 600MB 다. 실제로 서버가 `out of memory (printtup)` 로 죽었다.
     필요한 값만 SQL 에서 뽑는다 */
  const doneRows = await prisma.$queryRawUnsafe<{ matchKey: string; subject: string }[]>(
    `select "matchKey", "subject" from "BarracksBattleLogRaw" where "subjectKind" = 'clan'`,
  )
  const doneBy = new Map<string, Set<string>>()
  for (const row of doneRows) {
    const set = doneBy.get(row.matchKey) ?? new Set<string>()
    set.add(row.subject)
    doneBy.set(row.matchKey, set)
  }

  /** 저장된 응답의 `teamList` 에서 배운 짝 — 상대 번호를 여기서 읽는다.
      창구(`/api/dev/barracks-ingest`)로 들어온 행은 원문이 `payload.raw` 아래 있고,
      CLI 로 들어온 행은 `payload` 자체가 원문이다. 둘 다 본다 */
  const partnerRows = await prisma.$queryRawUnsafe<{ matchKey: string; clan_no: string }[]>(`
    select distinct b."matchKey", t->>'clan_no' as clan_no
    from "BarracksBattleLogRaw" b,
      lateral jsonb_array_elements(
        coalesce(b.payload->'teamList', b.payload->'raw'->'teamList', '[]'::jsonb)
      ) t
    where b."subjectKind" = 'clan' and t->>'clan_no' is not null`)
  const partnerBy = new Map<string, Set<string>>()
  for (const row of partnerRows) {
    const known = partnerBy.get(row.matchKey) ?? new Set<string>()
    known.add(String(row.clan_no))
    partnerBy.set(row.matchKey, known)
  }
  console.error(`이미 받은 클랜응답 ${doneRows.length}건 · 경기 ${doneBy.size}건`)

  /* ── 2. 매치목록 원문에서 경기를 모은다 ------------------------------ */
  /* 여기도 마찬가지로 **필요한 네 값만** 뽑는다. 17만 행이라도 10MB 안쪽이다 */
  const matches = new Map<string, MatchInfo>()
  let scanned = 0
  const PAGE = 20000
  for (let offset = 0; ; offset += PAGE) {
    const page = await prisma.$queryRawUnsafe<
      { matchKey: string; clan_no: string | null; plimit: string | null; red: string | null; blue: string | null }[]
    >(`
      select "matchKey",
             payload->>'clan_no'        as clan_no,
             payload->>'plimit'         as plimit,
             payload->>'red_clan_name'  as red,
             payload->>'blue_clan_name' as blue
      from "BarracksClanMatchRaw"
      order by "id" asc limit ${PAGE} offset ${offset}`)
    if (page.length === 0) break
    for (const row of page) {
      scanned += 1
      const plimit = Number(row.plimit ?? 0)
      if (PLIMIT > 0 && plimit !== PLIMIT) continue
      const info =
        matches.get(row.matchKey) ??
        ({ matchKey: row.matchKey, clanNos: new Set(), names: new Set(), plimit } as MatchInfo)
      if (row.clan_no) info.clanNos.add(String(row.clan_no))
      if (row.red) info.names.add(String(row.red))
      if (row.blue) info.names.add(String(row.blue))
      matches.set(row.matchKey, info)
    }
    if (page.length < PAGE) break
  }
  console.error(`매치목록 ${scanned}행 → 고유 경기 ${matches.size}건 (plimit=${PLIMIT || '전부'})`)

  /* ── 3. 우선순위 재료 ------------------------------------------------ */
  const players = await prisma.player.findMany({
    select: { id: true, name: true, clan: { select: { id: true, name: true } } },
  })
  const byFold = new Map<string, typeof players>()
  for (const p of players) {
    const key = foldNick(p.name)
    byFold.set(key, [...(byFold.get(key) ?? []), p])
  }

  /** ① 1티어. 이름을 접어서 찾고, **클랜 이름**으로 넓힌다 */
  const aceClanNames = new Set<string>()
  const aceFound: string[] = []
  const aceMissing: string[] = []
  for (const ace of ACES) {
    const cands = players.filter((p) => p.name === ace.name)
    const hits = cands.length > 0 ? cands : (byFold.get(foldNick(ace.name)) ?? [])
    if (hits.length === 0) {
      aceMissing.push(ace.name)
      continue
    }
    aceFound.push(ace.name)
    for (const h of hits) if (h.clan?.name) aceClanNames.add(h.clan.name)
  }

  /** ② 개인랭킹 1~30등 (DPL = slug `supply`) */
  const dpl = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
  const top30 = dpl
    ? await prisma.leaguePlayer.findMany({
        where: { leagueId: dpl.id, placement: false },
        orderBy: { rating: 'desc' },
        take: 30,
        select: { player: { select: { name: true, clan: { select: { name: true } } } } },
      })
    : []
  const topClanNames = new Set<string>()
  for (const t of top30) if (t.player.clan?.name) topClanNames.add(t.player.clan.name)

  /** ③ IPL 등록 클랜 (slug `nolink`) */
  const iplClanNames = new Set(
    (
      await prisma.leagueClan.findMany({
        where: { league: { slug: 'nolink' } },
        select: { clan: { select: { name: true } } },
      })
    ).map((r) => r.clan.name),
  )

  console.error(
    `① 1티어 ${aceFound.length}/${ACES.length}명 → 클랜 ${aceClanNames.size}곳` +
      (aceMissing.length > 0 ? ` · 못 찾음: ${aceMissing.join(', ')}` : ''),
  )
  console.error(`② 개인랭킹 30명 → 클랜 ${topClanNames.size}곳`)
  console.error(`③ IPL 등록 클랜 ${iplClanNames.size}곳`)

  /* ── 4. 짝을 만든다 -------------------------------------------------- */
  /** [matchKey, 클랜번호 색인, discover(0|1)] */
  type Pair = [string, number, 0 | 1]
  const buckets = new Map<number, Pair[]>([
    [1, []],
    [2, []],
    [3, []],
    [4, []],
  ])
  const clanIndex = new Map<string, number>()
  const clanList: string[] = []
  const indexOf = (clanNo: string): number => {
    let i = clanIndex.get(clanNo)
    if (i === undefined) {
      i = clanList.length
      clanList.push(clanNo)
      clanIndex.set(clanNo, i)
    }
    return i
  }

  const stat = { skippedDone: 0, halfDone: 0, noClanNo: 0, emitted: 0, matchesEmitted: 0 }

  for (const info of matches.values()) {
    const done = doneBy.get(info.matchKey) ?? new Set<string>()
    /* **받았으면 끝이다.** 응답 하나에 양 팀 10명이 다 들어 있다 (D-218).
       `--both-sides` 일 때만 옛 판정(둘 다 있어야 뺀다)을 쓴다 */
    if (BOTH_SIDES ? done.size >= 2 : done.size >= 1) {
      stat.skippedDone += 1
      continue
    }

    /* 어느 우선순위인가 — 낮은 번호가 이긴다 */
    const names = [...info.names]
    let priority = 4
    if (names.some((n) => aceClanNames.has(n))) priority = 1
    else if (names.some((n) => topClanNames.has(n))) priority = 2
    else if (names.length === 2 && names.every((n) => iplClanNames.has(n))) priority = 3
    if (ONLY > 0 && priority !== ONLY) continue

    /* 아는 클랜번호를 다 모은다: 매치목록에서 본 것(조회 주체라 항상 있다) +
       저장된 teamList 에서 배운 것. 사전순으로 고정해 재실행에도 같은 짝이 나오게 한다 */
    const listed = [...info.clanNos].sort()
    const learned = [...(partnerBy.get(info.matchKey) ?? [])].sort()
    const candidates = [...new Set<string>([...listed, ...learned])]
    const missing = candidates.filter((no) => !done.has(no))
    if (missing.length === 0) {
      /* 부를 번호를 하나도 모른다 (매치목록 원문에 clan_no 가 비어 있던 경우) */
      stat.noClanNo += 1
      continue
    }

    const bucket = buckets.get(priority)!
    if (BOTH_SIDES) {
      /* ── 옛 방식: 아는 번호를 전부 낸다. 한 쪽만 아는 경기는 discover 로 상대를 찾게 한다 */
      if (done.size === 1) stat.halfDone += 1
      const discover: 0 | 1 = missing.length >= 2 || done.size === 1 ? 0 : 1
      for (const no of missing) {
        bucket.push([info.matchKey, indexOf(no), discover])
        stat.emitted += 1
      }
    } else {
      /* ── 지금 방식: **경기당 한 짝.** 한 응답에 양 팀이 다 온다 (D-218).
         `discover=0` 이라 스니펫은 상대를 이어 받지 않는다 — 받을 것이 없다 */
      bucket.push([info.matchKey, indexOf(missing[0]!), 0])
      stat.emitted += 1
    }
    stat.matchesEmitted += 1
  }

  /* ── 5. 파일로 떨어뜨린다 -------------------------------------------- */
  /* 예전 목록을 남겨 두면 스니펫이 이미 끝난 것을 다시 받는다. 통째로 다시 쓴다 */
  if (existsSync(OUT_DIR)) {
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith('.json')) rmSync(join(OUT_DIR, f))
    }
  }
  mkdirSync(OUT_DIR, { recursive: true })

  const index: {
    priority: number
    label: string
    part: number
    pairs: number
    file: string
  }[] = []

  for (const [priority, pairs] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (pairs.length === 0) continue
    const parts = Math.ceil(pairs.length / CHUNK)
    for (let part = 1; part <= parts; part += 1) {
      const slice = pairs.slice((part - 1) * CHUNK, part * CHUNK)
      /* 클랜번호 사전은 그 조각이 실제로 쓰는 것만 담는다 — 파일이 작아진다 */
      const used = new Map<number, number>()
      const localClans: string[] = []
      const localPairs = slice.map(([key, gi, disc]) => {
        let li = used.get(gi)
        if (li === undefined) {
          li = localClans.length
          localClans.push(clanList[gi]!)
          used.set(gi, li)
        }
        return [key, li, disc] as Pair
      })
      const file = `p${priority}-${String(part).padStart(3, '0')}.json`
      writeFileSync(
        join(OUT_DIR, file),
        JSON.stringify({
          version: 1,
          generated_at: new Date().toISOString(),
          priority,
          label: PRIORITY_LABEL[priority],
          part,
          parts,
          plimit: PLIMIT || null,
          both_sides: BOTH_SIDES,
          note: BOTH_SIDES
            ? 'pairs = [matchKey, clans 색인, discover]. **옛 방식(--both-sides)** — 경기당 두 번 ' +
              '부른다. discover=1 이면 응답의 teamList 로 상대 클랜번호를 알아내 이어 받는다'
            : 'pairs = [matchKey, clans 색인, discover]. **경기당 한 번만** 부른다 (D-218) — ' +
              '응답 하나에 양 팀 10명이 다 들어 있다. discover 는 늘 0 이다',
          clans: localClans,
          pairs: localPairs,
        }),
        'utf8',
      )
      index.push({ priority, label: PRIORITY_LABEL[priority]!, part, pairs: localPairs.length, file })
    }
  }

  writeFileSync(
    join(OUT_DIR, 'index.json'),
    JSON.stringify(
      {
        version: 1,
        generated_at: new Date().toISOString(),
        plimit: PLIMIT || null,
        both_sides: BOTH_SIDES,
        chunk: CHUNK,
        totals: {
          matchesTotal: matches.size,
          /** 배틀로그를 **받은** 경기 (기본 방식에서는 한 건만 있어도 완전하다) */
          matchesDone: stat.skippedDone,
          matchesEmitted: stat.matchesEmitted,
          pairsEmitted: stat.emitted,
          /** `--both-sides` 에서만 의미가 있다. 기본 방식에서는 늘 0 */
          halfDone: stat.halfDone,
          unresolvable: stat.noClanNo,
        },
        byPriority: [...buckets.entries()]
          .filter(([, v]) => v.length > 0)
          .map(([p, v]) => ({ priority: p, label: PRIORITY_LABEL[p], pairs: v.length })),
        parts: index,
      },
      null,
      2,
    ),
    'utf8',
  )

  /* ── 6. 보고 ---------------------------------------------------------- */
  console.error('')
  console.error(
    BOTH_SIDES
      ? '⚠ 옛 방식(--both-sides) 이다 — 경기마다 양쪽을 다 부른다. 받는 내용은 같다 (D-218)'
      : '경기당 1회 호출이다 — 응답 하나에 양 팀 10명이 다 온다 (D-218 실측)',
  )
  console.error(`경기 ${matches.size}건 중 이미 받은 것 ${stat.skippedDone}건`)
  if (BOTH_SIDES) console.error(`한 쪽만 받은 것 ${stat.halfDone}건`)
  console.error(`부를 클랜번호를 모르는 것 ${stat.noClanNo}건`)
  console.error(`→ 낼 짝 ${stat.emitted}개 (경기 ${stat.matchesEmitted}건)`)
  for (const [p, v] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (v.length === 0) continue
    /* discover=1 은 한 번 더 부른다. 기본 방식에서는 discover 가 없어 짝 = 호출이다 */
    const calls = v.reduce((sum, [, , d]) => sum + (d === 1 ? 2 : 1), 0)
    const hours = ((calls * 0.2) / 3600).toFixed(1)
    console.error(
      `  ${p}순위 ${PRIORITY_LABEL[p]} — 짝 ${v.length}개 · 예상 호출 ${calls}회 · 200ms 간격이면 ${hours}시간`,
    )
  }
  console.error(`\n파일 ${index.length + 1}개를 ${OUT_DIR} 에 썼다`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
