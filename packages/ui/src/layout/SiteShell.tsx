import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

/**
 * 전역 셸 — 모든 페이지가 공유하는 헤더/본문/푸터 골격.
 *
 * ── 2026-08-30: 자체 디자인(`적진`)
 *   헤더는 화면에 고정된 64px 띠라 본문을 그만큼 내려 준다.
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
        {/* 고정 헤더 높이만큼 본문을 내린다 — `SiteHeader` 의 `NAV_HEIGHT` 와 같은 값이다 */}
        <div className="flex-1 pt-[var(--spacing-nav,64px)]">{children}</div>
        <SiteFooter />
      </div>
    </>
  )
}
