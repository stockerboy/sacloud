'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MENU = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/clans', label: '클랜' },
  { href: '/admin/seasons', label: '시즌' },
  { href: '/admin/matches', label: '경기' },
  { href: '/admin/legacy', label: '과거기록' },
]

/**
 * 관리자 공통 틀.
 *
 * 별도 툴처럼 보이게 만들지 않는다 — 기존 디자인 토큰을 그대로 쓴다 (정책 26).
 * 화려함보다 **실수하기 어렵고 상태가 분명한 것**을 우선한다.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="pc-container mt-6">
      <div className="mb-4 flex items-center">
        <h1 className="text-2xl font-semibold text-ink">운영 관리</h1>
        <span className="ml-3 rounded border border-divider px-2 py-0.5 text-xs text-meta">
          관리자 전용
        </span>
      </div>
      <nav className="mb-6 flex border-b border-divider text-lg">
        {MENU.map((item) => {
          const active = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 ${active ? 'border-b-[3px] border-b-black font-bold' : 'text-meta'}`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}

export function AdminDenied({ message }: { message: string }) {
  return (
    <div className="rounded border border-lose-line bg-lose-bg p-6 text-center text-lose">
      {message}
    </div>
  )
}

export function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded border border-divider bg-card p-4">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-32 rounded border border-divider p-3">
      <div className="text-sm text-meta">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-meta">{hint}</div> : null}
    </div>
  )
}
