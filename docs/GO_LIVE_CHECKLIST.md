# GO_LIVE_CHECKLIST — 가오픈 체크리스트

> 기준 HEAD **`985e45f`** · 작성 2026-08-25
>
> **아직 아무것도 배포하지 않았다.** 이 문서는 "Deploy 버튼을 누르기 직전까지" 의 준비 상태다.
> 실제 배포 · 도메인 연결은 사용자가 한다.

---

## 0. 한 줄 결론

> **가오픈 가능하다.** worker(수집기) 없이도 사이트는 정상 동작한다.
> managed PostgreSQL 하나 만들고 → 데이터 옮기고 → Vercel 에 환경변수 넣고 → Deploy 하면 된다.

---

## 1. BLOCKER (가오픈 전에 반드시)

| # | 항목 | 상태 |
|---|---|---|
| 1 | managed PostgreSQL 생성 + 데이터 이전 | **사용자 작업 대기** (절차는 5장) |
| 2 | `DATABASE_URL` · `AUTH_SECRET` 운영 값 준비 | **사용자 작업 대기** (4장) |
| 3 | 개발 fixture 공개 노출 | **해결됨** — 리그 목록에 비활성 개발 클랜이 나오던 것을 고쳤다 |
| 4 | production CSP 에 `unsafe-eval` 없음 | **확인함** — 아래 8장 |
| 5 | production build | **확인함** — 성공 |

그 외 코드 쪽 blocker는 없다.

## 2. NON-BLOCKER (가오픈 후 처리)

| 항목 | 분류 | 판단 |
|---|---|---|
| incomplete 88건 | C (데이터 부족) | 정책대로 rating 제외. 기록·원본은 보존. 넥슨 할당량 회복 후 backfill |
| Nexon 429 / 자동수집 없음 | B | 사이트 조회에 영향 없음. health 가 `degraded` 로 표시 |
| 무기 랭킹 데이터 부족 | C | UI가 `집계 없음` 으로 **정직하게** 표시. 거짓 랭킹 아님 |
| `LeaguePlayerWeaponStat` stale 9건 | C | 전부 `placement=true` 라 랭킹에 안 뜬다. 거짓 표시 없음 |
| Beta rating 이 3000 근처 | B | 경기 29건뿐이라 정상. 식을 건드리지 않는다 |
| 모바일 UI 완성도 | B | 아래 7장 — 이번에 검수 못 함 |
| fallback 마크 시각 검수 | D | 자산은 만들었고 로직은 테스트로 고정. 눈으로만 미확인 |
| E2E placeholder Player 7건 | B | 아래 3장 — **삭제하지 않는다** |
| `real-` 개발 클랜 4건 | B | 아래 3장 — **삭제하지 않는다** |
| `db:check` User 42/43 | — | **해결됨** (검사가 brittle했다) |

---

## 3. 개발 fixture 판정 — 삭제하지 않는다

### E2E placeholder Player 7건

| id | 이름 | 경기 기록 | LeaguePlayer |
|---|---|---|---|
| `E2E-MMA수련중` | MMA수련중 | **10건** | 1 |
| `E2E-UlsaN_Keuni` 외 5명 | — | 각 1건 | 0 |

**전부 실제 `MatchPlayerStat` 을 가지고 있다.** 지우면 그 경기의 참가자가 사라진다.
→ **삭제 금지.** 개인 랭킹 노출 여부를 확인했고 **0건**이다 (배치고사 상태라 랭킹에 안 뜬다).

### `real-` 개발 클랜 4건

| slug | 이름 | active | LeagueClan | 경기 |
|---|---|---|---|---|
| `real-전설` | 전설 | **false** | 1 (div1) | 9 |
| `real-해적` | 해적 | false | 1 | 0 |
| `real-악마` | 악마 | false | 1 | 0 |
| `real-xenics-storm` | Xenics-Storm | false | 1 | 0 |

**이미 `active = false` 로 올바르게 표시돼 있다.** 데이터는 손대지 않았다.
문제는 **리그 목록의 대표 클랜 미리보기가 `active` 필터를 빠뜨린 것**이었다 —
개수는 `ACTIVE_CLAN` 으로 44를 세면서 목록에는 비활성 클랜이 나왔다. 필터를 맞춰 고쳤다.

확인 결과 (production build):
- 클랜 랭킹 · 통합 랭킹 · 개인 랭킹에 `real-` / `E2E-` **노출 0건**
- 리그 목록 대표 클랜에서 제거됨
- `origin='mock'` 시드(리그 4 · 클랜 60 · 선수 920 · 게시글 400)는 D-116 `publicScope` 가 이미 감춘다

`admin-test-clan` 2개는 `LeagueClan` 이 0이라 어디에도 나오지 않는다.

