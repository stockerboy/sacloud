'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 약관 문서 공통 레이아웃.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="pc-container">
 *   <div class="flex items-stretch text-xl border-b-2 border-b-gray-200">
 *     <a class="clause-item [active]">이용약관</a>
 *     <a class="clause-item [active]">개인정보 취급방침</a>
 *   <div class="mt-10"> …문서 본문… </div>
 * ```
 * `.clause-item` : padding 1rem 1.5rem · margin-bottom -2px (아래 테두리 위에 겹침)
 * `.clause-item.active` : 아래 테두리 2px 검정 + 굵게
 */

const TABS = [
  { label: '이용약관', href: '/clause/service' },
  { label: '개인정보 취급방침', href: '/clause/policy' },
]

export default function ClauseLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="pc-container">
      <div className="flex items-stretch border-b-2 border-b-divider text-xl">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-[2px] flex items-center justify-center px-6 py-4 ${
              pathname === tab.href ? 'border-b-2 border-b-black font-bold' : ''
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="mt-10">{children}</div>
    </div>
  )
}
