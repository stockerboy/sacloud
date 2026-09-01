'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EGG_SYSTEM_ENABLED } from '@sacloud/ui'

/**
 * ⚠ 2026-09-02 — **「알」 탭을 감췄다** (사용자 지시: *"알 좀 버려 일단"* · D-252).
 *
 * 지운 것이 아니라 **스위치를 태웠다** (`CLAUDE.md` 10-4).
 * `EGG_SYSTEM_ENABLED` 를 `true` 로 되돌리면 탭이 제자리(경기 다음)로 돌아온다.
 *
 * `/admin/eggs` 화면과 `/api/admin/eggs` · `EggBreak` 테이블은 **그대로 있다.**
 * 주소를 직접 치면 열린다 — 데이터를 되돌릴 길을 막지 않기 위해서다.
 */
const MENU = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/clans', label: '클랜' },
  { href: '/admin/seasons', label: '시즌' },
  { href: '/admin/matches', label: '경기' },
  ...(EGG_SYSTEM_ENABLED ? [{ href: '/admin/eggs', label: '알' }] : []),
  /* 클랜 마스터 인증 심사 (2026-09-01 · D-253) — 사진을 보고 승인/거부한다 */
  { href: '/admin/clan-master-claims', label: '마스터인증' },
  { href: '/admin/legacy', label: '과거기록' },
]

/**
 * 관리자 공통 틀 — `적진`.
 *
 * 3rd.supply 재현을 그만뒀다 (2026-08-30). 별도 툴처럼 보이게 만들지 않는다는 원칙은 그대로다 —
 * 사이트와 **같은 토큰**을 쓴다. 화려함보다 **실수하기 어렵고 상태가 분명한 것**을 우선한다.
 *
 * ── 정보 밀도는 높아도 된다. 다만 **선을 줄이고 여백으로 나눈다**
 *   패널마다 테두리를 두르는 대신 제목 + 여백으로 끊고, 표 안에서만 옅은 1px 선을 쓴다.
 *
 * ── 검정 바탕에서 안 보이던 것들을 고쳤다
 *   제목이 `text-ink`(#060505, 바닥과 같은 색)라 보이지 않았고, 활성 탭 밑줄이
 *   `border-b-black` 이라 역시 보이지 않았다. 각각 `text-text-strong` · 진홍 밑줄로 바꿨다.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="pc-container mt-14 pb-24">
      <div className="flex items-baseline gap-3">
        <h1 className="display text-3xl text-text-strong">운영 관리</h1>
        <span className="rounded border border-line px-2 py-0.5 text-xs text-meta">관리자 전용</span>
      </div>

      <nav className="mt-8 flex gap-1 border-b border-line text-sm">
        {MENU.map((item) => {
          const active =
            item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-mb-px border-b px-4 py-3 transition-colors duration-100 ${
                active
                  ? 'border-accent font-bold text-text-strong'
                  : 'border-transparent text-meta hover:text-text'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-10">{children}</div>
    </div>
  )
}

/**
 * 권한 없음.
 * 면을 칠하지 않고 왼쪽 진홍 선 하나로 표시한다 — 막힌 화면이라는 것만 분명하면 된다.
 */
export function AdminDenied({ message }: { message: string }) {
  return <div className="border-l-2 border-accent py-1 pl-4 text-sm text-text">{message}</div>
}

/**
 * 관리 화면의 한 덩어리.
 * **테두리를 두르지 않는다.** 제목 아래 옅은 선 하나와 넉넉한 아래 여백으로 끊는다.
 */
export function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 border-b border-line-soft pb-2 text-sm font-bold text-text-strong">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * 숫자 한 칸.
 * 숫자는 `--font-num` + tabular-nums 로 쓴다 (`.num`). 자릿수가 흔들리면 표가 지저분해진다.
 */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="min-w-32 border-l border-line-soft py-1 pl-4">
      <div className="text-xs text-meta">{label}</div>
      <div className="num mt-1 text-2xl text-text-strong">{value}</div>
      {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
    </div>
  )
}

/** 관리 화면 공용 입력 — focus 에서만 진홍이 켜진다 */
export function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 rounded border border-line bg-card-2 px-3 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

/** 관리 화면 공용 선택 */
export function AdminSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

/**
 * 관리 화면 공용 버튼.
 *
 * `tone="danger"` 만 진홍 테두리를 갖는다 — **되돌릴 수 없는 동작**에만 쓴다.
 * 나머지는 회색 선이고, 가리켰을 때만 진홍이 든다 (`.btn-line`).
 */
export function AdminButton({
  children,
  tone,
  disabled,
  onClick,
  className,
}: {
  children: React.ReactNode
  tone?: 'default' | 'danger'
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-line h-9 px-4 text-sm disabled:opacity-50 ${
        tone === 'danger' ? 'border-accent text-text-strong' : ''
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