---

## 4. production 환경변수

실제 코드에서 읽은 것만 적는다. **값은 여기 적지 않는다.**

### 필수 (Vercel web)

| 이름 | 용도 | 사용처 | secret |
|---|---|---|---|
| `DATABASE_URL` | managed PostgreSQL 접속 | web · worker · prisma | **예** |
| `AUTH_SECRET` | 세션 서명 (32자 이상) | web `lib/server/session.ts` | **예** |

`AUTH_SECRET` 생성:
```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 선택 (web)

| 이름 | 기본값 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `live` | `mock` 이면 MSW 가 가로챈다. **운영은 반드시 `live`** |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | API base |
| `SACLOUD_CLIENT_IP_HEADER` | — | 프록시가 덮어쓰는 IP 헤더 이름 (rate limit 용) |
| `SACLOUD_PUBLIC_SCOPE` | `real` | **운영에서 절대 `all` 로 두지 마라** — 개발 시드가 공개된다 |
| `SACLOUD_LOCAL_UPLOADS` | — | 운영에서 파일 업로드를 강제로 허용. **넣지 마라** |

### worker 전용 (Vercel 에 넣지 않는다)

| 이름 | 용도 |
|---|---|
| `NEXON_API_KEY` | 넥슨 Open API 키 — **secret** |
| `NEXON_RATE_LIMIT_PER_SEC` · `NEXON_MAX_RETRIES` · `NEXON_REQUEST_TIMEOUT_MS` | 수집 속도/재시도 |
| `NEXON_REFRESH_INTERVAL_DAYS` · `NEXON_MIGRATION_VERSION` | 신선도 정책 · 파이프라인 세대 |
| `NEXON_POLL_*` (12개) | 적응형 폴링 |
| `NEXON_API_BASE_URL` · `NEXON_USER_AGENT` | 엔드포인트 · UA |

### 절대 Vercel 에 넣으면 안 되는 것

| 이름 | 이유 |
|---|---|
| `SACLOUD_SEED_PASSWORD` | 시드 계정 비밀번호. 운영에 시드를 넣지 않는다 |
| `SACLOUD_TEST_ADMIN_EMAIL` / `SACLOUD_TEST_ADMIN_PASSWORD` | 테스트 전용 |
| `SACLOUD_ALLOW_REMOTE_SEED` | 운영 DB 에 시드를 허용하는 스위치 |
| `SACLOUD_PGDATA` | 로컬 embedded PostgreSQL 경로 |
| `SACLOUD_PUBLIC_SCOPE=all` | 개발 시드를 공개한다 |

---

## 5. managed PostgreSQL 이전

### 이전 대상

전체 51개 모델을 통째로 옮긴다. 부분 이전은 하지 않는다 —
`Match` 는 있는데 `NexonMatch`(원본)가 없으면 재변환·재검증이 불가능해진다
(CLAUDE.md 3-A 1번: 원본 응답을 버리지 않는다).

### 방법 — `pg_dump` 를 권장한다

**이 환경에는 `pg_dump` 가 없다.** `embedded-postgres` 는 서버 바이너리만 담고 있어
클라이언트 도구가 빠져 있다. 그래서 **PostgreSQL 17 클라이언트 도구 설치**가 가장 확실하다.

> `docs/RATING_FINAL_SPEC.md` 의 rating 백업 JSON 은 **래더 rollback 전용**이다.
> 전체 DB 이전 백업으로 쓰면 안 된다.

```bash
# 1) PostgreSQL 17 설치 (Windows 인스톨러에서 "Command Line Tools" 만 선택해도 된다)
#    설치 후 pg_dump 경로 예: C:\Program Files\PostgreSQL\17\bin

# 2) 로컬 DB 를 통째로 덤프 (로컬 DB 는 켜져 있어야 한다: pnpm db:start)
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" ^
  -h 127.0.0.1 -p 5433 -U sacloud -d sacloud ^
  --no-owner --no-privileges -Fc -f sacloud-golive.dump
#    비밀번호: sacloud

# 3) managed DB 에 스키마 먼저 만든다 (덤프 복원 전에)
#    DATABASE_URL 을 managed 로 두고
pnpm --filter @sacloud/db exec prisma migrate deploy

# 4) 데이터만 복원 (스키마는 3에서 이미 만들었다)
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" ^
  --data-only --disable-triggers --no-owner ^
  -d "<managed DATABASE_URL>" sacloud-golive.dump
