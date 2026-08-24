# HANDOFF_CURRENT.md — 현재 상태 인수인계

**작성 2026-08-21. 최종 갱신 2026-08-24 (Phase 14 — 현재 소속 자동 갱신 · 경기 당시 소속 분리).**
> **지금 상태를 가장 빨리 알려면 맨 아래 L장을 먼저 읽는다.** 새 세션은 **이 파일 하나만 읽어도** 상황을 파악할 수 있어야 한다.
읽는 순서: `CLAUDE.md` → 이 파일 → `git log --oneline -10`.
Phase 9 래더는 **H장** · `docs/LADDER_TUNING_REPORT.md` · `docs/DECISIONS.md` D-057~D-068에 있다.

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
| **8 전적 수집 파이프라인** | ✅ 파이프라인 + 실응답 검증 완료 |
| **8.1 D-044 검증 + 적응형 폴링** | ✅ 완료 |
| **8.2 로스터 기반 재구성** | ✅ 완료 (2026-08-22). **D-044는 여전히 해결되지 않았다** — 아래 F장 |
| **9 레이팅/시즌/랭킹** | ✅ 완료 (2026-08-22) |
| **10 베타 운영 준비** | ✅ 관리자 화면·실데이터 E2E 완료 (2026-08-22). 아래 I장 |
| **11 Beta 공개 시즌 구조** | ✅ 시즌 타입·격리·클랜 래더 4종·legacy importer·Beta 공개 UI (2026-08-22). 아래 **J장** |
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
packages/nexon/      넥슨 Open API 클라이언트 · 스키마 · 정규화 (순수, DB 모름)
apps/worker/         넥슨 수집 잡 + CLI (Redis/BullMQ 없음, ImportJob 체크포인트)
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

# 넥슨 수집 (아래 F장)
pnpm nexon:status                                  # 현재 적재 현황 + 키 설정 여부
pnpm nexon:identities --nicknames "닉1,닉2" [--dry-run]
pnpm nexon:collect --ouid <OUID> | --all-identities [--dry-run] [--limit N]
pnpm nexon:project [--league <slug>] [--reproject] [--allow-mock-league]
pnpm nexon:poll --targets N [--detail-limit N] [--modes "폭파미션"]   # 적응형 폴링 (8.1)
pnpm nexon:report                                  # 티어 분포 + 호출량 계측
pnpm nexon:manual-refresh --player <playerId>      # 수동 갱신 최우선 표시
pnpm nexon:refresh [--limit N]                     # 신선도 정책(기본 30일) 재수집

# 로스터 기반 재구성 (8.2 — 아래 F장)
pnpm nexon:roster                                          # 등록 현황
pnpm nexon:roster --league <slug> --file <CSV> [--verified]
pnpm nexon:roster --league <slug> --from-league-players    # 현재 소속에서 파생 (미확인 상태)
pnpm nexon:roster --sync-priority                          # 폴링 우선순위 동기화
pnpm nexon:backfill-observations [--ouid <OUID>]           # 보관 원본 → 관측값 (**요청 없음**)
pnpm nexon:reconstruct [--league <slug>] [--redo] [--match-id <ID>] [--allow-unverified-roster]

# 래더 (Phase 9 — 아래 H장)
pnpm nexon:rate --league <slug> [--dry-run]     # 리그 전체를 처음부터 다시 계산 (결정적)
pnpm nexon:season-reset --league <slug>         # 시즌 종료 soft reset (완전 초기화 아님)
pnpm nexon:check                                   # 숫자 대조 12항목
pnpm --filter @sacloud/worker exec tsx src/dev/offlineSmoke.ts   # 네트워크 없이 전 구간 점검

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
- 마이그레이션 **10개** 적용 완료 (`20260821000820_init` … `20260822005816_phase9_rating_evidence`)
- 시드: 클랜 60 · 플레이어 920 · 사용자 42 · 리그 4 · 매치 3,000 · 참가기록 31,462 · 게시글 400 · 댓글 1,200
- **시드 데이터는 전부 가짜다.** `Match.origin="mock"` / `formulaVersion="mock-fixture"` 로 표시 (D-023)
- Legacy 테이블은 **현재 비어 있다** (`LegacyPlayerSeason` 0행, `LegacyCollectionJob` 0건)
- 넥슨 테이블에 **실데이터가 소량 들어 있다** (2026-08-21 실응답 검증분, 닉네임 1명)
  `RawImport` 15 · `NexonMatch` **2,414**(상세 6) · `NexonMatchParticipant` 37 ·
  `NexonIdentity` 3(전부 unresolved) · `NexonNickname` 26 · `NexonPollState` 3 ·
  `NexonMatchObservation` **2,434** · 운영 `Match(origin=nexon)` **0**
- `LeagueRosterMembership` **0행** — 로스터 등록은 운영자의 일이다. 이것이 비어 있으면
  재구성은 한 건도 되지 않는다 (그게 정상이다)
- 관측값 2,434건 중 2,414건은 **보관된 원본에서 백필**된 것이다 (넥슨 호출 없음, F장 사고 기록 참조)

### 검수 계정 (로컬 개발 전용, D-033)

> **폐기됨 (2026-08-23 · D-119).** 예전에 있던 공용 비밀번호는 **무효화됐다.**
> 시드 계정 42개는 전부 아무도 모르는 무작위 해시라 **로그인할 수 없다.**
>
> 로컬에서 로그인이 필요하면 둘 중 하나를 쓴다.
> - 재시드: `SACLOUD_SEED_PASSWORD='...' pnpm db:seed`
> - 검수 계정 별도 생성:
>   `SACLOUD_TEST_ACCOUNT_PASSWORD='...' pnpm nexon:accounts --provision-test --email qa@example.invalid`
>   (기본 최소 권한. 관리자 화면이 필요할 때만 `--admin`)
>
> 어느 경우에도 **평문을 저장소·문서·로그에 남기지 않는다.**

| 이메일 | 역할 |
|---|---|
| `user001@naver.com` | 운영자(role 2) + 공식전 리그 소유자 |
| `admin-test@naver.com` | 운영자, 리그 소유 없음 |
| `user-test@naver.com` | 일반 회원, 리그 참여 클랜 소속 플레이어와 연동 |
| `user005@naver.com` | 일반 회원, 연동 X, 권한 없음 |

### 마지막 검증 (2026-08-22, Phase 9)

