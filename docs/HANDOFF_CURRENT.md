# HANDOFF_CURRENT.md — 현재 상태 인수인계

> ## ⬛ 3rd.supply 미러 수집 진행 중 · 클랜 랭킹 원본 일치 (2026-08-28 · D-153~D-158)
>
> **결정 기록을 따라잡았다.** D-151 ~ D-158 이 코드·마이그레이션·이 문서에서 이미 쓰이고 있었는데
> `docs/DECISIONS.md` 에 항목이 없었다. 지금은 전부 들어가 있다 (D-152 · D-154 도 결번이 아니다).
>
> ### 수집 (3rd.supply 미러 · `packages/db/data/`)
>
> | 리그 | 경기 | 상세 | 상태 |
> |---|---|---|---|
> | `supply` (서플라이공식리그) | 130,148 | 130,148 | **완료** |
> | `daerule` (대룰리그) | 29,697 | 29,697 | **완료** |
> | `sanply` (열산리그) | 202,727 | 진행 중 | 수집 중 |
>
> 수집 범위(`floor`)는 **2024-05-24 ~ 현재**다. 저장은 줄 단위 JSONL 이고 중단 후 재개된다 (D-153).
> `sanply` 체크포인트에는 실패 5건이 기록돼 있다.
>
> ### 클랜 랭킹 (D-157 적용 후 · 원본과 대조 완료)
>
> | 리그 | 클랜 | 부리그 |
> |---|---|---|
> | `supply` | 49 | 1부 **22** · 2부 **27** ← 원본과 **순위·점수 전부 일치** |
> | `daerule` | 45 | 1부 **15** · 2부 **30** |
> | `sanply` | 96 | 1부 **96** (단일리그) |
>
> 세 리그 모두 **"수집 파일 클랜 수 == 랭킹 반영 클랜 수"** 다.
> 클랜 점수·승패·부리그는 **경기에서 되짚지 않고 수집 파일 클랜 목록 값을 그대로** 쓴다 (D-157).
>
> ### 남은 일
>
> - `sanply` 미러 수집 완료 후 **`supply-import` → `supply-push` → `supply-rollup` 재실행**
> - `daerule` 도 상세 29,697 이 새로 들어왔으므로 **import / rollup 재실행 필요**
> - **`supply-push` 는 create-only 다** (D-156). 집계표(`LeagueClan` / `LeaguePlayer`) 값이
>   갱신되지 않는다 — `LeagueClan` 은 새로 만들 때만 값이 들어가고 `LeaguePlayer` 는 아예 옮기지 않는다.
>   **운영 집계는 `DATABASE_URL` 을 운영으로 두고 `supply-rollup` 을 직접 돌려서 맞춘다.**
> - 모바일 레이아웃 · UI 차이 45건 · 성능 최적화 **진행 중**
> - **신규 경기 증분 동기화 스케줄러 미구현**
>
> ### 테스트
>
> `apps/worker/src/__tests__/snapshotAuditSafety.test.ts` **8/8 통과** (D-158).
> 실패하던 3건은 전부 **전제가 낡은 것**이었다 — 미러 적재로 스냅샷 624경기가 DB 에 들어와
> `missing = 0` / 투영 대상 0건이 됐고, 미러링 리그의 `LeaguePlayer.rating` 은 원본 점수라
> 우리 공식 replay 값과 다른 것이 정상이다 (D-153). 단언이 지키려던 성질은 그대로 두고
> 전제 요구만 걷어냈다.

> ## ⬛ Vercel 프로덕션 배포 성공 · **DB 자격증명만 남았다** (2026-08-27 · D-151)
>
> | | |
> |---|---|
> | 프로젝트 | `softgw01-8957s-projects/sacloud-web` (기존 · 새로 만들지 않았다) |
> | URL | https://sacloud-web-softgw01-8957s-projects.vercel.app |
> | 커밋 | `941780d` |
> | 화면 | **전 경로 200** · 보안 헤더 정상 · `x-powered-by` 없음 |
> | DB | **연결 안 됨** — 아래 참조 |
>
> ### ⛔ 지금 해야 할 일 하나 — `DATABASE_URL` 사용자명
>
> ```
> Authentication failed against database server,
> the provided database credentials for `postgres` are not valid.
> ```
>
> Supabase **transaction pooler(6543)** 는 사용자명이 `postgres` 가 아니라
> **`postgres.<project-ref>`** 여야 한다. 지금은 `postgres` 로 들어가 있다.
>
> Vercel → Settings → Environment Variables → `DATABASE_URL` 을 아래 형태로 고친다.
>
> ```
> postgresql://postgres.<project-ref>:<비밀번호>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
> ```
>
> - `pgbouncer=true` 를 빼면 Prisma 가 prepared statement 오류를 낸다
> - 값이 Sensitive 로 설정돼 있어 **CLI 로 읽을 수 없다.** 사람이 직접 고쳐야 한다
> - 고친 뒤 재배포하면 `/api/health` 가 `ok` 가 되어야 한다
>
> ### 여기까지 오면서 고친 것 두 가지
>
> **1. `pnpm install` 이 exit 1** — 배포가 build 에 들어가지도 못했다
>
> ```
> [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @embedded-postgres/linux-x64
> ```
>
> pnpm 11 은 `allowBuilds` 에 없는 빌드 스크립트를 **경고가 아니라 오류**로 만든다.
> `windows-x64` 만 허용해 뒀더니 개발 PC 는 통과하고 Vercel(Linux)만 죽었다.
> `true`(실행) 뿐 아니라 **`false`(실행 안 함을 명시)** 도 적어야 한다.
>
> > Linux 재현법 — 매니페스트와 lockfile 만 빈 폴더에 복사하고 `pnpm-workspace.yaml` 에
> > `supportedArchitectures: {os: [linux], cpu: [x64]}` 를 넣은 뒤 `pnpm install --frozen-lockfile`.
>
> **2. 배포는 됐는데 DB 질의가 전부 죽음** — Prisma 엔진이 번들에 없었다
>
> 생성 클라이언트가 `packages/db/generated/client` 에 있는데 Next 가 번들하면 위치를 잃는다.
> 런타임에 Prisma 는 정해진 곳만 찾고, **첫 번째가 `/var/task/apps/web/generated/client`** 다.
>
> `outputFileTracingIncludes` 는 **상대 경로를 유지**하므로 `packages/db/...` 를 넣으면
> Prisma 가 보지 않는 곳에 떨어진다 — 실제로 그렇게 한 번 더 실패했다.
> 그래서 `scripts/copy-prisma-engine.mjs` 로 엔진을 `apps/web/generated/client/` 에 복사한다.
>
> `binaryTargets = ["native", "rhel-openssl-3.0.x"]` 도 함께 필요하다.
> 개발 PC 가 Windows 라 `native` 만 두면 Linux 엔진이 아예 생기지 않는다.
>
> ### 바꾼 프로젝트 설정 (대시보드)
>
> - Build Command → `pnpm --filter @sacloud/db exec prisma generate && node scripts/copy-prisma-engine.mjs && next build`
> - Deployment Protection(Vercel Authentication) → **껐다.** 켜져 있으면 전 경로가 302 로
>   SSO 로 튀어서 아무도 못 본다. 지금은 **공개 상태**다
>
> ### TODO (배포를 막지 않는다)
>
> - 스키마 drift — 로컬 DB 에만 `MatchPlayerStat(matchTimeLeagueClanId)` 인덱스가 있다.
>   고칠 때는 forward-only · `IF NOT EXISTS`
> - Vercel 빌드마다 `@embedded-postgres/linux-x64` 타르볼을 내려받는다(스크립트는 막았다).
>   설치를 `--filter @sacloud/web...` 로 좁히면 없앨 수 있다
> - D-150 데이터 정리(E2E 자리표시자 · dev slug)는 **공개 랭킹에 보인다.** DB 가 붙으면 드러난다