```

**`prisma migrate dev` 는 절대 쓰지 않는다.** `migrate deploy` 만 쓴다.

### 대안 (pg_dump 를 못 쓸 때)

- provider 자체 import 기능 (Neon / Supabase 등은 `pg_dump` 파이프를 지원한다)
- 그것도 안 되면 Prisma 기반 export/import 스크립트를 새로 만들어야 한다.
  51개 모델의 FK 순서를 직접 맞춰야 해서 **위험하고 느리다.** 최후 수단이다.

### 이전 검증

이전 전후로 같은 명령을 돌려 숫자를 비교한다.

```bash
pnpm --filter @sacloud/worker nexon db-snapshot --stamp before
# ... 이전 ...
pnpm --filter @sacloud/worker nexon db-snapshot --stamp after
```

---

## 6. 로컬 DB 기준선 (이전 후 이 숫자와 맞아야 한다)

`985e45f` 시점 실측:

| 모델 | 행 수 | | 모델 | 행 수 |
|---|---|---|---|---|
| user | 43 | | match | 3,136 |
| userPlayerLink | 5 | | matchPlayerStat | 32,546 |
| authToken | 1 | | rankSnapshot | 3 |
| refreshToken | 354 | | boardCategory | 8 |
| player | 1,755 | | board | 402 |
| clan | 110 | | comment | 1,202 |
| clanAlias | 8 | | vote | 4 |
| adminAuditLog | 228 | | rawImport | 1,186 |
| gameMap | 15 | | importJob | 1,275 |
| league | 5 | | importFailure | 150 |
| leagueMap | 26 | | migrationCheck | 782 |
| leaguePlayerLimit | 7 | | nexonIdentity | 204 |
| season | 14 | | nexonNickname | 1,727 |
| leagueClan | 138 | | nexonIdentityCandidate | 129 |
| leaguePlayer | 1,522 | | nexonMatch | 37,701 |
| leaguePlayerWeaponStat | 2,701 | | nexonMatchParticipant | 6,092 |
| leaguePlayerSeason | 1,258 | | nexonMatchObservation | 41,242 |
| leagueClanSeason | 98 | | nexonPollState | 204 |
| ratingConfig | 2 | | nexonPollRun | 1 |
| rateLimit | 1,288 | | leagueRosterMembership | 475 |
| barracksRawImport | 4 | | matchWeaponEvidence | 24 |

0건: `playerLinkClaim` `appSetting` `leagueInvitation` `upload` `legacyPlayerSeason`
`legacyCollectionJob` `legacyCollectionPlayer` `sourceMapping` `auditLog`

**기간**
- `match.startAt` : 2026-03-23 ~ 2026-08-23
- `user.createdAt` : 2024-04-11 ~ 2026-08-24

**무결성 6종 전부 PASS**
진영 클랜 빈 Match 0 · rating 있는데 formulaVersion 없음 0 · 그 반대 0 ·
승률 48% 미만인데 4000+ 0 · 이름 빈 클랜 0 · 중복 이메일 0

---

## 7. 검수 결과

### production build · 보안 헤더 — PASS

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; form-action 'self';
  img-src 'self' data: blob: https://static.3rd.supply;
  script-src 'self' 'unsafe-inline';          <- unsafe-eval 없음
  style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
`X-Powered-By` 없음. `unsafe-eval` 은 **개발 모드에서만** 열린다.

### production smoke (`next start`) — 전부 200

`/` · `/league/supply/home/info` · `/league/supply/rank/player` · `/league/supply/rank/clan` ·
선수 상세 2종 · `/league/supply/clan/ddorr` · `/auth/login` · `/auth/signup` · `/api/health` · `/board`

### auth smoke — PASS

| 항목 | 결과 |
|---|---|
| 미인증 `/api/me` | 401 |
| 미인증 `/api/admin/summary` | 403 |
| 잘못된 로그인 | 401 |
| 쿠키 | `httpOnly` · `sameSite=lax` · `secure`는 production 에서만 |

### 모바일 — **미검수**

세션 중 Chrome 창이 깨져(viewport 0×0 · screenshot CDP 오류) 확인하지 못했다.
**추측해서 통과시키지 않는다.** 가오픈 직후 실기기에서 확인해야 한다.

### fallback 마크 — 로직 PASS · 시각 미확인

로직은 테스트로 고정(`officialClanMark.test.ts` 7건), 자산은 인라인 SVG 로 만들었다.
브라우저 캡처 불가로 **눈으로는 확인하지 못했다.**

---

## 8. Vercel 설정값

| 항목 | 값 |
|---|---|
| Repository | 이 저장소 (monorepo 루트) |
| Framework Preset | **Next.js** |
| **Root Directory** | **`apps/web`** |
| Install Command | (기본값) — Vercel 이 pnpm workspace 를 자동 인식한다 |
| Build Command | (기본값 `next build`) |
| Output Directory | (기본값) |
| Node.js Version | **22.x** (로컬은 24. Vercel 최신 LTS 로 둔다) |
| Root Directory 밖 파일 접근 | **켠다** (`Include files outside the root directory`) — workspace 패키지가 필요하다 |

> `vercel.json` 은 없다. 위 값은 Vercel UI 에서 입력한다.

### Production 환경변수 (Vercel)

```
DATABASE_URL          = <managed PostgreSQL 접속 문자열>
AUTH_SECRET           = <새로 생성한 48바이트 키>
NEXT_PUBLIC_API_MODE  = live
```

### Preview 환경변수

Preview 에는 **운영 DB 를 넣지 마라.** 별도 DB 가 없으면 Preview 를 끄거나
Preview 전용 DB 를 따로 만든다. 같은 `DATABASE_URL` 을 쓰면
PR 미리보기가 운영 데이터를 건드린다.

### Prisma generate

`@sacloud/db` 의 `build` 가 없어 Vercel 이 `prisma generate` 를 자동 실행하지 않을 수 있다.
빌드가 Prisma Client 없음으로 실패하면 Vercel Build Command 를 아래로 바꾼다.

```
pnpm --filter @sacloud/db exec prisma generate && next build
```

---

## 9. worker 없이 가오픈 가능한가 — **가능하다**

| 질문 | 답 |
|---|---|
| Vercel + managed DB 만으로 사이트가 서비스되는가 | **YES** |
| worker 가 떠 있어야 사이트가 열리는가 | **NO** |
| worker 가 없으면 무엇이 멈추는가 | **신규 경기 자동 수집만** 멈춘다 |

근거
- `apps/web` 은 `@sacloud/nexon` 에서 **상수 2개만** 가져온다. 넥슨 API 를 호출하지 않는다
- 수집·replay·backfill 은 전부 `apps/worker` CLI 다. 웹 요청 경로에 없다
- `/api/health` 는 수집기가 멈춰도 `degraded`(200) 이지 `down`(503) 이 아니다.
  DB 가 죽거나 공개 데이터가 없을 때만 503 이다

즉 **현재 DB 스냅샷 기준으로 조회는 전부 정상**이고, 새 경기만 안 들어온다.
worker 는 나중에 별도 서버(또는 로컬)에서 돌리면 된다.

---

## 10. 오늘 따라 할 순서

### STEP 1 — managed PostgreSQL

1. Neon / Supabase / Railway 중 하나에 가입
2. 새 PostgreSQL 인스턴스 생성 (region 은 한국에서 가까운 곳)
3. 연결 문자열(`postgresql://...`) 복사 → 이것이 `DATABASE_URL`

