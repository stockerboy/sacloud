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
    reporters: ['default'],
  },
})
