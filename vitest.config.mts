import { defineConfig } from 'vitest/config'

/**
 * Phase 0 테스트는 전부 순수 TypeScript(계약 검증 / Mock 픽스처 / 커서 유틸)라
 * node 환경 단일 설정으로 충분하다. 컴포넌트 테스트는 Phase 1에서 추가한다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // `packages/db/legacy` · `packages/db/ops` 처럼 src 밖에 있는 도구도 테스트한다
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/db/legacy/**/*.test.ts',
      'packages/db/ops/**/*.test.ts',
      'apps/*/**/*.test.ts',
      // rating 설계 검증 시뮬레이션 (운영 코드가 아니다 — scripts/)
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**'],
    /*
      기본 5초는 **순수 테스트 기준**이다. 이 저장소에는 로컬 PostgreSQL 을 실제로 때리는
      통합 테스트가 섞여 있고, 데이터가 늘수록 그 쿼리가 느려진다.

      2026-08-31 실측: IPL 경기 24,662건을 넣은 뒤 `playerPosition` · `playerProfileIdentity`
      가 5초를 넘겨 실패했다. **로직이 틀린 게 아니라 스캔이 길어진 것**이다
      (`ANALYZE` 로 하나는 4.4초까지 내려왔다).

      D-187 이 로컬 루프백에 `connection_limit=5` 를 걸어 둔 것도 겹친다.
      기본값을 올려 «느려서 실패» 와 «틀려서 실패» 를 섞지 않는다.
    */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
})
