# HANDOFF_CURRENT.md — 현재 상태 인수인계

**작성 2026-08-21.** 새 세션은 **이 파일 하나만 읽어도** 상황을 파악할 수 있어야 한다.
읽는 순서: `CLAUDE.md` → 이 파일 → `git log --oneline -10`.

---

## A. 프로젝트 현재 상태

### Phase

| Phase | 상태 |
|---|---|
| 0 계약 + Mock 생성기 | ✅ 완료 |
| 1 공통 레이아웃 + 홈 | ✅ 완료 |
| 3 리그 & 랭킹 | ✅ 완료 |
| 2 플레이어 & 클랜 프로필 | ✅ 완료 |
| 4 기록실 & 매치 상세 | ✅ 완료 |
| 5 게시판 | ✅ 완료 |
| 6 인증 & 관리 화면 | ✅ 완료 — 여기까지 **M1 (Mock 기반 화면·흐름 복원)** |
| **7 DB + 실제 API** | ✅ **완료** (2026-08-21 최종 검수 완료) |
| **8 전적 수집 파이프라인** | ⬜ **다음 작업. 아직 시작 안 함** |
| 9 레이팅/시즌/랭킹 배치 | ⬜ |
| 10 SSR/SEO/성능/운영 | ⬜ |

**Legacy 이관(3rd.supply 과거 기록)은 Phase 8과 별개 트랙**이며 현재 **WAF로 blocked** 상태다 (D장).

### 기술 스택

pnpm workspace 모노레포 / Next.js 15 App Router / React 19 / **TypeScript 5.9 고정**(7.x는 `next build`가 깨진다, D-007) /
Tailwind v4 / TanStack Query / Zod / **PostgreSQL + Prisma 6** / 인증은 `jose`(JWT) + `bcryptjs` **직접 구현**(D-025) / Vitest

```
apps/web/            Next.js — 화면 + app/api/** 실제 API (라우트 57개)
packages/contract/   Zod 스키마 + 엔드포인트 레지스트리   ← 계약의 단일 진실 원천
packages/mock/       결정적 픽스처 + MSW 핸들러
packages/ui/         공용 컴포넌트 + 디자인 토큰(원본 실측값)
packages/db/         Prisma 스키마 · 시드 · legacy 도구
docs/                기준 문서 · 결정 기록
```

### 실행 명령

```bash
# 개발 (순서대로)
pnpm db:start        # 로컬 PostgreSQL 127.0.0.1:5433 — 켜 두는 명령. 끄면 API가 전부 500 (D-022)
pnpm db:migrate      # 최초 1회
pnpm db:seed         # Mock과 같은 결정적 픽스처 적재
pnpm dev:clean       # dev 서버를 3000번에 하나만 기동 (여러 개 뜨면 404 사고, D-021)

# 검증
pnpm typecheck / pnpm lint / pnpm test / pnpm verify
pnpm build           # 프로덕션 빌드 (clean 후 실행)
pnpm db:check        # 시드 자가 점검 15항목
pnpm compare         # Mock ↔ 실제 API 응답을 **값까지** 대조

# Legacy (아래 C장)
pnpm legacy:import <파일.csv> [--dry-run]
pnpm legacy:collect --players <CSV> [--limit N] [--dry-run] | --resume
```

> **화면 검수는 `pnpm dev`가 아니라 프로덕션 빌드로 한다** (D-032).
> dev는 라우트마다 첫 요청에서 컴파일해 수십 초가 걸리고, 렌더러가 멈춰 앱 버그와 구분이 안 된다.
> `pnpm build` → `pnpm --filter @sacloud/web start`

### DB 상태

- 로컬 개발 DB: `embedded-postgres` (Docker/PostgreSQL 미설치 환경, **개발 전용**, D-022)
- 데이터 디렉터리: `%LOCALAPPDATA%\sacloud\pgdata` (저장소 경로에 한글이 있어 initdb가 깨진다)
- 마이그레이션 6개 적용 완료 (`20260821000820_init` … `20260821091714_legacy_collection_job`)
- 시드: 클랜 60 · 플레이어 920 · 사용자 42 · 리그 4 · 매치 3,000 · 참가기록 31,462 · 게시글 400 · 댓글 1,200
- **시드 데이터는 전부 가짜다.** `Match.origin="mock"` / `formulaVersion="mock-fixture"` 로 표시 (D-023)
- Legacy 테이블은 **현재 비어 있다** (`LegacyPlayerSeason` 0행, `LegacyCollectionJob` 0건)

### 검수 계정 (로컬 개발 전용, D-033)

비밀번호는 4개 공통 **`sacloud1234`** (시드의 `DEV_PASSWORD`, 운영 비밀값 아님)

