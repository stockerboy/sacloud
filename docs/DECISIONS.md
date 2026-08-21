# DECISIONS.md — 프로젝트 결정 기록

`CLAUDE.md` 3장 11번(중요한 프로젝트 지식과 결정은 문서화)에 따라, **원본 관측으로 정해지지 않아 우리가 결정한 사항**을 남긴다.
여기 적힌 것은 전부 "원본과 동일함이 검증되지 않은" 자체 결정이며, 실측 결과가 나오면 갱신한다.

---

## Phase 0 (2026-08-20)

### D-001. 저장소 구조 — pnpm workspace 모노레포

```
apps/web/            Next.js 15 (App Router)
packages/contract/   Zod 스키마 + 엔드포인트 레지스트리   ← 단일 진실 원천
packages/mock/       결정적 픽스처 생성기 + MSW 핸들러
```

- 계획서의 `apps/worker`, `packages/db`, `packages/ui`는 **아직 만들지 않았다.**
  각각 Phase 8, Phase 7, Phase 1에서 실제로 필요해질 때 만든다. (지금 만들면 빈 껍데기만 남는다.)
- 내부 패키지는 빌드 단계 없이 `src/*.ts`를 직접 참조한다(`exports` → `./src/index.ts`).
  Next.js는 `transpilePackages`로 컴파일한다. 빌드 산출물 관리 비용을 없애기 위한 선택이다.

### D-002. 계약 표기 규칙

| 항목 | 결정 | 근거 |
|---|---|---|
| 필드명 | 원본 응답 그대로 **snake_case** (`win_rate`, `rating_update`) | 관측된 응답 형태를 유지해야 비교 검수가 쉽다 |
| 식별자 타입 | 전부 **문자열** | 매치 ID가 18자리(`YYMMDDHHmmss`+6)라 `Number.MAX_SAFE_INTEGER`를 넘는다 |
| 날짜/시각 | ISO 8601 + `+09:00` (예: `2026-06-05T00:06:24+09:00`) | 원본 포맷은 `[미확인]`. 계약으로 고정 |
| 파생값 | `win_rate`, `kd_rate`, `kill_per_match`, `damage_percent`를 **응답에 포함** | 원본이 서버 계산인지 `[미확인]`. 계산 규칙을 `packages/mock/src/derive.ts` 한 곳에 두고 Phase 7 서버도 동일 규칙을 구현한다 |
| 커서 | `base64url("next__<id>" \| "prev__<id>")`, 랭킹 20 / 게시판 15 | 관측값. 테스트로 고정 |

### D-003. 엔드포인트 출처 표시 (`origin`)

모든 엔드포인트에 `origin: 'observed' | 'designed'`를 붙였다.

- `observed` — `docs/3rd-supply-structure.md`에 기록된 실제 관측 엔드포인트
- `designed` — 화면 동작은 관측됐지만 경로·본문이 확인되지 않아 **우리가 설계**한 것

`designed`로 표시된 것은 전부 `[미확인]`이며, 실측되면 경로를 바꾼다.
현재 `designed`인 것: 비밀번호 재설정/이메일 인증, 갱신 요청(`/renew`), 플레이어·클랜 설정,
클랜 지난시즌, 리그 참여 클랜원 목록, 맵 목록, 리그 생성·관리 전반, 추천/비추천.

### D-004. 상대팀 결측(`알수없음`) 재현 방식

원본은 상대 클랜 플레이어의 딜량·헤드샷을 `알수없음`으로 표시한다.

- Mock 데이터에는 **양쪽 값을 모두 저장**하고, 응답 단계에서 **보는 쪽이 아닌 팀의 값을 null로 지운다.**
- 매치 상세(`GET /leagues/:leagueId/matches/:matchId`)에는 "어느 기록실에서 펼쳤는지"가 필요해서
  선택 쿼리 `league_clan_id`를 추가했다 — **자체 설계** `[미확인]`.
  원본은 아코디언이라 매치 개별 URL이 없어 이 정보를 어떻게 넘기는지 알 수 없다.

### D-005. 픽스처 정책

- 시드 고정(`FIXTURE_SEED = 20260820`) + 기준 시각 고정(`FIXTURE_NOW = 2026-08-20T12:00:00+09:00`).
  실제 시계를 쓰지 않으므로 스냅샷·테스트가 흔들리지 않는다.
- 규모: 리그 4(단일 1 + N부 3, 공식 2) / 클랜 60 / 플레이어 920 / 매치 3,000 / 게시글 400 / 댓글 1,200.
- 클랜명·닉네임·리그명·게시글 문구는 **전부 새로 만든 가상의 이름**이다. 원본 자산·문구를 복사하지 않았다.
- 클랜마크·업로드 이미지 URL은 존재하지 않는 자리표시자 호스트(`static.sacloud.local`)를 쓴다.
- 래더 증감은 관측 범위(승 +7~+12 / 패 −10~−19)의 **난수**다. **레이팅 엔진이 아니다** — Phase 9에서 다룬다.
- 승/패·킬뎃·래더는 생성된 매치를 시간순으로 누적해서 만들었다. 랭킹과 기록실이 서로 어긋나지 않게 하기 위함이다.