### STEP 2 — 데이터 옮기기

4. PostgreSQL 17 클라이언트 도구 설치 (`pg_dump` 용)
5. 로컬 DB 켜기: `pnpm db:start` (별도 창에서 켜 둔 채로)
6. 이전 전 기준선: `pnpm --filter @sacloud/worker nexon db-snapshot --stamp before`
7. 덤프 → 스키마 생성(`migrate deploy`) → 복원 (5장 명령 그대로)
8. 이전 후 대조: `pnpm --filter @sacloud/worker nexon db-snapshot --stamp after`
   → **6장 표와 숫자가 같아야 한다**

### STEP 3 — Vercel

9. `AUTH_SECRET` 생성 (4장 명령)
10. Vercel 에 GitHub 저장소 연결
11. **Root Directory = `apps/web`** · Framework = Next.js · Node 22.x
12. Environment Variables 에 `DATABASE_URL` · `AUTH_SECRET` · `NEXT_PUBLIC_API_MODE=live`
13. **Deploy**

### STEP 4 — vercel.app 주소로 가오픈 검수

14. `https://<프로젝트>.vercel.app/` 접속
15. 아래 route 를 눈으로 확인 (11장)
16. 회원가입 → 로그인 → 로그아웃
17. 모바일(실기기)에서 같은 화면 확인 — **이번에 검수 못 한 부분이다**

### STEP 5 — 도메인 (STEP 4 가 전부 정상일 때만)

18. Vercel → Settings → Domains → 도메인 추가
19. DNS 레코드 등록
20. HTTPS 발급 확인 후 다시 smoke

---

## 11. 배포 후 눈으로 볼 route

| # | route | 봐야 할 것 |
|---|---|---|
| 1 | `/` | 홈 · 통합검색 |
| 2 | `/league/supply/home/info` | 리그홈. **대표 클랜에 `전설`·`Xenics-Storm` 이 없어야 한다** |
| 3 | `/league/supply/rank/player` | 개인랭킹. 3,050 / 3,035 … (D-145 값) |
| 4 | `/league/supply/rank/clan` | 클랜랭킹 |
| 5 | `/league/supply/player/OBS-f234f1743622c0d10da68e20` | 공식 클랜 선수(하연수담당일진) — **실제 클랜마크** |
| 6 | `/league/supply/player/OBS-dc37dbc824867181603a2e4c` | 무소속 선수(은호리움) — **fallback 구름 마크** · 소속 `-` · 스나/라 `집계 없음` |
| 7 | `/league/supply/clan/ddorr` | 클랜 기록실 → 경기 펼치기 (`260823233540000001`, 5v5, 래더 −29) |
| 8 | `/auth/signup` → `/auth/login` | 가입 · 로그인 |
| 9 | `/api/health` | `status: ok` 또는 `degraded` (수집기 멈춤은 정상) |