> ## ⬛ 624경기 적재 감사 완료 · **승인 대기** (2026-08-27 · D-150)
>
> **아직 아무것도 넣지 않았다.** DB 에 한 줄도 쓰지 않았다.
> 상세는 `docs/SUPPLY_SNAPSHOT_IMPORT_AUDIT.md`.
>
> ```bash
> pnpm --filter @sacloud/worker nexon snapshot-audit --league supply
> ```
> 이 명령에는 `--confirm` 이 없다. `dryRun` 이 아니면 시작조차 하지 않는다.
>
> ### 결론
> | | |
> |---|---|
> | 미수입 경기 | **624** (정확 대조) |
> | 적재 가능 | **590** |
> | 제외 | 34 (6대6 11 · 리그 밖 클랜 23) |
> | 래더 경기 | 98 → **604** |
> | 래더 선수 | 260 → **1,475** |
> | 4000+ | 0 → **0** (최고 3,228) |
>
> **판정 B (일부 적재 가능) · 가오픈 전 적재는 권하지 않는다.**
>
> ### ⚠ 먼저 정리해야 할 것 — 팀 판정
> 스냅샷의 `perspectives` 로 팀을 정하면 기존 126경기 중 98건이 우리 DB 와 일치하고
> **28건이 어긋난다.** 어긋난 24건(래더 반영분)을 참가자 원소속으로 다시 판정하니
> **스냅샷 10 : 우리 DB 2 (동점 12)** 로 스냅샷 쪽이 더 맞았다.
>
> 즉 **현재 래더 98경기 중 24건의 팀 판정이 의심스럽다.** 투영에서도 같은 성격의
> `side_clan_mismatch` 가 86건 나온다(래더에서 빠지므로 안전한 실패다).
> 590건을 먼저 얹으면 이 문제가 6배 규모에서 드러난다. **적재 전에 판단이 필요하다.**
>
> ### 알아 둘 것
> - 라인업 행의 `clanId` 는 **그 선수 개인의 클랜**이다. 팀 식별에 쓰면 안 된다 —
>   다수결로 정했더니 양 팀이 같은 클랜이 되는 경기가 54건 나왔다. `perspectives` 를 써라
> - 래더 예측은 **실제 `runRate` 코드**로 돌린다. 공식을 복제한 시뮬레이터는 없다.
>   `extraMatches` 주입은 `dryRun` 에서만 허용된다
> - 하네스 검증: 투영 없이 dry-run → 현재 DB 래더 260명 **전원 일치**
> - 판수 중앙값이 **2** 라 624를 넣어도 confidence 평균 0.15 다. 4000+ 는 0명 그대로다

> ## ⬛ 무기별 전적 분리 완료 (2026-08-26 · D-149)
>
> ### 무엇이 문제였나
> D-148 에서 무기(3rd.supply)와 KDA(넥슨)를 다 가져왔는데도 화면은 `집계 없음` 이었다.
> **둘이 만난 적이 없었다** — 무기는 새로 만든 참가자에게만 썼고, KDA 를 가진
> 기존 넥슨 참가자는 건너뛰었다. `weapon + KDA known` 이 **0건**이었다.
>
> ### 결과
> | | 전 | 후 |
> |---|---|---|
> | weapon + KDA known 참가행 | 0 | **810** |
> | 무기 집계 선수 | 25 | **259** (스나 66 · 라플 220 · 둘 다 27) |
> | 무기 랭킹 | 전원 1위(동점) | **실제 순위** |
>
> ### 지켜야 할 것
> - **`games` 와 `knownStatGames` 는 다르다.** K/D 의 분모는 `knownStatGames` 다.
>   모르는 경기를 0킬로 세면 평균이 거짓이 되고, 모르는 경기 하나 때문에
>   아는 경기까지 버리면 `집계 없음` 이 돌아온다
> - **무기별 공식은 없다.** 랭킹 기준 `ratingDelta` 는 D-145 가 계산한
>   `ratingUpdate` 를 무기별로 나눠 담은 것뿐이다. 개인 래더를 쪼개지 마라
> - **K/D 정의는 하나다** — `킬 / (킬 + 데스) × 100`. 전체와 무기별이 같아야 한다
> - **`공식/비공식` 을 사용자 화면에 다시 붙이지 마라.** 배지도 계약 필드도 없앴다.
>   사용자 표기는 `래더 미반영` 하나뿐이다. DB 의 `Match.official` 은 관리자·출처용으로 남아 있다
> - 집계 기준은 전부 **`Match.redRatingUpdate != null`** 이다. `official` 이 아니다
> - **구성 보정은 경기별 배율이 아니다.** 최근 20경기 평균 본클랜원 수 → 최대 +50.
>   반영률(100/70/40/0%) UI 를 복구하지 마라
>
> ### 남은 것
> - **624경기 import 는 하지 않았다.** 별도 승인 사항 (경기 136 → 760)
> - 모바일 축소는 viewport 버그가 아니다 — `.pc-container` 1120px 고정폭이
>   **원본 동작을 재현한 것**이다. 반응형 전환은 원본과 달라지는 일이라 승인이 필요하다
>
> ```bash
> pnpm --filter @sacloud/worker nexon lineup-complete --confirm
> pnpm --filter @sacloud/worker nexon weapon-rebuild --league supply --confirm
> ```
>
> 상세는 `docs/DECISIONS.md` D-149.

> ## ⬛ 참가자 10명 복원 완료 (2026-08-25 · D-148)
>
> ### 무엇이 문제였나
> 경기 상세에 5vs5 10명이 다 나오지 않았고 래더도 거의 반영되지 않았다.
> **원인은 두 개**였다 — 넥슨 `match-detail` 이 한 경기에 6~9명만 준다는 것(D-044),
> 그리고 D-145 에서 폐기된 `official` 라벨이 집계 필터로 남아 있었다는 것.
>
> ### 결과
> | | 전 | 후 |
> |---|---|---|
> | 10명인 경기 | 39 / 136 | **126 / 136** |
> | 래더가 붙은 경기 | 17 | **98** |
> | `nexon:check` | 3 FAIL | **17항목 전 통과** |
>
> 명단은 `packages/db/data/supply-official-matches.json` 에서 가져왔다.
> **무기 정보도 여기서 온다** — 넥슨은 무기를 주지 않는다 (D-034).
>
> ### 지켜야 할 것
> - **모르는 KDA 는 `null` 이다.** 3rd.supply 는 킬/데스/어시를 주지 않으므로
>   명단만 복원한 224명은 `알수없음` 이다. **0으로 채우면 안 된다**
> - **신원 해석 순서를 바꾸지 마라.** 같은 경기 안의 근거가 전역 근거보다 우선이다.
>   반대로 하면 한 사람이 두 줄이 된다 (실제로 그랬다 — 경기당 11~16명)
> - 집계 기준은 `Match.official` 이 아니라 **`Match.redRatingUpdate != null`** 이다
>
> ### 남은 것
> - 3rd.supply 스냅샷에 있으나 우리 DB 에 없는 경기 **624건**. import 는 별도 작업이며
>   **사용자 승인 전에는 하지 않는다**
> - `side_clan_mismatch` 2건 · 전역 신원 확정 실패 26건 — 추측해 메우지 않았다
>
> ```bash
> pnpm --filter @sacloud/worker nexon lineup-complete --confirm   # idempotent
> pnpm --filter @sacloud/worker nexon rate --league supply
> pnpm --filter @sacloud/worker nexon weapon-rebuild --league supply --confirm
> ```
>
> 상세는 `docs/DECISIONS.md` D-148.

