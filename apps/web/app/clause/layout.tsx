'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 약관 문서 공통 레이아웃 — `적진`.
 *
 * 3rd.supply 재현을 그만뒀다 (2026-08-30). 원본의 `2px 검정 밑줄` 탭은 검정 바탕에서
 * 아예 보이지 않는다. 활성 표시는 이 시안의 규칙대로 **진홍 1px 밑줄** 하나로 바꿨다.
 *
 * 약관은 읽는 화면이다. 카드로 감싸지 않고 본문 폭만 좁혀(`max-w-[760px]`) 줄이 길어지지
 * 않게 한다 — 한 화면을 꽉 채우지 않는다.
 */

const TABS = [
  { label: '이용약관', href: '/clause/service' },
  { label: '개인정보 취급방침', href: '/clause/policy' },
]

export default function ClauseLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="pc-container mt-14">
      <div className="flex items-stretch gap-1 border-b border-line text-sm">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px flex items-center justify-center border-b px-4 py-3 transition-colors duration-100 ${
                active
                  ? 'border-accent font-bold text-text-strong'
                  : 'border-transparent text-meta hover:text-text'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="mt-10 max-w-[760px]">{children}</div>
    </div>
  )
}
