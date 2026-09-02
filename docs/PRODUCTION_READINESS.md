# PRODUCTION_READINESS.md — 외부 공개 준비

**작성 2026-08-24.** 이 문서 하나로 "지금 공개해도 되는가"와 "공개하려면 무엇을 해야 하는가"를
판단할 수 있어야 한다. 실제 배포·도메인 연결은 **아직 하지 않았다** — 준비만 끝냈다.

읽는 순서: `CLAUDE.md` → `docs/HANDOFF_CURRENT.md` → 이 문서.

---

## 0. 한 줄 결론

> **기능은 공개 가능한 상태다. 남은 것은 인프라 선택과 데이터 정리 5건이다.**
> 코드 쪽 blocker 는 이번에 전부 닫았다.

---

## 1. 점검 결과

### 1-1. 화면 · API (실측, 로컬 프로덕션 빌드)

스모크 22종 **전부 200**. 스크립트는
`docs/` 밖 스크래치가 아니라 아래 10장 체크리스트로 옮겨 두었다.

```
화면  홈 · 리그목록 · 리그홈 · 클랜랭킹 · 개인랭킹 · 클랜상세 · 클랜원 ·
      선수프로필 · 게시판 · 로그인 · 회원가입 · 약관
API   리그목록/상세 · 클랜랭킹 · 개인랭킹 · 클랜상세 · 클랜기록실 ·
      경기상세 · 선수상세 · 게시판 · 정보 · health
```

응답 시간은 전부 **0.3초 미만**(로컬). 500 없음.

### 1-2. 이번에 고친 blocker 3건

| | 증상 | 원인 |
|---|---|---|
| **D-135** | 무소속 선수 프로필 **404** (58명 중 14명) | D-134로 무소속 선수가 생겼는데 조회가 클랜을 필수로 봤다 |
| **D-138** | 클랜 기록실이 **통째로 빈다** | `match_time_clan` 이 외부 클랜에 빈 문자열 id를 넣어 계약 검증이 깨졌다 |
| **D-136** | 보안 헤더 **0개** | 없었다 |

`apiContract.test.ts` 가 D-138을 잡는 테스트였다. 지금은 통과한다.

### 1-3. 보안

| 항목 | 상태 |
|---|---|
| 공용 개발 비밀번호 | **0건** (D-119에서 42계정 폐기 완료) |
| 로그인·가입 rate limit | 있음 (`RateLimit` 813행이 실제로 동작 중 · D-120) |
| 계정 연동 | 운영자 승인제 (`PlayerLinkClaim` · D-121). 닉네임 선점 불가 |
| 관리자 API 비인증 | **403** |
| 클라이언트 번들 secret | **없음** (`.next/static` 전수 검사 — DSN·키·비밀번호 문자열 0건) |
| 저장소에 커밋된 secret | **없음** (`.env.example` 3개만 추적됨. `.env*` 는 `.gitignore`) |
| 보안 헤더 | **추가함** (CSP · XFO · nosniff · Referrer · Permissions · COOP · HSTS) |
| `x-powered-by` | **껐다** |
| DB 포트 | 127.0.0.1 바인딩 — 외부 노출 없음 |

**남은 타협 1건** — CSP `script-src 'unsafe-inline'`.
Next 하이드레이션 부트스트랩 때문이다. nonce 방식은 미들웨어가 필요해 이번 범위 밖으로 뒀다.
공개 자체를 막는 수준은 아니지만 숙제로 남긴다.

### 1-4. 데이터

```
공개 리그 1 · 클랜 45 · 선수 835 · 경기 136
official 17 · 비공식 119
래더 반영 경기 17 · 선수 58
경기 당시 소속 스냅샷 1,058 / 1,084 (97.6%)
raw/staging 750건 보존 · 삭제 이력 없음
```

### 1-5. 공개 전 정리해야 할 데이터 5건 (**blocker**)

코드가 아니라 **데이터**다. 지우면 되는 것들이고, 지금은 남겨 뒀다.

