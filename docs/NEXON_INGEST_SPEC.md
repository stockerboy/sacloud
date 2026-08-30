# NEXON_INGEST_SPEC.md — 넥슨 Open API 전적 수집 사양 (Phase 8)

**작성 2026-08-21.** 이 문서는 Phase 8 수집 파이프라인의 **사양 기준**이다.
구현이 이 문서와 어긋나면 문서가 아니라 구현을 고친다. 사양이 바뀌면 문서를 먼저 고친다.

관련 문서: `CLAUDE.md` 3-A장(마이그레이션 절대 규칙) · `docs/MIGRATION_GAPS.md`(접근 가능성 조사)
· `docs/DECISIONS.md` D-034 ~ D-040 · `docs/IMPLEMENTATION_PLAN_1.md` Phase 8

---

## 1. 출처 실측 (2026-08-21)

넥슨 개발자 포털의 API 문서는 클라이언트 렌더링이라 본문을 정적으로 읽을 수 없다.
대신 문서 페이지가 참조하는 **넥슨 공식 OpenAPI 3.0.3 스펙 파일**을 직접 받아 확인했다.

| 스펙 파일 | 내용 |
|---|---|
| `https://openapi.nexon.com/static/api/suddenattack/47_ko_script20250324012941.yaml` | 계정 정보 조회 |
| `https://openapi.nexon.com/static/api/suddenattack/48_ko_script20250529012921.yaml` | 매치 정보 조회 |
| `https://openapi.nexon.com/static/api/suddenattack/52_ko_script20250529004346.yaml` | 메타데이터 조회 |

**키 없이 엔드포인트 존재 여부는 확인할 수 없다.** 게이트웨이가 존재하지 않는 경로에도
`400 {"error":{"name":"OPENAPI00004"}}`를 돌려준다(실측: `/suddenattack/v1/no-such-endpoint` 동일 응답).
따라서 위 스펙 파일이 **유일한 신뢰 근거**이며, 실제 응답 형태는 API 키 수령 후 1차 실주행에서 확정한다.

### 1-1. 스펙에 명시된 제약 (원문)

- 서든어택의 게임 데이터는 **평균 10분 후** 확인 가능하다.
- **2025년 1월 24일 이후** 데이터를 조회할 수 있다.
- 게임 콘텐츠 변경으로 **ouid가 변경될 수 있다.**

### 1-2. 엔드포인트

호스트 `https://open.api.nexon.com` · 인증 헤더 `x-nxopen-api-key` (메타데이터 제외 전부 필수)

| 메서드 | 경로 | 파라미터 | 응답 |
|---|---|---|---|
| GET | `/suddenattack/v1/id` | `user_name` (필수) | `ouid` |
| GET | `/suddenattack/v1/user/basic` | `ouid` (필수) | `user_name` `user_date_create` `title_name` `clan_name` `manner_grade` |
| GET | `/suddenattack/v1/user/rank` | `ouid` (필수) | 통합/시즌 계급·경험치·랭킹 |
| GET | `/suddenattack/v1/user/tier` | `ouid` (필수) | 솔로/파티 랭크전 티어·점수 |
| GET | `/suddenattack/v1/user/recent-info` | `ouid` (필수) | 최근 승률·킬데스·총기별 킬데스 |
| GET | `/suddenattack/v1/match` | `ouid` (필수) · `match_mode` (**필수**) · `match_type` (선택) | `match[]` = `match_id` `match_type` `match_mode` `date_match` `match_result` `kill` `death` `assist` |
| GET | `/suddenattack/v1/match-detail` | `match_id` (필수) | `match_id` `match_type` `match_mode` `date_match` `match_map` + `match_detail[]` |
| GET | `/static/suddenattack/meta/{logo,grade,season_grade,tier}` | — | 메타데이터 |

`match_detail[]` 항목: `team_id` `match_result` `user_name` `season_grade` `clan_name` `kill` `death`
`headshot` `damage` `assist`.

**열거값**
- `match_mode`: `개인전` `데스매치` `폭파미션` `진짜를 모아라`
- `match_type`: `일반전` `클랜전` `퀵매치 클랜전` `클랜 랭크전` `랭크전 솔로` `랭크전 파티` `토너먼트`
- `match_result`: `1` 승 · `2` 패 · `3` 무 (모드에 따라 순위 의미로 쓰임)

**페이지네이션이 없다.** `/match`는 커서·날짜 필터 없이 **최근 최대 1000건**을 돌려준다.
증분 수집이 불가능하므로 전략은 *매번 재조회 + `match_id` 기준 중복 제거*다.

