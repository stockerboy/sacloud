/**
 * ★배지 페이지★ — 일곱 그림을 걸어 두는 곳 (2026-09-17 사장님).
 *
 * > «페이지를 하나 더 만들어서 저 7개 걸어놓고 밑에 어떤 특성인지 쓰고
 * >  들어가면 뱃지 소유자들을 전부 보여줘»
 *
 * 그림은 일곱 장인데 ★이름은 여덟★ 이다 — 스나의 어택이 A장악력·B장악력으로 갈려
 * 둘이 황소 그림을 같이 쓴다 (사장님: «스나는 뱃지를 두개 만들어 A 장악력 B 장악력»).
 */
import Link from 'next/link'
import { BADGE_KEYS, BADGES, badgeArtPath } from '@sacloud/contract'
import { leagueBadgePath } from '@sacloud/ui'

/* ★갱신 주기 60초★ (2026-09-21) — 까닭은 `app/player/[playerId]/page.tsx` 에 한 번만 적었다 */
export const revalidate = 60


export const dynamic = 'force-static'

export default async function BadgeListPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  return (
    <main className="section-stack mx-auto w-full max-w-[--layout-max] px-4 py-6">
      <header className="border-b border-line-soft pb-4">
        <h1 className="text-[1.5rem] font-black tracking-tight text-text-strong">배지</h1>
        <p className="mt-2 text-[0.85rem] text-meta">
          여섯 축에서 앞선 선수에게 붙습니다. 배지를 누르면 그 배지를 가진 선수가 순위대로 나옵니다.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {BADGE_KEYS.map((key) => {
          const b = BADGES[key]
          return (
            <li key={key}>
              <Link prefetch={false}
                href={leagueBadgePath(leagueSlug, key)}
                className="flex h-full flex-col items-center gap-2 rounded-[2px] border border-line bg-card p-4 transition-colors hover:border-line-soft hover:bg-card-2"
              >
                <img
                  src={badgeArtPath(b)}
                  alt={b.label}
                  width={84}
                  height={84}
                  className="h-[84px] w-[84px] select-none"
                />
                <span className="text-center text-[0.95rem] font-bold text-text-strong">{b.label}</span>
                <span className="text-center text-[0.72rem] leading-snug text-faint">{b.note}</span>
                <span className="mt-auto text-[0.68rem] tracking-wide text-faint">
                  {b.weapons.length === 2 ? '스나 · 라플' : b.weapons[0] === 1 ? '스나만' : '라플만'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="text-[0.72rem] leading-relaxed text-faint">
        스나에게는 <b className="text-meta">샷터 · 크래커 · 어태커</b> 가 없고, 라플에게는{' '}
        <b className="text-meta">스나싸움마스터 · A장악력 · B장악력</b> 이 없습니다.
        그 무기로는 재지 않는 축이라 빈칸도 만들지 않습니다.
      </p>
    </main>
  )
}
