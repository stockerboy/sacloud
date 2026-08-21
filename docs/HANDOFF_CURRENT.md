# HANDOFF_CURRENT.md — 현재 상태 인수인계

**작성 2026-08-21. 최종 갱신 2026-08-22 (Phase 8.2 — 로스터 기반 재구성 완료).** 새 세션은 **이 파일 하나만 읽어도** 상황을 파악할 수 있어야 한다.
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
| **8 전적 수집 파이프라인** | ✅ 파이프라인 + 실응답 검증 완료 |
| **8.1 D-044 검증 + 적응형 폴링** | ✅ 완료 |
| **8.2 로스터 기반 재구성** | ✅ 완료 (2026-08-22). **D-044는 여전히 해결되지 않았다** — 아래 F장 |
| 9 레이팅/시즌/랭킹 배치 | 🟨 설계·시뮬레이션만 진행 (아래 H장). **공식 확정은 사용자 승인 대기** |
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
- 마이그레이션 **9개** 적용 완료 (`20260821000820_init` … `20260822004445_roster_backed_reconstruction`)
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

비밀번호는 4개 공통 **`sacloud1234`** (시드의 `DEV_PASSWORD`, 운영 비밀값 아님)

| 이메일 | 역할 |
|---|---|
| `user001@naver.com` | 운영자(role 2) + 공식전 리그 소유자 |
| `admin-test@naver.com` | 운영자, 리그 소유 없음 |
| `user-test@naver.com` | 일반 회원, 리그 참여 클랜 소속 플레이어와 연동 |
| `user005@naver.com` | 일반 회원, 연동 X, 권한 없음 |

### 마지막 검증 (2026-08-22, Phase 8.2)

| 항목 | 결과 |
|---|---|
| typecheck / lint | 통과 |
| build | 통과 (37 페이지) |
| **test** | **332 passed / 9 skipped** (재구성 37 + 폴링 확장 13 = 50건 신규) |
| 오프라인 스모크 | **79항목 통과** (재구성·전파 27항목 추가) |
| `pnpm nexon:check` | **12항목 통과** (로스터 근거·판정 근거·전파 사유 5항목 추가) |
| `pnpm db:check` | **23항목 통과** (로스터 격리 3항목 추가) |
| `pnpm compare` | 25/25 일치 (Phase 7 기준, 8.2에서 변경 없음) |

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