| 이메일 | 역할 |
|---|---|
| `user001@naver.com` | 운영자(role 2) + 공식전 리그 소유자 |
| `admin-test@naver.com` | 운영자, 리그 소유 없음 |
| `user-test@naver.com` | 일반 회원, 리그 참여 클랜 소속 플레이어와 연동 |
| `user005@naver.com` | 일반 회원, 연동 X, 권한 없음 |

### 마지막 검증 (2026-08-21)

| 항목 | 결과 |
|---|---|
| typecheck / lint | 통과 |
| **test** | **192 passed / 1 skipped** |
| build | 통과 (37 페이지) |
| `pnpm db:check` | 15항목 통과 |
| `pnpm compare` | **25/25 일치** |

> skip 1건은 "개발 서버가 없으면 계약 테스트를 건너뛴다"는 안내용 테스트다.
> 서버가 떠 있으면 계약 테스트 8건이 돌고 이 1건이 skip된다. 정상이다.

---

## B. Legacy 3rd.supply 이관 상태

### 목적 (범위 축소됨)

> 현재 활동 중인 약 5,000명이, **서플라이공식리그(`supply`)** 의
> 과거 시즌 요약(승률·킬뎃·순위)을 새 SACLOUD에서 볼 수 있게 한다.

**다른 리그는 이관하지 않는다.** 3부리그(`sanply`)·대룰리그(`daerule`)·기타 사용자 리그 전부 제외.

### 확정된 URL

```
https://3rd.supply/league/supply/player/<PLAYER_ID>/season
```

### 확정된 사실 (원본 화면 실측)

- **playerId만 있으면 URL을 바로 조립할 수 있다.** 프로필 페이지를 거칠 필요 없음
- **유저당 1페이지.** 그 한 페이지에 **시즌 1~6 카드가 전부** 있다
- 원본은 **표가 아니라 카드**다 (2열 격자)
- **시즌마다 제공 필드가 다르다**
  ```
  시즌 6: 6,934명중  1위  967승 578패  승률 62.6%  16,875킬 10,605데스  킬뎃 61.4%
  시즌 4: 29,991명중 122위             승률 56.9%                      킬뎃 56.9%  ← 비율만
  ```
- 과거 시즌은 `win_rate` / `kd` 만 있을 수 있다 → `wins`/`losses`/`kills`/`deaths` 는 **null**
- **절대 역산하지 않는다.** 승률에서 승·패를 되만들 수 없다 (총 경기 수를 모른다)
- `final_rating`(래더)은 **시즌 카드에 없다** → 항상 null (사이드바의 래더는 *현재* 시즌 값이다)
- `division` / `clan_name` 도 카드에 없다 → null
- `source_player_id` 는 **문자열**로 다룬다 (실측: `285626135` 9자리, `1074574325` 10자리 — 자릿수 고정 아님)

### 덤으로 확인된 것

원본 숫자로 우리 파생 공식이 검증됐다.
```
승률 = 218/(218+173) = 55.75% → 화면 55.8%   ✓
킬뎃 = 3468/(3468+3197) = 52.03% → 화면 52%  ✓
```
**킬뎃은 비율이 아니라 백분율**이라는 것의 독립적 증거. 회귀 테스트로 고정했다.

### 저장 모델 `LegacyPlayerSeason`

운영 데이터(`LeaguePlayerSeason` / `Match`)와 **완전히 분리**. 조인하지 않고, 합산하지 않고,
**신규 래더 공식으로 재계산하지 않는다.**

| 필드 | 비고 |
|---|---|
| `source` | `"3rd.supply"` |
| `sourcePlayerId` | nullable, 문자열 |
| `nickname` | **영구 ID가 아니다.** 닉네임만으로 현재 사용자와 자동 병합 금지 |
| `leagueSlug` | `supply`. 빼면 다른 리그의 같은 시즌이 서로 덮어쓴다 |
| `season` | |
| `division` `clanName` `finalRating` | 카드에 없어 항상 null |
| `wins` `losses` `winRate` `kills` `deaths` `kd` | 없으면 null |
| `finalRank` `rankCount` | `6,934명중 140위` → 140 / 6934 |
| `sourceUrl` `rawSnapshot` `importedAt` | 원문 보존 (재변환 가능) |
| **`dedupeKey`** | **`@unique`** |

**dedupe 정책**
```
dedupeKey = <source>|<sourcePlayerId ?? "nick:"+nickname>|<leagueSlug ?? "-">|<season>
```
복합 유니크를 쓰지 않은 이유: Postgres는 NULL을 서로 다른 값으로 봐서
`sourcePlayerId`가 비면 중복이 걸러지지 않는다. **upsert(dedupeKey)** 로 멱등성을 보장한다.