1. **E2E 자리표시자 `Player` 7건** — `E2E-` 접두사. 공개 랭킹에 보인다
2. **dev slug 클랜 4건** — `real-` 접두사가 공개 URL에 노출된다 (이미 `active=false`지만 확인 필요)
3. **게시판 최상단 글 제목이 운영자 이메일** — 실제 작성분이라 임의로 지우지 않았다
4. **관리자 계정 2개** — 운영자가 비밀번호를 새로 정해야 한다
5. **모바일 가로 스크롤** — `.pc-container` 가 **1120px 고정폭**(실측)이다.
   원본 3rd.supply 가 PC 전용 레이아웃이라 **의도된 재현**이다.
   반응형은 V2 과제로 두되, 공개 전에 "모바일은 PC 화면을 축소해 본다"는 것을 인지하고 가야 한다.

   > 실제 모바일 뷰포트로는 **확인하지 못했다.** 브라우저 도구의 창 크기 변경이 탭 뷰포트에
   > 반영되지 않아 고정폭 수치만 확인했다. **실기기 또는 devtools 로 한 번 보고 공개한다.**

---

## 2. 배포 구조 (권장안)

### 결론 — **웹은 Vercel, 수집기는 별도, DB는 managed Postgres**

```
                    ┌──────────────────────────┐
   사용자 ─────────▶ │ Vercel  (apps/web)       │
                    │  Next.js 15 App Router   │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ Managed PostgreSQL       │
                    │  (Neon / Supabase / RDS) │
                    └────────────▲─────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │ 수집기 (apps/worker)      │
                    │  작은 VPS 또는 cron 러너   │
                    └──────────────────────────┘
```

### 왜 이렇게 나누는가

| 대상 | 판단 |
|---|---|
| `apps/web` | **Vercel 적합.** Next 15 App Router · 서버 액션 없음 · 라우트 57개 전부 요청-응답형 |
| `apps/worker` | **Vercel 부적합.** 수집 1회가 수백~수천 호출이고 수십 분 걸린다. 서버리스 실행 시간 한계를 넘는다. 게다가 `--resume` 체크포인트가 **오래 사는 프로세스**를 전제로 한다 |
| PostgreSQL | 지금은 `embedded-postgres`(개발 전용 · D-022). **운영에 쓰면 안 된다.** managed 로 옮긴다 |

### 수집기를 어디서 돌릴까 — 세 가지

1. **작은 VPS** (권장) — 월 5달러급이면 충분하다. cron 으로 `pnpm nexon:poll` 을 돌린다.
   장점: 실행 시간 제한 없음 · `--resume` 그대로 동작 · 넥슨 rate limit 을 프로세스 하나가 관리
2. **GitHub Actions 예약 워크플로** — 인프라가 필요 없다.
   단점: 6시간 제한 · DB 접속 정보를 Actions secret 에 둬야 한다
3. **로컬 PC에서 계속** — 지금 방식. 공개 서비스에는 권하지 않는다 (PC가 꺼지면 수집이 멈춘다)

> **한 번에 하나만 돌려야 한다.** 넥슨 호출 한도가 계정 단위라 수집기를 두 곳에서 돌리면
> 서로 429를 유발한다 (2026-08-24 실측).

### Vercel 에서 확인할 것

- `transpilePackages` 로 워크스페이스 패키지를 소스 참조한다 → **모노레포 루트를 빌드 루트로** 잡아야 한다
- 빌드 명령 `pnpm build` · 출력 `apps/web/.next`
- `next.config.ts` 의 `headers()` 는 Vercel 에서 그대로 적용된다
- Prisma 는 빌드 시 `prisma generate` 가 필요하다 (`postinstall` 확인)

---

## 3. 환경변수

**실제 값은 이 문서에 적지 않는다.** 이름과 성격만 적는다.

### 3-1. 서버 전용 (절대 클라이언트에 노출 금지)