| 항목 | 결과 |
|---|---|
| typecheck / lint | 통과 |
| build | 통과 (37 페이지) |
| **test** | **400 passed / 9 skipped** (래더 엔진 37건 추가) |
| 오프라인 스모크 | **98항목 통과** (Phase 9 래더 반영·결정적 replay 포함) |
| `pnpm nexon:check` | **15항목 통과** (인정 기준·공식 버전·제로섬 3항목 추가) |
| `pnpm db:check` | **23항목 통과** |
| `pnpm compare` | 25건 중 **24건 일치** — 어긋난 1건은 게시판 `like_count`(60 vs 61)로 **DB 상태 드리프트**다. 코드 문제가 아니다 |

> skip 9건은 **개발 서버가 없을 때** 건너뛰는 계약 테스트다.
> 서버가 떠 있으면 계약 테스트 8건이 돌고 안내용 1건만 skip된다. 정상이다.

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

## F. Phase 8 / 8.1 — 넥슨 수집 (2026-08-21)

사양: `docs/NEXON_INGEST_SPEC.md` · 결정: `docs/DECISIONS.md` D-034 ~ D-051

### 파이프라인 (완성 · 실데이터로 검증됨)

```
Nexon 응답 → RawImport(append-only) → normalize → NexonMatch/NexonMatchParticipant
          → validate → projection rule → Match / MatchPlayerStat
```

- 신원은 ouid·닉네임 어느 쪽으로도 자동 병합하지 않는다 (D-036)
- 넥슨이 주지 않는 값(무기·플레이시간·종료시각·선공·MVP·탈주)은 전부 `null` (D-034)
- 실제 응답은 스펙과 두 가지가 달랐다: 클랜명 필드가 `guild_name`(D-043), **양 팀 미제공**(D-044)

### ★ D-044 — 아직 **해결되지 않았다** (최대 BLOCKER)

후속 검증(Phase 8.1)에서 확인한 것:

| 검증 | 결과 |
|---|---|
| 같은 `match_id` 재호출 (3건) | **응답이 완전히 동일**(contentHash 일치). 새 행 없이 `fetchCount`만 증가 |
| 다른 참가자의 목록에 같은 경기가 있는가 | **있다.** 그 사람의 kill/death/assist·승패를 준다 (상세 값과 일치) |
| 상대 팀 전원 확보 | **불가.** 상세가 상대 닉네임을 안 주므로 모르는 사람은 조회조차 못 한다 |

분류: **CASE 1**(multi-OUID 재조회는 의미 없음) + **조건부 CASE 3**(우리가 이미 아는 사람만 보완 가능).

부수 발견: 닉네임으로 조회한 계정이 그 경기의 그 사람이 아닌 사례를 실제로 만났다(`혀반샷`).
D-036(닉네임 자동 병합 금지)이 실데이터로 확인된 셈이다.

### 적응형 폴링 (Phase 8.1 신규)

- `NexonPollState` — 계정별 tier/주기/다음 조회 시각/연속 빈 조회/수동 갱신 요청
- 티어: `hot` 30분 · `warm` 3시간 · `cold` 1일 · `dormant` 7일 (전부 `NEXON_POLL_*` 설정값)
- 우선순위: 수동 갱신 > hot > warm > cold > dormant, 같으면 오래 기다린 순
- 크게 밀린 대상은 우선순위를 올려 **굶지 않게** 한다
- 이미 상세를 가진 경기는 다시 부르지 않는다 (D-050). 신선도 기한만 예외
- 목록에서 얻은 개인 기록은 `NexonMatchObservation`에 출처와 함께 쌓는다 (D-048)
- 실행마다 호출량을 `NexonPollRun`에 남긴다 → `pnpm nexon:report`

절감 계산: 고정 전수(30분·4모드·5,000명) 96만 호출/일 → 적응형 약 7.9만 호출/일(가정 분포).
**분포는 가정이며 실제 값은 `NexonPollRun`으로 확인한다.**

### 실호출 누계 (2026-08-21)

Phase 8 검증 15회 + Phase 8.1 검증 7회 = **총 22회**. 429·403은 한 번도 없었다.

## F-2. Phase 8.2 — 로스터 기반 재구성 (2026-08-22)

결정: `docs/DECISIONS.md` D-052 ~ D-056

### 무엇을 한 것인가 (그리고 아닌 것)

> **D-044를 해결한 것이 아니다.** 넥슨 상세는 여전히 참가자 일부만 준다.
> Phase 8.2가 만든 것은 **공식리그 경기를 신뢰성 있게 재구성할 수 있는 조건**이다.

근거는 넥슨 밖에서 온다.

| 근거 | 출처 | 성격 |
|---|---|---|
| 개인 관측값 | 각 선수의 매치 목록 (`NexonMatchObservation`) | **1차.** 호출 없이 쌓인다 (D-048) |
| 경기 시점 소속 | `LeagueRosterMembership` (운영자 등록) | **1차.** 넥슨이 주는 값이 아니다 (D-052) |
| 매치 상세 | `NexonMatchParticipant` | **보조.** 교차검증 + 헤드샷/데미지 (D-054) |

### 완전성 조건 (D-056 — 하나라도 모자라면 투영하지 않는다)

참가자 전원 관측 · 전원 로스터 근거 · 클랜 정확히 2곳 · 양 팀 인원 동일 ·
리그 대전 인원 일치 · 클랜별 승패 일관 · 승자 유일 · 상세와 불일치 없음

미완 사유는 코드로 구분되어 `NexonMatch.reconstruction`(JSON)에 숫자로 남는다:
`missing_observation` `incomplete_roster` `roster_mismatch` `conflict_with_detail`
`inconsistent_outcome` `no_winner` `duplicate_player` `mock_league` `match_type` `map_not_in_league` 등

### 폴링 쪽 변화 — **호출량은 늘지 않는다**

- 리그 등록 선수를 **같은 티어 안에서** 먼저 본다 (D-053). 티어를 뒤집지 않는다
- 새 클랜전을 발견하면 동료·**증거로 확인된** 상대 클랜의 조회를 앞당긴다 (D-055).
  상한은 `NEXON_POLL_PROPAGATION_FANOUT`(기본 20). 티어·주기는 건드리지 않는다

### 세 번째 범위 사고 (기록)

`backfillObservations()`에 범위 인자가 없어서, 오프라인 스모크가 **실제 수집분의 목록 원본까지**
다시 읽어 관측값 2,414건을 만들었다.

- 넥슨 호출은 **0건**이다. 이미 보관한 원본을 다시 읽었을 뿐이다
- 값 자체는 정당하다 (운영자가 `nexon:backfill-observations`를 부르면 나왔을 그 행이다)
- 그래도 D-045 위반이다. `backfillObservations({ ouids })`로 범위를 넣고 스모크를 제한했다
- 만들어진 행은 지우지 않았다 — 보관 원본에서 나온 실제 증거다

### 남은 BLOCKER