---

## 12. 도메인 연결 전 확인

- [ ] vercel.app 주소에서 위 9개 route 전부 정상
- [ ] 로그인 후 새로고침해도 세션 유지 (HTTPS 에서 `secure` 쿠키가 실제로 붙는지)
- [ ] `/api/health` 가 `db: ok`
- [ ] 개인·클랜 랭킹 숫자가 로컬과 같음
- [ ] 개발 클랜(`전설` 등) 미노출
- [ ] 모바일 실기기 확인

---

## 13. rollback

### 웹

★**여기 한 줄만 있었다** — *「Vercel → Deployments → 이전 배포 → Promote to Production」*.
그 한 줄에는 **「누가 언제 판단하나」가 없었고**, 대시보드를 브라우저로 열어야 하는데
**이 PC 는 소켓이 끊긴다** (최윤서 · `O-008` ⑧).

→ ★**절차 전체는 15-4 에 있다.**★ 판단 기준 · 대시보드가 안 열릴 때의 CLI 경로 ·
  되돌린 뒤 확인 · **2026-09-03 리허설 기록**(무엇을 해 봤고 무엇을 못 해 봤나)까지 거기 있다.
  ⚠ **두 곳에 절차를 적지 않는다.** 한쪽만 낡는다.

### DB
- **로컬 DB 를 지우지 않는다.** 이전은 복사이지 이동이 아니다
- managed DB 로 옮기기 **전** 덤프 파일(`sacloud-golive.dump`)을 보관한다
- 문제가 나면 managed DB 를 비우고 같은 덤프로 다시 복원한다

### 래더
`apps/worker/backups/rating/supply-d145-pre.json` (checksum `e16c100f49739bd2aa79579db1df8043`)
```
pnpm --filter @sacloud/worker nexon rating-restore --file <경로>
```
replay → restore 왕복은 실제로 검증했다.

### dual-write 금지
production web 은 **managed DB 하나만** 본다. 로컬은 개발 전용(5433).
두 곳에 동시에 쓰는 구조를 만들지 않는다.

---

## 14. 넥슨 · incomplete 88

- 넥슨 할당량은 이번 작업에서 **건드리지 않았다** (호출 0회)
- incomplete 88건은 rating 제외 유지. 원본·기록은 보존
- 할당량이 회복되면: backfill → `nexon rate --league supply` 로 재replay
- 재replay 는 결정적·idempotent 임이 검증돼 있다
> ⚠ **`nexon:rate` 는 DB 의 `placement` 칸을 쓴다** (2026-09-03 · O-036).
> 배치고사는 2026-09-01 에 폐지됐는데 이 명령은 `DEFAULT_RATING_CONSTANTS`(**옛 10경기**)를
> 쓰고 있었다. 그대로 돌리면 **9판 이하 선수가 전부 랭킹에서 사라진다.**
> 지금은 이 명령이 운영과 같은 `V2_RATING_CONSTANTS`(0경기)를 쓰도록 고쳤다 (`cli.ts` `case 'rate'`).
> **돌린 뒤에는 랭킹 인원수를 전/후로 세어 보라** — 줄었으면 그 자리를 다시 봐야 한다.

---

## 15. 공개 당일 순서표 (O-025 · 2026-09-03)

> **왜 이 장이 생겼나** — 지도에 「18 공개」가 있는데 **「누가 · 언제 · 무엇을 눌러서 여는가」**
> 가 어디에도 없었다 (최윤서). 공개는 **한 번뿐**이고, 그날 순서가 없으면 그 자리에서 지어내게 된다.
>
> ⚠ **시각은 T 기준 상대시간이다.** 실제 몇 시에 여는지는 **사장님이 정한다.**
> 여기에 시간을 지어내 적지 않는다.

### 15-1 여는 순서

★표시는 **사장님만 할 수 있는 것**이다. 나머지는 실행 세션이 한다.

