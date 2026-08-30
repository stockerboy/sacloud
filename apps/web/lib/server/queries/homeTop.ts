import { prisma } from '@sacloud/db'
import { HOME_LEAGUES, HOME_TOP_SIZE, type HomeLeagueTop, type HomeTop } from '@sacloud/contract'
import { getPlayerRanks } from './leagues'
import { publicOriginWhere } from './publicScope'

/**
 * 메인페이지 · 리그별 개인랭킹 TOP3 (`docs/SITE_SPEC_V2.md` 3절).
 *
 * ── 순위를 여기서 다시 계산하지 않는다
 *   `getPlayerRanks`(개인랭킹 화면이 쓰는 바로 그 질의)를 크기 3으로 부르고
 *   필요한 칸만 옮겨 담는다. 정렬(`rating desc, id asc`) · 배치고사 제외 ·
 *   모집단 규칙이 랭킹 화면과 **한 곳에서** 나오게 하기 위해서다.
 *   여기에 따로 `orderBy` 를 적으면 두 화면이 조용히 갈라진다.
 *
 * ── 리그가 없거나 비어 있으면 빈 배열이다
 *   무소속리그(`nolink`)는 2026-08-30 현재 등록 클랜이 0이라 개인랭킹도 0건이다.
 *   자리를 0점으로 메우거나 다른 리그 선수를 끌어오지 않는다 (CLAUDE.md 3장 7번).
 *   화면은 그 자리에 "아직 기록이 없습니다"만 그린다.
 *
 * ── 킬뎃은 애초에 담지 않는다
 *   무소속리그는 누적 킬뎃을 감춘다 (D-107). 계약(`HomeTopRow`)이 그 칸을
 *   갖고 있지 않으므로 리그별로 다르게 지울 것이 없다.
 */
export async function getHomeTop(): Promise<HomeTop> {
  /* 개발용 시드 리그는 공개 화면에서 뺀다 (D-116) */
  const leagues = await prisma.league.findMany({
    where: { slug: { in: HOME_LEAGUES.map((entry) => entry.slug) }, ...publicOriginWhere() },
    select: { id: true, slug: true, name: true },
  })
  const bySlug = new Map(leagues.map((league) => [league.slug, league]))

  const rows = await Promise.all(
    HOME_LEAGUES.map(async (entry): Promise<HomeLeagueTop> => {
      const league = bySlug.get(entry.slug)
      /* 리그 자체가 없으면 약칭 표의 이름으로 물러난다. 칸을 통째로 없애지는 않는다 —
         메인에 세 리그가 나란히 있다는 것 자체가 사양이다 */
      if (!league) return { slug: entry.slug, abbr: entry.abbr, name: entry.name, rows: [] }

      const page = await getPlayerRanks(league.id, null, HOME_TOP_SIZE)
      return {
        slug: league.slug,
        abbr: entry.abbr,
        name: league.name,
        rows: (page?.items ?? []).map((row) => ({
          rank: row.rank,
          player: row.player,
          clan: row.clan,
          rating: row.rating,
        })),
      }
    }),
  )

  return { leagues: rows }
}