> ## ⬛ 가오픈 준비 완료 (2026-08-25 · D-147)
>
> **`docs/GO_LIVE_CHECKLIST.md` 를 보고 그대로 따라 하면 된다.**
> 실제 배포·DNS 는 하지 않았다. Deploy 버튼 직전까지의 준비만 끝냈다.
>
> ### 결론
> **가오픈 가능하다.** worker(수집기) 없이도 사이트는 정상이다 —
> web 은 넥슨 API 를 호출하지 않고, 수집·replay 는 전부 worker CLI 다.
> worker 가 없으면 **신규 경기 자동 수집만** 멈춘다.
>
> ### 이번에 고친 것
> - **개발 클랜이 공개 리그 목록에 노출되던 버그** — 대표 클랜 미리보기가 `_count` 와
>   다른 조건으로 조회돼 `active=false` 인 `real-` 클랜이 그대로 나왔다.
>   데이터는 이미 올바르게 비활성이라 **삭제하지 않고 필터만** 맞췄다
> - seed 가 로컬 DB 가 아니면 실행 거부 (운영에 가짜 데이터 유입 차단)
> - `/api/uploads` 가 운영에서 503 으로 명확히 거절 (Vercel FS 는 읽기 전용)
> - `db:check` 의 User 검사가 전체를 세면서 픽스처 수를 기대해 실제 가입 1명에 깨지던 것(42/43)
> - `nexon db-snapshot` 신설 — DB 이전 검증용 기준선 (51모델 · 기간 · 무결성 6종)
>
> ### 검수 결과
> - production build **성공** · CSP 에 `unsafe-eval` **없음** · 보안 헤더 6종 전부 존재
> - production `next start` smoke 11개 route 전부 200
> - auth: 미인증 `/api/me` 401 · `/api/admin/*` 403 · 쿠키 httpOnly/lax/secure(prod)
> - `db:check` PASS · typecheck/lint/test/build PASS
> - 랭킹·리그 목록에 `real-` / `E2E-` / mock 시드 노출 **0건**
>
> ### 삭제하지 않은 것 (의도)
> - **E2E placeholder Player 7건** — 전부 실제 `MatchPlayerStat` 을 가진다.
>   지우면 경기 참가자가 사라진다. 랭킹 노출은 0건이라 위험을 감수할 이유가 없다
> - **`real-` 개발 클랜 4건** — 이미 `active=false`. 노출 경로만 막았다
>
> ### 미검수 (정직하게)
> - **모바일 viewport** — 세션 중 Chrome 창이 깨져(viewport 0×0) 확인 못 함
> - **fallback 마크 시각 확인** — 로직은 테스트로 고정, 눈으로는 미확인
> 둘 다 가오픈 직후 실기기에서 확인해야 한다
>
> ### 다음
> > `docs/GO_LIVE_CHECKLIST.md` 10장 STEP 1~5 순서대로.
> > managed PostgreSQL 생성 → pg_dump 이전 → Vercel 배포 → vercel.app smoke → 도메인

---


> ## ⬛ UI A~D 마무리 (2026-08-25 · D-146)
>
> **레이팅은 건드리지 않았다.** `packages/rating` · formula · replay 결과 전부 그대로다.
>
> | 항목 | 상태 |
> |---|---|
> | A. 클랜 상세 경기 펼침 = 완성형 상세표 | **완료** (원래 이미 공유 · 딜량 막대만 추가) |
> | B. 미등록·외부 클랜 fallback 구름 마크 | **완료** |
> | C. 스나이퍼/라이플 랭킹 분리 | **완료** (데이터 없으면 `집계 없음`) |
> | D. 공식 1/2부 등록 클랜만 공식 소속 표시 | **완료** |
>
> ### 공식 등록 클랜 판정 (단일 기준)
> `Clan.sourceClanId != null` — 3rd.supply 공식 레지스트리에서 이관된 **44개**뿐이다.
> 이름·slug 문자열로 추측하지 않는다. 개발용 `real-` 접두 클랜 4개도 공식이 아니다.
> 판정은 **서버**가 하고 (`isOfficialLeagueClan`), 클라이언트는 판단하지 않는다.
>
> ### 현재 / 과거 분리
> - **현재 화면**(프로필·랭킹·클랜원): 현재 소속 기준 — `toClanSummary`
> - **과거 경기**(기록실·매치 상세): **경기 당시 소속** 기준 — `matchTimeClanOf` +
>   `officialLeagueClanIds(leagueId)` 로 그 당시 등록 클랜이었는지 판정
> - 실데이터: match_time_clan 1,058건 중 공식 **779** / 외부 **279** (두 경로 모두 사용됨)
> - 현재 소속 기준: 공식 등록 **89명** / 미등록·무소속 **83명**
>
> ### 구현
> - `packages/ui/src/common/FallbackClanMark.tsx` — 인라인 SVG (검은 원 + 하늘색 구름).
>   외부 자산 아님. `ClanMark` 가 **마크가 비면 자동으로** 이걸 그린다 → 모든 화면에 일괄 적용
> - 서버가 미등록 클랜의 마크를 **비워서** 내려보낸다 (이름·slug 는 보존)
> - 계약 additive: `ClanSummary.is_official_clan` · `MatchTimeClan.is_official_clan` ·
>   `LeaguePlayer.sniper_rank/rifle_rank/...`
> - 무기 랭킹: `playerWeaponRankOf` (`LeaguePlayerWeaponStat.ratingDelta` 기준)
>
> ### 이번에 잡은 버그 2건
> 1. **무기 랭킹 "0명중 1위"** — 배치고사 선수를 모집단에서 빼면서 순위는 매기고 있었다.
>    본인이 모집단에 없으면 순위도 없다
> 2. **래더 미반영 경기의 클랜 점수가 "0점"** 으로 보였다 — 값이 없는 것(null)이므로 `알수없음`
>
> ### 검증 한계 (정직하게)
> - 기능 검증은 끝났다 — `get_page_text` 로 실제 렌더 확인 + API 응답 + 테스트 802건
>   확인한 것: `스나이퍼 집계 없음` / `라이플 집계 없음` / `소속 -` /
>   `비공식 경기`·`래더 미반영` 배지 **분리** / 5v5 는 래더 반영, 그 외 미반영
> - **fallback 마크의 시각 확인은 못 했다.** 세션 중 Chrome 창이 깨져
>   (viewport 0x0 · screenshot CDP 오류) 캡처가 불가능해졌다. 자산 자체는 사용자에게 전달함
> - 모바일 viewport 확인도 같은 이유로 못 했다
>
> ### 내가 직접 확인할 route
> 1. 공식 등록 클랜 선수 — `/league/supply/player/OBS-f234f1743622c0d10da68e20` (하연수담당일진 · Iatency-)
> 2. 외부·미등록 선수 — `/league/supply/player/OBS-dc37dbc824867181603a2e4c` (은호리움 · 소속 없음)
> 3. 이적 이력 선수 — **없다** (Beta 기간이 짧아 로스터 변경이 아직 없다)
> 4. 클랜 상세에서 펼칠 경기 — `/league/supply/clan/ddorr` → `260823233540000001` (5v5 · 래더 −29)
> 5. 무기 기록 있는 선수 — `/league/supply/player/NX-1935c05a1505ed2e540cd2efb797c560` (중사형 · 라이플 3판)
>    → 배치고사 중이라 `집계 없음` 으로 나온다. 정상이다
>
> ### 남은 TODO
> - fallback 마크 **시각 검수** (브라우저 복구 후)
> - 모바일 viewport 확인
> - `LeaguePlayerWeaponStat` 이 **stale** 하다 — 9건 전부 `ratingDelta 0` · `placement true`.
>   D-145 replay 가 무기 통계를 다시 만들지 않는다 (넥슨이 무기를 안 줘서 새로 쌓일 것도 없다).
>   무기 데이터가 생기면 그때 재집계 경로가 필요하다
> - 사전 정리: E2E placeholder Player 7건 · `real-` 접두 개발 클랜 4건

---