1. **D-044 미해결** — 상대 팀 전원 확보는 여전히 불가하다.
   로스터에 없는 클랜과의 경기는 재구성되지 않는다 (그게 설계다)
2. **로스터가 비어 있다** (`LeagueRosterMembership` 0행). 재구성 실행 경로는 완성됐지만
   **입력이 없다.** 운영자 등록 없이는 한 건도 재구성되지 않는다
3. 실제 리그·클랜·플레이어가 없다 (DB는 여전히 mock). 신원 연결은 사람이 승인해야 한다
4. 테스트 키 호출 한도 `[미확인]` — 22회로는 한도에 닿지 않았다
5. `user/basic`·`rank`·`tier`·`recent-info`는 아직 호출해 보지 않았다
6. 적응형 폴링·전파는 **오프라인 스모크로만** 검증했다 (실 API로 poll 실행은 아직)

## G. 다음 세션 첫 행동

1. `CLAUDE.md` 읽기
2. **이 파일** 읽기
3. `git status` 확인
4. `git log --oneline -10` 으로 최근 checkpoint 확인

그 뒤 **현재 상태를 10줄 이내로 요약해서 사용자에게 보고하고, 임의로 작업을 시작하지 말고 다음 지시를 기다린다.**

### 사용자 확인이 필요한 열린 항목

- [ ] Legacy: 운영자에게 **CSV** 를 요청할지, **WAF 예외** 를 요청할지, **수동 수집**(21시간)을 할지
- [ ] **D-044 대응 방향 결정** — multi-OUID 재조회는 **불가로 확인됨**.
      Phase 8.2가 택한 길은 "리그 로스터 + 목록 관측으로 **완전할 때만** 복원". 남은 선택지는
      넥슨 문의 / 다른 출처
- [ ] **로스터 등록 방식 결정** — 운영자 CSV를 받을지, `LeaguePlayer.clanId`에서 파생한 뒤
      운영자가 확인(verified)할지. 이것 없이는 재구성이 시작되지 않는다
- [ ] 대규모 수집 착수 여부 (로스터가 없으면 반쪽 데이터만 쌓인다)
- [ ] **Phase 9 래더 공식 승인** — 후보·시뮬레이션은 아래 H장. **승인 전 production 적용 금지**
- [ ] **Auth.js 미사용 결정(D-025) 승인** — 계획 문서와 다른 선택
- [ ] 서든어택 계정 연동이 **소유권을 증명하지 않는다** — 운영 노출 전 반드시 해결

---

## H. Phase 9 — 래더 엔진 (2026-08-22 · 최신 정책 반영 완료)

> 정책: `docs/DECISIONS.md` **D-079 ~ D-088이 최신**이다 (앞선 항목 중 충돌분을 대체).
> 상수 근거: `docs/LADDER_TUNING_REPORT.md` · 엔진: `packages/rating/`

### 공식

```
개인   K(R) = max(8, 36.6 - R/200)
       E    = 1 / (1 + 10^((Ro - R) / 800))
       승리 = +round(K(R) × (1-E) × capFactor)     ← 절대 음수가 되지 않는다
       패배 = -round(K(R) × E)

클랜   같은 구조(K = 16) × **팀별 반영률**
```

- division을 넣지 않는다 · 동급 경기 증감 합 0 · 보상 감쇠는 **부호**를 본다(업셋 보호)
- 반복 대전 감쇠 **꺼짐** — 멸망전은 정상 문화다

### 공식 경기 인정 — **OR 조건** (D-079)

**양 팀 중 한쪽이라도** 본클랜원 3명 이상이면 공식 경기다. AND가 아니다.

```
클3+용2 vs 클0+용5  → 공식        클2+용3 vs 클2+용3  → 비공식 경기
```

### 비공식 경기 (D-080)

양쪽 다 3명 미만이어도 **경기는 남긴다**. `Match.official = false`.
기록실에 참가자·K/D/A·맵·결과가 그대로 보이고, 화면에 `비공식 경기 · 래더 미반영` 배지가 붙는다.
시즌 승패·킬뎃·평균킬·MVP·개인 래더·클랜 래더·랭킹에는 **전혀 반영하지 않는다**.

### 클랜 래더 반영률 (D-081 · D-082)

| 본클랜원 | 클랜 래더 |
|---|---|
| 3명 이상 | 100% |
| 2명 | 70% |
| 1명 | 40% |
| 0명 | 0% |

팀마다 **독립**이라 한 경기의 클랜 증감 합이 0이 아닐 수 있다(`+8 / -20`).
장기 영향은 측정했다 — 평균 이동 최대 -4.0, 하한 집중 0건, 실력 상관 0.979↑ (D-083).

**개인 래더에는 차등이 없다.** 용병도 100% 받는다. 용병의 원소속 클랜 래더는 불변이다.

### 시즌 (D-077 · D-078 · D-085 · D-086)

- 전환은 **운영자 액션으로만**. 날짜·배포로 자동 전환하지 않는다
- 귀속은 **실제 경기 시각(`startAt`)** 기준. 늦게 수집돼도 마찬가지다
- 종료 시 **최종 랭킹 스냅샷**을 굳히고, 시작 시 **승강 반영 + 전원 1500**
- 지난 시즌 기록(경기·참가기록·시즌 통계·스냅샷)은 그대로 보존한다

### 운영 명령 (관리자 기능)

```bash
pnpm nexon:season --league <slug>                    # 현재 시즌 상태
pnpm nexon:season --league <slug> --close [--at ISO] # 최종 랭킹 스냅샷 + 종료
pnpm nexon:season --league <slug> --start [--at ISO] # 승강 반영 + 전원 같은 점수로 시작
pnpm nexon:clan  [--league <slug>]                   # 클랜 목록
pnpm nexon:clan  --register --slug <s> --name <n>
pnpm nexon:clan  --rename   --slug <s> --name <n>
pnpm nexon:clan  --join --league <slug> --slug <s> --division N
pnpm nexon:clan  --merge --from <s> --into <s>       # slug 두 개를 정확히 지정할 때만
pnpm nexon:roster --league <slug> --file <CSV> [--verified]
pnpm nexon:rate  --league <slug> [--season N]        # 시즌 전체를 처음부터 다시 계산
```

> **관리자 화면은 아직 없다.** 위 기능은 전부 CLI로만 제공된다.
> 웹 관리자 페이지(시즌 제어·클랜 관리)는 **남은 작업**이다 — Phase 10 범위.

### 지금 상태

**계산된 경기는 0건이다.** 로스터가 비어 재구성된 경기가 없다.
파이프라인은 오프라인 스모크 **112항목**으로 끝까지 검증했다
(공식/비공식 경기 분기 · 용병 기록 · 원소속 불변 · 시즌 baseline 포함).

