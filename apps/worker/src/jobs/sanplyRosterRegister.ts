import { prisma } from '@sacloud/db'

import { log, warn } from '../lib/log.js'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'
import { candidatesOf } from './clanFindMissing.js'

/**
 * ★★서플라이 3부리그 명단을 병영수첩으로 대조해 열산에 등록한다★★
 * (2026-09-22 · 사장님 지시)
 *
 * > 「3부 클랜 95개 맞음 일단 3부 클랜 대조해서 등록부터 해」
 * > 「서플라이에서는 ★명단만 받고★ 클랜 등록은 그 명단 보고
 * >  ★우리가 직접 병영수첩에서 따와야한다★」
 *
 * ── 여기 있는 이름은 어디서 왔나
 *
 *   3rd.supply `/league/sanply/home/info` 화면을 사람이 보듯 읽어서 옮겼다.
 *   ★그쪽 slug·마크·클랜번호는 하나도 안 가져왔다★ — 그쪽 내부 식별자는 우리와
 *   무관하고, 사장님 지시대로 ★주소는 병영수첩에서 직접★ 딴다. 여기 있는 것은
 *   ★이름 하나뿐★ 이다.
 *
 *   ★95/95 다 받았다★ (2026-09-22) — 60곳은 화면 자동화로, 35곳은
 *     사장님이 폰 스크린샷(클랜랭킹 2~95위)으로 더해 주셨다.
 *
 *   ⚠ ★IPL·PL 과 이름·클랜이 겹쳐도 상관없다★ (2026-09-22 사장님: 「IPL pl이랑
 *     중복돼도 상관없다 그냥 등록해라 열산리그에」) — 아래 로직이 이미 그렇게 짜여
 *     있다. 병영 클랜 하나가 여러 리그에서 뛸 수 있으므로, ★그 클랜(Clan row)이
 *     이미 있어도 열산 리그 등록(LeagueClan)만 따로 본다.★ 다른 리그 소속은
 *     한 칸도 안 건드린다.
 *
 * ── 이름 하나를 어떻게 등록으로 바꾸나
 *
 *   ```
 *   POST /api/Search/GetSearchClanAll/{이름}/1   → 후보 여럿
 *   ```
 *   ★이름이 정확히 같은 후보가 하나일 때만★ 받아들인다.
 *     0곳 → 못 찾음   ·   2곳 이상 → 어느 쪽인지 모른다, 손대지 않는다 (D-106 · D-221)
 *
 *   찾으면:
 *     · 그 slug 로 이미 있는 클랜이면 → 열산 리그에 없을 때만 명단에 올린다
 *       (이미 있는 클랜의 이름·마크는 안 건드린다)
 *     · 없는 클랜이면 → ★병영이 준 이름·마크로★ 새로 만들고 (active: true —
 *       이건 사장님이 확인하신 진짜 등록이다. 상대 클랜 자동생성과 다르다)
 *       클랜번호도 같이 받아 적는다 (없으면 명단 잡이 못 잇는다)
 *
 * ── 지키는 것
 *
 *   ⚠ ★기록을 만들지 않는다★ — 클랜 한 줄 + 명단 한 줄 + 번호 한 줄뿐이다
 *   ⚠ ★막히면(403/429) 그 자리에서 멈춘다★ — 우회하지 않는다 (D-266)
 *   ⚠ ★이 잡은 서버(크롬)에서만 돈다★ — 병영 검색이 노트북에서는 막힌다
 *
 * ```
 * pnpm --filter @sacloud/worker nexon sanply-roster-register             # 미리보기
 * pnpm --filter @sacloud/worker nexon sanply-roster-register --confirm
 * ```
 */

