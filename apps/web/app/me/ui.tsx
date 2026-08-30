/**
 * 마이페이지 공용 조각 — `적진`.
 *
 * 네 화면(`/me` · `/me/setting` · `/me/password` · `/me/link`)이 같은 패널·입력·버튼을 쓴다.
 * 화면마다 클래스를 따로 적으면 한 곳만 고쳐지고 나머지가 남는다. 여기 한 곳에 둔다.
 *
 * 시안 규칙
 *   - 패널은 **그림자가 없다.** 1px `--color-line` 과 여백이 경계를 만든다.
 *   - 입력은 `--color-card-2` 면 + 1px 선, **focus 에서만** 진홍 테두리.
 *   - 버튼은 채우지 않는다 (`.btn-line`). 진홍은 hover 테두리와 위험한 동작에만.
 */

/** 마이페이지 패널 (카드 한 장) */
export function MePanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded border border-line bg-card px-6 py-6 ${className ?? ''}`}>
      {children}
    </div>
  )
}

/** 패널 안 소제목 */
export function MeHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-text-strong">{children}</h2>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-meta">{hint}</p> : null}
    </div>
  )
}

/** 공용 입력 — 폭은 호출부에서 정한다 */
export function MeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full max-w-[320px] rounded border border-line bg-card-2 px-3 text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

/** 라벨 + 입력 */
export function MeField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-sm font-bold text-meta">{label}</label>
      {children}
    </div>
  )
}

/** 저장·변경 버튼. 면을 채우지 않는다 */
export function MeButton({
  children,
  disabled,
  onClick,
  className,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-line h-10 px-7 text-sm font-bold disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** 실패 알림 — 빨강을 쓰는 자리다. 면은 칠하지 않고 왼쪽 선 하나 */
export function MeError({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 border-l-2 border-accent pl-3 text-sm text-text">{children}</div>
}

/** 성공·안내 알림 — 색을 쓰지 않는다 */
export function MeNotice({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 border-l-2 border-line pl-3 text-sm text-meta">{children}</div>
}