### PRE-PRODUCTION REQUIRED CHECK

실제 roster가 등록되면 **경기 1건 이상으로 전 구간을 한 번 확인해야 한다.**
`넥슨 → 관측 → 재구성 → 공식/비공식 판정 → 래더 → LeaguePlayer/LeagueClan → 랭킹 화면`
아직 수행하지 못했다. BLOCKER가 아니라 **운영 전 필수 점검**이다.

### 사용자 결정이 남은 것

- [ ] **로스터 등록 착수** — 이것 없이는 재구성도 래더도 0건이다
- [ ] Season 8 시작 시점 (운영자 액션)
- [ ] **관리자 웹 화면** 구현 여부 (현재 CLI만 있다)
- [ ] 실제 Supply 클랜 등록·병합 승인 (자동 병합하지 않는다 — D-088)
- [ ] 클랜 비활동 패널티 방식

---

## I. Phase 10 — 베타 운영 준비 (2026-08-22)

> 결정: `docs/DECISIONS.md` **D-089 ~ D-096**

### 관리자 화면 (`/admin`)

**운영자(role 2)만** 접근할 수 있다. 권한은 **서버에서** 판정한다 — 버튼을 감춰서 막지 않는다.

| 경로 | 하는 일 |
|---|---|
| `/admin` | 대시보드 — 활성 시즌(리그별·MOCK 표시) · 클랜/로스터 · 수집/공식/비공식 · 래더 · 변경 이력 |
| `/admin/clans` | 클랜 목록·검색·등록 |
| `/admin/clans/{slug}` | 이름·구분(공식/무소속)·무소속 티어·활성 · **넥슨 클랜명 별칭** · 부리그 · **로스터** |
| `/admin/seasons` | 시즌 현황 · 종료/시작 **미리보기 → 확인** |
| `/admin/matches` | 경기 검색(공식/비공식·sourceMatchId·클랜) · **공식 ↔ 비공식 전환** |

모든 변경은 `AdminAuditLog`에 남는다 (누가·언제·무엇을·이전 값·바뀐 값).

### 안전장치

- 시즌 종료·시작은 **미리보기가 먼저**다. `confirm: true` 없이는 실행되지 않는다
- 실행은 **트랜잭션** — 중간 실패로 "시즌 7은 닫혔는데 8이 없는" 상태가 생기지 않는다
- 삭제 대신 **비활성**(`active=false`) · 로스터는 **`leftAt`** 으로 종료한다
- 비공식 → 공식 전환은 **근거를 적어야** 한다. 공식 → 비공식은 바로 된다 (D-095)

### 실데이터 E2E (2026-08-22)

**넥슨 API를 새로 부르지 않았다.** 이미 받아 둔 실제 응답만 썼다.

```
pnpm --filter @sacloud/worker exec tsx src/dev/e2eSetup.ts     # 실운영 리그·클랜·로스터 구성
pnpm nexon:reconstruct --league supply --redo --match-id 260716180538124001
pnpm nexon:rate --league supply
pnpm --filter @sacloud/worker exec tsx src/dev/e2eTeardown.ts  # 되돌리기 (mock 전용 상태로)
```

결과 — 실제 경기 `260716180538124001` (2026-07-16 · 올드타운 · 참가 7명):

| 항목 | 결과 |
|---|---|
| 판정 | **비공식 경기** (`official = false`) |
| 이유 | 7명이 6개 클랜에 흩어져 있어 **어느 팀도 본클랜원 3명을 못 채웠다** |
| 확인 수준 | `6v1` · confidence `low` |
| 구성 | UlsaN_CIaN 클랜원 2 / 용병 4 · lunatic\`Gaming 클랜원 1 / 용병 0 |
| 개인 래더 | **미반영** (`ratingUpdate = null`) |
| 클랜 래더 | **미반영** — `nexon:rate` 대상 0건 |
| 시즌 귀속 | Season 7 (경기 시각 기준) |
| 기록실 | 표시됨 + `비공식 경기 · 래더 미반영` 배지 + 팀별 반영률 |

> 실제 `퀵매치 클랜전`이 **여러 클랜이 섞인 픽업 경기**라는 것이 실데이터로 확인됐다.
> 공식 인정 기준(D-079)이 의도대로 걸러 내고, 기록은 그대로 남는다.

### 실운영 데이터와 mock 분리

- 실운영 리그는 `supply`(Season 7 활성), mock 시드는 `officialmain` 등 4개
- 관리자 화면은 mock 리그에 **`(MOCK)`** 을 표시한다
- 검증 도구는 실운영 데이터가 들어와도 흔들리지 않게 고쳤다 (D-096)

### Season 상태

**`supply` 리그는 Season 7이 활성이다. Season 8은 시작하지 않았다.**
전환 경로는 관리자 화면과 CLI 두 곳뿐이고 둘 다 운영자 확인이 필요하다.
(mock `officialmain`의 Season 8은 시드 픽스처다 — 운영 판단에 쓰지 않는다.)

### 남은 작업

- [ ] 실제 Supply 클랜 대량 등록 (CSV import는 `nexon:roster --file`로 로스터만 가능. 클랜 대량 등록은 화면에서 한 건씩)
- [ ] 베타오픈 시각(`betaOpenedAt`) 설정 — 운영자가 정한다
- [ ] 선수 신원 관리 전용 화면 (지금은 클랜 상세에서 연결 상태만 확인 가능)
- [ ] 공식 경기가 실제로 나오는 로스터 규모 확보 후 래더 반영 E2E

---

## J. Phase 11 — Beta 공개 시즌 → Season 8 구조 (2026-08-22)

> 결정: `docs/DECISIONS.md` **D-097 ~ D-107**

### 시즌 흐름

```
Season 1 … Season 7   →   Beta Season   →   Season 8
 (legacy · frozen)        (beta · 번호 0)     (official · 운영자가 시작)