/**
 * ★이 이름들 뿐★ — 지어내지 않는다 (2026-09-22)
 *
 * ── 어디서 왔나
 *   ① 60곳 — `/league/sanply/home/info` 를 화면 자동화로 끝까지 스크롤해 받았다.
 *      그 화면은 로그인 없이는 정확히 세 쪽(20×3)에서 더 안 늘어났다 — 두 번
 *      독립적으로 시도해 똑같이 60에서 멈췄다. 로그인은 하지 않았다.
 *   ② 35곳 — 사장님이 폰으로 `클랜랭킹`(래더순 2~95위) 화면을 스크린샷 두 장으로
 *      보내 주셨다. 그 화면은 폰에서는 끝까지 스크롤됐다. ①과 겹치는 이름은
 *      뺐다 (예: `너구리마을`·`엉금엉금`·`aeonic`·`시엘클랜`·`methodcrew`·`united`·
 *      `hilarious-`·`sixnight`·`warigari`·`necrosis` 는 이미 ①에 있었다).
 *
 *   합쳐서 ★95/95 다★ 다. 빠진 곳이 없다.
 *
 * ⚠ ★위장 문자에 주의★ — `cameIlia`·`Iovemate`·`CeIebrity`·`skybIue`·`aIIure`·
 *   `yourmyseIf`·`infIame`·`ctrI` 는 소문자 l 자리에 ★대문자 I★ 를 쓴 것이다.
 *   `celebrity`(소문자, 래더 899점) 와 `CeIebrity`(대문자I, 1,577점) 는
 *   ★서로 다른 두 클랜★ 이다 — 눈으로 구별이 안 되지만 실측 점수가 다르다 (D-221).
 */
export const SANPLY_ROSTER_NAMES: readonly string[] = [
  // ① home/info 스크롤 — 60곳
  'dearblue', 'angelique:', 'Asterism-', 'criticism', '에리스', 'celebrity', 'Catarsis',
  'cream', '＃chaseplay', 'margieIa-', 'ladyfirst', 'Iovemate', 'essentially', 'evenstarz',
  'yourlove', 'tranquilt', 'warigari', '鬼神。', '미니피그', 'cameIlia', '뷰티풀', '엉금엉금',
  'Chamundara', 'yeonnom', 'roses', 'serenitas', 'aIIure', 'gentry', '시엘클랜', '너구리마을',
  'myday', 'methodcrew', '땅어', 'vullady', 'infIame', 'yogurt', 'Вlackpearl', 'Apophis-',
  'bbibbo', 'afterpray', '마왕', 'aeonic', 'diavel', 'yourmyseIf', 'ThelVub', 'eternalrz',
  'necrosis', 'recentwct-', 'sixnight', 'chic', 'Mentalist-', 'skybIue', 'ctrI', 'saint',
  'MiraGe.', 'hilarious-', 'CeIebrity', 'united', 'overthere', 'respects-',
  // ② 클랜랭킹 2~95위 스크린샷 — ①과 안 겹치는 35곳
  '-tsAr.nTc', 'hingˇ', 'stylecIan', 'bbuu', 'lineclan', '또마토', 'bamboo', 'galactico-',
  'churr', 'maybe', 'Lullaby', 'mikael', "resun`z", 'Blitz-', 'line:', '[P.ro™]',
  "Grand'rN", 'merry', 'elice', 'untrue', 'bonny', '청순발랄', 'Valiant', "des'per@do",
  'Capri', '하룰라라', 'daytona', 'toheaven', 'rodenty', 'colorful',
  'Arc#', 'sometimes', '생지옥', 'sovereignwc', 'highway',
]

const DELAY_MS = 1500

export interface SanplyRosterResult {
  total: number
  found: number
  created: number
  joined: number
  already: number
  ambiguous: number
  notFound: number
  numbered: number
  blocked: boolean
  confirmed: boolean
  samples: string[]
}

const trimmed = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** ★클랜 번호를 받아 적는다★ — 없으면 명단 잡이 못 잇는다 (clanFindMissing.ts 와 같은 규칙) */
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