| 이름 | 쓰임 | 운영에서 새 값 필요? |
|---|---|---|
| `DATABASE_URL` | Prisma 접속 문자열 | **필요** — managed DB 의 값 |
| `AUTH_SECRET` | JWT 서명 (`jose`) | **필요** — 로컬 값을 재사용하지 않는다 |
| `NEXON_API_KEY` | 넥슨 Open API | 수집기 쪽에만. 웹에는 **넣지 않는다** |
| `NEXON_API_BASE_URL` | 기본값 있음 | 불필요 |
| `NEXON_RATE_LIMIT_PER_SEC` | 호출 속도 | 권장 — 운영에서는 보수적으로 |
| `NEXON_MAX_RETRIES` · `NEXON_REQUEST_TIMEOUT_MS` | 재시도·타임아웃 | 선택 |
| `NEXON_REFRESH_INTERVAL_DAYS` | 신선도 정책 | 선택 |
| `NEXON_POLL_*` (11개) | 적응형 폴링 튜닝 | 선택 — 기본값으로 시작 |
| `NEXON_MIGRATION_VERSION` | 원본 재변환 추적용 | 선택 |
| `SACLOUD_PUBLIC_SCOPE` | 공개 범위. **운영에서는 설정하지 않는다**(기본이 안전) | 불필요 |
| `SACLOUD_CLIENT_IP_HEADER` | 프록시 뒤 실제 IP 헤더 | **필요** — Vercel 이면 `x-forwarded-for` |

> `SACLOUD_CLIENT_IP_HEADER` 를 안 넣으면 rate limit 이 **느슨한 전체 한도**로만 동작한다(D-120).
> 프록시 뒤에서는 반드시 넣는다.

### 3-2. 클라이언트 노출 (`NEXT_PUBLIC_*` — 공개돼도 되는 값만)

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_API_MODE` | `live` (기본값이 `live` 다 · D-116) |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` — 같은 오리진. CSP `connect-src 'self'` 와 맞는다 |

### 3-3. 개발·테스트 전용 (**운영에 넣지 않는다**)

`SACLOUD_SEED_PASSWORD` · `SACLOUD_TEST_ADMIN_EMAIL` · `SACLOUD_TEST_ADMIN_PASSWORD` ·
`API_TEST_BASE_URL`

---

## 4. 운영 DB 이전 계획

> 운영 DB는 **아직 없다.** 아래는 생기면 그대로 따라 할 절차다.

### 4-1. 순서

```
1. managed Postgres 생성 · DATABASE_URL 확보
2. prisma migrate deploy          ← dev 금지. deploy 만 쓴다
3. 로컬 → 운영 데이터 이관 (pg_dump / pg_restore)
4. pnpm db:check · pnpm nexon:check 로 숫자 대조
5. 웹을 운영 DB로 붙이고 스모크 (10장)
```

### 4-2. 이관 명령 (스키마는 migrate 가 만든다 — 데이터만 옮긴다)

```bash
# 로컬에서 데이터만 뽑는다 (스키마 제외 · 순서 문제를 피하려고 --disable-triggers)
pg_dump --data-only --disable-triggers \
        --exclude-table=_prisma_migrations \
        "postgresql://…@127.0.0.1:5433/sacloud" > sacloud-data.sql

# 운영에 넣는다
psql "$DATABASE_URL" < sacloud-data.sql
```

### 4-3. 반드시 지킬 것

- **`prisma migrate dev` 금지.** 대화형 프롬프트에서 리셋을 물어 볼 수 있다.
  실제로 이 프로젝트에서 한 번 위험했다 (Phase 11 기록)
- **`_prisma_migrations` 를 데이터 덤프에 넣지 않는다.** `migrate deploy` 가 직접 관리한다
- **ID를 새로 만들지 않는다.** `cuid` 문자열 PK 를 그대로 옮긴다.
  `sourceMatchId` · `sourcePlayerId` · `ouid` 같은 원본 대조 키도 그대로다
- **raw/staging(750건)을 먼저 옮긴다.** `RawImport` → `NexonMatch` → `NexonMatchParticipant`
  → `NexonMatchObservation` 순. 파생 데이터는 명령으로 다시 만들 수 있지만 raw 는 못 만든다
- **마이그레이션 이력 drift 주의** — 로컬 DB에는 저장소에 없는
  `20260823120000_public_data_origin` 이 있다. 운영에는 저장소 기준으로만 적용한다

### 4-4. rollback