```

- `Season.seasonType` = `legacy` | `beta` | `official`, `Season.frozen`으로 과거 확정 (D-098 · D-099)
- 베타 내부 번호는 **0**이다. 화면에는 `Beta Season`으로만 쓰고, 정렬은 번호가 아니라 `startedAt` 기준
- 다음 정식 번호는 `max(number)+1` → 베타가 8을 소모하지 않는다

### Beta → Season 8 격리 (D-101)

`startSeason`이 한 트랜잭션에서 되돌리는 것:

```
LeaguePlayer   rating · baseRating = 1500 · win/lose/kill/death/assist/headshot/mvpCount = 0 · 배치고사 재시작
LeagueClan     rating = 1500 · win/lose = 0 · 배치고사 재시작
LeaguePlayerWeaponStat  전량 삭제  (통합 = baseRating + 무기별 delta 합 불변식)
```

베타 기록은 **지우지 않는다.** `closeSeason`이 `LeaguePlayerSeason` / `LeagueClanSeason` 카드로
굳혀 두고, 지난 시즌 화면에서 계속 보인다. 회귀는 `packages/db/ops/__tests__/seasonIsolation.test.ts`.

> baseline은 `SEASON_BASELINE = 1500` 한 곳에서만 정한다 (`packages/db/ops/season.ts`).

### 클랜 순위 네 가지 (D-104)

| 순위 | 모집단 | 쓰임 |
|---|---|---|
| 1부 standings | 1부만 | **승강 판단** |
| 2부 standings | 2부만 | **승강 판단** |
| 무소속 Tier 내 / 무소속 전체 | 무소속 | Tier 화면 · Tier 무시 래더 |
| 전체 통합 래더 | 1부+2부+무소속 | 부리그·Tier 무시, `rating`만 본다 |

승강 기본안은 **1부 최하위 ↔ 2부 1위 1팀 교환**(`startSeason`). Tier는 운영자 값이라
rating으로 자동으로 오르내리지 않는다. 구현은 `apps/web/lib/server/queries/ladders.ts`.

### Beta 공개 UI (D-105)

- 모든 리그 화면: 서브내비에 `Beta Season` 배지 (tooltip = 승계 안내)
- 리그홈 헤더 아래 **한 번만**: 제목 + 두 문장 안내
- 문구는 `packages/ui/src/league/betaNoticeText.ts` 한 곳에서 정한다
- 정식·레거시 시즌, 그리고 **시즌 종류를 모를 때는 아무것도 띄우지 않는다**

### 라플/스나 (D-097 보강)

3rd.supply 자체 API(`api-v2.3rd.supply/leagues/1/players/{id}/matches`)의
`matches[].summary.red[]/blue[]`에 **경기별 `weapon`(0=라이플 / 1=스나이퍼)이 실제로 있다**는 것이
정상 브라우저로 확인됐다. 그래도 **역할 래더는 만들지 않는다** —

1. 우리 수집 경로(넥슨 Open API)에는 그 필드가 없다
2. 그 값의 원 출처가 검증되지 않았다
3. 3rd.supply는 WAF로 막혀 있고 우회하지 않는다

Beta에서 정상적인 수집 경로가 검증되면 그때 Season 8에 정식 적용한다.
**헤드샷·딜량으로 추정하지 않는다.**

### 이번 단계에서 하지 않은 것

- **Season 8을 시작하지 않았다.** 시작은 운영자 액션이다 (`--start`, 관리자 화면)
- 정식 시즌 기간(약 3개월)을 코드·DB 어디에도 박지 않았다. 자동 종료 없음
- 라플/스나 스키마·랭킹·UI를 미리 만들지 않았다 (D-097)

### Phase 11 감사에서 고친 것 (2026-08-22)

**1. 과거 기록의 결측값이 0으로 저장되고 있었다 (D-106).**
파서는 `null`을 냈는데 importer가 `?? 0`으로 채웠다. 시즌 4처럼 승률만 주는 카드가
`0승 0패 · 승률 56.9%` 라는 거짓 기록이 됐다.

- `LeaguePlayerSeason.rating/win/lose/kill/death` → **nullable**
  (마이그레이션 `20260822235000_legacy_season_nullable_stats`)
- 매핑을 `legacySeasonCardData()` 순수 함수 한 곳으로 모으고 회귀 테스트 9건 추가
- 조회 계층은 `winRateOrNull` / `kdRateOrNull` — 모르면 계산하지 않는다
- 화면은 `알수없음`

**2. 지난시즌 표가 베타를 `시즌 0`으로 보여 줬다 (D-098 위반).**
`season_label`을 쓰도록 고치고, 클랜 시즌 응답에도 `season_label` / `season_type`을 넣었다.
클랜 시즌 정렬도 번호가 아니라 `startedAt` 기준으로 바꿨다.

**3. 운영 지표·CLI 보완**
- 관리자 대시보드에 **보류 사유별 건수**와 **미해결 수집 실패**를 노출 (정책 21)
- `legacy` 명령이 CLI 도움말에 없었다 → 추가 + `pnpm nexon:legacy` 스크립트

### 무소속리그 정책 확정 (D-107 · 2026-08-23)

**결론: 무소속리그는 리그다.** 개인 기록도 개인 랭킹도 정상으로 존재한다.
D-102의 "무소속 개인 커리어 숨김"은 **폐기됐다.**

```
같은 선수라도 리그가 다르면 다른 그릇이다
  길수 + 무소속리그   100전 89승 11패  rating 1742
  길수 + 공식리그     238전 149승 89패 rating 1625
```

- 감추는 것은 **누적 kill · death · 킬뎃** 세 가지뿐. 경기 한 판의 K/D/A는 그대로 보인다
- 기록이 쌓이는 곳은 선수의 소속이 아니라 **어느 리그 경기였는가**로 정해진다
  (무소속 클랜 선수가 공식리그 용병으로 뛰면 → 공식리그 기록)
- 스키마는 다시 짜지 않았다. `League.category` 컬럼 하나만 추가
  (`20260823001500_league_category`). 무소속리그는 **별도 League 행**이다
- 공개 범위 판단은 `apps/web/lib/server/queries/visibility.ts` 한 곳
- 회귀 `apps/web/tests/independentLeague.test.ts` **24건** (실제 DB에 임시 리그 2개를 만들어 검증)

---

## K. Phase 12 — 공개 Beta Season 실제 시작 (2026-08-23)

> 결정: `docs/DECISIONS.md` **D-108 · D-109**

### Beta 상태 — **ACTIVE**

```
리그      supply (서플라이공식리그)
시즌      number 0 · seasonType beta · status active
시작      2026-08-20 00:00:00 KST  (UTC 2026-08-19T15:00:00Z 저장 — 9시간 밀림 없음)
클랜      1부 6곳 · 2부 1곳
로스터    7명 (verified)
baseline  개인·클랜 전원 1500
```

Season 7은 `closed`. 활성 시즌은 **정확히 1개**다. **Season 8은 만들지 않았다.**

`pnpm nexon:beta-bootstrap --league supply` 로 다시 실행해도 안전하다
(이미 열려 있으면 그대로 쓴다).

### 실데이터 수집 결과 (8/20 00:00 ~ 8/23 06:00 KST)

| 항목 | 수 |
|---|---|
| 스테이징 전체 | 3,749 |
| 구간 내 경기 | 49 |
| 구간 내 **클랜전 계열** | **22** (8/20 6 · 8/21 6 · 8/22 10) |
| 상세 확보 | 22 |
| 관측값 | 3,769 |
| 운영 Match(공식 판정) | **0** |

### ★ 왜 0건인가 — 로스터 규모가 벽이다

파이프라인은 끝까지 정상 동작했다. 맵도 등록했고 신원도 근거로 연결했다.
남은 것은 **입력 데이터**다.

```
공식 인정 조건   양 팀 중 한쪽이 본클랜원 3명 이상 (D-079)
본클랜원 판정    LeagueRosterMembership (닉네임·guild_name이 아니다)
현재 로스터      클랜당 1명 — 전체 7명
결과            어떤 팀도 3명을 채울 수 없다 → single_clan 21건
```

실제 경기 데이터를 보면 두 Beta 클랜이 3명 이상씩 붙은 판이 실제로 있다
(예: 8/22 01:00 `전설 3 vs lunatic\`Gaming 3`). 그런데 그 6명 중 **로스터에 등록된 사람은 1명**이라
우리 기준으로는 확인할 수 없다.

