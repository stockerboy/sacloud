import Link from 'next/link'
import { NavLogo } from '../layout/BrandLogo'

/**
 * 인증 화면 공용 카드 — `적진`.
 *
 * 3rd.supply 재현을 그만뒀다 (2026-08-30). 원본의 `w-96 · 흰 카드 · shadow-md ·
 * 화면 높이 꽉 채우기` 구조는 더 이상 기준이 아니다. 대신 이 시안의 규칙을 따른다.
 *
 * ── 좁고 조용하게
 *   카드 폭은 **420px 를 넘지 않는다.** 로그인은 사이트에서 가장 할 말이 적은 화면이다.
 *   화면을 꽉 채우지 않고, 세로도 가운데 정렬만 하되 위아래에 넉넉히 숨을 남긴다.
 *
 * ── 그림자 없음 · 반경 2px
 *   경계는 1px `--color-line` 이 만든다. `shadow-md` 를 걷어냈다.
 *
 * ── 로고는 카드 **바깥** 위에 둔다
 *   카드 안에 로고 자리를 크게 비워 두면(원본 `h-28`) 조용한 카드가 아니라 큰 카드가 된다.
 *
 * **인증 화면에는 전역 GNB·푸터가 없다** (`AppShell` 이 경로로 판단). 로고를 누르면 홈으로 간다.
 */
export function AuthCard({
  children,
  footer,
}: {
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-page px-4 py-16">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-8 flex items-center justify-center">
          {/*
            ⚠ 여기에는 `tone="dark"`(= `--color-ink` #060505) 가 붙어 있었다.
            원본 재현 때 카드가 **흰색**이었을 때의 값인데, `적진`(D-204)으로 갈아 끼우면서
            바탕이 `--color-page`(#060505) 가 됐다 — 로고가 바탕과 같은 색이 되어 보이지 않았다.
            `tone` 속성 자체는 남겨 둔다(CLAUDE.md 10-4). 여기서만 기본값(밝게)으로 되돌린다.
            폭은 못박지 않는다 — 확정 로고는 두 줄이라 비율이 다르다. 높이만 준다.
          */}
          <NavLogo className="h-9 w-auto" />
        </Link>

        <div className="rounded border border-line bg-card px-7 py-8 text-text">{children}</div>

        {footer ? <div className="mt-6 text-center text-sm text-meta">{footer}</div> : null}
      </div>
    </div>
  )
}

/**
 * 인증 화면 제목.
 *
 * 카드 안 첫 줄이다. `--font-display` 는 큰 제목 전용이므로 여기서는 쓰지 않고,
 * 본문 글꼴을 굵게만 올린다 — 로그인 화면에 큰 활자가 들어가면 조용하지 않다.
 */
export function AuthTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-base font-bold tracking-tight text-text-strong">{children}</h1>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-meta">{hint}</p> : null}
    </div>
  )
}

/** 라벨 + 입력 한 줄 */
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
    <div className={className ?? 'mb-5'}>
      <label className="mb-2 block text-sm font-bold text-meta">{label}</label>
      <div className="flex h-11 items-stretch">{children}</div>
    </div>
  )
}

/**
 * 인증 화면 공용 입력.
 *
 * 면은 `--color-card` 와 같은 어둠에서 한 단만 올리고(`bg-card-2`), 테두리 1px 로 형태를 잡는다.
 * **focus 에서만 진홍이 켜진다** — 이 화면에서 빨강이 나오는 자리는 여기 하나다.
 * 전역 `:focus-visible` 아웃라인이 테두리와 겹쳐 두 겹으로 보이므로 `focus:outline-none` 을 둔다.
 */
export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-line bg-card-2 px-3 text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

/**
 * 인증 화면 공용 제출 버튼.
 *
 * **면을 진홍으로 채우지 않는다** (`적진` 규칙 3 — 빨강은 아껴 쓴다).
 * 평소에는 한 단 올린 면 + 1px 선이고, 가리켰을 때만 테두리에 진홍이 든다.
 * 높이는 입력칸(h-11)과 맞춘다 — 원본의 `h-14` 는 이 폭에서 너무 크다.
 */
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
    <div className="mt-7">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="btn-line h-11 w-full text-sm font-bold disabled:opacity-50"
      >
        {children}
      </button>
    </div>
  )
}

/**
 * 인증 화면 오류 줄.
 *
 * 실패는 이 시안에서 **빨강을 써도 되는** 몇 안 되는 자리다. 다만 면을 칠하지 않고
 * 왼쪽 2px 선 하나로만 표시한다.
 */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 border-l-2 border-accent pl-3 text-sm text-text">{children}</div>
  )
}

/** 인증 화면 안내 줄 (성공·대기 등). 색을 쓰지 않는다 */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 border-l-2 border-line pl-3 text-sm text-meta">{children}</div>
  )
}