```
T-30  ① DB 스키마를 맞춘다
         node scripts/prod-migrate.mjs          ← ★--confirm 없이 먼저★ (무엇이 바뀌는지만 본다)
         내용을 읽고 예상과 같을 때만 --confirm 을 붙여 다시 돌린다

      ② ★엣지 워밍 체인이 살아 있는지 본다★
         GitHub Actions → 「엣지 캐시 워밍」 → 최근 run 셋
         ★최근 3개가 전부 30분 이내 간격인가★
         ⚠ 체인은 한 고리만 끊겨도 예약 후퇴값(112~310분)으로 떨어진다.
           ★「한 번 이어졌다」와 「이어진다」는 다르다★ (오세라)

      ③ ★저장소 변수 SITE_URL 이 3rdcloud.my 인지★                     ★사장님★
      ④ ★Vercel 에 NEXON_API_KEY 가 있는지★                            ★사장님★
      ⑤ origin/main 과 로컬이 같은지 · ★배포된 커밋 해시를 적어 둔다★ (되돌릴 때 쓴다)
         git rev-parse HEAD          →  여기에 적는다: ______________

T-20  ⑥ ★수집을 멈춘다★
         GitHub Actions 에서 셋을 disable 한다
           supply-incremental.yml    3rd.supply 증분 동기화
           collect-watchdog.yml      수집 감시
           season0-apply.yml         시즌0 집계 반영 (랭킹 숫자)
         근거 D-239 · D-240 — ★사람이 제일 많을 때 DB 를 나눠 쓰지 않는다★
         ⚠ 「엣지 캐시 워밍」은 ★끄지 않는다★. 그건 DB 를 안 쓰고 캐시만 데운다

T-10  ⑦ 엣지를 손으로 한 번 데운다
         GitHub Actions → 「엣지 캐시 워밍」 → Run workflow (workflow_dispatch)
      ⑧ ★돌았는지 믿지 말고 확인한다★ — 15-2 의 표를 채운다

T-0   ⑨ 문을 연다 (링크를 뿌린다)                                       ★사장님★
```

### 15-2 엣지 데우기 — **재는 법이 중요하다**

```
★GET 으로 재라.★  curl -I (HEAD) 로 재면 캐시 칸이 달라 MISS 로 나온다
★두 번씩 재라.★   첫 번째 MISS → 두 번째 HIT 가 정상이다. 두 번 다 MISS 면 안 데워진 것이다

curl -sS -D - -o /dev/null 'https://3rdcloud.my<주소>'
   → x-vercel-cache 와 age 를 적는다
```

⚠ **왜 두 번인가** — `lastKnownGood`(안전망)이 **람다마다 따로**라 첫 몇 분에는 비어 있다 (오세라).
데워 두면 그 몇 분을 엣지가 대신 받아 낸다.

아래 주소는 **2026-09-03 에 운영에서 하나씩 열어 200 을 확인한 것**이다.

```
                                                        1차   2차
/                                                       ___   ___
/league/supply/rank/player                              ___   ___
/league/supply/rank/clan                                ___   ___
/league/supply/match                                    ___   ___
/api/leagues/supply/ranks/players?weapon=all            ___   ___
/api/leagues/nolink/ranks/players?weapon=all            ___   ___
/api/leagues/sanply/ranks/players?weapon=all            ___   ___
/api/leagues/supply/ranks/clans?division=1              ___   ___
/api/leagues/nolink/ranks/clans?division=1              ___   ___
/api/leagues/sanply/ranks/clans?division=1              ___   ___
```
MISS 가 남으면 ⑦을 한 번 더 돌린다.

⚠ ★람다는 못 데운다 — `ƒ` 는 캐시가 안 된다.★ 빌드 출력에서 `ƒ` 인 화면은 이 표에 넣지 않는다.
  (`O-016` 이 화면 10개를 `●` 로 굳혔다. 그것들만 데울 수 있다.)

### 15-3 열고 나서 보고 있어야 하는 것 넷

**자동으로 아무도 안 알려 준다.** 사람이 눈으로 본다. **처음 30분은 5분마다, 그 뒤 2시간은 15분마다.**

```
① /api/health          db 가 ok 인가
② x-vercel-cache       랭킹 경로가 HIT 인가. MISS 가 계속 뜨면 워밍이 죽은 것
③ ★개인 경로★          /api/players/{아무 id}/profile 을 직접 눌러 본다
                       ★여기가 제일 먼저 죽는다. 랭킹만 보면 못 본다★
④ Vercel 함수 오류율    ★사장님 손★ — 우리는 못 본다
```

★**③이 핵심이다.**★ ①②만 보면 「사이트 멀쩡함」이라고 보고하게 된다 — 랭킹은 SWR 이 24시간
받쳐 주니까. **사람이 실제로 겪는 건 ③이다.**

