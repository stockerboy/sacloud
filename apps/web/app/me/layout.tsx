'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 마이페이지 공통 레이아웃.
 *
 * 원본 라우팅 지도의 `/me` `/me/setting` `/me/password` `/me/link` 를 탭으로 묶는다.
 * 원본 화면 상세는 로그인이 필요해 관측하지 못했다 `[미확인]` —
 * 정보 구조(내 정보 / 정보 수정 / 비밀번호 변경 / 계정 연동)만 라우팅에서 확인했다.
 */
const TABS = [
  { label: '내 정보', href: '/me' },
  { label: '정보 수정', href: '/me/setting' },
  { label: '비밀번호 변경', href: '/me/password' },
  { label: '서든어택 계정 연동', href: '/me/link' },
]

export default function MeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''

  return (
    <AuthGuard>
      {/* 제목은 이 시안의 큰 제목 글꼴(`display`)을 쓰는 자리다 — 화면당 하나만 둔다 */}
      <div className="pc-container mt-14 pb-20">
        <h1 className="display text-3xl text-text-strong">마이페이지</h1>

        {/* 탭. 활성 표시는 **진홍 1px 밑줄** 하나다.
            예전에는 `border-b-black` 이라 검정 바탕에서 아예 보이지 않았다 */}
        <div className="mt-8 flex items-center gap-1 border-b border-line text-sm">
          {TABS.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`-mb-px border-b px-4 py-3 transition-colors duration-100 ${
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

        <div className="mt-10">{children}</div>
      </div>
    </AuthGuard>
  )
}