**사람이 해야 하는 일은 하나다 — 클랜별 실제 로스터 등록.**

```bash
pnpm nexon:roster --league supply --file <로스터.csv> --verified
pnpm --filter @sacloud/worker nexon identity-link --league supply --confirm
pnpm nexon:reconstruct --league supply --redo
pnpm nexon:rate --league supply
```

로스터가 들어오면 위 네 줄로 끝난다. 코드는 더 고칠 것이 없다.

### 이번에 만든 도구

| 명령 | 하는 일 |
|---|---|
| `nexon beta-bootstrap` | 현재 시즌 종료 → Beta 시작. 클랜·로스터 자동 승계 |
| `nexon identity-link` | 닉네임 정확 일치 + **실제 경기 guild_name 근거**로만 연결 (D-109) |
| `nexon league-maps` | 실제 관측된 맵만 리그에 등록 |

### 무소속

- 무소속 **리그 0개**, 무소속 클랜이 참여한 리그 0곳 — **하나도 만들지 않았다**
- `Clan.category='independent'` 1건은 이번 세션 이전부터 있던 것이고 어느 리그에도 없다
- 등록 시점부터 기록이 시작되는 규칙은 `LeagueClan.joinedAt`으로 강제된다 (D-108)

### Beta 즉시 래더 (D-112 · 2026-08-23)

**공개 Beta 한 시즌만** 배치고사를 면제한다. 정식 시즌 정책은 그대로다.

```
constantsForSeason(base, season, flags)
  seasonType === 'beta' && betaImmediateRating → { ...base, placementMatches: 0 }
  official · legacy · 미상                      → base 그대로
```

하드코딩이 아니라 `seasonType` 조건이라 **Beta가 끝나도 정식 시즌이 따라 바뀌지 않는다.**
회귀 `packages/rating/src/__tests__/seasonPolicy.test.ts` 9건 (절반이 정식 시즌 보호 검사).

같이 고친 것: `nexon:rate`가 래더만 쓰고 승패·킬데스를 안 쌓아서 화면에 `0승 0패`로
보였다 (D-113). 이제 같은 replay에서 함께 누적한다.

### 실제 Beta 기록 (2026-08-20 ~ 08-22)

```
공식 6경기 · 비공식 4경기 · 참가 기록 48건

개인 랭킹                    클랜 1부
 1 씨야         1570  5승0패    1 UlsaN_CIaN     1539  5승0패
 2 울상진리     1570  5승0패    2 lunatic`Gaming 1508  1승0패
 3 중사형       1542  3승0패    3 전설           1482  0승6패
 …