> ⚠ ★**①에 함정이 있었다 — 고쳤다** (2026-09-03)★
>
> 순서표를 쓰면서 운영 `/api/health` 를 열어 보니 **이미 `degraded`** 였다.
> ```
> collector  degraded — 마지막 수집 성공이 ★240시간★ 전 (기준 48시간)
> ```
> **그런데 수집은 멈춘 적이 없었다.** 그 칸이 **넥슨 파이프라인**(`ImportJob`)을 보고 있었고,
> 넥슨은 할당량 때문에 **일부러 세워 둔** 것이다 (14장). 새 경기는 **3rd.supply 미러**로 들어온다.
>
> ★이미 노랑이라 나빠져도 안 바뀌었고, 그 뒤에서 `sanply` 적재가 열흘 동안 빨간 줄이었다.★
> **세워 둔 것을 고장이라 부르면 알람이 무뎌진다. 무딘 알람은 없는 알람보다 나쁘다.**
>
> → **지금은 「수집기」가 ★리그별 최신 경기★ 로 판정한다** (`supply` 24h · `sanply` 12h ·
>   `daerule` 168h — 2026-09-01 실측). 밀리면 **어느 리그인지 이름을 댄다.**
>   `nolink`(IPL)는 사람 손으로 들어와서 판정에 안 넣는다.
>
> ⚠ 그래도 ★`status` 한 칸만 보지 마라.★ `checks` 셋을 각각 본다 —
>   어느 칸이 왜 나쁜지가 **처방을 정한다.**

### 15-4 되돌리기

`O-008` ⑧ 의 세 줄이다. **글자를 바꾸지 않는다.**

```
1. 판단 — 홈이나 화면 6개 중 하나가 500 을 1분 이상 내면 되돌린다. 원인은 나중에 본다
2. 실행 — Vercel Deployments 에서 마지막 초록 배포를 Promote to Production
          (대시보드가 안 열리면 `vercel promote <배포URL>`,
           그것도 막히면 GitHub 에서 마지막 초록 커밋을 revert 해 push)
3. 확인 — /api/health 200 · 화면 6개 육안 → ORDERS.md 에 뭘 되돌렸는지 한 줄
```

DB · 래더를 되돌리는 것은 **위 13장**에 따로 있다. 웹을 되돌리는 것과 다른 일이다.

#### 리허설 기록 (2026-09-03 · `O-008` ⑧)

**운영에 손대지 않고 할 수 있는 데까지 다 해 봤다.** 못 한 칸은 못 했다고 적는다 —
★리허설의 목적은 통과가 아니라 「무엇이 안 되는지 미리 아는 것」이다.★