### D-006. 임시로 정한 값 (원본 미확인)

| 값 | 임시 결정 | 실제 확인 필요 시점 |
|---|---|---|
| 배치고사 판정 경기 수 | 10경기 | Phase 9 |
| `hot`(인기) 선정 가중치 | `추천×3 + 댓글×2 + 조회수/100` | Phase 7 |
| 리그맵 목록 | `맵 01`~`맵 08` 자리표시자 | Phase 3 이전 |
| 익명 별칭 형식 | `무명-123` 형태 | Phase 5 |
| 공식 리그 배지 필드명 | `official: boolean` | 실측 시 |
| 에러 응답 포맷 | `{ message, data?, errors? }` | Phase 7 |

### D-007. 툴체인

- **TypeScript는 5.9로 고정.** 최신 7.0.2에서 `next build`가 `next.config.ts`를 읽지 못한다
  (`Cannot read properties of undefined (reading 'fileExists')`). Next 15.5가 TS 7을 지원하면 올린다.
- pnpm 11은 설치 스크립트를 기본 차단한다. `pnpm-workspace.yaml`의 `allowBuilds`로 `msw`(워커 설치)와
  `sharp`(Next 이미지 최적화)만 허용했다.
- ESLint는 flat config 하나(루트)를 쓰고, `apps/web/eslint.config.mjs`는 루트 설정을 재수출한다
  (`next build`가 앱 디렉터리에서 설정을 찾기 때문).
- **Redis / BullMQ / Prisma / PostgreSQL / Auth.js / Tiptap은 설치하지 않았다.**
  각각 Phase 7~9에서 실제로 필요할 때 넣는다.

### D-008. Phase 0 범위에서 하지 않은 것

- 실제 데이터 연결 없음. 넥슨 병영수첩·3rd.supply의 어떤 API도 호출하지 않는다.
- 로그인 상태는 항상 비로그인(`/infos`의 `user: null`). 세션 전환 스위치는 Phase 6.
- 쓰기 계열(POST/PUT/DELETE) 핸들러는 **계약 형태만** 돌려준다. 저장·rate limit·캡차 시뮬레이션은 Phase 5~6.
- 랭킹은 요청 시 정렬한다. 1시간 주기 배치 재현은 Phase 9.
- **광고 관련 요소는 일절 만들지 않았다** (`CLAUDE.md` 4장).

---

## Phase 1 (2026-08-20)

### D-009. 디자인 토큰은 원본 실측값으로 확정

Phase 0의 토큰은 전부 추정값이었다. Phase 1에서 Chrome 개발자 도구(`getComputedStyle` / `cssRules`)로
3rd.supply 홈·약관·404 화면을 직접 측정해 아래 값으로 교체했다. 정의 위치는 `packages/ui/src/styles.css`.

**원본은 루트 폰트 크기가 14px 이다.** (`1rem = 14px`) 이 값을 맞춰야 Tailwind의 rem 기반 유틸리티가
원본과 같은 픽셀로 떨어진다. 원본은 Tailwind v2 계열을 쓰고 우리는 v4라 색 팔레트 기본값이 다르므로,
아래 색은 v4 기본값을 쓰지 않고 실측값을 토큰으로 고정했다.

| 토큰 | 실측값 | 원본에서의 쓰임 |
|---|---|---|
| `--color-ink` | `#000000` | 헤더 · 히어로 · 푸터 배경 |
| `--color-page` | `#f2f2f2` | 본문 배경 (`bg-gray-light`) |
| `--color-nav-fg` | `#e5e7eb` | GNB 글자 |
| `--color-nav-active` | `#292929` | 현재 보고 있는 대표 리그 항목 배경 |
| `--color-divider` | `#e5e7eb` | 목록 구분선 |
| `--color-meta` | `#374151` | 목록의 상대시간 |
| `--color-accent` | `#1e3a8a` | 카드 머리글 글자 · 4px 밑줄 |
| `--color-comment` | `#ef4444` | 게시글 제목 옆 댓글 수 |
| `--color-selector` / `-fg` | `#334155` / `#f3f4f6` | 통합검색 좌측 셀렉터 |
| `--color-input-fg` / placeholder | `#4a4a4a` / `#9ca3af` | 통합검색 입력 |
| `--shadow-card` | `0 1px 3px rgb(0 0 0/.1), 0 1px 2px rgb(0 0 0/.06)` | 카드 그림자 |
| `--spacing-nav` | `4.5rem` (63px) | 고정 헤더 높이 |
| `--spacing-container` | `80rem` (1120px) | 데스크톱 고정폭 |
| `--spacing-logo` | `44rem` (616px) | 홈 로고 박스 |
| `--spacing-search` / `-selector` | `28rem` / `11rem` | 검색 입력 / 셀렉터 |
| `--spacing-board` / `-title` / `-time` | `48rem` / `42rem` / `6rem` | 인기게시글 카드 / 제목 칸 / 시간 칸 |
| `--spacing-notfound` | `24rem` (336px) | 404 일러스트 |

