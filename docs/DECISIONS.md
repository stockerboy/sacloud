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

## 검수 기록

| 일자 | 대상 | 방법 | 결과 |
|---|---|---|---|
| 2026-08-20 | Phase 0 | `pnpm typecheck` / `pnpm lint` / `pnpm test` / `next build` / dev 서버 HTTP 확인 | 전부 통과 |
| 2026-08-20 | Phase 0 브라우저 확인 | Chrome 자동화 | **미실시** — 이 세션에서 브라우저 도구가 꺼져 있었다. Phase 1 착수 시 함께 확인한다 |
