/**
 * 요청이 실패했을 때의 표시.
 *
 * `적진` 톤 — 가운데 정렬 + 옅은 글자. 실패를 빨갛게 칠하지 않는다.
 * 이 화면에서 빨강은 강조 하나뿐이라, 오류마다 빨강을 쓰면 강조가 죽는다.
 * 대신 `다시 시도` 만 테두리 버튼으로 세운다.
 * 구조와 props 는 그대로다 (겉만 바꿨다).
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-14 text-center text-sm leading-relaxed text-meta">
      <div>{message}</div>
      {onRetry ? (
        <button type="button" className="btn-line mt-4 px-4 py-1.5 text-sm" onClick={onRetry}>
          다시 시도
        </button>
      ) : null}
    </div>
  )
}