**실측하지 못해 역산한 값** — 셀렉터 드롭다운 hover 색(`#4338ca` / `#818cf8`).
원본 클래스명(`hover:bg-indigo-700` / `hover:border-indigo-400`)에서 Tailwind v2 팔레트로 되짚었다 `[미확인]`.

승/패·래더·MVP 색(`--color-win/-lose/-rating/-mvp`)은 Phase 0의 임시값 그대로다.
해당 화면(Phase 2~4)에서 실측해 교체한다 `[미확인]`.

### D-010. `.pc-container` 는 고정폭 1120px 가운데 정렬

원본 CSS 규칙에는 `min-width: 80rem; margin: 0 auto` 만 있지만, **관측된 동작**은 다음과 같다.

- 창이 넓으면 1120px 고정폭으로 가운데 정렬 (뷰포트 1517px에서 좌측 여백 198.5px)
- 창이 1120px보다 좁아지면 줄어들지 않고 넘쳐서 가로 스크롤 (뷰포트 1014px에서 `margin-right: -105.6px`)

`min-width` 만으로는 넓은 창에서 가운데 정렬이 나오지 않으므로 `width: 80rem` + 좌우 `auto` 마진으로 구현했다.
CSS 선언은 원본과 다르지만 **두 경우의 렌더 결과가 모두 원본과 일치**하는 것을 실측으로 확인했다.

### D-011. 상대시간 포맷 규칙

원본 홈에서 관측된 표기는 `6시간 전` `15시간 전` `1일 전` `2일 전` `3일 전` 뿐이다.
`분` `달` `년` 단위와 1분 미만 표기는 해당하는 글이 없어 확인하지 못했다 `[미확인]`.

우리 규칙(`packages/ui/src/common/relative-time.ts`, 테스트로 고정):
`60초 미만 = 방금 전` / `분` / `시간` / `일` / `30일 = 1달` / `365일 = 1년`, 미래 시각은 `방금 전`.
**원본과 동일함이 검증되지 않았다.**

### D-012. 원본 자산·문구를 쓰지 않은 지점 (의도된 차이)

`CLAUDE.md` 3장 4번(원본 자산·문구 복사 금지)에 따라 아래는 **일부러 원본과 다르게** 두었다.
박스 크기·배치·정보 구조는 원본과 맞추고 내용만 우리 것으로 채웠다.

| 항목 | 원본 | 우리 |
|---|---|---|
| 홈 로고 | `main_logo.png` 616×143.5 | 직접 그린 SVG, 같은 박스 |
| GNB 로고 | `nav_logo.png` 152×24 | 직접 그린 SVG, 같은 박스 |
| 404 일러스트 | 이미지 336×189 | 직접 그린 SVG, 같은 박스 |
| 검색·화살표 아이콘 | Font Awesome | 직접 그린 SVG, 같은 크기 |
| 푸터 저작권·문의 | 원본 상호/메일 | `© 2026 SACLOUD` / `sacloud@local.invalid` |
| 문서 제목 | 원본 서비스명 | `SACLOUD - 서든어택 클랜전 전적검색` |
| 약관·개인정보 본문 | 원본 약관 문구 | **새로 작성한 초안** — 법적 검토를 받지 않았다. 오픈 전 교체 필요 |
| GNB 대표 리그 3개 | `공식리그`/`3부리그`/`대룰리그` → `/league/supply` 등 | Phase 0 픽스처의 가상 리그 `공식전`/`세컨드`/`친목전` (D-005 연장). 설정은 `packages/ui/src/site-config.ts` 한 곳 |

### D-013. Phase 1에서 추가한 것 / 하지 않은 것

- `packages/ui` 를 계획대로 이번 Phase에 만들었다. `next/link`·`next/navigation` 에 의존한다(peer).
- **TanStack Query 도입.** Phase 1에서 실제로 서버 상태(`/boards?category=hot`)를 다루기 시작했기 때문이다.
  커서 무한스크롤(`useInfiniteQuery`)은 Phase 3에서 쓴다.
