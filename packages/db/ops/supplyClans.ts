/**
 * 서플라이 공식리그 참가 클랜 이관 (D-124).
 *
 * ── 무엇을 옮기는가
 *   3rd.supply 공식리그의 **실제 참가 클랜**이다. 공개 SSR payload에서 읽은 스냅샷
 *   (`data/supply-official-clans.json`)만 근거로 쓴다.
 *
 * ── 경기에서 본 클랜은 참가 클랜이 아니다
 *   `guild_name`에 등장했다 · 상대전적에 나왔다 · 이름이 비슷하다 —
 *   **어느 것도 공식 참가 근거가 아니다.** 실제로 상대전적에서 22개 클랜을 더 찾았지만
 *   공식 목록 근거가 없어 넣지 않았다.
 *
 * ── 아직 48개가 아니다
 *   원본은 `48개의 클랜 참여중`이라고 표시한다. 공개 경로에서 확인된 것은 **44개**다.
 *   나머지 4개는 커서 페이지네이션 뒤에 있고, 그 API는 직접 접근이 차단돼 있다.
 *   **차단을 우회하지 않았고, 4개를 만들어 채우지도 않았다.**
 *   화면에 48이라고 쓰지 않는다 — 확인된 수만 쓴다.
 *
 * ── slug 정규화
 *   기존 DB의 클랜은 dev 발판이 만든 `real-` 접두사를 달고 있었다
 *   (`real-ulsan-cian`). 실제 slug는 `ulsanulsan`이다.
 *   canonical slug로 바꾸되 **옛 slug를 `ClanAlias`로 남겨** 기존 링크가 죽지 않게 한다.
 */
import { prisma } from '../src/index'

export interface SupplyClanSnapshot {
  source: string
  capturedAt: string
  officialTotalReported: number
  markUrlPrefix: string
  /** [sourceClanId, slug, name, division, markBgFile, markFrontFile] */
  clans: [number, string, string, number, string, string][]
}

export interface ClanImportRow {
  sourceClanId: string
  slug: string
  name: string
  division: number
  markBgUrl: string | null
  markFrontUrl: string | null
}

/** 스냅샷 → 이관 입력. 여기서 형태를 확정해 두면 아래는 DB만 다룬다 */
export function toImportRows(snapshot: SupplyClanSnapshot): ClanImportRow[] {
  const prefix = snapshot.markUrlPrefix
  return snapshot.clans.map(([id, slug, name, division, bg, front]) => ({
    sourceClanId: String(id),
    slug,
    name,
    division,
    markBgUrl: bg ? `${prefix}${bg}` : null,
    markFrontUrl: front ? `${prefix}${front}` : null,
  }))
}

export interface SupplyClanImportResult {
  rows: number
  clansCreated: number
  clansUpdated: number
  slugRenamed: { from: string; to: string }[]
  aliasesKept: number
  leagueClansCreated: number
  leagueClansUpdated: number
  marksSet: number
  skipped: { slug: string; reason: string }[]
}

/**
 * 기존 클랜 찾기 — **추측하지 않는다.**
 *
 * 1. `sourceClanId`가 같으면 같은 클랜이다 (가장 강한 근거)
 * 2. slug가 정확히 같으면 같은 클랜이다
 * 3. dev 발판이 만든 `real-<이름>` 형태는 **이름이 정확히 같을 때만** 잇는다
 *
 * 이름이 비슷하다는 이유로 잇지 않는다 (D-036).
 */
async function findExistingClan(row: ClanImportRow) {
  const bySource = await prisma.clan.findFirst({
    where: { sourceClanId: row.sourceClanId },
    select: { id: true, slug: true, name: true },
  })
  if (bySource) return bySource

  const bySlug = await prisma.clan.findUnique({
    where: { slug: row.slug },
    select: { id: true, slug: true, name: true },
  })
  if (bySlug) return bySlug

  // dev 발판(`real-`)이 만든 행. **이름 완전 일치**만 인정한다
  const devPlaceholder = await prisma.clan.findFirst({
    where: { slug: { startsWith: 'real-' }, name: row.name },
    select: { id: true, slug: true, name: true },
  })
  return devPlaceholder
}

export async function importSupplyOfficialClans(input: {
  snapshot: SupplyClanSnapshot
  leagueSlug: string
  confirm?: boolean
}): Promise<SupplyClanImportResult> {
  const result: SupplyClanImportResult = {
    rows: 0,
    clansCreated: 0,
    clansUpdated: 0,
    slugRenamed: [],
    aliasesKept: 0,
    leagueClansCreated: 0,
    leagueClansUpdated: 0,
    marksSet: 0,
    skipped: [],
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    result.skipped.push({ slug: '-', reason: `리그를 찾을 수 없다: ${input.leagueSlug}` })
    return result
  }

  for (const row of toImportRows(input.snapshot)) {
    result.rows += 1
    const existing = await findExistingClan(row)

    if (!input.confirm) {
      if (!existing) result.clansCreated += 1
      else {
        result.clansUpdated += 1
        if (existing.slug !== row.slug) result.slugRenamed.push({ from: existing.slug, to: row.slug })
      }
      continue
    }

    let clanId: string
    if (existing) {
      /* slug를 canonical로 바꾸기 전에 **옛 slug를 별칭으로 남긴다.**
         기존 링크(`/clan/real-ulsan-cian`)가 죽지 않게 하기 위해서다. */
      if (existing.slug !== row.slug) {
        await prisma.clanAlias.upsert({
          where: { alias: existing.slug },
          create: { clanId: existing.id, alias: existing.slug, source: 'manual' },
          update: { clanId: existing.id },
        })
        result.aliasesKept += 1
        result.slugRenamed.push({ from: existing.slug, to: row.slug })
      }

      await prisma.clan.update({
        where: { id: existing.id },
        data: {
          slug: row.slug,
          name: row.name,
          sourceClanId: row.sourceClanId,
          markBgUrl: row.markBgUrl,
          markFrontUrl: row.markFrontUrl,
          category: 'official',
          origin: '3rd.supply',
          active: true,
        },
      })
      clanId = existing.id
      result.clansUpdated += 1
    } else {
      const created = await prisma.clan.create({
        data: {
          slug: row.slug,
          name: row.name,
          sourceClanId: row.sourceClanId,
          markBgUrl: row.markBgUrl,
          markFrontUrl: row.markFrontUrl,
          category: 'official',
          origin: '3rd.supply',
        },
        select: { id: true },
      })
      clanId = created.id
      result.clansCreated += 1
    }

    if (row.markBgUrl || row.markFrontUrl) result.marksSet += 1

    /* 리그 참가.
       **rating·승패를 원본에서 가져오지 않는다.** SACLOUD Beta는 전원 같은 출발점에서
       시작한다(D-101). 원본 점수를 옮기면 베타가 원본의 연장이 되어 버린다. */
    const membership = await prisma.leagueClan.findUnique({
      where: { leagueId_clanId: { leagueId: league.id, clanId } },
      select: { id: true, division: true },
    })
    if (membership) {
      if (membership.division !== row.division) {
        await prisma.leagueClan.update({
          where: { id: membership.id },
          data: { division: row.division },
        })
      }
      result.leagueClansUpdated += 1
    } else {
      await prisma.leagueClan.create({
        data: { leagueId: league.id, clanId, division: row.division },
      })
      result.leagueClansCreated += 1
    }
  }

  return result
}
