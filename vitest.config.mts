import { defineConfig } from 'vitest/config'

/**
 * Phase 0 테스트는 전부 순수 TypeScript(계약 검증 / Mock 픽스처 / 커서 유틸)라
 * node 환경 단일 설정으로 충분하다. 컴포넌트 테스트는 Phase 1에서 추가한다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    reporters: ['default'],
  },
})