> ## ⬛ D-145 운영 이식 · Beta replay **완료** (2026-08-25)
>
> **레이팅 설계 논의는 여기서 끝난다.** 사양은 `docs/RATING_FINAL_SPEC.md` (D-145 FINAL LOCK).
> formula version **`sacloud-d145`**
>
> ### 운영에 들어간 것
> - `packages/rating` — 기준점 3000 · K 50 고정 · divisor 400 · floor 1000 · 제로섬
>   `delta = K x (actual - E) x m`, `m = ramp(h, 0.80 -> 0.86)` (이변은 만점)
>   신뢰도 `min(1, sqrt(games/150))` · 표시 `3000 + (내부-3000) x 신뢰도 x 3.5`
>   -> **승률 자격선** -> **활동 페널티** (이 순서 고정)
> - **official 게이트 폐기.** 정상 5v5 + 참가자 10명이면 전부 래더 대상
> - 제거: 가변 K · rewardCap · repeatDecay · lineupBlend · 승리배수 · minWinReward ·
>   클랜원 가중치(100/70/40/0) · 구식 lab 튜닝 도구 7개
> - 스키마 **추가만**: `internalRating` · `activityPenalty` · `lastRatedAt`
>   (+ LeagueClan `compositionScore`). `rating(Int)` 은 유지하되 의미가 **표시 점수**로 바뀜
>   migration `20260825090000_d145_rating_columns` (deploy 로 적용 · destructive 없음)
>
> ### Beta replay 결과 (`supply` · 시즌 0)
> 시즌 범위 109경기 중 **29경기 반영** · **새로 포함 24경기** · 선수 155 · 클랜 17
> 제외는 전부 5v5 아님 (5v4 20 · 5v1 19 · 5v2 18 · 5v3 14 · 4v1 6 · 3v1 2 · 1v1 1)
> 표시 점수 분포 **2,943 ~ 3,050** (Beta 는 1인당 최대 4경기라 신뢰도가 12~16%)
> 4000+ 인원 0명 — **모집단·경기량이 적어서다. 이것 때문에 식을 다시 튜닝하지 않는다**
>
> ### 검증 (전부 PASS)
> 결정적 replay 2회 동일 · idempotent 2회 동일 · NaN 0 ·
> 5v5 아닌데 반영된 경기 0 · 승률 48% 미만인데 4000+ 0 · 경기별 증감 합 0 (제로섬) ·
> 옛 공식 잔존 0 · official 게이트 잔존 0 · 클랜원 가중치 잔존 0
>
> ### 백업 / rollback
> `apps/worker/backups/rating/supply-d145-pre.json` (checksum `e16c100f49739bd2aa79579db1df8043`)
> 복원: `pnpm --filter @sacloud/worker nexon rating-restore --file <경로>`
> **replay -> restore 왕복으로 실제 복구 확인함.**
> 한계: 값은 되돌리지만 replay 가 새로 만든 행은 지우지 않는다 (재replay 하면 덮어써짐).
> `pg_dump` 는 이 환경에 없다 (embedded-postgres 미포함).
>
> ### 이번에 함께 고친 것
> - **CSP 가 개발 모드 하이드레이션을 막고 있었다** (D-136 부작용).
>   `unsafe-eval` 이 없어 react-refresh 가 죽고 **모든 클라이언트 화면이 스켈레톤에서 멈췄다.**
>   개발 모드에서만 열도록 고쳤다. 운영 빌드에는 들어가지 않는다.
> - UI 문구: "비공식 경기 · 래더 미반영" -> **비공식(라벨)과 래더 미반영(5v5 아님)을 분리**.
>   "클랜 래더 반영률 70%" 표시 제거 -> 구성 보정 안내로 교체.
>
> ### 알려진 상태
> - `pnpm db:check` 1건 실패 — `사용자 기대=42 실제=43`. **D-145 와 무관**한 기존 드리프트
>   (이전 검수에서 만든 계정). D-145 는 User 를 건드리지 않는다
> - 서버가 떠 있을 때 `adminApi`/`authAttack` 일부 테스트가 5s 타임아웃.
>   Next dev 의 라우트 최초 컴파일 지연이다 — 라우트를 예열하면 통과한다. 회귀 아님
> - incomplete 88건은 여전히 제외. 넥슨 할당량 회복 후 backfill -> 재replay
>
> ### 남은 UI TODO (이번 범위 밖 · 상태만 확인)
> - **A. 클랜 상세 경기 펼침** — `MatchCard` 를 쓰고 있다. 완성형 상세표인지 별도 확인 필요
> - **B. 외부 클랜 fallback 마크(검은 원 + 파란 구름)** — **미구현.** 관련 코드 없음
> - **C. 스나이퍼/라이플 랭킹 분리** — 무기별 컴포넌트는 있으나 선수 상세 카드 분리 확인 필요
> - **D. 공식 1/2부 등록 클랜만 공식 소속 표시** — **미구현.** 판정 코드 없음
>
> ### 다음 작업
> > UI 마무리 — 위 A~D. 레이팅은 더 논의하지 않는다.

---


> ## ⬛ 마지막 튜닝 검증 — **승인 대기** (2026-08-25 · PROPOSED D-145)
>
> **`docs/RATING_D145_PROPOSAL.md`** — 기준점 2500 후보 + 연속 신뢰도 + 억제 재조정 검증 결과.
> **FINAL SPEC 은 건드리지 않았다.** source of truth 는 여전히 D-143 이다.
>
> **권고: 기준점 3000 유지 · 배율 3.5 유지 · 신뢰도 √(g/150) · 억제 끝점 0.88 → 0.86**
> 바뀌는 것은 두 줄뿐이다.
>
> - **기준점 2500 은 비권고.** 선형 변환으로는 랭커 인원과 고점 희귀성을 동시에 못 맞춘다.
>   배율 5.0+ 면 4900+ 가 시즌마다 0.6~1.0명 (희귀성 붕괴),
>   배율 4.5 면 랭커가 13.8 → 8.0 으로 42% 감소 + 중간층 −150~−360점.
> - **신뢰도 √곡선**: 경계 한 경기 점프 **+236 → +12**. 150판 100% · 이후 증가 없음.
> - **억제 0.86**: 약팀 전승 4,774 → 4,684. 처음으로 강일정 55%(4,705)가 양학을 이긴다.
>   정직한 일정 점수는 변화 0.
>
> 권고안 실측: day30 4,410 / day60 4,596 / day90 4,462 (pop220 중앙값)
> day60 밴드 13.2/8.8/6.0/2.6/0.4/0.0/0.0/0.0 · SUPPLY-LIKE day60 4,312
>
> **미해결 (정직하게 남김)**: WARN1(day30 과열) · WARN2(day45 이후 정체)는
> 이번 변경으로 해결되지 않았다. 상위권은 day30 전에 이미 150판을 넘겨 신뢰도가 100%라
> 곡선을 바꿔도 시간 곡선이 **완전히 동일**하다. Elo 수렴의 성질이다.
>
> **다음**: 사용자 승인 → FINAL SPEC 2줄 수정 + D-145 기록 → packages/rating 이식

> ## ⬛ 시즌 시간축 검증 완료 (2026-08-24 · D-144)
>
> **`docs/RATING_TIMELINE.md`** — FINAL SPEC 을 그대로 3개월 운영했을 때의 시간 곡선.
> **FINAL SPEC 은 바꾸지 않았다.** 측정만 했다.
>
> **두 달차(day60) 1위 = 중앙값 4,498 (전체 36 run) · best estimate 약 4,450**
> day30 중앙값 4,476 · day90 중앙값 4,399 · day60 4900+ 는 25 run 중 0건
>
> 판정 **PASS (WARN 4건)** — WARN 은 승인 대기, 임의 수정 금지:
> 1. day30 이 이미 높다 (중앙값 4,517 · 최대 4,870)
> 2. 점수가 day45 에 사실상 끝난다 (day60~90 평평/하락)
> 3. 약팀 파밍이 시즌 초·중반 1위를 차지할 수 있다 (day30 4,737)
> 4. 신뢰도 경계 점프가 크다 (30/31 · 60/61 · 90/91 에서 최대 236점)
>
> 변경 권고(미실행): 신뢰도를 연속 함수로 · 억제 끝점 0.88 → 0.86.

> ## ⬛ 레이팅 설계 **최종 잠금** (2026-08-24 · D-142 → **D-143**)
>
> **최종 사양: `docs/RATING_FINAL_SPEC.md`** ← 다음 작업(운영 이식)의 source of truth
> 판정 근거: `docs/RATING_DESIGN_VERDICT.md` · 판정 **PASS 95/100**
>
> **운영 반영은 아직 하지 않았다.** `packages/rating` 은 여전히 1500 기준 구버전이다.
> 이번 작업에서 바꾼 것은 `scripts/rating-simulation` · tests · docs 뿐이다.
> 운영 DB · migration · raw/staging 은 **건드리지 않았다.**

### 최종 공식

