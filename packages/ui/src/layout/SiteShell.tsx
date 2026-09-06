import { SiteFooter } from './SiteFooter'
/* ★2026-09-07 (Part 10 ③) — 머리띠를 v2 로 갈아끼웠다★
   옛 판은 `./SiteHeader` 에 ★그대로★ 있다. 되돌리려면 아래 두 줄을 맞바꾼다.
   `import { SiteHeader } from './SiteHeader'` */
import { SiteHeaderV2 as SiteHeader } from '../v2/SiteHeaderV2'

/**
 * 전역 셸 — 모든 페이지가 공유하는 헤더/본문/푸터 골격.
 *
 * ── 2026-08-30: 자체 디자인(`적진`)
 *   헤더는 화면에 고정된 띠라 본문을 그만큼 내려 준다.
 *
 * ── ⚠ 2026-09-07 (Part 10 ③) — 띠 높이가 ★68px★ 로 바뀌었다 (시안 실측).
 *   값은 여기 없다. `styles.css` 의 `--spacing-nav` 한 줄이 ★머리띠·본문 밀림·
 *   리그 탭바 위치★ 셋을 함께 정한다. 옛 값은 `4.5rem`(72px) 이었다.
 *   본문 배경은 페이지 색 하나뿐이다 — 헤더·본문·푸터를 다른 색으로 나누지 않고
 *   **1px 선과 여백**으로만 구분한다.
 */
export function SiteShell({
  children,
  user,
  onLogout,
}: {
  children: React.ReactNode
  /** 로그인한 사용자 (없으면 비로그인) */
  user?: { nickname: string } | null
  onLogout?: () => void
}) {
  return (
    <>
      <SiteHeader user={user} onLogout={onLogout} />
      <div className="flex min-h-screen flex-col bg-page text-[var(--color-text,#d6c9c9)]">
        {/* 고정 헤더 높이만큼 본문을 내린다 — 머리띠와 ★같은 토큰★ 을 본다 */}
        <div className="flex-1 pt-[var(--spacing-nav,68px)]">{children}</div>
        <SiteFooter />
      </div>
    </>
  )
}
