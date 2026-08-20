/**
 * 요청이 실패했을 때의 표시.
 * 원본의 오류 문구·재시도 UI는 관측하지 못했다 [미확인] — 실측 후 교체한다.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-10 text-center text-meta">
      <div>{message}</div>
      {onRetry ? (
        <button type="button" className="mt-2 underline" onClick={onRetry}>
          다시 시도
        </button>
      ) : null}
    </div>
  )
}