```
개인  내부 = Elo(K=50, 기준 3000, 제로섬)
      단, 일방적 경기 억제:  h = 이겼으면 E, 졌으면 1-E
                            m = 1 (h<=0.80) → 0 (h>=0.88) 사이 선형
                            delta = 50 x (실제 - E) x m    ※ 이변(약팀 승)은 언제나 m=1
      표시 = 3000 + (내부 - 3000) x 신뢰도 x 3.5
             → 승률 자격선 적용 → 활동 페널티 차감   (이 순서를 지킨다)

클랜  점수 = Clan Elo(K=50) + 구성 보정(최근 20경기 · 상한 +50)
             → 클랜 자격선 적용 → 활동 페널티 차감
```

### 랭커 승률 자격선 (D-143 신규)

| 표시 점수 | 최소 시즌 승률 | | 클랜 점수 | 최소 승률 |
|---|---|---|---|---|
| 4000+ | **48%** | | 3150+ | 45% |
| 4300+ | 50% | | 3300+ | 50% |
| 4500+ | 52% | | | |
| 4700+ | 55% | | | |
| 4800+ | 58% | | | |
| 4900+ | 60% | | | |

자격 미달이면 그 밴드 아래로 내려가고, **부족한 승률 1%p 당 20점**(클랜 6점)씩 더 내려간다.
내부 Elo 는 건드리지 않는다.

### 확정 파라미터 (더 이상 논의하지 않는다)

| 항목 | 확정값 |
|---|---|
| 개인 K / 클랜 K | 50 / 50 |
| 기준점 / 바닥 | 3000 / 1000 |
| 퍼포먼스(KD·MVP) | **0%** |
| 일방적 경기 억제 | **0.80 ~ 0.88** ramp (이변은 만점) |
| 랭커 자격선 | **48%** 부터 · 밴드별 상향 · soft |
| 표시 배율 | **3.5** (선형 · percentile 앵커 없음) |
| 신뢰도 | 40/55/70/85/95/100% · 150판 100% · 이후 판수 보너스 없음 |
| 구성 보정 | 상한 **+50** · 최근 **20경기** |
| 개인 감점 | 4000+ 주-20 / 4300+ -30 / 4600+ -40 / 4800+ -50 / 4900+ -60 · 4000미만 없음 |
| 감점 회복 | 경기당 -8 (개인) · -5 (클랜) — **1판으로 초기화 불가** |
| 클랜 감점 | 7~13일 주-10 / 14~20일 -20 / 21일+ -30 |
| official 게이트 | **폐기.** 정상 5v5 는 전부 레이팅 대상 |

### 검증 결과 (9시즌 · 150/220/500명 x 시드 3개)

- 평균 실력 재현도 **0.9023** · FAIL 이상징후 **0건**
- **승률 48% 미만인데 4000+ 인 선수: 9시즌 모두 0명**
- 결정요인: 일정 감안 승리의 질 **0.960** > 승률 0.859 > 상대강도 0.466 > 판수 0.058
- KD 인과 기여 **0.000** (퍼포먼스 0% 이라 구조적으로 불가능)
- 밴드 등장: 4000 9/9 · 4300 8/9 · 4500 6/9 · 4700 1/9 · 4800 0/9 · 4900 0/9 · 5000 0/9
- 실험실: 최상위60% **5,076** · 최상위65% **5,125** · OUTLIER **5,536** (5000 돌파 가능)
- 약팀 600판 전승 **4,774** (역사적 영역 진입 불가)

### 남은 미확정

**0개.** 표시 배율만 실데이터 replay 후 한 번 확인한다 (미확정이 아니라 확인 항목).

### 다음 작업 (정확히 이것)

> `docs/RATING_FINAL_SPEC.md` 8장의 REMOVE/CHANGE/KEEP 대로 `packages/rating` 을 이식하고,
> 9장의 replay 계획대로 Beta 데이터를 재생한다. **replay 전에 스냅샷 백업이 먼저다.**
> 적용 순서(표시 → 자격선 → 감점)를 반드시 지킨다.

### 지금까지 고친 하네스 결함 3건 (D-142)

1. **#5** 상대 선택이 실제 라인업을 반영하지 않아 일정 강도 차이가 114점밖에 안 났다
2. **#6** 승패 주기와 상대 풀 주기가 공명해 유한 풀이 무한 풀보다 점수가 높게 나왔다
3. **#7** 경로 하나로 판정해 검증된 강자가 40판 신규에게 지는 결과가 나왔다 -> 25경로 평균

---


**작성 2026-08-21. 최종 갱신 2026-08-24 (Phase 20 — 후보 2안 검증 · 승률/상대강도 우선 · 잠수 감점).**
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

---

## N. Phase 15 — D-129 적용 · 라인업 팀 식별 보조 증거 (2026-08-24) ← **가장 최신**

> 결정: `docs/DECISIONS.md` **D-133** · 경위: `docs/WORKLOG.md`

### 현재 HEAD

`git log --oneline -3` 으로 확인한다.

```
feat(reconstruct) 3rd.supply 라인업을 팀 식별 보조 증거로 사용 (D-133)
fix(rating)       replay 가 저장된 팀 배정을 그대로 쓴다 + 검수 도구
docs              D-133 · WORKLOG · HANDOFF
```

### D-129 최종 결정 (= D-133)

**라인업은 "누가 어느 팀이었나"를 말해 주는 데만 쓴다.**

| | |
|---|---|
| 허용 | 진영(red/blue)과 각 진영의 **클랜** |
| 금지 | 라인업 `clan` 을 경기 당시 소속으로 (그건 현재 소속 · D-130) |
| 금지 | 라인업만으로 **참가자 생성** (k/d/a 가 없다) |
| 금지 | `rating_update` · `weapon` 을 사실값으로 |

**넥슨 우선.** 넥슨으로 양 팀이 정해지면 보조 증거를 보지 않는다.
쓰기 전에 넥슨 승패와 라인업 진영이 맞는지 검증하고, 한 명이라도 어긋나면 그 경기는 버린다.

### 복원한 경기 수 / before → after

```
incomplete   142 → 88     (54건 복원)
official      17 → 17     (변화 없음)
운영 Match    82 → 136
래더 반영 경기 16 → 17     (replay 일관성 버그 수정)
래더 반영 선수 56 → 58
경기 당시 소속 626 → 1,058 / 1,084 (97.6%)
conflict       0          (충돌 0 · 검증 불가 0)
```

새로 들어온 54건이 전부 비공식인 것은 **정상**이다 — 본클랜원 3명 미만(D-079)이라
기록실에는 보이고 래더에는 안 들어간다(D-080).

### 남은 문제 — 88건은 **세 가지가 막고 있다**

라인업이 알려 준 "빠진 선수" 216명을 넥슨에서 채우려다 멈췄다.

1. **넥슨 호출 한도** — HTTP 429가 **처음 관측**됐다(그동안 `[미확인]`).
   목록 99건 성공 후 계속 실패해서 **중단했다.** 우회하지 않는다
2. **`Player` 행이 없다** — 라인업에만 있는 선수는 DB에 없다.
   `deriveCurrentMembership` 은 클랜이 확정된 선수만 만든다(D-130).
   무소속·미등록 클랜 선수까지 만들지는 **정하지 않았다**
3. **`identity-link` 가 로스터를 요구한다** (D-109) — 위 선수들은 로스터가 없어
   178명 검토 · **연결 0** 으로 전부 보류됐다. 조건 완화는 정책 변경이다

즉 88건은 라인업을 안 써서 남은 게 아니라 **넥슨 쪽 실제 기록이 아직 없어서** 남았다.

### 다음 정확한 작업

1. **위 3번 결정** — `identity-link` 가 로스터 없이도 연결할 수 있게 할지 (D-109 완화).
   `guild_name` 근거는 이미 있다. **사람이 정한다**
2. **위 2번 결정** — 라인업 전용 선수의 `Player` 생성 여부
3. 넥슨 목록 수집을 **더 느린 속도로 나눠** 재개 (`--resume` 로 이어진다)
4. 그 뒤 `reconstruct --redo --lineup-evidence` → `rate` 재실행
5. 이후 **production readiness 점검 → 도메인 연결/외부 공개 준비**

