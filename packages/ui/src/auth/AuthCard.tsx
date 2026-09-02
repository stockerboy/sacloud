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
  hint,
  error,
}: {
  label: string
  children: React.ReactNode
  className?: string
  /**
   * ★치기 **전에** 보여 주는 한 줄★ (2026-09-03 · O-032 ②③).
   *
   * ══ 왜 필요한가 — 열에 여덟이 첫 칸에서 튕긴다 ══
   *
   * 강민재가 선수 23,562명 이름을 아이디 규칙에 그대로 넣어 봤다.
   * ```
   * 그대로 아이디가 되는 이름   4,400명   18.7%
   * 튕기는 이름              19,162명   ★81.3%★
   *   └ 영문으로 시작 안 함   16,768명   71.2%   ← 한글 닉이 여기 다 들어간다
   * ```
   * 서든 유저는 아이디 칸에 **자기 닉네임**을 넣는다. 그런데 `허진석` 을 치면
   * 「영문으로 시작하는 4~16자」라고만 나오고 **「그럼 뭘 넣으라는 거냐」가 어디에도 없다.**
   *
   * > 민재 말 그대로다 — *"규칙을 말해 주는 것과 답을 보여 주는 건 다르다."*
   *
   * 그래서 이 자리에 **예시**를 적는다. 규칙이 아니라 **답**이다.
   * 비밀번호·닉네임도 같다 — 짧게 치고 나서야 알려 주지 말고 **빈 칸일 때부터** 적는다.
   *
   * ⚠ 아이디 **규칙 자체는 안 바꾼다.** 이 판은 규칙을 그대로 두고 사람이 통과하게 돕는 것이다.
   */
  hint?: React.ReactNode
  /**
   * ★오류를 **그 칸 밑에** 붙인다★ (O-032 ④).
   *
   * 전에는 「이미 사용 중인 아이디입니다」가 **버튼 바로 위**에 떴는데
   * 아이디 칸은 **화면 맨 위**다. 사람이 위아래를 오가며 어느 칸인지 찾아야 했다.
   * 서버는 어느 칸인지까지 알려 준다(`errors`) — 그걸 여기로 데려온다.
   *
   * `error` 가 있으면 `hint` 대신 이쪽이 나온다. 둘을 겹쳐 쌓지 않는다 —
   * 칸 하나에 줄이 둘이면 화면이 뛴다.
   */
  error?: React.ReactNode
}) {
  return (
    <div className={className ?? 'mb-5'}>
      <label className="mb-2 block text-sm font-bold text-meta">{label}</label>
      <div className="flex h-11 items-stretch">{children}</div>
      {error ? (
        <div className="mt-1.5 text-sm text-accent">{error}</div>
      ) : hint ? (
        <div className="mt-1.5 text-[13px] text-meta">{hint}</div>
      ) : null}
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
  pending,
  pendingLabel,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  /**
   * ★지금 보내는 중인가★ (2026-09-03 · O-032 ①).
   *
   * ══ 왜 필요한가 — 12초를 아무 표시 없이 기다렸다 ══
   *
   * 전에는 `disabled` 만 켰다. 버튼이 **흐려지기만 하고 글자는 그대로**다.
   * 강민재가 로그인을 누르고 **12초 동안 아무 표시 없이** 기다렸다.
   * 흐려진 것을 「눌리지 않았다」로 읽는 사람이 더 많고, **폰에서는 두세 번 누른다.**
   *
   * 두 번 눌러도 지금은 `disabled` 가 막아 준다. 그래도 **막는 것과 알려 주는 것은 다르다** —
   * 알려 주지 않으면 사람은 「고장났다」고 결론 내고 나간다.
   */
  pending?: boolean
  /** 보내는 중에 대신 보여 줄 글자. 「가입하는 중…」처럼 **하는 일**을 적는다 */
  pendingLabel?: React.ReactNode
}) {
  return (
    <div className="mt-7">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        /* `aria-busy` 는 화면 낭독기에게 같은 말을 한다 — 글자만 바꾸면 안 들린다 */
        aria-busy={pending ? true : undefined}
        className="btn-line h-11 w-full text-sm font-bold disabled:opacity-50"
      >
        {pending && pendingLabel ? pendingLabel : children}
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