```
운영 DB 생성 직후 스냅샷을 뜬다 (managed 서비스의 PITR/백업 기능)
이관이 잘못되면 스냅샷으로 되돌린다
로컬 DB는 지우지 않는다 — 원본이 그대로 남아 있어야 다시 시도할 수 있다
```

### 4-5. 백업

managed Postgres 의 자동 백업을 켠다. 그와 별개로 주기적으로

```bash
pg_dump "$DATABASE_URL" | gzip > sacloud-$(date +%F).sql.gz
```

`RawImport` 가 가장 크고 가장 중요하다 — 파생 데이터는 재생성되지만 이것은 안 된다.

---

## 5. 도메인 연결 절차

> 도메인은 **아직 없다.** 아래에서 `sacloud.example` 을 실제 도메인으로 바꾸면 된다.

### 5-1. 필요한 정보

| 항목 | 값 |
|---|---|
| root | `sacloud.example` |
| www | `www.sacloud.example` → root 로 301 |
| canonical | **root** (www 없음) |
| HTTPS | 필수. provider 가 발급하는 인증서 사용 |

### 5-2. DNS 레코드 (Vercel 기준)

```
A      @      76.76.21.21            ← Vercel 이 알려 주는 값으로 교체
CNAME  www    cname.vercel-dns.com.  ← 같음
```

> **provider 가 주는 실제 target 을 쓴다.** 위 값은 예시다.

### 5-3. 순서

```
1. provider 에 도메인 추가 → target(A/CNAME) 확인
2. DNS 에 레코드 등록 → 전파 대기
3. HTTPS 인증서 발급 확인
4. www → root 301 리다이렉트 설정
5. 10장 체크리스트 전부 통과
```

### 5-4. 도메인 확정 후 코드에서 손볼 것

- `NEXT_PUBLIC_API_BASE_URL` 은 `/api` 그대로 (상대 경로라 도메인과 무관)
- HSTS `preload` 추가 여부 결정 (지금은 넣지 않았다)
- SEO canonical·OG 태그는 **Phase 10(SSR/SEO)** 과제로 아직 남아 있다

---

## 6. 상태 감시

### 6-1. `/api/health`

인증 없이 열려 있다. **민감한 값을 담지 않는다** — 숫자·시각·판정만이다.

```
status            ok | degraded | down     (down 이면 HTTP 503)
checks.db         쿼리가 도는가
checks.collector  마지막 성공 · 24시간 신규 · 실패율 · 429
checks.data       공개 화면이 비어 보이지 않을 최소 조건
metrics           위 값들의 원시 숫자 + pendingDetail / pendingProjection /
                  unresolvedIdentities / 공개 리그·클랜·선수·경기 수
```

`degraded` 로 넘어가는 조건

- 마지막 수집 성공이 **48시간** 초과
- 최근 24시간에 **429** 를 본 적 있음
- 최근 24시간 상세 실패율 **50%** 초과
- 공개 클랜 또는 선수가 0

### 6-2. 붙일 것 (권장)

업타임 감시 서비스(UptimeRobot 등)로 `/api/health` 를 5분마다 찌른다.
`503` 이면 즉시 알림. `degraded` 는 200이라 알림이 안 오므로,
**본문 `"status":"degraded"` 를 키워드로 감시**하도록 설정한다.

---

## 7. 패치 후 복구 절차

넥슨 패치로 응답 구조가 바뀌어 수집이 멈춰도 **과거 누락분을 되찾을 수 있어야 한다.**
그래서 원본을 버리지 않는다 (`CLAUDE.md` 3-A 1번).

```
1. 감지      /api/health 의 collector 가 degraded 로 넘어간다
             (마지막 성공 시각 · 실패율 · 429)
2. raw 보존  RawImport 는 그대로 쌓인다. 파싱이 실패해도 원본은 남는다
3. parser 수정  packages/nexon 의 스키마·정규화를 고친다
4. backfill  pnpm nexon:backfill-observations   ← **넥슨을 부르지 않는다.**
             보관된 원본을 다시 읽어 관측값을 만든다
5. 재구성    pnpm nexon:reconstruct --league supply --redo --lineup-evidence
6. 래더      pnpm nexon:rate --league supply    ← 결정적 replay. 몇 번을 돌려도 같다
```