- Mock(MSW)은 브라우저 Service Worker라 **첫 방문에는 아직 페이지를 제어하지 않는다.**
  그 사이 나간 요청은 가로채이지 못하고 응답 없이 매달린다. `controllerchange` 를 기다렸다가
  준비 완료로 표시하도록 `apps/web/app/providers.tsx` 에서 처리했다. 원본에 대응하는 동작이 아니라
  Mock 단계의 구현상 장치이며, Phase 10(SSR 전환)에서 대부분 사라진다.
- `Skeleton` / `EmptyState` / `ErrorState` 도 같은 성격의 구현상 장치다.
  원본은 SSR이라 로딩·빈 목록·오류 표시를 관측할 수 없었다 `[미확인]`.
- **Playwright E2E와 반응형 스냅샷(1280/1024/390)은 하지 않았다.** 계획 6장에는 있으나,
  원본이 1120px 고정폭 데스크톱 전용이고 모바일 화면이 `[미확인]` 이라 기준이 없다.
  이번 Phase의 검수는 Chrome 실브라우저 직접 비교로 대신했다.
- 광고 관련 요소는 만들지 않았다. 원본 홈의 광고 슬롯(`h-wide-ad` 280px + 상하 여백)을 통째로 빼고
  히어로 다음에 인기게시글 카드가 바로 이어지게 했다 (`CLAUDE.md` 4장).


### D-014. `.next` 오염으로 CSS가 통째로 빠지는 문제 (2026-08-20 발생 · 해결)

**증상** — `localhost:3000`이 브라우저 기본 스타일로만 렌더됐다. HTML과
`<link rel="stylesheet" href="/_next/static/css/app/layout.css">`는 정상인데
**그 CSS 파일이 404**였고 `.next/static` 안에 CSS 파일 자체가 없었다.

**원인** — Tailwind/PostCSS 설정 문제가 아니었다. `app/globals.css`를
`@tailwindcss/postcss`로 직접 돌려보면 18KB가 정상 생성되고
`@import '../../../packages/ui/src/styles.css'` 인라인과
`@source "../../../packages/ui/src"` 스캔도 모두 정상이었다.
문제는 **`.next` 디렉터리가 깨진 상태**였다는 것이다.
`next build`(프로덕션)와 `next dev`를 같은 `.next`에 번갈아 돌렸고,
그 중 일부가 컴파일 도중에 강제 종료되면서 매니페스트는 CSS를 가리키는데
정작 CSS 청크는 없는 상태로 남았다. 포트를 붙잡고 있던 좀비 dev 서버가 그 깨진 `.next`를 계속 서빙했다.

**해결 / 재발 방지**
- `pnpm clean` 스크립트 추가 (`apps/web/.next` 삭제)
- `pnpm build` 를 `pnpm clean && next build` 로 변경 — 프로덕션 빌드가 dev 산출물 위에 겹쳐 쓰이지 않는다
- 증상이 보이면 **`pnpm clean` 후 dev 서버 재시작**. 3000번 포트를 잡고 있는 좀비 프로세스가 있는지도 함께 확인한다

**교훈** — 이 Phase의 검수에서 `HTTP 200`과 `getComputedStyle` 수치만 보고 완료로 판단했다.
둘 다 통과하는데도 실제 화면은 무스타일일 수 있었다(계측 시점의 서버와 사용자가 본 서버가 달랐다).
**앞으로는 화면 단위 작업의 완료 판정에 반드시 실제 렌더 스크린샷을 포함한다.**


---

## Phase 진행 방식 변경 (2026-08-20)

### D-015. Phase별 승인 대기 폐지 · 자율 진행

이후 Phase는 사용자 승인을 기다리지 않고 V1 완료까지 자율 진행한다.
Phase마다 아래 절차를 반복한다.

```
계획/문서 확인 → 필요시 원본 조사 → 구현 → localhost 실행 → Chrome 실렌더·기능 확인
→ 원본 비교 → QA 서브에이전트 독립 검수 → FAIL이면 수정 → 재검증
→ lint → typecheck → test → build → 회귀 테스트 → Git 체크포인트 커밋 → 다음 Phase
```

이전 Phase의 문제가 나중에 발견되면 되돌아가 수정하고 회귀 테스트한 뒤 계속 진행한다.
`HTTP 200` 이나 테스트 통과만으로 UI 완료를 판단하지 않는다 (D-014 교훈).

**사용자에게 묻고 멈추는 경우 — 이 목록으로 한정한다**

- 넥슨 Open API Key가 실제로 필요한 시점
- 사용자가 직접 로그인·본인인증해야 하는 경우
- 유료 서비스 가입·결제
- production DB 파괴·초기화 가능성이 있는 작업
- production 배포
- `55sa.cloud` DNS 변경
- 되돌리기 어려운 외부 서비스 변경
- 조사만으로 해결할 수 없는 중요한 제품 의사결정
- 기존 3rd.supply 핵심 데이터를 현실적으로 마이그레이션할 방법이 없는 경우