### 주의사항 · 금지사항

- **HTTP 429 를 봤다.** 대규모 수집은 속도를 낮추고 나눠서 한다. 우회 금지
- 보조 증거는 **팀 이름표일 뿐**이다. 참가자를 만들지 않는다
- 라인업 `clan` 을 경기 당시 소속으로 승격하지 않는다 (D-130 · D-131)
- `rate` 는 저장된 진영 클랜을 그대로 쓴다. 여기서 팀을 다시 추론하지 않는다
- 래더 공식은 이번에도 **건드리지 않았다**
- raw/staging 삭제 없음 · `migrate dev` 미사용 · 터널 닫힘 유지

### 검증 결과

```
pnpm typecheck    통과       pnpm lint  통과
pnpm test         714 passed / 17 skipped  (신규 23건)
pnpm build        통과
pnpm nexon:check  16항목 전 항목 PASS
rate 2회 실행     결과 동일 (결정적 replay)
```

검수 도구 — `pnpm nexon explain-matches --limit 5` 로 경기별 근거를 사람이 읽을 수 있다.

### working tree 상태

clean.

---

## O. Phase 16 — D-109 완화 · 로스터를 신원 조건에서 제거 (2026-08-24) ← **가장 최신**

> 결정: `docs/DECISIONS.md` **D-134** (사용자 결정) · 경위: `docs/WORKLOG.md`

### 현재 HEAD

```
c07eb92 feat(identity) 로스터를 신원의 조건에서 뺀다 — 강한 넥슨 식별자 기준 (D-134)
```

### D-134 — 확정된 정책

```
신원 생성 조건   강한 넥슨 식별자 (필수)
로스터의 역할    본클랜원 / 용병 판정에만
```

**강한 넥슨 식별자** = `ouid` + **그 계정이 실제로 뛴 경기**(`NexonMatchObservation`).
닉네임 → ouid 만으로는 틀린 적이 있어서(D-051) 관측값을 요구한다.

**기존 선수와 잇는 근거** = 같은 경기 · 같은 닉네임 (D-132와 동일).
이을 곳이 없으면 **새 선수를 만든다** — 무소속·용병도 선수가 되고,
나중에 공식 클랜에 가입해도 `ouid` 덕분에 **같은 `Player` 행이 이어진다**.

유지되는 금지 사항 — fuzzy 매칭 금지 · 근거 갈리면 conflict · 선점된 선수 안 뺏음 ·
`--confirm` 없이 안 씀 · `linkReason` 에 사유 기록.

### 실행 결과

```
NexonIdentity   active 26 → 49  (기존 선수 연결 10 · 새 선수 13) · 충돌 0
로스터 없는 active 신원   0 → 15명     ← 완화가 실제로 동작한다
Player          1,742 → 1,755
재실행          연결 0 · 생성 0 (idempotent)

incomplete      88 → 88   (변화 없음)
official        17 → 17
래더 반영 경기   17 · 선수 58
```

### 남은 문제 — 이제 **정책이 아니라 호출 한도**다

나머지 155계정은 매치 목록을 못 받아 `no_activity` 로 보류됐다.

```
속도 2/s   → HTTP 429
속도 0.5/s → 여전히 HTTP 429
⇒ 초당 속도가 아니라 **키의 기간 할당량 소진**
```

이 세션에서 상세 747 + 신원 204 + 목록 ~150회를 썼다. 우회하지 않고 중단했다.

### 다음 정확한 작업

1. **할당량 회복 후** 목록 수집 재개 — 그대로 이어진다
   ```bash
   pnpm nexon:collect --all-identities --no-detail --modes "폭파미션" --resume
   pnpm nexon:backfill-observations
   pnpm nexon identity-link --league supply --confirm
   pnpm nexon:reconstruct --league supply --redo --lineup-evidence --limit 300
   pnpm nexon:rate --league supply
   ```
2. 그 뒤 incomplete / official 변화를 다시 재어 본다
3. 이후 **production readiness 점검 → 도메인 연결/외부 공개 준비**

### 주의사항 · 금지사항

- **HTTP 429는 기간 할당량이다.** 속도를 낮춰도 안 된다. 우회 금지 — 시간을 기다린다
- 신원은 **경기 기록이 있어야** 만든다. 닉네임만으로 만들지 않는다 (D-051)
- 근거가 없으면 기존 선수에 붙이지 말고 **새로 만든다** (fuzzy 금지)
- 로스터를 신원 조건으로 되돌리지 않는다 (D-134가 D-109를 대체)
- 래더 공식은 이번에도 건드리지 않았다
- raw/staging 삭제 없음 · `migrate dev` 미사용 · 스키마 변경 없음 · 터널 닫힘 유지

### 검증 결과

```
pnpm typecheck    통과 (0 errors)      pnpm lint   통과
pnpm test         723 passed / 17 skipped  (신규 9건)
pnpm build        통과
pnpm nexon:check  16항목 전 항목 PASS
identity-link     재실행 시 연결 0 · 생성 0 (idempotent)
```

### working tree 상태

clean.

---

## P. Phase 17 — 외부 공개 준비 (2026-08-24) ← **가장 최신**

> 상세: **`docs/PRODUCTION_READINESS.md`** (배포 구조 · env · DB 이전 · 도메인 · 체크리스트)
> 결정: `docs/DECISIONS.md` **D-135 ~ D-138**

### 현재 HEAD

```
592f762 fix(public) 무소속 선수 프로필 404 (D-135)
2b99148 fix(public) 기록실이 비던 계약 위반 + 보안 헤더 + 상태 점검 (D-136~D-138)
```

### 넥슨 할당량 — **아직 안 풀렸다**

**단 1회** 호출로 확인했다(무차별 재시도 금지 원칙대로).

```
GET /suddenattack/v1/id  →  HTTP 429 (OPENAPI00007)
```

88건 backfill 은 **실행하지 않았다.** 명령은 그대로 대기 상태다
(`PRODUCTION_READINESS.md` 8장에 그대로 있다). `--resume` 이라 언제든 이어진다.

```
incomplete 88 · official 17 · 래더 반영 경기 17  ← 전부 변화 없음
```

### production readiness 결과 — **코드 blocker 0**

점검 중 실제 결함 **3건을 찾아 고쳤다.**

| | 증상 | 원인 |
|---|---|---|
| D-135 | 무소속 선수 프로필 **404** (58명 중 14명) | D-134로 무소속 선수가 생겼는데 조회가 클랜을 필수로 봤다 |
| D-138 | 클랜 기록실이 **통째로 빈다** | `match_time_clan` 이 외부 클랜에 빈 문자열 id → 계약 검증 실패 → 목록 전체가 빈 배열 |
| D-136 | 보안 헤더 **0개** | 없었다 |

D-138은 API 는 200에 15건을 주는데 **화면만 비어서** 눈에 안 띄던 종류다.

```
스모크 22종 전부 200 · 응답 0.3초 미만 · 500 없음
선수 상세 44/58 → 57/58
클랜 기록실  "없습니다" → 경기 15건 · 마크 234개 로드
```

### 새로 생긴 것

- **보안 헤더** — CSP · XFO · nosniff · Referrer · Permissions · COOP · HSTS · `x-powered-by` off
- **`/api/health`** — db · collector(마지막 성공·24h 신규·실패율·429) · 공개 데이터.
  민감한 값 없음. 지금 응답은 `degraded`(429를 봤기 때문 — 정확하다)
- **`docs/PRODUCTION_READINESS.md`** — 배포 구조 · env 목록 · DB 이전 · 도메인 · 복구 절차 · 체크리스트

### 외부 공개를 막는 것 — **데이터 5건** (코드 아님)

1. E2E 자리표시자 `Player` **7건** (`E2E-` 접두사)이 공개 랭킹에 보인다
2. dev slug 클랜 **4건** (`real-` 접두사)이 공개 URL 에 노출된다
3. 게시판 최상단 글 제목이 **운영자 이메일** (실제 작성분이라 임의로 안 지웠다)
4. 관리자 계정 2개 — 운영자가 비밀번호를 새로 정해야 한다
5. 모바일 가로 스크롤 — `.pc-container` 가 **1120px 고정폭**(실측). **원본 재현이라 의도된 것**이지만
   인지하고 가야 한다. ※ 실제 모바일 뷰포트로는 확인하지 못했다 — 브라우저 도구의 창 크기 변경이
   탭 뷰포트에 반영되지 않았다. 고정폭 수치만 확인한 것이다. **실기기 확인은 공개 전 숙제**