```
1 길이 열려 있나        ★된다★
  vercel CLI 59.7.0 이 이 PC 에서 돈다 (`npx vercel`)
  로그인돼 있다 — softgw01-8957 · `.vercel/project.json` 으로 sacloud-web 에 묶여 있다
  `vercel ls --prod` 가 ★256ms★ 에 목록을 준다. 되돌릴 후보가 ★11개★ 다 (전부 ● Ready)
  ⚠ ★대시보드를 못 열어도 된다는 뜻이다.★ 이 PC 는 소켓이 끊기는 문제가 있는데
    CLI 경로가 살아 있으므로 그게 막혀도 길이 있다

2 ★실제로 promote 했나★  ★안 했다★
  `O-008` ⑧ 이 「실제로 promote 하지 마라」로 못박아 뒀다. 운영을 바꾸는 일이라 안 한다.
  ★안 해 본 한 걸음이 정확히 무엇인지 적어 둔다★ — `vercel promote <URL>` 한 줄이다.
  그 앞뒤(목록 뽑기 · 후보 확인 · 되돌린 뒤 화면 보기)는 전부 해 봤다.

3 되돌린 뒤 화면이 사나   ★산다★ — 되돌릴 후보(16분 전 배포)를 ★직접 열어★ 확인했다
  /                                    200  0.65s
  /player/{id}                         200  2.15s
  /league/supply/rank/clan             200  0.39s
  /league/supply/match                 200  0.15s
  /api/health                          200
  ⚠ ★이건 「문서를 읽었다」가 아니라 그 배포에 실제로 요청을 보낸 것이다.★
    이전 배포 URL 은 살아 있고 화면이 온전하다

4 얼마나 걸리나          ★promote 자체는 안 재 봤다. 안 해 봤으므로 적지 않는다★
  대신 ★진짜 비용★ 을 쟀다 — 되돌리면 배포가 바뀌므로 **엣지가 비워진다.**
  배포 직후 운영에서 GET 두 번씩 (2026-09-03):
  ```
  /                          PRERENDER → HIT
  /league/supply/rank/player MISS → HIT
  /league/supply/rank/clan   MISS → HIT
  /league/supply/match       MISS → HIT
  /player/{id}               MISS → HIT
  ```
  ★주소 하나당 딱 한 번의 느린 요청이면 다시 따뜻해진다.★ 「몇 분」이 아니다.
  다만 **개인 기록은 사람마다 주소가 달라 전부 첫 방문**이라, 되돌린 직후에는
  그만큼이 한꺼번에 람다로 간다. 되돌린 뒤에는 15-2 의 워밍을 ★한 번 더★ 돌린다.

5 ★DB 는 안 따라 돌아간다★  ★맞다. 그런데 지금은 안전하다 — 확인했다★
  코드만 되돌아가고 마이그레이션은 그대로 남는다. 그래서 **새 코드가 만든 표를
  옛 코드가 모르면** 문제가 되는데, 최근 마이그레이션 7개를 다 열어 봤다:
  ```
  clan_hex_v2_summary        CREATE TABLE · CREATE INDEX
  title_challenge            CREATE TABLE · CREATE INDEX
  clan_master_claim          CREATE TABLE · CREATE INDEX
  player_round_burst         ADD COLUMN (전부 DEFAULT 있음)
  player_round_burst_rounds  ADD COLUMN (전부 DEFAULT 있음)
  search_trgm_index          CREATE EXTENSION · CREATE INDEX
  signup_username            ADD COLUMN + ★ALTER COLUMN "email" DROP NOT NULL★
  ```
  ★전부 「더하는」 것뿐이다.★ 지우거나 이름을 바꾼 것이 하나도 없다 →
  **옛 코드는 새 표·새 칸을 그냥 안 볼 뿐이라 깨지지 않는다.**

  ⚠ ★딱 하나 위험한 자리★ — `signup_username` 의 `email DROP NOT NULL`.
    그 뒤로 **이메일 없이 가입한 사람**이 생길 수 있다.
    ★그 마이그레이션보다 앞선 코드로 되돌리면★ 옛 코드는 이메일이 언제나 있다고 믿는다.
    → ★되돌리는 범위를 「그 배포 직전」으로 좁게 잡는다.★ 며칠씩 거슬러 올라가지 않는다.
      위 11개 후보는 전부 그 마이그레이션 이후이므로 ★지금은 어느 것으로 가도 안전하다.★

6 ★혼자 할 수 있나★      ★못 한다★
  15-5 대로 사람이 하나뿐이다. 그 한 사람이 자고 있으면 ★아무도 안 되돌린다.★
  자동 롤백도 없고 알림도 없다 (15-6). ★이건 고칠 수 있는 게 아니라 알고 있어야 하는 사실이다.★
  최소한 이렇게는 줄일 수 있다 — 공개 직후 몇 시간은 ★사람이 깨어 있는 시간대에 연다.★
```

⚠ **여전히 안 해 본 한 걸음이 있다** (위 2번). 그러나 **그 앞뒤는 다 해 봤고,
  길이 열려 있다는 것과 되돌릴 곳이 살아 있다는 것을 숫자로 확인했다.**

### 15-5 누가 하나

```
사장님    문을 여는 것 · SITE_URL · NEXON_API_KEY · Vercel 대시보드 · 되돌릴지 최종 판단
실행 세션  migrate · 워밍 · 15-2 표 채우기 · 15-3 눈으로 보기 · 되돌리기 실행
```

★**지금 사람이 하나뿐이다.**★ 사장님이 자리를 비우면 ③④와 되돌리기 판단이 **멈춘다.**
**대리 운영자가 없다.** 이건 고칠 수 있는 게 아니라 **알고 있어야 하는 사실**이다.

### 15-6 ★지금 없는 것★ — 있다고 착각하면 안 된다

```
★없다★ 알림    500 이 나도 아무도 안 알려 준다. ★사람이 눈으로 본다★
                  `DISCORD_WEBHOOK_URL` 이 비어 있다 (O-008 사장님 손 목록).
                  ⚠ ★이게 값이 없을 때 무슨 일이 나는지 2026-09-03 에 실제로 드러났다★ —
                    `collect-watchdog` 은 「워크플로 연속 실패 3회」를 판정한다.
                    `supply-incremental` 이 ★열두 번 연속★ 실패했으니 진작 울렸어야 했다.
                    웹훅이 비어 있어 **로그에만 찍고 끝났다.**
                    ★감시견은 짖고 있었고 아무도 못 들었다.★ 공개 전에 반드시 넣는다
없다   모니터링   대시보드가 없다. 위 15-3 을 손으로 친다
없다   대리 운영자 사장님 한 사람이다 (15-5)
없다   자동 롤백   사람이 판단하고 사람이 누른다
없다   롤백 리허설 O-008 ⑧ 이 아직 안 끝났다
(고쳤다) 수집   「240시간 멈춤」은 ★자를 잘못 댄 것★ 이었다 (15-3 ①). 수집은 돌고 있다
```