### 1-2-A. 실응답 실측 (2026-08-21, 닉네임 1명 · 호출 15회)

스펙만으로는 알 수 없던 것들이 실제 호출로 확인됐다. 가명화한 응답은
`packages/nexon/src/fixtures/real/*.json`, 회귀 테스트는 `__tests__/realResponse.test.ts`.

| 항목 | 실측 결과 |
|---|---|
| `ouid` | 32자리 16진수 문자열 |
| `match_id` | **18자리 숫자 문자열** (3rd.supply 매치 ID와 같은 형식 — D-047) |
| `date_match` | `2026-07-16T09:05:38.130Z` — **밀리초 포함** UTC |
| 참가자 클랜명 | **`guild_name`** (스펙의 `clan_name`이 아니다 — D-043) |
| 참가자 필드 전체 | `kill` `death` `assist` `damage` `team_id` `headshot` `user_name` `guild_name` `match_result` `season_grade` |
| `damage` | 정수로 관측 (스펙은 double) |
| `team_id` | 클랜전은 `"0"` / `"1"`, **개인전은 `null`** |
| 참가자 `ouid` | **없다.** 닉네임뿐 |
| 무기·MVP·탈주·플레이시간·종료시각 | **응답에 필드 자체가 없다** (D-034 근거 확정) |
| `match_map` | 모드가 붙기도 한다 (예: `3보급-개인전`) |
| 한 유저의 매치 수 | 개인전 53 · 데스매치 1 · 폭파미션 644 · 진짜를모아라 0 (2025-02-10 ~ 2026-07-16) |

**가장 중요한 실측: 한 경기 응답에 양 팀이 함께 오지 않는다 (D-044).**
승리 팀 전원 + (조회 대상이 졌다면) 본인만 온다. 상대 팀 라인업을 얻을 수 없어
**클랜 vs 클랜 경기를 한 사람의 조회만으로 재구성할 수 없다.** 이것이 Phase 9의 선결 과제다.

---

### 1-3. 넥슨이 제공하지 않는 값 (SACLOUD 도메인 대비)

| SACLOUD 필드 | 넥슨 제공 | 처리 |
|---|---|---|
| `weapon` (라이플/스나이퍼) | ❌ (실응답에 필드 없음 확인) | `null` = 알 수 없음 |
| `playTime` | ❌ | `null` |
| `endAt` | ❌ (`date_match` 하나뿐) | `null` |
| 전반 진영 (선레드/선블루) | ❌ (경기 응답에 없다) | `null`. **배틀로그 폭탄 근거**(D-184)로만 판정한다 — `Match.firstHalfAttackSide` · D-207. 옛 `blueFirst` 는 폐기 |
| `mvp` | ❌ | `null` |
| `dropout` (탈주) | ❌ | `null` |
| 참가자 `ouid` | ❌ (닉네임만 — 실응답 확인) | 신원 해석 필요 (5장) |
| 클랜 식별자(slug) | ❌ (`guild_name` 문자열만 — D-043) | 클랜 매칭은 이름 기준 + 미해결 허용 |
| 부리그·래더·배치고사 | ❌ (3rd.supply 고유 개념) | SACLOUD가 산정 (Phase 9) |
| **상대 팀 라인업** | ❌ (D-044 — 실측) | 현재 방식으로는 확보 불가. Phase 9 선결 과제 |

**`false`를 기본값으로 쓰지 않는다.** `mvp=false` / `dropout=false` / `blueFirst=false`는
"아니다"라는 **실제 정보**다. 우리는 그 사실을 모르므로 `null`이어야 한다 (D-034).

---

## 2. 파이프라인 흐름 (고정)

```
Nexon API 응답
  → RawImport                (원본 JSON 무가공 보존 + contentHash)
  → normalize                (순수 함수, 네트워크·DB 없음)
  → NexonMatch / NexonMatchParticipant   (스테이징)
  → validate                 (스테이징 위에서 검증, 실패는 ImportFailure)
  → projection rule          (리그·맵·인원·클랜 소속 필터)
  → Match / MatchPlayerStat  (운영 도메인)
```

**넥슨 응답을 운영 `Match`에 바로 넣지 않는다.** 단계를 건너뛰는 경로는 만들지 않는다.
스테이징이 있어야 (a) 리그에 나중에 가입한 클랜의 과거 경기를 재투영할 수 있고,
(b) 투영 규칙이 바뀌어도 원본을 다시 받지 않고 재실행할 수 있다.