export async function runSanplyRosterRegister(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<SanplyRosterResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? SANPLY_ROSTER_NAMES.length

  const result: SanplyRosterResult = {
    total: SANPLY_ROSTER_NAMES.length,
    found: 0,
    created: 0,
    joined: 0,
    already: 0,
    ambiguous: 0,
    notFound: 0,
    numbered: 0,
    blocked: false,
    confirmed: confirm,
    samples: [],
  }

  if (!useChromeFetch()) {
    warn('★이 잡은 서버(크롬)에서만 돈다★ — 병영 검색이 노트북에서는 막힌다')
    return result
  }

  const league = await prisma.league.findUnique({ where: { slug: 'sanply' }, select: { id: true } })
  if (league === null) {
    warn('★sanply 리그가 없다★ — 아무것도 하지 않는다')
    return result
  }

  let done = 0
  for (const name of SANPLY_ROSTER_NAMES) {
    if (done >= limit || result.blocked) break
    done += 1

    let body: string
    try {
      const path = `/api/Search/GetSearchClanAll/${encodeURIComponent(name)}/1`
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

    let candidates: ReturnType<typeof candidatesOf>
    try {
      candidates = candidatesOf(JSON.parse(body)).filter((c) => c.clanName === name)
    } catch {
      result.notFound += 1
      await sleep(DELAY_MS)
      continue
    }

    if (candidates.length === 0) {
      result.notFound += 1
      if (result.samples.length < 60) result.samples.push(`★검색에 없다★ ${name}`)
      await sleep(DELAY_MS)
      continue
    }
    if (candidates.length > 1) {
      /* ★어느 쪽인지 모르면 손대지 않는다★ — 이름만 보고 고르지 않는다 (D-106 · D-221) */
      result.ambiguous += 1
      if (result.samples.length < 60) {
        result.samples.push(`★못 가림★ ${name} — 같은 이름 ${candidates.length}곳`)
      }
      await sleep(DELAY_MS)
      continue
    }

    const found = candidates[0]
    if (found === undefined) continue
    result.found += 1
    const slug = found.clanId

    if (!confirm) {
      if (result.samples.length < 60) result.samples.push(`찾음 ${name} → ${slug}`)
      await sleep(DELAY_MS)
      continue
    }

    let clanId: string
    const existing = await prisma.clan.findUnique({ where: { slug }, select: { id: true, name: true } })
    if (existing === null) {
      const made = await prisma.clan.create({
        data: {
          slug,
          name: found.clanName ?? name,
          markBgUrl: found.mark1,
          markFrontUrl: found.mark2,
          active: true,
        },
        select: { id: true },
      })
      clanId = made.id
      result.created += 1
      if (await fillClanNumber(clanId, slug)) result.numbered += 1
      await sleep(DELAY_MS)
    } else {
      clanId = existing.id
    }

    const has = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, clanId },
      select: { id: true, expelledAt: true },
    })
    if (has !== null && has.expelledAt === null) {
      result.already += 1
    } else if (has !== null) {
      /* ★전에 내렸던 자리면 되살린다★ — 지우지 않았으니 한 칸만 비운다 (CLAUDE.md 1-4) */
      await prisma.leagueClan.update({ where: { id: has.id }, data: { expelledAt: null } })
      result.joined += 1
      if (result.samples.length < 60) result.samples.push(`되살림 ${name}`)
    } else {
      await prisma.leagueClan.create({ data: { leagueId: league.id, clanId, division: 1 } })
      result.joined += 1
      if (result.samples.length < 60) result.samples.push(`등록 ${name} (${slug})`)
    }
    await sleep(DELAY_MS)
  }

  if (useChromeFetch()) closeBarracksBrowser()

  log(
    `열산 명단 대조 — 대상 ${result.total} · 찾음 ${result.found} · 만듦 ${result.created} · ` +
      `번호받음 ${result.numbered} · 등록 ${result.joined} · 이미있음 ${result.already} · ` +
      `못 가림 ${result.ambiguous} · 검색에 없음 ${result.notFound}` +
      (result.blocked ? ' · ★막힘★' : '') +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
