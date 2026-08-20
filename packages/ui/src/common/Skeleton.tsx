/**
 * 로딩 자리표시.
 *
 * 원본은 Angular SSR이라 목록이 서버에서 이미 채워진 상태로 내려오고, 별도의 로딩 표시가 없다.
 * 우리는 Phase 1~6 동안 브라우저에서 Mock(MSW)을 호출하므로 첫 프레임이 비어 있다.
 * 이 컴포넌트는 그 공백을 메우기 위한 **구현상의 장치**이며 원본에 대응하는 UI가 아니다.
 * Phase 10(SSR)에서 서버 렌더로 바뀌면 대부분 사라진다.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-divider ${className ?? ''}`} />
}