---

## C. Legacy parser / importer 구현 상태

| 파일 | 역할 |
|---|---|
| `packages/db/legacy/extract.ts` | **핵심 파서.** `parseSeasonCard()` 카드 글자 → 값 / `splitSeasonCards()` 페이지 텍스트 → 카드 조각 / `htmlToText()` HTML → 글자 / `mapSeasonRow()` 표 형식(우리 재현 화면용) |
| `packages/db/legacy/row.ts` | CSV 한 줄 → `LegacyPlayerSeason` 입력. `buildDedupeKey()` |
| `packages/db/legacy/csv.ts` | 의존성 없는 작은 CSV 파서 (따옴표·쉼표·CRLF) |
| `packages/db/legacy/import.ts` | `pnpm legacy:import` — CSV 적재. 멱등. 잘못된 줄은 줄 번호와 사유로 보고 |
| `packages/db/legacy/collect.ts` | `pnpm legacy:collect` — **자동 수집 job.** 응답 분류 · 재시도 · 체크포인트 · 재개 · upsert |
| `packages/db/legacy/collect-snippet.js` | **사람이 브라우저에서 직접 돌리는** 수집기. 요청을 보내지 않고 화면 글자만 읽어 `localStorage`에 누적. `__legacyStatus()` `__legacyTodo()` `__legacyExport()` `__legacyReset()` |
| `packages/db/legacy/extract-snippet.js` | 위의 단일 페이지 버전 (한 페이지 → CSV) |
| `packages/db/legacy/__tests__/legacy-extract.test.ts` | **30건.** 실제 원본 문자열 기준. 파서↔스니펫 규칙이 어긋나면 실패 |

**파서는 하나뿐이다.** 수집기·스니펫·import가 전부 같은 규칙을 쓰고,
어긋나면 테스트가 깨진다 (어긋난 채 5,000페이지를 모으면 전부 다시 해야 한다).

### 수집 job 모델