그 외(CSS·Tailwind·TypeScript·테스트·빌드·개발서버·의존성·API·Mock·렌더 차이·DB 개발 오류)는
묻지 않고 스스로 원인을 찾아 고친다.

**비밀키는 코드·Git에 넣지 않는다.** `.env` 환경변수로만 관리한다.

### D-016. 마이그레이션 접근 경로 확정 (조사 결과)

`docs/MIGRATION_GAPS.md` 참조. 요약하면,

- `api-v2.3rd.supply` → 외부 요청 전면 403 (AWS ELB)
- `3rd.supply` 웹 → AWS WAF **CAPTCHA** 챌린지 (`x-amzn-waf-action: captcha`)
- → **3rd.supply 직접 대량 수집은 하지 않는다.** 접근 통제 우회 금지 원칙에 해당한다.
- 경기 원천 기록의 1차 출처는 **넥슨 Open API** (서든어택 정식 지원, 게임 id 41).
  `x-nxopen-api-key` 헤더 필수 → **키 발급이 선행 조건**이다.
- 넥슨 이용 조건: 가져간 데이터는 **최소 30일마다 갱신** 필요 → 수집 주기 설계에 반영한다.
- 3rd.supply 고유 산출물(래더·`rating_update`·리그/시즌/부리그·랭킹·배치고사)은
  운영자 협조 없이 확보 불가. `MIGRATION_GAPS.md` 4장에 결정 요청으로 정리했다.

### D-019. Chrome 검수 시 탭이 백그라운드면 React 상태가 갱신되지 않는다 (2026-08-21)

**증상** — 로그인 폼에 실제로 타이핑해도 버튼이 계속 비활성이었다.
DOM `value`는 바뀌는데 React 상태가 안 바뀌고, 컨트롤드 입력인데도 React가 값을 되돌리지 않았다.
`__reactProps`에 `onChange`는 정상적으로 붙어 있었고 콘솔 오류도 없었다.

**원인** — 앱 버그가 아니다. 검수용 탭이 `document.visibilityState === 'hidden'` 상태였다.
Chrome은 백그라운드 탭에서 타이머·MessageChannel을 throttle하는데,
React 스케줄러가 이것을 쓰기 때문에 **상태 업데이트가 flush되지 않는다.**
CDP 평가가 45초 타임아웃 나던 것("renderer frozen")도 같은 원인이다.

**대응**
- 상호작용을 검수할 때는 **탭이 visible인지 먼저 확인한다** (`document.visibilityState`).
  스크린샷을 찍으면 대체로 활성화된다.
- 데이터 렌더(React Query 결과)는 백그라운드에서도 보이므로 "화면이 나온다 = 상호작용도 된다"가 아니다.
- 폼 검증 같은 순수 로직은 브라우저 대신 **단위 테스트로 고정**한다
  (`signup-rules.test.ts`, `league-create.test.ts`).

### D-029. Phase 0 픽스처의 시각이 id 순서와 어긋나 있었다 (2026-08-21 수정)

Mock↔실제 API 응답을 값까지 대조하다가 발견했다. 픽스처가 아래 세 곳의 시각을 **무작위로**
뽑고 있어서, id(=표시 순서)와 시각이 맞지 않았다.

| 대상 | 증상 |
|---|---|
| 게시글 `createdAt` | 목록은 최신순인데 `작성시간` 열이 내림차순으로 보이지 않았다 |
| 댓글 `createdAt` | 한 글 안에서 댓글 시각이 뒤죽박죽이었다. 대댓글이 부모보다 앞서기도 했다 |
| 리그 참여 `joinedAt` | 리그 목록의 대표 클랜 3개가 Mock과 실제 DB에서 서로 달랐다 |

Mock은 배열 순서(=id)로 정렬하고 실제 DB는 시각으로 정렬하므로, 이대로면 두 모드의
화면이 달라진다. **화면 자체도 틀린 상태였다** — 원본은 최신순 정렬이다.

→ `rng`를 뽑는 **순서는 그대로 두고**(다른 필드가 흔들리지 않게) 값의 배치만 정렬했다.
회귀 테스트 4건을 추가해 다시 어긋나면 바로 잡히게 했다.
댓글 시각이 기준 시각을 넘어 **미래로 찍히던 것**도 함께 막았다.

### D-028. 계약이 `:leagueId`인 자리에 슬러그도 받는다 (2026-08-21 사고)

**증상** — 실제 화면에서 클랜랭킹·개인랭킹·기록실이 전부 비어 보였다.

**원인** — 계약은 랭킹·매치 경로를 `:leagueId`로 적어 두었지만,
화면은 이 자리에 **URL 슬러그를 그대로 넣어 호출한다**
(`app/league/[leagueSlug]/rank/...`). Mock 핸들러가 `resolveLeagueId`로 둘 다 받아 왔기 때문에
Phase 1~6 내내 드러나지 않았다.