> ⚠ **`nexon:rate` 는 DB 의 `placement` 칸을 쓴다** (2026-09-03 · O-036).
> 배치고사는 2026-09-01 에 폐지됐는데 이 명령은 `DEFAULT_RATING_CONSTANTS`(**옛 10경기**)를
> 쓰고 있었다. 그대로 돌리면 **9판 이하 선수가 전부 랭킹에서 사라진다.**
> 지금은 이 명령이 운영과 같은 `V2_RATING_CONSTANTS`(0경기)를 쓰도록 고쳤다 (`cli.ts` `case 'rate'`).
> **돌린 뒤에는 랭킹 인원수를 전/후로 세어 보라** — 줄었으면 그 자리를 다시 봐야 한다.

**핵심은 4번이다.** 원본을 버리지 않았기 때문에 파서를 고친 뒤 호출 없이 되돌릴 수 있다.

---

## 8. 남은 넥슨 백필 (할당량 회복 대기)

`incomplete 88건` 은 코드가 아니라 **넥슨 기간 할당량**이 막고 있다 (D-134 말미).

```bash
pnpm nexon:collect --all-identities --no-detail --modes "폭파미션" --resume
pnpm nexon:backfill-observations
pnpm nexon identity-link --league supply --confirm
pnpm nexon:reconstruct --league supply --redo --lineup-evidence --limit 300
pnpm nexon:rate --league supply
```

`--resume` 이 이미 끝난 것을 건너뛴다. 중간에 멈춰도 다시 돌리면 이어진다.

---

## 9. 공개 순서 (권장)

```
1. 위 1-5의 데이터 정리 5건
2. managed Postgres 생성 → 4장대로 이관 → db:check · nexon:check
3. Vercel 에 apps/web 배포 (환경변수는 3장)
4. 수집기를 VPS/Actions 로 옮기고 cron 등록 (한 곳에서만)
5. /api/health 를 업타임 감시에 등록
6. 도메인 연결 (5장)
7. 10장 체크리스트 전부 통과
8. 공개
```

---

## 10. 공개 전 스모크 체크리스트

한 번에 확인한다. 하나라도 실패하면 공개하지 않는다.

### 자동

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm db:check          # 시드/데이터 정합성
pnpm nexon:check       # 수집 파이프라인 16항목
curl -s "$BASE/api/health" | grep '"status":"ok"'
```

### 화면 (PC)

- [ ] 홈이 뜬다
- [ ] 로그인 · 회원가입 화면이 뜨고 실제 로그인이 된다
- [ ] 클랜랭킹에 클랜과 **마크**가 보인다
- [ ] 개인랭킹에 선수와 **현재 소속** 마크가 보인다
- [ ] 클랜 기록실에 경기가 보인다 (**빈 목록이면 D-138 재발**)
- [ ] 경기를 펼치면 참가자 K/D/A 가 보인다
- [ ] 경기 상세·라인업에 **그 경기 당시** 클랜마크가 보인다
- [ ] 선수 프로필에 **현재** 클랜마크가 보인다
- [ ] **무소속 선수** 프로필이 404가 아니다 (D-135)
- [ ] 비공식 경기에 배지가 있고 래더에 반영되지 않는다
- [ ] 게시판이 열리고 글이 보인다

### 화면 (모바일)

- [ ] 페이지가 뜬다 (가로 스크롤은 **의도된 동작** — 원본이 PC 레이아웃이다)

### 데이터

- [ ] 공개 리그가 `supply` 하나다 (시드 리그는 404)
- [ ] `E2E-` 자리표시자가 랭킹에 없다
- [ ] `real-` 접두사 slug 가 공개 URL 에 없다

### 보안

- [ ] 응답에 CSP · X-Frame-Options · nosniff 헤더가 있다
- [ ] `x-powered-by` 가 없다
- [ ] 관리자 API 를 비로그인으로 부르면 403
- [ ] 로그인 5회 실패 시 429 + `Retry-After`
- [ ] 클라이언트 번들에 키·DSN 문자열이 없다