- `LegacyCollectionJob` — status(`running`/`done`/`stopped`/**`blocked`**) · 진행 수치 · `lastPlayerId` · `stopReason`
- `LegacyCollectionPlayer` — 플레이어별 status · attempts · rowsCreated · errorType · httpStatus · durationMs
- 재개 시 **`success` / `not_found` 는 건너뛴다.** `blocked` / `pending` 은 재시도한다

### 실행 명령 (package.json 실측)

```bash
pnpm legacy:import <파일.csv> [--dry-run] [--source=3rd.supply]
pnpm legacy:collect --players <플레이어CSV> [--limit N] [--dry-run]
pnpm legacy:collect --resume [--limit N]
```

---

## D. 실제 자동 수집 테스트 결과 (2026-08-21)

### 첫 실제 요청

```
GET https://3rd.supply/league/supply/player/285626135/season
User-Agent: SACLOUD-legacy-migration/1.0 (operator-authorized; contact: sacloud@local.invalid)

→ HTTP/1.1 405 Not Allowed
   x-amzn-waf-action: captcha
   <title>Human Verification</title>
   window.awsWafCookieDomainList / window.gokuProps      ← AWS WAF CAPTCHA
```

| 항목 | 결과 |
|---|---|
| 정상 페이지 | **0** |
| DB 저장 행 | **0** |
| 404 / 403 / 429 | 0 / 0 / 0 |
| **WAF CAPTCHA** | **1건 — 첫 요청에서 확인 후 즉시 전체 중단** |
| 실제로 보낸 요청 | **총 1건** |
| 평균 처리 시간 | 318ms |

### 지킨 것

- **CAPTCHA/WAF를 우회하지 않았다**
- proxy / IP 회전 / stealth / fingerprint 위장 / **User-Agent 위장을 구현하지 않았다**
  (UA는 우리가 누구인지 밝히는 값을 썼다. 브라우저인 척했다면 통과했을 수도 있지만 그게 금지 사항이다)
- 차단 감지 → `status=blocked` + `stopReason` + 플레이어별 기록으로 **체크포인트 저장**
- resume / idempotency **검증 완료**
  ```
  재개 대상: 1074574325(blocked), 285626135(pending)
  → success 로 표시하면 제외됨 / not_found 도 제외됨 → 0명
  ```

### 현재 상태

> **Legacy 5,000명 자동 수집은 `blocked` 다. 수집을 시작하지 않았다.**

파이프라인은 완성돼 있고, **차단이 풀리면 `pnpm legacy:collect --resume` 로 그대로 돌아간다.**

### 정상적으로 풀 수 있는 경로

| 방법 | 필요한 것 | 사람 시간 |
|---|---|---|
| ① **운영자 CSV/DB export** (`WHERE l.slug='supply'`) | 쿼리 1회 | **0** |
| ② **운영자가 WAF 예외 제공** (IP allowlist 또는 별도 허용 경로) | 콘솔 설정 1회 | **0** (자동 수집 즉시 가능) |
| ③ 사람이 브라우저에서 수동 수집 (`collect-snippet.js`) | 없음 | 약 21시간 (5,300페이지) |

권장 SQL은 `docs/LEGACY_MIGRATION.md` 7장에 있다.

---

## E. 중요한 의사결정

1. **기존 "3rd.supply 전체 복제" 계획은 폐기.**
   Legacy 목표는 `현재 활동 유저 → 서플라이공식리그 → 과거 시즌 요약` 뿐이다.
2. **경기 약 12만 건 개별 이관은 하지 않는다.** 경기 상세·참가자 10명·경기별 `rating_update`·게시판 전부 제외.
3. **3부리그·대룰리그·기타 리그는 이관하지 않는다.**
4. **Legacy와 신규(Nexon) 데이터는 분리한다.** 별도 테이블, 조인·합산하지 않는다.
5. **Legacy 값을 신규 래더 공식으로 재계산하지 않는다.** 원본값 그대로 보존 (`CLAUDE.md` 3-A 2번).
6. **접근 통제는 우회하지 않는다.** 운영자의 데이터 이전 허가와, 사업자가 인프라에 걸어둔
   기술적 접근 통제는 다른 문제다. WAF 예외는 운영자가 열어줄 일이지 우리가 뚫을 일이 아니다.
7. 인증은 Auth.js 대신 직접 구현 (D-025) — **계획 문서와 다른 선택이라 사용자 확인이 아직 남아 있다.**

관련 결정 기록: `docs/DECISIONS.md` D-022 ~ D-033.

---

## F. Nexon Phase 8 (다음 우선순위)

Legacy가 WAF로 막혔으므로 **기본 개발 우선순위는 Phase 8**이다.

```
Nexon Open API → raw 보존 → normalize → validate → 도메인 DB
```

### 넥슨 콘솔에서 확인된 제약 (2026-08-21)

- **2025-01-24 이후 데이터만 조회 가능** → 그 이전은 넥슨으로 못 가져온다 (Legacy가 필요한 이유)
- **크롤링한 데이터는 30일 이내에 갱신할 의무** → 일회성 수집이 아니라 **주기적 재수집**이 필수
- **게임 콘텐츠 변경으로 `ouid`가 바뀔 수 있다** → `Player.nexonOuid`를 불변 키로 믿으면 안 된다
- 게임 데이터는 평균 10분 후 조회 가능
- 호출: `https://open.api.nexon.com` · 헤더 `x-nxopen-api-key`

### API 키

- `apps/web/.env.example` 에 `NEXON_API_KEY` 자리를 만들어 뒀다
- 실제 값은 `apps/web/.env.local` (gitignore됨). **현재 비어 있다**
- 사용자가 보유한 키는 `test_` 로 시작하는 **테스트 키**라 호출 한도가 낮다.
  실수집 전 서비스 키 여부와 한도를 확인해야 한다
- **키 값을 채팅·문서·커밋에 남기지 않는다**

### 필수 고려 (스키마에 이미 자리가 있다)

`idempotency` · `retry` · `cursor` · `import job` · **raw preservation** · API 장애 · OUID 변경 · 외부 신원 매핑
→ `RawImport` / `SourceMapping` / `ImportJob` / `ImportFailure` / `MigrationCheck` 모델 참고

### 하지 않는 것

**Phase 8에서 래더/랭킹 공식을 확정하지 않는다.** 그건 Phase 9다
(`docs/LADDER_IMPLEMENTATION_SPEC.md` 를 Phase 9 착수 시 반드시 먼저 읽는다).

---

## G. 다음 세션 첫 행동

1. `CLAUDE.md` 읽기
2. **이 파일** 읽기
3. `git status` 확인
4. `git log --oneline -10` 으로 최근 checkpoint 확인

그 뒤 **현재 상태를 10줄 이내로 요약해서 사용자에게 보고하고, 임의로 작업을 시작하지 말고 다음 지시를 기다린다.**

### 사용자 확인이 필요한 열린 항목

- [ ] Legacy: 운영자에게 **CSV** 를 요청할지, **WAF 예외** 를 요청할지, **수동 수집**(21시간)을 할지
- [ ] Phase 8 착수 승인 (넥슨 API 키를 `.env.local` 에 넣어야 실수집 가능)
- [ ] **Auth.js 미사용 결정(D-025) 승인** — 계획 문서와 다른 선택
- [ ] 서든어택 계정 연동이 **소유권을 증명하지 않는다** — 운영 노출 전 반드시 해결
