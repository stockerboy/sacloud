import Link from 'next/link'
import { SITE_BRAND } from '../site-config'

/**
 * 전역 푸터.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 짰다
 *   최소한만 남긴다 — 약관 링크 둘, 저작권, 문의처. 배경으로 면을 칠하지 않고
 *   본문과 같은 검정 위에 **위쪽 1px 선 하나**로만 갈라 놓는다.
 *
 * 링크는 원본과 동일하게 새 탭으로 연다.
 * 상호·연락처·저작권 값은 원본 문구를 쓰지 않고 우리 값이다 (CLAUDE.md 3장 4번).
 */
const CLAUSE_LINKS = [
  { label: '이용약관', href: '/clause/service' },
  { label: '개인정보 취급방침', href: '/clause/policy' },
]

export function SiteFooter() {
  return (
    <footer className="mt-[var(--section-gap,40px)] border-t border-line">
      <div className="mx-auto flex w-full max-w-[var(--layout-max,1120px)] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-[12px] text-[var(--color-faint,#6b5555)] max-md:px-3">
        {CLAUSE_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener"
            className="text-meta transition-colors duration-100 hover:text-accent"
          >
            {link.label}
          </Link>
        ))}

        <span className="ml-auto max-md:ml-0">{SITE_BRAND.copyright}</span>

        <a
          href={`mailto:${SITE_BRAND.contactEmail}`}
          target="_blank"
          rel="noopener"
          className="transition-colors duration-100 hover:text-accent"
        >
          {SITE_BRAND.contactEmail}
        </a>
      </div>
    </footer>
  )
}
