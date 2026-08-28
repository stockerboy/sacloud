import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      /* `.next` 뿐 아니라 **다른 이름으로 뽑은 Next 빌드 산출물**도 뺀다.
         검증용으로 `--distDir .next-verify` 같은 자리에 빌드하면 그 안의 생성 타입
         파일이 그대로 검사돼 오류가 만 단위로 쏟아졌다 (실측 17,846건).
         우리가 쓴 코드가 아니다. */
      '**/.next/**',
      '**/.next-*/**',
      '**/dist/**',
      '**/coverage/**',
      '**/public/mockServiceWorker.js',
      '**/next-env.d.ts',
      // prisma generate 산출물 — 우리가 작성한 코드가 아니다
      'packages/db/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // packages/ui 도 Next 컴포넌트(next/link, next/navigation)를 쓰므로 같은 규칙을 적용한다
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router 전용 저장소라 pages 디렉터리 검사는 의미가 없다
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Mock 픽스처 생성기와 개발용 프로브는 콘솔 출력을 허용한다
    files: ['packages/mock/**/*.ts', 'apps/web/app/**/dev-*.tsx'],
    rules: { 'no-console': 'off' },
  },
  {
    /**
     * rating 설계 검증 시뮬레이션 (`scripts/rating-simulation/`).
     *
     * **운영 코드가 아니다.** 결과를 사람이 읽는 리포트로 뽑는 것이 목적이라
     * 콘솔 출력을 쓰고, 리포트 렌더러는 집계 번들을 느슨한 타입으로 받는다.
     * 엔진·시나리오 등 **판정 로직 쪽은 그대로 엄격하게** 검사한다.
     */
    files: ['scripts/rating-simulation/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // 리포트 렌더러만 집계 번들을 any 로 받는다 (표를 그리는 코드다)
    files: ['scripts/rating-simulation/report.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
