/**
 * 목록이 비었을 때의 표시.
 * 원본의 빈 목록 문구는 관측하지 못했다 [미확인] — 문구·여백은 실측 후 교체한다.
 */
export function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-10 text-center text-meta">{message}</div>
}
