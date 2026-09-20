import Link from 'next/link'
import { BADGES, badgeArtSmallPath, type BadgeDef } from '@sacloud/contract'
import { FEATURED_LEAGUES, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★메인의 배지 진열장★★ (2026-09-20 사장님)
 *
 * > 「뱃지를 전부 다 메인화면에 이쁘게 진열하고 누르면 뱃지 페이지로 가게해줘.
 * >  그리고 거기서 ipl pl 열산 나눠서 뱃지별로 누르면 그 랭킹나열 쭉 볼 수 있게해줘」
 *
 * ```
 *     ⬢    ⬢    ⬢    ⬢    ⬢       ← 배지 아홉
 *    샷터  크래커 ...                누르면 그 배지의 랭킹으로
 *
 *   리그를 먼저 고른다 :  IPL · PL · 열산리그
 * ```
 *
 * ── ★리그를 먼저 고른다★
 *   배지 페이지 주소가 `/league/{slug}/badge/{key}` 라 ★리그가 있어야★ 간다.
 *   그래서 진열장 위에 리그 단추를 두고, 고른 리그로 보낸다.
 *   ⚠ 이 부품은 ★상태가 없다★ — 리그마다 한 줄씩 그려 놓고 `<details>` 로 접는다.
 *     서버에서 그려 보내므로 폰으로 내려가는 자바스크립트가 0바이트다.
 *
 * ── ★없는 배지를 지어내지 않는다★
 *   `BADGES` 한 곳이 목록이다. 무기별로 못 받는 배지가 있는데, 진열장은
 *   ★배지라는 것이 무엇이 있는지★ 를 보여 주는 자리라 전부 늘어놓는다.
 *   누가 받았는지는 눌러서 들어간 페이지가 말한다.
 */

/** 같은 그림을 쓰는 배지가 있다 (A장악력·B장악력·어태커가 모두 `attacker`) — 그림 기준으로 접는다 */
const WALL: readonly BadgeDef[] = (() => {
  const seen = new Set<string>()
  const out: BadgeDef[] = []
  for (const b of Object.values(BADGES)) {
    if (seen.has(b.key)) continue
    seen.add(b.key)
    out.push(b)
  }
  return out
})()

/*
 * ★차례는 C1 · IPL · PL · 열산리그★ — 사장님이 적으신 「ipl pl 열산 나눠서」 앞에
 * ★C1 을 붙였다★ (2026-09-20 밤). 홈 리그 단추(`HomeLeagueButtons`)와 같은 차례다.
 * ⚠ `FEATURED_LEAGUES` 의 차례는 ★안 건드린다★ — 상단바가 같이 쓴다.
 */
const HOME_ORDER = ['c1', 'nolink', 'supply', 'sanply'] as const

const LEAGUES = HOME_ORDER.flatMap((slug) => {
  const found = FEATURED_LEAGUES.find((league) => league.href === `/league/${slug}`)
  if (!found || isLeaguePreparing(slug)) return []
  return [{ slug: slug as string, label: found.label }]
})

export function HomeBadgeWall() {
  if (LEAGUES.length === 0) return null

  return (
    <section
      aria-label="배지"
      className="mt-[30px] w-full max-w-[940px] border-t border-[var(--v2-head-divider)] pt-[22px]"
    >
      <div className="flex items-baseline gap-[10px]">
        <h2 className="text-[15px] font-bold text-[var(--v2-text-strong)]">배지</h2>
        <p className="text-[12px] text-[var(--v2-text-dim)]">
          누르면 그 배지를 받은 선수들이 쭉 나옵니다
        </p>
      </div>

      {/* 리그마다 한 줄. 첫 리그는 펼쳐 둔다 — 접힌 채로만 두면 있는 줄 모른다 */}
      <div className="mt-[14px] flex flex-col gap-[10px]">
        {LEAGUES.map((league, i) => (
          <details
            key={league.slug}
            open={i === 0}
            className="group rounded-[12px] border border-[var(--v2-row-divider)] bg-[rgba(255,255,255,.02)]"
          >
            <summary className="flex cursor-pointer list-none items-center gap-[8px] px-[14px] py-[11px] text-[13px] font-bold tracking-[.08em] text-[var(--v2-text-dim)] marker:content-none [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="text-[11px] text-[var(--v2-text-ghost2)]">
                ▸
              </span>
              {league.label}
            </summary>

            <div className="grid grid-cols-5 gap-[10px] px-[14px] pb-[14px] max-md:grid-cols-3">
              {WALL.map((badge) => (
                <Link
                  key={badge.key}
                  href={`/league/${league.slug}/badge/${badge.key}`}
                  title={`${badge.label} — ${badge.note}`}
                  className="flex flex-col items-center gap-[5px] rounded-[10px] px-[4px] py-[8px] transition-colors duration-150 hover:bg-[rgba(255,255,255,.04)]"
                >
                  {/*
                    ⚠ ★`width`·`height` 를 반드시 준다★ — 없으면 폰에서 가로가 0 이 된다
                      (`HomeLeagueTiles` 가 같은 함정을 적어 뒀다).
                  */}
                  <img
                    src={badgeArtSmallPath(badge)}
                    width={64}
                    height={64}
                    alt=""
                    aria-hidden
                    className="block h-[42px] w-[42px] max-md:h-[36px] max-md:w-[36px]"
                  />
                  {/* `a { color: inherit }` — 색은 안쪽 span 에 준다 (D-231) */}
                  <span className="block w-full break-keep text-center text-[10.5px] leading-[1.2] text-[var(--v2-text-dim)] max-md:text-[9.5px]">
                    {badge.label}
                  </span>
                  {/*
                    ★★무기 전용 배지는 그렇다고 적는다★★ (2026-09-20 사장님:
                      「뱃지들중에 스나전용인거랑 라플전용인 뱃지는 표시해줘」)

                    배지마다 받을 수 있는 무기가 정해져 있다 (`BADGES[].weapons`).
                    ★둘 다 받을 수 있는 배지는 아무 말도 안 적는다★ — 그게 기본이라
                    적으면 줄만 늘어난다. ★한쪽 전용일 때만★ 한 마디 붙인다.

                    무기 값은 `1` 스나 · `0` 라플이다 (CLAUDE.md 5장).
                  */}
                  {badge.weapons.length === 1 ? (
                    <span
                      className={
                        'mt-[1px] block rounded-[3px] px-[4px] py-[1px] text-center text-[9px] leading-[1.3] max-md:text-[8.5px] ' +
                        (badge.weapons[0] === 1
                          ? 'bg-[rgba(143,240,255,.12)] text-[#8ff0ff]'
                          : 'bg-[rgba(255,154,61,.12)] text-[#ff9a3d]')
                      }
                    >
                      {badge.weapons[0] === 1 ? '스나 전용' : '라플 전용'}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