11 MMA수련중    1476  2승4패
```


---

## J. Phase 11 — PUBLIC 실데이터 전환 (2026-08-23)

> 결정: `docs/DECISIONS.md` **D-116 ~ D-118** · 경위: `docs/WORKLOG.md`

### 지금 공개 화면에 나가는 것

**실데이터 리그 `supply` 하나뿐이다.** 시드 리그 4개(`officialmain` `secondline`
`friendly01` `tourney2026`)는 공개 경로에서 **404**다. 검색·게시판·인기글·기록실도 같다.

거르는 곳은 한 곳이다 — `apps/web/lib/server/queries/publicScope.ts`.
판별자는 `origin` 컬럼이고 시드는 `mock`이다.

```
League mock=4 sacloud=1 · Clan mock=60 sacloud=8
Player mock=920 sacloud=23 · Board mock=400 sacloud=1
```

> **`pnpm compare`를 돌리려면** 서버를 `SACLOUD_PUBLIC_SCOPE=all` 로 띄워야 한다.
> 그 도구는 "실제 API가 시드를 그대로 돌려준다"를 전제로 값을 대조하기 때문이다.

### 실 Beta 데이터 현황

리그 `supply` · Season 0(beta) 활성 · 클랜 7 · 선수 11 · 경기 10건(공식 6 · 비공식 4)
개인 래더 1476~1570 · 클랜 래더 1482~1539 · 라플/스나 판정 17건

### 아직 사람이 판단해야 하는 것

- [x] ~~시드 계정 42명이 전원 같은 비밀번호를 쓰고 그중 2개가 관리자~~
      → **해소 (2026-08-23 · D-119).** 42/42 무효화, 관리자 2건 포함.
      폐기된 값으로 로그인 시도 시 **401** 확인. `pnpm nexon:accounts --audit` 로 상시 점검
- [ ] 로그인·가입·비밀번호찾기에 **rate limit이 없다**
- [ ] `PUT /api/me/link`가 **소유권을 증명하지 않는다** — 닉네임 선착순 선점이 가능하다
      (코드 주석이 스스로 "운영에 노출하면 안 된다"고 적어 둔 상태)
- [ ] 공개 게시판 최상단 글 제목이 **운영자 이메일**이다 (실제 작성분이라 임의 삭제하지 않았다)
- [ ] 공개 랭킹에 E2E 자리표시자 `E2E-MMA수련중` · 클랜 `admin-test-clan-div`가 남아 있다
- [ ] 실 클랜 slug에 dev 접두사 `real-`이 그대로 붙어 공개 URL에 노출된다
- [ ] 보안 헤더(CSP · X-Frame-Options 등)가 하나도 없다
- [ ] 고정 1280px 레이아웃이라 모바일에서 가로 스크롤이 강제된다 (원본 재현이라 의도일 수 있음)

### 감사에서 확인된 **정상** 항목 (다시 조사하지 말 것)

- 관리자 API 비인증 접근 **403 차단** · 시크릿 클라이언트 미노출 · 소스맵 없음
- **DB 5433은 127.0.0.1 바인딩** — 외부 노출 없음
- Beta 예외(D-112)는 `constantsForSeason` 한 곳에 갇혀 있고 **Season 8 정책을 오염시키지 않는다**
- 공식 판정 OR 조건 · 클랜 가중치 0.4/0.7/1.0 · 용병 개인 100% · 원소속 클랜 불변 ·
  시각순 replay · baseline 1500 — 실저장값과 전부 일치

---

## L. Phase 13 — 공식리그 경기 발견 파이프라인 (2026-08-24) ← **가장 최신**

> 결정: `docs/DECISIONS.md` **D-128 · D-129** · 경위: `docs/WORKLOG.md`

### 현재 HEAD

`git log --oneline -3` 으로 확인한다. 이번 작업의 커밋은 세 개다.

```
data: 공식리그 경기 발견 스냅샷 — 3rd.supply 클랜 44곳 최근매치 750건
feat(nexon): supply-matches — 3rd.supply 발견 → 넥슨 상세 보강 파이프라인 (D-127)
docs: 공식리그 경기 발견 결과 + Beta 구간 실수집 (D-128 · D-129)
```

### 이번에 완료한 것

1. **발견 스냅샷 확보** — 공식 클랜 44곳의 `/league/supply/clan/{slug}` 공개 SSR payload에서
   최근매치 750건. **맵이 전부 제3보급창고**다. `packages/db/data/supply-official-matches.json`
2. **`nexon supply-matches` 파이프라인** — 스냅샷 → 스테이징 seed → 넥슨 `/match-detail` 보강.
   `--confirm` 없이는 DB에 쓰지 않고 넥슨도 부르지 않는다. 중단 후 재실행하면 이어진다
3. **상세 747건 실수집 → 750/750 확보** — 실패 0 · invalid 0.
   **맵이 750/750 전부 제3보급창고**다. 발견한 id 가 100% 공식리그 경기였다
4. **제3보급창고를 리그 맵에 등록** (`nexon league-maps --confirm`)
5. **재구성** — projected 72 · incomplete 142. 운영 `Match` **10 → 82**
6. **래더 replay** — `nexon:rate` 결과 그대로 **6경기**. 공개 래더는 바뀌지 않았다
7. Beta 구간 밖 536건은 **스테이징까지만** 두었다 (재구성·투영하지 않았다)

### 남은 작업 — 순서대로

1. **클랜별 로스터 등록** ← 이것 하나가 전부를 막고 있다
   ```bash
   pnpm nexon:roster --league supply --file <로스터.csv> --verified
   pnpm nexon identity-link --league supply --confirm
   pnpm nexon:reconstruct --league supply --redo --limit 400
   pnpm nexon:rate --league supply
   ```
   현재 `LeagueRosterMembership` 23명 / 리그 클랜 48곳. 팀당 3명(D-079)을 못 채워
   새 경기 72건이 전부 `official = false` 로 들어갔다
2. **D-129 결정** — 3rd.supply 라인업(양 팀 10명 · weapon · 원본 rating_update)을 쓸지.
   A 안 유지 / B 라인업만 보강 / C 과거 이관 경로로 분리. **사람이 정한다**
3. Beta 구간 밖 536건을 어떻게 다룰지 (과거 시즌 이관 대상인가)
4. 스냅샷 페이지네이션 — 클랜당 최근 20건만 받았다. `metadata.cursor.next` 가 있어
   더 받을 수 있지만 이번엔 하지 않았다

### 주의사항 · 금지사항

- **3rd.supply 는 Node fetch 가 405 다.** 헤더를 위조하거나 우회하지 않는다.
  스냅샷은 정상 브라우저로만 다시 뜬다
- **스냅샷의 map · player_count · 라인업은 필터 힌트일 뿐이다.** 스테이징 사실값은
  전부 넥슨 `/match-detail` 응답이다 (D-128). 이 경계를 흐리지 않는다
- `nexon supply-matches` 는 `--confirm` 없이는 아무것도 하지 않는다. 그대로 둔다
- 기존 경기·rating 을 지우지 않았다. purge 하지 않는다
- `prisma migrate dev` 를 쓰지 않는다 — 대화형 프롬프트에서 리셋 위험. 이번 마이그레이션도
  손으로 쓰고 `migrate deploy` 로 적용했다
- 로컬 마이그레이션 이력에 **기존 drift** 가 있다 (DB 에만 있는
  `20260823120000_public_data_origin`). 이번 작업 이전부터의 상태이며 건드리지 않았다

### 검증 결과

```
pnpm typecheck            통과 (8 프로젝트)
pnpm lint                 통과
pnpm test                 통과 (신규 회귀 9건 포함)
pnpm nexon:check          16항목 전 항목 PASS
pnpm nexon:supply-matches --status   스냅샷 750 = 스테이징 750 = 상세확보 750 · 미수집 0
```

실화면 경로도 확인했다 (localhost:3000, 실 DB).

```
GET /api/leagueclans/<Iatency->/matches   →  제3보급창고 20건 · official=false
GET /api/leagues/supply/clans/ddorr/show  →  match_summary.recent_count = 0
```

**둘 다 맞는 동작이다** — D-080대로 비공식 경기는 기록실 목록에는 보이고
승패·킬뎃·래더 요약에는 들어가지 않는다. 로스터가 채워져 `official = true` 가 되면
요약에도 자동으로 반영된다.

### working tree 상태

clean. 이번 작업분은 전부 커밋됐다.

### 실행 환경 메모

- Prisma client 재생성이 `EPERM` 으로 막히면 `next start` 가 query engine DLL 을 물고 있는
  것이다. 그 프로세스를 내리고 `pnpm db:generate` 를 다시 돌린다.
  이번 작업 중 3000번에 떠 있던 `next start`(전날 기동)를 그 이유로 내렸다 — **다시 띄우려면**
  `pnpm dev:clean` 또는 `pnpm --filter @sacloud/web start`
- `pnpm db:start` 는 켜 두는 명령이다. 내리면 API가 전부 500이 된다

---

## M. Phase 14 — 현재 소속 자동 갱신 · 경기 당시 소속 분리 (2026-08-24) ← **가장 최신**

> 결정: `docs/DECISIONS.md` **D-130 · D-131 · D-132** · 경위: `docs/WORKLOG.md`

### 현재 HEAD

`git log --oneline -4` 로 확인한다. 이번 작업 커밋은 넷이다.

```
feat(roster)      현재 소속 자동 갱신 — 3rd.supply 라인업 clan 기반 (D-130)
feat(affiliation) 경기 당시 소속 스냅샷 + 넥슨↔3rd.supply 선수 연결 (D-131 · D-132)
feat(ui)          기록실·경기 상세에 경기 당시 소속 표시 + 이적 선수 과거 경기 복구
docs              D-130~D-132 · WORKLOG · HANDOFF
```

### 이번에 완료한 작업

1. **현재 로스터 자동 갱신** — `nexon supply-rosters`. 사람이 CSV를 넣지 않는다
2. **넥슨 ↔ 3rd.supply 선수 연결** — `nexon supply-players` (같은 경기 · 닉네임 정확 일치)
3. **경기 당시 소속 스냅샷** — `nexon affiliation` (넥슨 guild_name → 로스터)
4. **화면 분리** — 기록실/경기상세 = 경기 당시 · 프로필/랭킹/클랜원 = 현재
5. **버그 수정** — 이적하면 개인 기록실에서 과거 경기가 사라지던 문제
6. 회귀 20건 신규 (실제 DB 통합 11건 + 순수 함수 9건)

### DB schema 변경 (추가 전용 · `migrate deploy` 로만 적용)

```
LeagueRosterMembership  observedAt · confidence · sourceRef
MatchPlayerStat         matchTimeClanName · matchTimeLeagueClanId · matchTimeClanSlug
                        matchTimeClanMarkBgUrl · matchTimeClanMarkFrontUrl
                        matchTimeClanSource · matchTimeClanObservedAt · matchTimeClanConfidence