→ 실제 API도 `resolveLeagueId`로 슬러그·ID를 모두 받는다. 회귀 테스트로 고정했다.

**교훈** — 이 버그는 **curl로도, 계약 준수 테스트로도 잡히지 않았다.**
둘 다 "우리가 옳다고 생각한 경로"로 호출했기 때문이다. 실제 화면을 열어봐야 드러났다.
`CLAUDE.md` 3장 10번(렌더 확인 필수)이 왜 있는지 보여주는 사례다.

### D-027. Next 서버 번들에서 `Prisma.sql` 태그드 템플릿을 쓰지 않는다 (2026-08-21)

`hot`(인기) 게시판은 저장 컬럼이 아니라 계산식으로 정렬해야 해서 raw SQL이 필요하다.
그런데 Next 서버 번들 안에서는 `Prisma.Sql` 인스턴스 검사가 통과하지 못해,
SQL 조각으로 넣은 값이 **바인드 파라미터(jsonb)로 직렬화**된다.

```
ERROR: argument of WHERE must be type boolean, not type jsonb
```

같은 코드가 `tsx` 단독 실행에서는 정상이라 재현이 헷갈린다.

→ `$queryRawUnsafe` + 번호 플레이스홀더(`$1`)로 직접 조립한다.
**사용자 입력은 전부 `bind()`를 거쳐 `$n`으로만 넣고**, 테이블·컬럼명과 정렬식은
파일 안의 리터럴만 쓴다. `LIKE` 검색어는 `%`·`_`·`\`를 이스케이프한다.

### D-026. 라우트 세그먼트 이름을 계약과 1:1로 맞추지 않는다 (2026-08-21)

계약은 같은 자리에 서로 다른 이름을 쓴다.

```
/leagues/:leagueSlug          /leagues/:leagueId/ranks/clans
/leagues/:leagueSlug/clans/:clanSlug/show
/leagues/:leagueSlug/clans/:leagueClanId/division
```

Next는 **한 세그먼트에 서로 다른 이름의 동적 라우트를 둘 수 없다.**
그래서 파일 경로에서는 이름을 하나로 통일하고(`[league]`, `[clan]`),
**핸들러마다 계약대로 슬러그인지 ID인지 해석**한다. 각 파일 주석에 어느 쪽인지 적어 둔다.

외부에서 보이는 URL은 계약 그대로다. 바뀐 것은 우리 저장소의 폴더 이름뿐이다.

### D-025. Auth.js(NextAuth)를 쓰지 않고 직접 구현한다 (2026-08-21)

**계획 문서(`docs/IMPLEMENTATION_PLAN_1.md` 1장)와 어긋나는 결정이다.** 사용자 확인이 필요하다.

계획은 인증에 Auth.js(NextAuth v5)를 적었다. 그런데 Phase 0에서 확정한 계약이
자체 토큰 흐름을 정의하고 있다.

```
POST /auth/login  → { access_token, refresh_token, expires_at, user }
POST /auth/token  → 토큰 갱신
```

NextAuth의 세션 모델(자체 쿠키 + `/api/auth/*` 예약 경로)과 정면으로 부딪힌다.
NextAuth를 얹으면 계약을 맞추려고 감싸는 코드가 더 늘어난다.

→ `jose`(JWT) + `bcryptjs`로 직접 구현했다.
- 액세스 토큰: JWT 1시간. **httpOnly 쿠키로도 내려보낸다** (스크립트로 못 읽는다)
- 리프레시 토큰: 불투명 문자열 30일. **평문을 저장하지 않고 해시만** DB에 둔다. 갱신 시 폐기(rotation)
- 계약이 본문에도 토큰을 요구하므로 본문에도 넣는다

로그아웃은 계약에 없었다(원본에 엔드포인트가 있는지 `[미확인]`). 세션이 httpOnly 쿠키라
서버가 지워야 해서 `authLogout`을 **계약에 `designed`로 추가**했다.

### D-024. 닉네임 유일 제약을 걸지 않는다 (2026-08-21)

Phase 7 스키마 초안에서 `User.nickname`에 `@unique`를 걸었다가 **되돌렸다.**

원본이 닉네임 중복을 막는지는 **관측되지 않았다**. 회원가입 폼에서 확인한 것은 길이 제약(2~16자)뿐이다.
확인되지 않은 제약을 임의로 만드는 것은 `CLAUDE.md` 3장 7번 위반이다.
게다가 Mock 픽스처(사용자 40명)에 이미 닉네임 충돌이 있어, 유일 제약을 걸면
**mock 모드와 live 모드의 데이터가 달라진다.** 화면 비교의 기준이 무너진다.

→ `@unique` 대신 조회용 `@@index([nickname])`만 둔다.
원본이 중복을 막는다는 것이 확인되면 그때 제약과 마이그레이션을 추가한다.

### D-023. 시드 데이터는 출처를 남긴다 (2026-08-21)

개발 시드로 들어가는 3,000경기는 **가짜다.** 실제 3rd.supply 기록이 아니고,
래더 값도 픽스처 난수라 SACLOUD 공식으로 계산된 것이 아니다.

나중에 실제 기록과 섞이면 구분할 방법이 없어지므로 두 곳에 표시를 남긴다.

- `Match.origin = "mock"` — 실제 수집분(`nexon` / `3rd.supply`)과 구분
- `MatchPlayerStat.formulaVersion = "mock-fixture"` — 공식 계산 결과로 오인하지 않게

같은 이유로 `CLAUDE.md` 3-A 2번(기존 `rating_update`를 추정 공식으로 덮어쓰지 않는다)을
스키마 수준에서 지킬 수 있다. 이전된 과거 기록은 `formulaVersion`이 다르므로 재계산 대상에서 제외된다.

### D-022. 로컬 개발 DB는 `embedded-postgres`로 띄운다 (2026-08-21)

**문제** — 이 개발 PC에는 Docker도 PostgreSQL도 설치돼 있지 않다(2026-08-21 확인).
관리자 권한 설치를 요구하지 않고 개발을 진행할 방법이 필요했다.

**선택** — `embedded-postgres`(PostgreSQL 17 공식 바이너리를 `node_modules`에 내려받아
일반 사용자 권한으로 기동). `pnpm db:start` / `db:stop` / `db:reset`으로 다룬다.
**개발 전용이며 운영에는 쓰지 않는다.** 운영은 관리형 PostgreSQL을 쓴다.

**한국어 Windows에서 막혔던 지점 두 가지** (둘 다 실제로 실패를 확인하고 우회했다)

1. 데이터 디렉터리를 저장소 안(`C:\Users\LG\Desktop\서플라이\.pgdata`)에 두면
   `initdb`가 경로를 CP949로 다뤄 깨진다. → 저장소 밖 **ASCII 경로**
   (`%LOCALAPPDATA%\sacloud\pgdata`)에 둔다. `SACLOUD_PGDATA`로 바꿀 수 있다.
2. 기본 로케일이 `Korean_Korea.949`라
   - `initdb`가 "could not find suitable text search configuration"으로 실패 → `--locale=C`
   - post-bootstrap의 `pg_import_system_collations()`가 Windows collation 이름을 CP949로 넣어
     `invalid byte sequence for encoding "UTF8": 0xbc`로 실패 → 템플릿을 `--encoding=SQL_ASCII`로 만든다.

   **템플릿만 SQL_ASCII이고, 실제 사용 DB(`sacloud`)는 `TEMPLATE template0`으로
   UTF8 + `LC_COLLATE=C`로 따로 만든다.** 한글 저장은 UTF8이며,
   `pnpm db:check`가 한글 왕복과 DB 인코딩을 매번 검증한다.

**포트는 5433.** 나중에 시스템에 PostgreSQL을 설치해도 기본 포트(5432)와 겹치지 않는다.

### D-021. 개발 서버는 반드시 하나만 띄운다 (2026-08-21 사고)

**증상** — `/auth/login`이 브라우저에서 **404**로 보였다. 그런데 코드·빌드·라우트는 전부 정상이었다.

**원인** — `pnpm dev`가 여러 번 실행돼 있었다. Next는 3000이 점유돼 있으면
`Port 3000 is in use ... using available port 3003 instead` 로 **다른 포트에 뜬다.**
그래서 3000번에는 **인증 페이지가 생기기 전에 띄운 옛날 서버**가 남아 있었고,
사용자가 보는 3000번만 404였다. 실제로 3000/3001/3002/3003 네 개가 동시에 떠 있었다.

**대응**
- `pnpm dev:clean` 추가 (`scripts/dev-restart.mjs`) — 3000~3010의 프로세스를 정리하고
  `.next`를 지운 뒤 서버를 **한 번만** 띄운다.
- 404나 "옛날 화면"이 보이면 먼저 **몇 번 포트에 무엇이 떠 있는지** 확인한다.
  Next 시작 로그의 `Local: http://localhost:PORT` 줄을 반드시 본다.

### D-020. 클라이언트 번들에 `@sacloud/mock` 진입점을 넣지 않는다 (2026-08-21)

개발용 세션 스위치를 만들면서 클라이언트 컴포넌트가 `@sacloud/mock`(패키지 루트)을 import했다.
루트 진입점은 `./handlers`(msw)와 `./dataset`(매치 3,000건 픽스처 생성)을 함께 끌어온다.
그 결과 픽스처 생성 코드가 클라이언트 번들에 통째로 들어갔다.

→ `@sacloud/mock/session` 서브경로를 만들어 세션 모듈만 가져오도록 바꿨다.
루트 진입점에도 "클라이언트에서 import 금지" 주석을 달았다.

### D-018. 래더 사양 문서 신설 (2026-08-21)

사용자가 제공한 래더 역추적 결과를 `docs/LADDER_IMPLEMENTATION_SPEC.md`에 정리했다.
D-017에서 "없다"고 기록한 `LADDER_REVERSE_ENGINEERING.md`를 대신하는 문서다.

핵심: 공식 1개(D=3400, Kw(R)=36.6-R/200) + division 조합별 K/multiplier,
교차 division 보정은 **비대칭**(div1 측만 0.6 감쇠).
`CLAUDE.md` 3-B장에 어기면 안 되는 원칙만 요약해 두었다.

미확정으로 남긴 항목: 0.6의 적용 위치 · 2v1 경기 division 오염 · 배치 종료 후 초기 래더 ·
시즌 전환 시 래더 처리 · rounding 순서.

### D-017. `LADDER_REVERSE_ENGINEERING.md` 는 아직 존재하지 않는다

사용자 지시에서 참조된 문서지만 저장소에 없다(2026-08-20 확인).
Phase 9(레이팅) 착수 시 새로 작성하며, 모든 항목을 **확정 / 유력 / 추정 / 미확인** 으로 구분해 표기한다.
확정되지 않은 값(기대승률 함수 · K값 · K 구간 경계 · division multiplier · rounding ·
배치고사 종료 후 초기 래더 산식 · dropout 패널티)을 "원본과 동일한 공식"이라고 단정하지 않는다.
래더 설정값은 코드에 상수로 박지 않고 **변경 가능한 설정/전략 구조**로 분리한다.


---

## 검수 기록

| 일자 | 대상 | 방법 | 결과 |
|---|---|---|---|
| 2026-08-20 | Phase 0 | `pnpm typecheck` / `pnpm lint` / `pnpm test` / `next build` / dev 서버 HTTP 확인 | 전부 통과 |
| 2026-08-20 | Phase 0 브라우저 확인 | Chrome 자동화 | **미실시** — 이 세션에서 브라우저 도구가 꺼져 있었다. Phase 1 착수 시 함께 확인한다 |
| 2026-08-20 | Phase 1 | `pnpm typecheck` / `pnpm lint` / `pnpm test`(98건) / `next build` | 전부 통과 |
| 2026-08-20 | Phase 1 원본 비교 | Chrome 실브라우저 — 원본과 localhost 동시 계측(getComputedStyle/getBoundingClientRect) + 스크린샷 | 헤더·히어로·통합검색·인기게시글·푸터·404·약관 치수/색/서체 일치. 남은 차이는 D-012의 의도된 차이뿐 |
| 2026-08-20 | Phase 1 재검수 (CSS 미적용 신고) | 원인 추적: 서빙되는 CSS 에셋 직접 요청 / Tailwind PostCSS 단독 실행 / `.next` 내용 확인 / 콘솔 로그 / 좀비 프로세스 확인 | `.next` 오염이 원인(D-014). `pnpm clean` 후 재시작하여 해결, 실제 렌더 스크린샷으로 확인 |
| 2026-08-21 | Phase 7 시드 | `pnpm db:check` — 건수 대조 · 한글 UTF8 왕복 · 래더 정합성(base+무기별 delta = 통합) · division 스냅샷 누락 · 대댓글 1단계 | 15항목 전부 통과 |
| 2026-08-21 | Phase 7 Mock↔실제 API 동등성 | `pnpm compare` — 25개 엔드포인트의 응답을 **값까지** 재귀 비교 (커서 메타 포함) | **25/25 일치.** 의도적 차이(`view_count`)만 제외 |
| 2026-08-21 | Phase 7 계약 준수 | 실제 API 응답을 `packages/contract` Zod로 파싱 (`apps/web/tests/apiContract.test.ts`) | 9건 통과. 커서 중복·순위 연속성·404 형태 포함 |
| 2026-08-21 | Phase 7 정적 검사 | `pnpm typecheck` / `pnpm lint` / `pnpm test`(157건) / `pnpm build` | 전부 통과. API 라우트 57개 빌드됨 |
| 2026-08-21 | Phase 7 mock 모드 회귀 | 모드를 `mock`으로 되돌려 주요 7개 화면 + MSW 워커 응답 확인 | 전부 200 (`/rank/clan`의 307은 의도된 리다이렉트) |
| 2026-08-21 | Phase 7 Chrome 렌더 검수 | 실브라우저 DOM 확인 (홈 · 게시판 · 랭킹) | **부분 실시.** 홈·게시판은 live 데이터 렌더 확인, 랭킹에서 404를 발견해 수정(D-028). 이후 **Chrome 창이 최소화된 상태라 확장이 응답하지 않아 스크린샷·나머지 화면 검수는 미실시** |