`match_type`은 **원본 그대로 스테이징에 보존한다.** 클랜전이 아니라는 이유로 버리거나 변형하지 않는다.
사용 여부는 투영 규칙에서만 판단한다 (G 결정).

---

## 3. 내부 ID와 외부 ID의 분리 (B 결정)

```
Match.id            = SACLOUD 내부 식별자 (18자리 숫자 규칙, 계약 `MatchId`)
Match.origin        = "nexon" | "3rd.supply" | "sacloud" | "mock"
Match.sourceMatchId = 넥슨 원본 match_id (문자열 원형 그대로)
중복 방지            = @@unique([origin, sourceMatchId])
```

넥슨 `match_id`를 내부 `Match.id`로 **쓰지 않는다.** 외부 공급자의 ID 형식이 내부 도메인 ID 규칙에
침투하면 공급자가 늘어날 때마다 계약이 흔들린다.

내부 ID 생성 규칙은 우리 것이다: `YYMMDDHHmmss`(경기 시작 시각, KST) + 6자리 일련번호.
같은 초에 여러 경기가 들어오면 일련번호를 올려 충돌을 피한다.
**이 값은 원본 데이터가 아니라 내부 식별자다.** 원본은 언제나 `sourceMatchId`에 있다.

---

## 4. 수집 대상 선정 (G 결정)

- `/match`는 `match_mode`가 필수이므로 **ouid당 4개 모드를 각각 조회**한다.
- `match_type`은 **지정하지 않는다.** 원본을 전부 받아 스테이징에 `matchType`을 그대로 남긴다.
- SACLOUD가 사용할 경기는 **투영 규칙**에서만 고른다 (7장).

---

## 5. 신원(identity) 처리 — 자동 병합 금지 (추가 수정사항)

### 5-1. 원칙

1. **ouid만으로 영구 동일인을 가정하지 않는다.** 넥슨이 ouid 변경 가능성을 명시했다.
2. **닉네임 일치만으로 동일인을 자동 병합하지 않는다.** 닉네임도 영구 식별자가 아니다.
3. `Player.nexonOuid`는 **비권위 캐시**다. 판단 근거로 쓰지 않는다. 권위는 `NexonIdentity`에 있다.

### 5-2. 상태

| 상태 | 뜻 |
|---|---|
| `unresolved` | ouid는 알지만 어떤 `Player`인지 확정하지 못했다. **기본값** |
| `active` | 근거를 갖고 특정 `Player`에 연결됐고, 현재 유효한 ouid다 |
| `superseded` | 같은 사람의 더 새로운 ouid가 확인돼 대체됐다. **행은 지우지 않는다** |
| `conflicted` | 서로 다른 근거가 충돌한다. 사람이 판단할 때까지 자동 처리하지 않는다 |

### 5-3. 새 ouid를 만났을 때

```
새 ouid 관측
  → 닉네임·ouid 관측 이력(NexonNickname) 조회
  → 후보(NexonIdentityCandidate) 생성   ← 여기서 멈춘다
  → 사람이 근거를 확인하고 승인할 때만 Player 연결 / supersede 처리
```

후보는 근거(`evidence`)와 사유(`reason`)를 함께 남긴다. **자동 승인 경로는 만들지 않는다.**
`nickname_match`(닉네임 일치)는 후보 생성 사유일 뿐 연결 근거가 아니다.

---

## 6. 신선도(freshness) 정책 — 설정값

넥슨 이용 조건에 **"가져간 데이터는 최소 30일마다 갱신"** 이 명시돼 있다
(`docs/MIGRATION_GAPS.md` 1-4). 다만 이 의무가 어느 데이터 범위에 어떻게 적용되는지
(매치 상세 같은 불변 기록까지 포함하는지)는 **아직 검증되지 않았다 `[미확인]`.**

따라서 **주기를 코드에 고정하지 않는다.**

```
NEXON_REFRESH_INTERVAL_DAYS   기본 30 — 명시된 의무값
                              더 짧은 안전 마진이 필요하면 이 값을 낮춘다
```

- `NexonMatch.lastVerifiedAt` + `refreshDueAt` = `lastVerifiedAt + interval`
- `refreshDueAt`이 지난 행은 `pnpm nexon:refresh`가 재조회한다
- 기한을 넘겼는데 갱신하지 못하면 `staleAt`을 찍는다 (숨김/삭제 여부는 Phase 10에서 결정)

---

## 7. 투영(projection) 규칙

스테이징 → 운영 `Match`로 넘어가려면 **전부** 만족해야 한다. 하나라도 어긋나면
`projectionStatus = "skipped"` + 사유를 남기고 **원본과 스테이징은 그대로 둔다.**