### 배포 추천 구조

```
웹      Vercel (apps/web)
DB      managed Postgres (Neon / Supabase / RDS)
수집기  작은 VPS 또는 GitHub Actions cron  ← Vercel 부적합
```

`apps/worker` 는 1회 수집이 수백~수천 호출에 수십 분이라 서버리스 실행 시간에 안 맞는다.
**수집기는 반드시 한 곳에서만 돌린다** — 두 곳이면 서로 429를 유발한다(실측).

로컬 `embedded-postgres` 는 **개발 전용**이다(D-022). 운영에 쓰지 않는다.

### 다음 정확한 작업

1. 위 **데이터 5건 정리** (운영자 판단이 필요한 3·4번 포함)
2. managed Postgres 생성 → `PRODUCTION_READINESS.md` 4장대로 이관
3. Vercel 배포 (env 는 3장) · 수집기 VPS/Actions 이전
4. `/api/health` 를 업타임 감시에 등록
5. 도메인 연결 (5장)
6. 넥슨 할당량 회복되면 88건 backfill (8장)

### 주의사항 · 금지사항

- **429는 기간 할당량이다.** 속도를 낮춰도 안 된다. 무차별 재시도 금지 — 시간을 기다린다
- **`prisma migrate dev` 금지.** 운영 이전은 `migrate deploy` 만 쓴다
- `_prisma_migrations` 를 데이터 덤프에 넣지 않는다
- ID(`cuid`)·`sourceMatchId`·`sourcePlayerId`·`ouid` 를 새로 만들지 않는다
- **raw/staging 750건을 먼저 옮긴다.** 파생 데이터는 명령으로 다시 만들 수 있지만 raw 는 못 만든다
- 없는 식별자를 **빈 문자열로 있는 척하지 않는다** (D-138의 교훈). `null` 로 둔다
- 래더 공식·수집 로직은 이번에도 건드리지 않았다

### 검증 결과 (최종 · 빌드 후 서버 재기동 상태에서 재확인)

```
pnpm typecheck    통과 (0 errors)      pnpm lint   통과
pnpm test         729 passed / 17 skipped  (신규 6건)
pnpm build        Compiled successfully
pnpm db:check     전부 통과
pnpm nexon:check  16항목 전 항목 PASS
스모크 22종       전부 200 · 실패 0
보안 헤더         7종 전부 응답에 존재
/api/health       degraded (db ok · collector degraded · data ok)
                  → 429를 최근 24시간 안에 봤기 때문. **정확한 판정이다**
```

실화면 재확인 (프로덕션 빌드 · 서버 재기동 후)

```
클랜 기록실   경기 15건 · 비공식 배지 14 · "없습니다" 안 뜸
클랜마크      234개 중 234개 로드 · 깨진 것 0
```

### working tree 상태

clean.

---

## Q. Phase 18 — rating 설계 시뮬레이션 검증 (2026-08-24) ← **가장 최신**

> 판정: **`docs/RATING_DESIGN_VERDICT.md`** (사람이 쓴 결론)
> 근거 데이터: `docs/RATING_SIMULATION.md` (자동 생성 — 재실행하면 덮어써진다)
> 코드: `scripts/rating-simulation/`

### 무엇을 했나

**운영 코드도 운영 DB도 건드리지 않았다.** `packages/rating` 은 현행 1500 기준 그대로다.
"3000 기준 · 구성 보너스 +0/3/6/9/12" **제안 설계안**을 별도 구현으로 3개월 시즌 검증했다.

```bash
pnpm rating:simulate --seed 42 --runs 10 --players 200 --clans 100 --season-days 90
```

### 최종 등급 — **PASS WITH TUNING (74/100)**

뼈대는 옳다. 클랜래더 쪽에 구조적 문제가 셋 있다.

### 확인된 것 (핵심 가설 검증됨)

- **멸망전은 벌주지 않는다** — 반복 감쇠 없이 Elo가 정상 수렴 (후반 |delta| 28~38)
- **열빡은 탐지 없이 억제된다** — 같은 10명·같은 20경기에서
  고정팀 순증 240 vs 팀재편형 30. 팀을 섞으면 본클랜원 5.0 → 2.0
- **클1이 막히지 않는다** — 클랜 2위가 본클랜원 1.00 · 보너스 0으로 순수 Elo 진입
- **판수 박치기 차단** — 1000판 저실력 선수 220명 중 96위
- 실력 재현도 스피어만 **0.904** (10시드 평균 0.90)

### 심각한 문제 3개

1. **구성 보너스가 Elo를 이긴다** — clan-65: base 누적 **-1,762**, 보너스 +2,178 → 6위.
   top10 중 평균 2.4개가 base 음수, 보너스 기여 51%. **판수 많은 클랜이 유리**
2. **목표 rating 도달 불가** — 목표 4000+/4300±200 인데 실측 1위 **3,387**.
   K를 40→70 으로 바꿔도 3,384→3,398 (14점). **K로는 못 푼다**
3. **inflation 무제한** — 시즌당 +12,606점, 평균 클랜 3000→3128. 상한 없음

### 권고

| 항목 | 권고 |
|---|---|
| +0/3/6/9/12 | **값 유지 · 지급 방식만 `opponent-scaled`** (base 음수 2.4→0.2, 상관 유지) |
| K | **50** |
| 신뢰도 | **A (표시값만)** |
| 퍼포먼스 비중 | **±5%** (±10/15%는 정확도 안 오르고 포지션 편향만 선형 증가) |
| inflation | 시즌 종료 재센터링 필요 |
| 4000+ 체감 | **별도 결정** — Elo 분모·표시 배율·baseline 중 하나를 바꿔야 한다 |

### 만드는 과정에서 잡은 하네스 결함 2건

숫자를 바로 믿지 않고 분포를 확인하다 발견했다. 둘 다 고쳤고, 실력 재현도가 **0.43 → 0.90**.

1. `targetGames` 무시 — 1000판 선수와 40판 선수가 똑같이 350판을 뛰고 있었다
2. `opponentBias` 무력화 — 전원 평균 상대가 3014로 같았다 (클랜 전력이 출전 선수와 무관)

### 아직 검증 못 한 것

- **매치메이킹이 없다** — 상위 승률이 96/87/84%로 실제 리그보다 극단적이다.
  "승률 55~65%가 상위권"이라는 감각은 매치메이킹 있는 리그의 것이라 이 모델과 다르다.
  그래서 "정말 잘하는 사람이 top30에 드는가"는 **판정 보류**로 뒀다
- 시즌 간 이월 inflation · 이적 악용 · 개인↔클랜 상호작용 미검증
- 100 Monte Carlo 가 아니라 10 시드

### 다음 정확한 작업

1. 위 권고 3개(지급 방식 · inflation · 4000+ 스케일)에 대한 **사용자 결정**
2. 결정되면 매치메이킹 모드를 추가해 재검증
3. 그 뒤에야 운영 `packages/rating` 반영 — **지금은 반영하지 않는다**

### 주의사항

- `docs/RATING_SIMULATION.md` 는 **자동 생성물**이다. 손으로 고치지 말고 스크립트를 고친다
- 판정·결론은 `docs/RATING_DESIGN_VERDICT.md` 에 쓴다 (재실행해도 안 지워진다)
- 확정안 값(+0/3/6/9/12)을 **몰래 바꾸지 않는다.** 대안은 모드로 분리해 같은 시드로 비교
- 운영 rating 공식·운영 DB replay 는 승인 전까지 금지

### 검증 결과

```
pnpm typecheck   0 errors      pnpm lint  0
pnpm test        749 passed / 17 skipped  (시뮬레이션 회귀 20건 신규)
결정성           같은 시드 재실행 결과 일치 OK
```

### working tree 상태

clean.

---

