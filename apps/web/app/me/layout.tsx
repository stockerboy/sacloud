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
      <div className="pc-container mt-10 pb-10">
        <div className="text-3xl">마이페이지</div>
        <div className="mt-5 flex items-center border-b-2 border-b-divider text-xl">
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
    </AuthGuard>
  )
}