1. `matchType`이 리그가 인정하는 유형이어야 한다 (기본: `클랜전` 계열).
2. 참가자의 `clan_name` 이 정확히 **2개**로 갈리고, 둘 다 해당 리그의 `LeagueClan`이어야 한다.
3. `match_map`이 리그의 `LeagueMap`에 있어야 한다.
4. 팀당 인원이 리그의 `LeaguePlayerLimit`(5 또는 6)와 맞아야 한다.
5. 모든 참가자가 `NexonIdentity.status = "active"` 를 통해 `Player`로 해석돼야 한다.
   한 명이라도 미해결이면 투영하지 않는다 (부분 저장 금지).
6. 대상 리그에 `origin = "mock"` 경기가 있으면 **거부한다.** `--allow-mock-league`로만 우회 가능.

투영 시 넥슨이 주지 않는 값은 전부 `null`로 둔다. `winnerSide`는 참가자 `match_result`로 판정하며,
승패가 갈리지 않으면(무승부·모드 특성) 투영하지 않는다.

**래더·부리그·배치고사·`rating_update`는 Phase 8에서 계산하지 않는다.**
경기 시점 division 스냅샷은 현재 `LeagueClan.division` 값을 기록하되,
래더 관련 컬럼(`ratingBefore` / `ratingUpdate` / `ratingAfter` / `formulaVersion`)은 `null`로 남긴다.
채우는 것은 Phase 9의 일이다 (`docs/LADDER_IMPLEMENTATION_SPEC.md`).

---

## 7-A. 적응형 폴링 (Phase 8.1)

고정 전수 조회를 하지 않는다. 한 명을 한 번 확인하는 데 **모드 4개 = 호출 4회**다.

### 상태 (`NexonPollState`)

`tier` · `intervalMinutes` · `nextPollAt` · `lastPolledAt` · `lastSuccessfulPollAt` ·
`lastNewMatchAt` · `consecutiveEmptyPolls` · `recentNewMatchCount` ·
`manualRefreshRequestedAt` · `lastPollStatus` · `totalPolls` · `totalNewMatches`

### 티어와 전환 (기본값 — 전부 `NEXON_POLL_*` 설정값)

| 티어 | 조건 | 주기 |
|---|---|---|
| `hot` | 새 경기 발견 | 30분 |
| `warm` | 연속 빈 조회 ≥ 2 | 3시간 |
| `cold` | 연속 빈 조회 ≥ 5 | 1일 |
| `dormant` | 연속 ≥ 10 또는 30일간 새 경기 없음 | 7일 |

- 새 경기 발견 → 즉시 `hot`, 연속 빈 조회 초기화
- 실패·차단은 **활동량이 아니다** → 티어 유지, 다음 조회만 미룬다(백오프 ×2)
- 우선순위: 수동 갱신 → hot → warm → cold → dormant, 같으면 오래 기다린 순
- 예정보다 `NEXON_POLL_STARVATION_MINUTES` 이상 밀리면 우선순위를 올린다 (굶김 방지)

### 호출량 절감 (계산 방식)

```
하루 호출 수 = Σ (티어별 대상 수 × 모드 수 × (1440 / 티어 주기(분)))
```

- 고정 전수(30분 주기, 모드 4개, 5,000명): 5,000 × 4 × 48 = **960,000 호출/일**
- 적응형(가정 분포 hot 5% / warm 15% / cold 30% / dormant 50%):
  48,000 + 24,000 + 6,000 + 1,430 ≈ **79,000 호출/일** (약 92% 감소)

**분포는 가정이다.** 실제 값은 `NexonPollRun` 기록으로 계산한다 (`pnpm nexon:report`).

추가 절감 여지: 실측에서 클랜전 계열은 **전부 `폭파미션` 모드**였다(미키 표본).
`--modes "폭파미션"`으로 좁히면 대상당 호출이 4 → 1이 된다.
다른 모드에 클랜전이 있을 수 있는지는 `[미확인]`이라 기본값은 4모드 그대로다.

### 상세 재조회 (dedupe)

`decideDetailFetch`가 판단한다. 이미 상세가 있으면 **부르지 않는다**(D-050).
다른 사람의 목록에서 같은 경기가 나와도 마찬가지다 — 같은 `match_id`는 같은 응답이다(A-1 실측).
예외는 신선도 기한 초과뿐이다.

목록에서 얻은 개인 기록은 호출 없이 `NexonMatchObservation`에 출처와 함께 쌓인다(D-048).
**상세 참가자와 섞지 않는다.**

---

