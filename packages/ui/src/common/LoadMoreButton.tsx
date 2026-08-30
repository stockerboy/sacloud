'use client'

/**
 * `더 불러오기` — 커서 페이지네이션 전용. 페이지 번호는 없다.
 * 다음 커서가 없으면 아예 렌더되지 않는다 (호출부 판단, 여기는 그대로).
 *
 * `적진` 톤 — 예전에는 인디고로 꽉 채운 띠였다. 목록 아래에 넓은 색면이 깔리면
 * 이 시안이 무너진다. **면을 비우고 1px 선**으로 바꿨고, 가리켰을 때만 테두리에 진홍이 켜진다.
 * 동작·props 는 그대로다 (겉만 바꿨다).
 */
export function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className="btn-line w-full cursor-pointer py-3 text-sm tracking-wide text-meta disabled:cursor-not-allowed disabled:opacity-60"
      >
        더 불러오기
      </button>
    </div>
  )
}
