import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

/**
 * 전역 셸 — 모든 페이지가 공유하는 헤더/본문/푸터 골격.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <nav class="fixed ...">                                   본문 흐름 밖(고정)
 * <div class="flex flex-col min-h-screen bg-gray-light">     본문 배경 #F2F2F2
 *   <div class="pt-18 flex-1"> …페이지 내용… </div>           고정 헤더 높이(4.5rem)만큼 위 여백
 *   <footer>
 * ```
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
      <div className="flex min-h-screen flex-col bg-page">
        <div className="flex-1 pt-nav">{children}</div>
        <SiteFooter />
      </div>
    </>
  )
}
