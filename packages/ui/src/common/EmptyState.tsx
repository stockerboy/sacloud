/**
 * 목록이 비었을 때의 표시.
 *
 * `적진` 톤 — 가운데 정렬 + 옅은 글자로 **조용하게**.
 * 아이콘·일러스트·안내 박스를 붙이지 않는다. 비어 있다는 사실이 화면에서 소리치면 안 된다.
 * 구조와 props 는 그대로다 (겉만 바꿨다).
 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-14 text-center text-sm leading-relaxed text-faint">{message}</div>
  )
}
