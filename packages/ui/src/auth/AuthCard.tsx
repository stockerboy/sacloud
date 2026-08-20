import Link from 'next/link'
import { NavLogo } from '../layout/BrandLogo'

/**
 * 인증 화면 공용 카드.
 *
 * 원본 실측 구조 (2026-08-21)
 * ```
 * <div class="flex w-full h-screen justify-center items-center bg-gray-light">
 *   <div class="flex flex-col w-96 bg-white shadow-md rounded pb-3">        24rem(336px)
 *     <a class="flex flex-col justify-center items-center h-28 font-bold text-2xl">
 *       <div class="mt-6"><img class="w-9"></div><div class="mt-2">3rd.supply</div>
 *     <div class="px-8 py-6 text-mblack">
 *       <form>…</form>
 * ```
 * **인증 화면에는 전역 GNB·푸터가 없다.** 화면 전체를 덮는 단독 레이아웃이다 (원본 관측).
 * 로고를 누르면 홈으로 간다.
 */
export function AuthCard({
  children,
  footer,
}: {
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-page">
      <div className="flex w-96 flex-col rounded bg-card pb-3 shadow-md">
        <Link
          href="/"
          className="flex h-28 flex-col items-center justify-center text-2xl font-bold"
        >
          {/* 원본은 로고 이미지 + 서비스명 2줄. 우리 마크는 이름이 들어있어 한 줄로 둔다. */}
          <div className="mt-6">
            <NavLogo className="h-7 w-[152px]" tone="dark" />
          </div>
        </Link>
        <div className="px-8 py-6 text-input-fg">
          {children}
          {footer ? <div className="mt-4 text-center text-sm">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

/** 라벨 + 입력 한 줄 (원본: label `block font-bold mb-3`, 입력 높이 h-11) */
export function AuthField({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className ?? 'mb-4'}>
      <label className="mb-3 block font-bold">{label}</label>
      <div className="flex h-11 items-stretch">{children}</div>
    </div>
  )
}

/** 인증 화면 공용 입력 */
export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-line px-3 focus:outline-none ${props.className ?? ''}`}
    />
  )
}

/** 인증 화면 공용 제출 버튼 (원본 `btn-primary … w-full text-lg font-bold py-4 px-4 h-14`) */
export function AuthSubmit({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div className="my-8">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex h-14 w-full items-center justify-center rounded bg-more px-4 py-4 text-lg font-bold text-white shadow-card disabled:opacity-60"
      >
        {children}
      </button>
    </div>
  )
}