## 8. 멱등성 · 체크포인트 · 재시도

### 8-1. 멱등성

| 단계 | 키 |
|---|---|
| 원본 | `RawImport @@unique(source, endpoint, sourceId, migrationVersion, contentHash)` |
| 스테이징(매치) | `NexonMatch @@unique(source, sourceMatchId)` |
| 스테이징(참가자) | `NexonMatchParticipant @@unique(nexonMatchId, slot)` |
| 도메인(매치) | `Match @@unique(origin, sourceMatchId)` |
| 도메인(참가자) | `MatchPlayerStat @@unique(matchId, playerId)` |
| 작업 | `ImportJob @@unique(source, jobKey, migrationVersion)` |

같은 내용을 다시 받으면 `RawImport`는 새 행을 만들지 않고 `fetchCount` / `lastFetchedAt`만 올린다.
내용이 **달라지면** 새 행을 추가한다 (append-only). 원본을 덮어쓰지 않는다.

### 8-2. 체크포인트

넥슨에 커서가 없으므로 체크포인트는 **대상 단위**다.

```
jobKey = nexon:identity:<nickname>
         nexon:matchlist:<ouid>:<match_mode>
         nexon:matchdetail:<ouid>
         nexon:project:<leagueId>
cursor = 마지막으로 처리한 match_id / date_match 워터마크
```

`--resume`은 `done`인 job을 건너뛰고 `pending` / `failed`만 이어받는다.

### 8-3. 재시도 · 오류 분류

| 응답 | 분류 | 처리 |
|---|---|---|
| 200 | `ok` | 진행 |
| 400 (`OPENAPI00004` 등) | `bad_request` | 재시도 없음. `ImportFailure` 기록 후 다음 대상 |
| 401/403 (`OPENAPI00005` 키 오류 포함) | `forbidden` | **작업 전체 즉시 중단.** 키·권한 문제는 재시도로 풀리지 않는다 |
| 429 | `rate_limited` | `Retry-After` 존중 → 지수 백오프 + 지터 → **속도 자동 감속**. 연속 초과면 중단 |
| 5xx | `server` | 지수 백오프 재시도 (최대 `NEXON_MAX_RETRIES`) |
| 타임아웃·네트워크 | `network` | 위와 동일 |

**테스트 키의 실제 호출 한도는 추측하지 않는다.** 스펙에 수치가 없다.
속도는 `NEXON_RATE_LIMIT_PER_SEC`(기본 보수값)에서 시작해 429 응답으로만 조정한다.

---

## 9. 비밀 취급

- API 키는 `process.env.NEXON_API_KEY`에서만 읽는다.
- **로그·오류 메시지·`RawImport.requestParams`·테스트 픽스처 어디에도 키를 남기지 않는다.**
  요청 파라미터는 저장하되 헤더는 저장하지 않으며, 저장 전 `redactSecrets()`를 거친다.
- `.env.local`은 커밋하지 않는다. 저장소에는 `.env.example`만 있다.
- 키가 노출되면 즉시 재발급한다.

---

## 10. mock 데이터와의 분리

1. 시드(`pnpm db:seed`)는 넥슨 테이블에 **한 행도 쓰지 않는다.**
2. 수집기는 `origin = "mock"` 경기가 있는 리그에 투영하지 않는다 (`--allow-mock-league` 필요).
3. `pnpm db:check` / `pnpm nexon:check`가 혼재를 숫자로 검사한다.
4. Phase 8은 `formulaVersion`을 쓰지 않는다. 넥슨 경기의 래더 컬럼은 전부 `null`이다.

---

## 11. 검증 (완료 판정 기준)

"수집 완료" 로그가 아니라 **숫자 대조**로 판정한다 (`CLAUDE.md` 3-A 6번).
`pnpm nexon:check`가 아래를 `MigrationCheck`에 기록한다.

| 검사 | 기대 |
|---|---|
| `raw_vs_staging_match` | 상세 원본 수 = 스테이징 매치 수 |
| `staging_participants_per_match` | 참가자 0명인 매치 0건 |
| `staging_vs_domain` | 투영된 매치 수 = `Match(origin=nexon)` 수 |
| `domain_stat_count` | `MatchPlayerStat` 수 = 투영 매치의 참가자 수 합 |
| `mock_nexon_isolation` | 같은 리그에 `mock` + `nexon` 혼재 0건 |
| `nexon_rating_untouched` | `Match(origin=nexon)`의 래더 컬럼이 전부 null |
| `stale_beyond_policy` | `refreshDueAt` 초과 건수 (0이면 통과) |