## R. Phase 19 — 후보 1안 검증 (2026-08-24) ← **가장 최신**

> 판정: `docs/RATING_DESIGN_VERDICT.md` **부록 A** · 근거: `docs/RATING_SIMULATION.md` 17장

### 사용자가 정한 후보 1안

```
개인   내부 Elo K 50 · 퍼포먼스 ±5% · 신뢰도는 표시값에만 · 표시 배율로 점수판 생성
클랜   내부 Elo K 50 **순수 제로섬**만 래더에 반영
       구성은 누적 보너스가 아니라 **최근 20경기 평균 본클랜원 → 상한 100점 보정**
       최종 클랜 점수 = Elo + 구성 보정(0~100)
공통   반복 상대 감쇠 없음 (탐지만 · 자동 감점 없음) · official 게이트 없음
```

### 결과 — **PASS (87/100)**. 세 문제가 전부 해결됐다

같은 시드 5회 평균 (선수 220 · 클랜 100 · 90일)

| 지표 | 확정안 | **후보 1안** |
|---|---|---|
| 개인 실력 상관 | 0.906 | **0.916** |
| 클랜↔실제전력 상관 | 0.886 | **0.900** |
| **inflation 순증** | +16,165 | **0** |
| **top10 중 base 음수** | 3.4개 | **0.0개** |
| 클랜 평균 점수 | 3,164 | **3,011** (baseline 유지) |

보너스를 걷어내니 **두 상관계수가 모두 올랐다.**

### 표시 배율은 3.3이 아니라 **2.8을 권고**

표시값은 배율에 정확히 선형이라 재실행 없이 계산했다.

```
배율 2.8 → 1위 4,436 · 10위 3,902 · 중앙 3,050 · 4000+ 6명 · 4100+ 2명 · 4500+ 0명
배율 3.3 → 1위 4,692 · 4500+ 1명   ← "4500+ = 예외적" 자리를 매 시즌 채워 버린다
```

> **고정 상수는 위험하다.** 배율은 내부 스프레드에 곱해지는데 스프레드가 모집단 크기에 따라 변한다
> (선수 150명에선 3.3이 1위 4,495, 220명에선 4,692). **시즌 종료 시 "상위 0.5%가 4300이 되도록"
> 배율을 정하는 앵커 방식**을 권한다.

### 결정이 남은 것

1. **표시 배율** — 고정 2.8인가, 시즌말 앵커 방식인가
2. **구성 보정 상한** — 100은 클랜 Elo 스프레드의 1/5이라 Elo 100점 차를 뒤집는다.
   사용자 예시(3510 vs 3580)와 일치하지만 50~70으로 낮추면 더 보수적
3. **구성 창 크기** — 최근 20경기는 임의값이다. 10/30/50 비교는 안 했다

### 주의사항

- **운영 반영은 아직 하지 않는다.** `packages/rating` 은 현행 1500 기준 그대로다
- `docs/RATING_SIMULATION.md` 는 자동 생성물 — 손으로 고치지 말고 스크립트를 고친다
- 매치메이킹 미검증 한계는 그대로다 (부록 A-6)

### 하네스 수정 1건

클랜이 "본클랜원 5명으로 가겠다"고 해도 그 선수들의 목표 판수가 먼저 소진돼
용병으로 채워지고 있었다 — 최대 평균 본클랜원이 3.5에 그쳐 **구성 보정 검증 자체가 불가능**했다.
클랜 핵심 선수에게 클랜 일정만큼의 판수를 보장하도록 고쳤다 (최대 4.95, 구성 보정 최대 78).

### 검증

```
typecheck 0 · lint 0 · test 762 passed / 17 skipped (시뮬레이션 회귀 33건)
결정성 OK · 개인 이상 FAIL 0건
```

### working tree 상태

clean.

---

## S. Phase 20 — 후보 2안 검증 (2026-08-24) ← **가장 최신**

> 판정: `docs/RATING_DESIGN_VERDICT.md` **부록 B** · 근거: `docs/RATING_SIMULATION.md` 18장

### 최종 후보식 — **PASS (91/100)**

```
개인
  내부 Elo   K 50 · 제로섬
  퍼포먼스   ±2%          ← ±5% 에서 하향 (아래 이유)
  신뢰도     표시값에만 (1~30 40% … 150+ 100%, 150 이후 추가 없음)
  표시       display = 3000 + (내부-3000) × 신뢰도 × 3.3   (linear · percentile 앵커 없음)
  감점       내부 기준 tier — 3460↑ 주 −25 · 3395↑ −20 · 3300↑ −15 · 3210↑ −10
             3210 미만은 대상 아님 · 유예 7~14일 · 바닥 3000

클랜
  내부 Elo   K 50 · **순수 제로섬** (누적 보너스 없음)
  구성       최근 20경기 평균 본클랜원 → 상한 보정 (50~70 권고)
  최종       Elo + 구성 보정
  감점       14일 유예 후 완만하게 (개인과 다른 식)

공통  모든 정상 5v5 반영 · official 게이트 없음 · 반복 감쇠 없음(탐지만)
```

### **"승률/상대강도 >>> KD/MVP" 원칙 — 지켜진다**

| 설명변수 | 순위 상관 | 인과 몫 |
|---|---|---|
| **일정 감안 승리의 질** | **0.974** | — |
| 승률 | 0.919 | — |
| KD | 0.813 | **+0.004** |
| MVP율 | 0.213 | ≈0 |
| 판수 | 0.070 | — |

> **판정 기준 자체를 고쳤다.** 처음엔 raw 상관(KD 0.77)만 보고 FAIL 을 냈는데,
> 퍼포먼스 비중을 **0% 로 놔도 KD 상관이 0.761** 이었다. 잘하는 선수는 원래 KD 가 높다 —
> 상관은 인과가 아니다. **0% 대조군과의 차이**로 재도록 바꿨고, 인과 몫은 +0.004 다.

### 4900 / 5000 희귀성

```
9개 시즌(선수 150/220/500 × 시드 3)
4900+ 가 나온 시즌  1/9      5000+ 가 나온 시즌  0/9
1위 점수 범위       4,487 ~ 4,961
4000+ 비중          규모와 무관하게 5~9%
```

`convex` 변환은 4900+ 3명·5000+ 2명을 만들어 희귀성과 충돌 → **linear 채택.**

### 잠수 감점

활동자 평균 손실 **0** · 감점 대상 3% · 실력 상관 영향 0.001.
같은 실력·판수 대조 — U(36일 잠수) 4,131 15위 vs V(계속 활동) 4,406 5위.

### 구성 보정

상한 50/70/100 · 창 10/20/30/50 — **어느 조합에서도 base 음수 0**.
창 크기는 결과에 거의 영향 없음. 상한이 낮을수록 실력 재현도가 조금 높다(0.918 vs 0.913).

### 아직 미확정인 파라미터 (사용자 결정)

1. **표시 배율 3.3** — 유지할지. 모집단 3배면 1위가 ~470점 오른다
2. **구성 보정 상한** — 50 / 70 / 100 (정확도 vs 유도 강도)
3. **감점 폭** — 36일 잠수에 35점뿐이다. 더 세게 할지
4. **퍼포먼스 ±2%** — 0% 로 완전히 뺄지

### 주의사항

- **운영 반영은 아직 하지 않는다.** `packages/rating` 은 현행 1500 기준 그대로다
- 매치메이킹이 없어 상위 승률이 88~95% 로 극단적이다. 밴드 절대값은 운영에서 재보정 필요
- `docs/RATING_SIMULATION.md` 는 자동 생성물 — 스크립트를 고친다

### 하네스 결함 2건 (고침)

1. 전원이 시즌 끝까지 뛰어서 **감점이 한 번도 발동하지 않았다** → `activeUntil` 추가
2. 경기 시각이 활동 구간을 무시해 잠수가 재현되지 않았다 → 참가자 활동 구간 안에서 뽑도록 수정

### 검증

```
typecheck 0 · lint 0 · test 777 passed / 17 skipped (시뮬레이션 회귀 48건)
결정성 OK · 개인 이상 FAIL 0건
```

### working tree 상태

clean.
