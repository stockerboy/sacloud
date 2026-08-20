import { DevMockProbe } from './dev-mock-probe'

/**
 * Phase 0의 빈 셸.
 * 실제 홈 화면(로고 · 통합검색 · 실시간 인기게시글 · GNB)은 Phase 1에서 만든다.
 */
export default function Page() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 'var(--text-heading)', fontWeight: 700 }}>sacloud — Phase 0</h1>
      <p style={{ color: 'var(--color-foreground-muted)' }}>
        API 계약과 Mock 데이터만 있는 상태입니다. 화면 구현은 Phase 1부터 시작합니다.
      </p>
      <DevMockProbe />
    </main>
  )
}
