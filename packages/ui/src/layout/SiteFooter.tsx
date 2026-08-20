import Link from 'next/link'
import { SITE_BRAND } from '../site-config'

/**
 * 전역 푸터.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex-1 bg-black mt-12 text-gray-200">     배경 #000 / 글자 #E5E7EB / 위 여백 3rem
 *   <div class="pc-container py-5 tracking-wide">       상하 여백 1.25rem / 자간 0.025em
 *     <div class="mb-8 space-x-5"> 이용약관 · 개인정보 취급방침
 *     <div> 저작권 표기
 *     "Terms of Service | 문의 :" + 메일 링크
 * ```
 * 링크는 원본과 동일하게 새 탭으로 연다.
 * 상호·연락처·저작권 값은 원본 문구를 쓰지 않고 우리 값으로 채웠다 (CLAUDE.md 3장 4번).
 */
const CLAUSE_LINKS = [
  { label: '이용약관', href: '/clause/service' },
  { label: '개인정보 취급방침', href: '/clause/policy' },
]

export function SiteFooter() {
  return (
    <div className="mt-12 flex-1 bg-ink text-nav-fg">
      <div className="pc-container py-5 tracking-wide">
        {/*
          원본은 `space-x-5`(항목 사이 1.25rem = 17.5px)를 쓴다.
          Tailwind v4의 `space-x-*`는 v2와 적용 대상이 달라(마지막을 제외한 앞쪽에 붙는다)
          같은 그림이 나오지 않으므로, 첫 항목을 제외하고 왼쪽 여백을 직접 준다.
        */}
        <div className="mb-8">
          {CLAUSE_LINKS.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener"
              className={index === 0 ? undefined : 'ml-5'}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div>{SITE_BRAND.copyright}</div>
        {SITE_BRAND.contactLabel}{' '}
        <a href={`mailto:${SITE_BRAND.contactEmail}`} target="_blank" rel="noopener">
          {SITE_BRAND.contactEmail}
        </a>
      </div>
    </div>
  )
}
