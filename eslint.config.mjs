import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      /* ★서브에이전트 작업방(worktree)★ — 같은 저장소의 **사본**이다 (2026-09-04).
         사본마다 `tsconfig.json` 이 들어 있어 파서가
         «tsconfigRootDir 후보가 여럿» 이라며 ★저장소 전체를 못 읽었다★ (오류 2,848건).
         ★우리가 쓴 코드가 아니라 복사본이다.★ 원본만 검사한다. */
      '.claude/worktrees/**',
      /* `.next` 뿐 아니라 **다른 이름으로 뽑은 Next 빌드 산출물**도 뺀다.
         검증용으로 `--distDir .next-verify` 같은 자리에 빌드하면 그 안의 생성 타입
         파일이 그대로 검사돼 오류가 만 단위로 쏟아졌다 (실측 17,846건).
         우리가 쓴 코드가 아니다. */
      '**/.next/**',
      '**/.next-*/**',
      '**/dist/**',
      '**/coverage/**',
      '**/public/mockServiceWorker.js',
      /* `__` 접두사는 이 저장소에서 **「커밋하지 않는다」는 표시**다 (`.gitignore` 참조).
         일회성 진단·측정 스크립트라 `any` 를 그대로 쓰고 버린다.
         저장소에 남지도 않는 파일 때문에 `pnpm lint` 가 빨개지면
         **진짜 오류가 그 밑에 묻힌다** — 실제로 그렇게 묻혔다 (2026-09-01).
         `.gitignore` 가 무시하는 것과 같은 자리를 여기서도 무시한다. */
      /* `.tmp-scripts/` 는 `.gitignore` 가 이미 빼고 있는 **일회성 진단 스크립트** 자리다
         (`.gitignore:104`). 저장소에 남지 않는 파일인데 여기서만 검사돼
         `pnpm lint` 를 빨갛게 만들고 있었다 — 위 `__*` 와 **같은 이유로** 뺀다.
         2026-09-01 실측: 이 두 파일의 오류 2건이 전체 오류의 전부였고,
         그래서 「lint 는 원래 빨갛다」가 되어 진짜 오류를 못 볼 뻔했다. */
      '.tmp-scripts/**',
      '**/scripts/__*',
      '**/src/dev/__*',
      /* 브라우저 콘솔에 붙여 넣는 스니펫. **여기 규칙으로 볼 코드가 아니다** —
         전역 함수를 정의해 사람이 콘솔에서 부르는 것이 목적이라 «안 쓰는 함수» 로 잡힌다.
         `ipl-clan-members-snippet.js` 는 생성물이기도 하다
         (`apps/worker/src/dev/iplMemberSnippetBuild.ts` 가 만든다). */
      'scripts/*-snippet.js',
      '**/next-env.d.ts',
      // prisma generate 산출물 — 우리가 작성한 코드가 아니다
      'packages/db/generated/**',
      /*
       * ── ★★2026-09-20 — 「lint 는 원래 빨갛다」를 끝낸다★★
       *
       *   `pnpm verify` 가 ★오류 93건★ 으로 빨갰다. 그래서 ★배포 관문이 꺼져 있었다★ —
       *   `CLAUDE.md` 5절이 「초록일 때만 민다」 라고 적어 뒀는데 지킬 수가 없었다.
       *
       *   ⚠ 93건 중 ★87건이 「우리가 쓴 운영 코드가 아닌 자리」★ 였다.
       *     위 `__*` · `.tmp-scripts/` 주석이 2026-09-01 에 적어 둔 것과 ★같은 병★ 이다 —
       *     ★진짜 오류 6건이 그 밑에 묻혀 있었다.★ 그 여섯은 이 판에서 고쳤다.
       *
       *   아래 넷은 ★지우는 게 아니라 안 보는 것★ 이다. 파일은 그대로 있다.
       */
      /* 일회성 실험 자리. 손으로 돌려 보고 버리는 코드라 `any`·안 쓰는 변수가 그대로다 */
      'scratchpad/**',
      /* ★받은 시안 코드★ — 우리가 쓴 것이 아니다 (`CLAUDE.md` 2-4 와 같은 뜻) */
      'handoff_in/**',
      /* 크롬 확장 — `chrome.*` 같은 ★확장 전역★ 을 쓴다. 여기 규칙으로 볼 코드가 아니다 */
      'scripts/barracks-autocollect/extension/**',
      /* `_` 한 글자 접두도 「커밋하지 않는 일회성」 표시다 (`__*` 와 같은 뜻) */
      '**/packages/db/_*.ts',
      '**/packages/db/.tmp_*.ts',
      /* 같은 표시가 앱 뿌리에도 있다 (`apps/worker/_bulkimport.ts` — 추적 안 되는 파일) */
      'apps/*/_*.ts',
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