NexonMatch              discoverySource (Phase 13)
```

### 로스터 source — 실측으로 정했다

| 후보 | 결과 |
|---|---|
| 병영수첩 클랜 멤버 | **로그인 게이트** (서버 403 · 비로그인 브라우저에도 없음). 우회 안 함 |
| 3rd.supply 클랜원 목록 | 1,235명 중 181명이 두 곳 동시 → **이력**이지 현재가 아니다 |
| **3rd.supply 라인업 clan** | 1,091명 11개월간 변화 0 → **현재 소속** ← 쓴다 |
| **넥슨 guild_name** | 69명 변화 · 65명 기간 안 겹침 → **경기 당시 소속** |

> **캡처는 브라우저가 필요하다.** 3rd.supply 는 서버 fetch 가 405/403 이다.
> 스냅샷은 커밋돼 있고 갱신 명령은 그것만 읽는다 — 운영자가 이름을 타이핑할 일은 없다.

### current / match-time membership 정책

```
현재 소속      Player.clanId · LeaguePlayer.clanId · LeagueRosterMembership(leftAt=null)
경기 당시 소속  MatchPlayerStat.matchTimeClan* (표시·근거) + rosterLeagueClanId (내부 판정)
```

- 둘을 **같은 값으로 덮어쓰지 않는다**
- `joinedAt` 을 지어내지 않는다 (처음 = 클랜의 리그 참여 시각 / 이적 = 관측 시각)
- 이적 시 이전 소속을 **지우지 않고** `leftAt` 으로 닫는다
- 근거가 없으면 `null`. 현재 소속으로 메우지 않는다

### 기록실 표시 정책

| 화면 | 소속 |
|---|---|
| 기록실 목록 라인업 · 경기 상세 선수 행 | **경기 당시** |
| 선수 프로필 · 개인 랭킹 · 클랜원 목록 | **현재** |
| 본클랜원/용병/official/클랜 승패/클랜 래더 | **경기 당시** |

> **원본과의 의도된 차이.** 3rd.supply 원본은 라인업에도 현재 클랜을 붙인다.
> 우리는 사용자 지시로 경기 당시 소속을 보여 준다 (D-131).

### 실행 결과

```
supply-players --confirm   연결 212 · 충돌 0 · 근거 없음 0 · 빈 행 비켜줌 135
supply-rosters --confirm   소속 452 · 클랜 43곳 · 근거 갈림 0
affiliation --confirm      복원 626/639 (98%) · 리그클랜 연결 495 · null 13
rate                       경기 16 · 선수 56 · 클랜 10

경기 참가자의 로스터 보유   17명 → 135명
official 경기               6건 → 17건
래더 반영 경기              6건 → 16건
과거 소속 스냅샷 복원       626건 (현재와 실제로 다른 것 4건)
incomplete                 142건 → 142건 (변화 없음)
```

### 남은 문제

1. **incomplete 142건은 로스터로 안 풀린다.** 사유가 `single_clan`(94) ·
   `unidentified_side`(48)이고 둘 다 **넥슨이 상대 팀을 안 주는 문제**(D-044)다.
   D-129의 3rd.supply 라인업으로 참가자를 보강하는 안이 남아 있다 —
   **아직 결정되지 않았다**
2. 경기 참가자 229명 중 로스터 미보유 **94명** — 라인업 관측이 없는 사람들이다
3. 근거 없어 `null` 로 둔 경기 당시 소속 **13건**
4. 스냅샷 캡처가 브라우저 의존이다. 자동 스케줄링 불가

### 다음 정확한 작업

1. **D-129 결정** — 3rd.supply 라인업을 참가자 복원 근거로 쓸지.
   쓰면 `unidentified_side` 48건이 풀릴 가능성이 있다. **사람이 정한다**
2. 스냅샷 재캡처 주기 정하기 (현재 수동)
3. Beta 구간 밖 536건을 과거 시즌으로 이관할지 (Phase 13에서 넘어온 항목)

### 주의사항 · 금지사항

- **3rd.supply · 병영수첩 모두 서버 fetch 가 막혀 있다.** 헤더 위조·로그인 우회 금지
- **경기 당시 소속에 3rd.supply 라인업 clan 을 쓰지 않는다** (현재 소속이다 · D-130)
- **현재 소속을 join 해서 과거 화면을 그리지 않는다.** 스냅샷을 읽는다 (D-131)
- 탈퇴 감지는 **이 명령이 만든 소속만** 닫는다. 운영자 수기 로스터 불변
- 이름 유사 매칭 금지. slug/닉네임 **정확 일치**만
- `prisma migrate dev` 금지 (리셋 위험). 손으로 쓰고 `migrate deploy`
- 래더 공식은 이번 작업에서 **건드리지 않았다**

### 검증 결과

```
pnpm typecheck    통과 (8 프로젝트)
pnpm lint         통과
pnpm test         677 passed / 31 skipped  (신규 20건)
pnpm build        통과
pnpm db:check     전 항목 통과
pnpm nexon:check  16항목 전 항목 PASS
```

실화면 확인 (localhost:3000 · 실 DB) — 산툐리, 8/20 경기
```
경기 상세 · 라인업  VaIiant    (경기 당시)
선수 프로필         dravelior  (현재)
```

### working tree 상태

clean.
