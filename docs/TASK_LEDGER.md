# TASK_LEDGER — 작업 대장

감독관이 유지하는 **단일 작업 목록**이다. 사용자가 시킨 일을 하나도 빠뜨리지 않고 적고,
상태는 **에이전트의 말이 아니라 저장소·DB 실측**으로만 바꾼다.

- 최초 작성: 2026-08-28 07:40 (KST)
- 마지막 갱신: 2026-08-29 09:40 (KST)
- 상태 값: `완료` / `진행중` / `대기` / `막힘`
- **근거 칸에 확인 가능한 숫자나 파일 절대경로가 없으면 그 줄은 검증되지 않은 것이다.**
  "완료했다고 함" 은 근거가 아니다.

---

## 0. 지금 당장 알아야 할 것 (한 줄 요약)

> **B9 해소됨.** `bf83348` + `9c48313` 둘 다 `origin/main` 에 올라갔고 Vercel 배포 Ready 다.
> 감독관이 운영 URL 로 재측정해 **B3 · B5 · B6 · B4 가 실제로 고쳐진 것을 확인했다** (10절).
>
> **운영에서 눈에 보이는 미해결 결함은 현재 없다.**
> 남은 것은 진행중 작업(`B14` 폼그래프) · 미착수(`B11`) ·
> 사용자 회신 대기(`B17` 배틀로그 좌표) · `B8` 시크릿 등록 · 열린 질문(6절)이다.
>
> 지금 미커밋인 것은 **2차 커밋 이후 새로 생긴 작업분**이다.

---

## 1. 대장

### 완료로 보고됐던 항목 — 감독관 재검증 결과

| 번호 | 요구사항 (사용자 표현 그대로) | 상태 | 근거 (감독관 실측) | 담당 | 다음 행동 |
|---|---|---|---|---|---|
| A1 | D-150 3rd.supply 미수입 624경기 감사 | **완료** | `a681ca4` 가 `HEAD` 의 조상임을 `git merge-base --is-ancestor` 로 확인. `docs/DECISIONS.md:3161` D-150 존재 | — | 없음 |
| A2 | Vercel 운영 배포 | **완료 (최신 커밋 반영됨)** | `https://sacloud-web-softgw01-8957s-projects.vercel.app/api/leagues` → HTTP 200, 대룰리그 포함 응답. 다만 배포된 코드는 `origin/main = ba5aeab` (B9 참조) | — | 없음 |
| A3 | 시즌7 전량 미러링 "하나도 빠짐없이" | **완료** | 운영 DB 실측: `supply 130,022 · sanply 202,727 · daerule 29,697` = **362,446**. `MatchPlayerStat 3,658,446행` | — | 없음 |
| A4 | 3부리그 → **열산리그** 이름 변경 (slug `sanply` 유지) | **완료** (감독관이 잔여 1건 수정) | 운영 DB `League.name = 열산리그`. **단 GNB 라벨이 `3부리그` 로 남아 있었다** → `packages/ui/src/site-config.ts:32` 를 `열산리그` 로 고침 (2026-08-28 07:36) | 완료 | `bf83348` 에 포함되어 배포됨 |
| A5 | 두 리그 동시 소속 클랜 경기를 양쪽 리그에 다 기록 | **완료** | 운영 DB: 2개 이상 리그에 기록된 `sourceMatchId` = **34,322건**. `docs/DECISIONS.md:3458` D-155 | — | 없음 |
| A6 | 클랜랭킹이 원본과 안 맞던 문제 | **완료** | 운영 DB 랭킹 클랜 수: `supply 1부 22 · 2부 27` / `daerule 1부 15 · 2부 30` / `sanply 1부 96`. `docs/DECISIONS.md:3549` D-157 | — | 배포됨 |
| A7 | D-151~D-158 문서화 | **완료** | `docs/DECISIONS.md` 3226 · 3303 · 3341 · 3402 · 3458 · 3504 · 3549 · 3606 행에 D-151~D-158 전부 존재 | — | 없음 |
| A8 | 스냅샷 감사 테스트 3건 실패 → 통과 | **완료** | `npx vitest run apps/worker/src/__tests__/snapshotAuditSafety.test.ts` → **8 passed (8)**, 50.32s (2026-08-28 07:36 실행) | — | 없음 |

### 진행 중 / 남은 항목

| 번호 | 요구사항 (사용자 표현 그대로) | 상태 | 근거 (감독관 실측) | 담당 | 다음 행동 |
|---|---|---|---|---|---|
| B1 | 모바일 최적화 — "자고 일어났을 때 모바일 최적화 완료돼 있고 서플라이랑 90% 이상 똑같게" | **사용자 피드백 반영 중 (13:26~)** | 사용자 에이전트가 07:12 이후 **40분간 저장소 전체에 한 줄도 안 씀** → 07:55 감독관 인계 → 완료. 검증: **vitest 162/162 · typecheck 8/8 · eslint(16파일) 0건**. 완료 화면: 홈(로고 `max-w-full`+검색바 전체폭) · 게시판 목록 · 프로필 헤더 4종 · 참여중인 리그 카드 · 기록실 본문 2단→세로 쌓기. **"90% 똑같게" 는 검증 불가 — 아래 주의 참조** | 감독관 배정 에이전트 (완료) | 잔여 2건: ①`RecordPanels.tsx` 블록 **내부** 여백 → B2 에 인계함(09:40) ②검색 드롭다운 `최근검색/즐겨찾기` → **미구현, 의도적** · **13:26 회귀 수정**: 모바일 루트 폰트를 16px 로 올렸던 것을 **14px 로 되돌렸다**. 원본이 커 보인 것은 루트가 커서가 아니라 화면이 좁아 상대적으로 크게 보인 것이었고, 16px 로 올리자 rem 기반 값이 전부 약 14% 커져 **원본보다 큰 화면**이 됐다. 원본은 PC·모바일 모두 루트 14px 이다(D-009 실측) |

> **⚠ B1 검증 한계 — 원본을 더 이상 볼 수 없다.**
> 모바일 User-Agent 로 `https://3rd.supply/` 요청 시 **HTTP 405 + AWS WAF "Human Verification" CAPTCHA** 가 돌아온다.
> `CLAUDE.md` 3-A 5번(CAPTCHA/봇차단 우회 금지)에 따라 **우회하지 않았다**(요청 1회로 중단).
> 따라서 이번 모바일 작업은 **원본 대조 없이** 저장소의 기존 관측 기록(`styles.css` 주석 ·
> `LeagueSubNav.tsx` · `RankTable.tsx` · `UI_PARITY_AUDIT.md` 부록 A)만 근거로 했다.
> **정정(12:20)**: "원본을 전혀 볼 수 없다" 는 **과장이었다.** 막힌 것은 **HTML 사이트**(레이아웃·색·간격)뿐이고,
> **데이터 API 는 앱 헤더(D-153 경로)로 여전히 읽힌다** — 실제로 D-161 의 원본 `상세정보` 실측이 그 경로로 이뤄졌다.
> 따라서 **표시 항목·순서·값·포맷은 지금도 원본과 대조할 수 있다.** 판정 불가한 것은 **시각적 레이아웃**이다.
> **"서플라이랑 90% 이상 똑같은지"(시각) 는 현재 아무도 판정할 수 없다.**
> 사용자가 보낸 모바일 스크린샷 10장이 유일한 대조 수단이며, 그 이미지는 감독관 세션에 없다.
>
> **`최근검색 / 즐겨찾기` 드롭다운은 일부러 만들지 않았다.** 저장소 전체에 `최근검색` 문자열이
> 하나도 없고 원본을 볼 수 없어, 없는 기능을 지어내면 `CLAUDE.md` 3장 3번(임의 기능 추가 금지)
> 위반이 된다. 원본 관측이 되면 그때 추가한다.
| B2 | 매치 상세 UI "하나도 틀림없이 똑같이" | **완료 (감독관 독립 검증)** | 11시간 정지였던 것을 07:45 재기동 → 08:10 완료. **감독관이 직접 재실행해 확인**: `npx vitest run packages/ui/src/__tests__/` → **17파일 / 162 테스트 통과**, `matchWeaponLabel` 이 `'스나'`/`'라플'` 반환(`matchDetailView.ts:136-140`), `COMPOSITION_NOTICE`·`ladderNotice`·`NOT_RATED_INLINE` **소스에서 사라짐**. 10개 항목 중 **내가 고침 4**(무기 축약·팀바 선레드/선블루 항상표시·MVP `★`·설명문구 제거+`미반영`→`알수없음`), **이미 되어 있었음 6**(10명 킬/데스·딜량막대·래더점수 셀·닉네임 링크·기본 클랜마크·평균킬 `9.6킬` 포맷) | 완료 | **D-159 로 문서화함**(감독관). 미배포 → B9 · **모바일 인계분도 완료** — `RecordPanels.tsx` `max-md:`/`.mobile-scroll-x` **11곳**, `MatchCard.tsx` **25곳** 적용 확인 |
| B3 | 검색 기능이 제대로 작동 안 함 (`Huwho` 넣었더니 **선수가 아니라 게시글 같은 것**이 나옴) | **완료 — 운영 확인 완료** | **① 왜 0건인가**: 운영 실측 `/api/players/search/Huwho` → `[]`, `huwho` → 1건, `HUWHO` → `[]`, `Uwho` → `[]` = 대소문자 구분. 같은 운영 DB 에 Prisma `mode:'insensitive'` 로 직접 질의하면 `Huwho`/`HUWHO` 모두 1건 → **DB·Prisma 문제 아님, 배포된 코드가 옛것.** **② 왜 게시글이 보였나**: `apps/web/app/page.tsx:54-56` — 정확일치 실패 시 **화면 전환 없이 홈에 머문다**(원본 동작). 홈 화면이 곧 `실시간 인기게시글`(`HotPostList`)이라 사용자 눈에는 "게시글이 나온" 것으로 보인다. **두 현상이 같은 원인이다.** 수정: `search.ts` 의 6개 호출부 전부 `ci()`/`ciEquals()` 로 교체 + `packages/mock/src/store.ts` 도 같은 규칙으로 맞춰 Mock↔실제 응답 일치 유지 | 완료 | **배포 후 운영 재측정: `Huwho`·`HUWHO` 모두 1건 반환** (10절). 종결 |
| B4 | 개인랭킹 닉네임 옆 클랜마크가 안 나온다 | **완료 — 운영 확인 완료** | 사용자가 10:37~10:56 에 세 리그 집계를 운영에 반영했다. 감독관 재측정: 운영 `LeaguePlayer.clanId` supply **2,635/10,388** · sanply **3,719/15,312** · daerule **820/4,157** · `Player.clanId(3rd.supply)` **4,422/21,107**. 운영 개인랭킹 1위 `근면` 의 `clan` 이 **`des`per@do.`** 로 채워진 것 확인 — **`clan: null` 해소.** 규칙은 D-160. 100% 가 아닌 것은 결함이 아니다 — 수집 파일 자체가 선수의 71% 를 무소속으로 준다 | 완료 | 없음 |
| B5 | 평균킬이 전부 `0.0킬` | **완료 — 운영 확인 완료** | `apps/web/lib/server/queries/leagues.ts:373` 에 `OR: [{redRatingUpdate:{not:null}}, {origin: MIRROR_ORIGIN}]` 적용됨. 운영 DB 실측 — 3rd.supply 경기 362,446건 중 `redRatingUpdate != null` 은 **0건**(수정 전 분모 0 = `0.0킬` 원인 확정). 수정 후 분모/평균킬: 근면 2,150→**8.3** · chococake 3,065→**8.5** · 으어어어 1,189→**11.1** · kinder 768→**8.6** · mozz'a' 976→**9.1** | 완료 | 배포 후 운영 응답: `kill_per_match` **8.29 / 8.46 / 11.09** (10절). 종결 |
| B6 | 성능 | **해결 — 운영 확인 완료** | 실측 완료 — 아래 **7절** 참조. 핵심: 응답시간의 **90% 이상이 미국↔서울 왕복**이다. `/api/maps` 는 DB 실행 **0.1ms** 인데 HTTP **1.38s**. 회귀식 `≈ 0.6s + 질의당 0.75s`. `vercel.json` 의 `icn1` 은 **미커밋 = 미적용** | 완료 | 배포 후: `ranks/clans` **4.44s→0.33s(13배)** · `/api/leagues` **2.32s→0.63s** · `/api/health` **11.5s→0.33s(웜)**. `health` 미해명 건은 **리전이 원인이었음이 확인돼 종결**. 남은 선택지: `matchCountByPlayer` 부분 인덱스(9절) |
| B7 | UI 차이 45건 (`docs/UI_PARITY_AUDIT.md`) | **심각도 상위 10건은 거의 완료 / 전부 미배포** | 감독관 코드 실사(2026-08-28 07:55). ①클랜원 탭 → `apps/web/lib/profileTabs.ts:22-29` 3탭 복원 ②클랜 사이드 `상세정보` → `packages/ui/src/record/RecordPanels.tsx:264,296` ③`전적갱신`+`최근갱신` → `apps/web/app/league/[leagueSlug]/clan/[clanSlug]/layout.tsx` (`useRefresh`·`renewedAt`) ④`즐겨찾기` → `packages/ui/src/profile/LeagueRecordHeader.tsx:28` ⑤무기별 기록 블록 **제거됨**(옳았다) → `RecordPanels.tsx:232`. **단 `포지션` 줄 제거는 오판이었다 — D-161 로 되살렸다(아래 정정)** ⑥브레드크럼 → `LeagueRecordHeader.tsx:58,142,150` (`{리그명} - {N}부리그 - {순위}위`, 배치고사면 순위 조각 생략) ⑦GNB 리그 3개 → `packages/ui/src/site-config.ts:30-34` ⑧`Beta Season` 배지·안내박스 **제거됨** → `LeagueSubNav.tsx:73`, `home/layout.tsx:42` ⑨인기게시판 글쓰기·검색폼 **숨김** → `packages/ui/src/board/boardCopy.ts:30` ⑩게시판 소제목 → `boardCopy.ts:12`. 평균킬 `9.6킬` 포맷 · `미반영`→`알수없음` · `- / - / -` 도 **08:10 완료**(B2, D-159) | 상위 10건 완료 | 45건 전체 재감사는 **미착수**(`UI_PARITY_AUDIT.md` 는 상위 10건만 요약). 전부 미커밋이라 운영에 없다 → B9 |
| B8 | 실시간 증분 동기화 — "새로 쌓이는 기록들도 전부 반영" | **코드 완료 / 시크릿 등록만 남음** | `.github/workflows/supply-incremental.yml` 209줄. cron `0,30 * * * *`, `concurrency`+`cancel-in-progress:false`, `timeout-minutes:55`. `--dry-run` 검증 요청 **0건**, 인식 건수 130,022/29,697/202,727 DB 와 일치. **저장소는 public 이다** — 감독관이 `GET api.github.com/repos/stockerboy/sacloud` → `"private": false` 확인 | 사용자 | **남은 것은 `DATABASE_URL` 시크릿 등록 하나뿐** |

> **⚠ B8 남은 것은 시크릿 하나다.** (2026-08-28 정정 — 이전에 적었던 "Actions 무료 한도 초과" 는 **틀렸다.**
> 저장소가 public 이라 GitHub Actions 는 **무제한 무료**다. 결제할 것이 없다.)
>
> 1. **`DATABASE_URL` 시크릿 등록** — 운영 DB 비밀번호를 외부에 등록하는 일이라 **사용자만** 한다.
>    장시간 대량 작업이라 transaction pooler(6543)보다 **session pooler / 직결(5432) 권장**.
> 2. `schedule` 은 **기본 브랜치에서만** 돈다 — 워크플로가 `origin/main` 에 올라가 있어야 한다.
>
> 커밋 이력 전수 검사 결과 **실제 자격증명 노출 0건**(전부 자리표시자)이라 public 이어도 안전하다.
>
> 부수 수정 2건: ①`--dry-run` 이 실제로는 `/leagues/{slug}` 를 1회 호출하고 있었다 —
> `CLAUDE.md` 7장("요청을 한 건도 보내지 않는다")이 깨져 있던 것을 고쳤다.
> ②`--seen-from-db` 신설 — 미러 파일이 **2.07GB** 라 CI 러너에 못 올린다. `Match.sourceMatchId` 로 대신한다.
>
> 미해결 위험: 집계 실측을 **운영 DB 에 대고 재 본 적이 없다**. 세 리그 합쳐 55분 timeout 을 넘을 수 있다.
| B9 | 커밋·배포 | **완료 (2차까지)** | `bf83348`(모바일·검색·평균킬·서울리전) + `9c48313`(무소속리그 5티어·병영수첩 주소 검색·매치 UI 대조) 둘 다 **`origin/main` 반영 확인**(감독관 `git log origin/main`). Vercel 배포 Ready. 지금 미커밋인 것은 **그 뒤에 새로 생긴 작업분** | 사용자 (완료) | 신규 작업분은 다음 커밋에 |
| B10 | 지난시즌(시즌1~7) 기록 가능한가 — "작업하던 거 계속 하면서 대답만 해" | **조사 완료 → 수집 진행중** | 원본 요청 21건으로 확인. **경기 단위는 2024-05-24 에서 끊긴다**(커서 대조 실측: `next__240524235109124001` → 6건 / `next__240524220309124001` → **0건, next=null**). = 시즌7 시작일. `season=` 파라미터는 **무시**되고 `/leagues/{id}/seasons` 는 404. 반면 `/leagueplayers/{id}/seasons` · `/leagueclans/{id}/seasons` 는 **200 을 준다**. 교차검증: MiraGe. 사이트 표기 `4229승 4523패` = 우리 미러 집계 **완전 일치**, supply 49클랜 중 32클랜 완전일치 · 나머지 오차 0~8 | **수집 착수됨** (사용자 측) | 아래 **8절** 참조. 10:19~ `supplySeasons.ts` · `supplySeasonsImport.ts` · `packages/db/ops/season.ts` · `SeasonTable.tsx` 작업 중. **감독관이 `.gitignore` 에 `supply-seasons-*` 를 추가**해 수집 파일이 커밋되는 사고를 막았다 |
| B11 | BattleLog — 탈주자 K/D 복원 + 무기 분류 | **대기** | D-114 파서 존재. 통합 안 됨 | **미배정** | B2 · B7 정리 후 착수 |
| B12 | **무소속리그** (티어 편성 · `nolink`) — 사용자 지시 신규 기능 | **구현됨 / 미배포** | 감독관이 발견해 대장에 추가(누락돼 있었다). `packages/db/ops/independentLeague.ts` · `apps/web/app/league/[leagueSlug]/setting/page.tsx` · `packages/ui/src/league/divisionLabel.ts` · 회귀 테스트 `apps/web/tests/independentTier.test.ts`. `CLAUDE.md` 에 CLI(`nexon independent-league`) 등재됨. **D-165**(번호 정정 후) | 사용자 에이전트 | `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 **명시적 예외**로 문서에 근거가 적혀 있다. 커밋·배포 필요 |
| B13 | **선수 포지션 복원 + 선수 프로필 수집**(`position`·`note`·`renewed_at`) | **구현됨 / 미배포** | 감독관이 발견해 대장에 추가. `UI_PARITY_AUDIT` 6-2 에서 **원본에 없다고 판단해 지웠던 `포지션` 줄이 사실은 원본에 있었다** — 되살렸다. `packages/db/ops/supplyPlayerProfiles.ts` · `apps/worker/src/jobs/supplyPlayerProfiles*.ts` · `packages/contract/src/entities/detail.ts`. **D-161** | 사용자 에이전트 | ⚠ 내가 앞서 "B7 #5 포지션 블록 제거 = 완료" 로 보고했던 것이 **뒤집혔다**. 아래 주의 참조 |
| B14 | **폼 그래프** — 최근매치 도넛 제거 → 6개월 월별 킬뎃 꺾은선 + 최근 10경기 판정 문구(`하락중`/`꾸준함`/`급상승중`) | **진행중** | 사용자 지시 신규 기능. 담당 배정됨 | 사용자 에이전트 | `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 **예외**이므로 결정 문서에 근거를 남겨야 한다 |
| B15 | **증분 동기화 5분** — 사용자: "5분 내로 뜨면 좋겠다" | **구현 완료 / 미배포** | 병목 2개를 다 고쳤다. ①적응형 폴링 — 훑는 클랜 190 → **평균 27.3**/사이클, `/clans/show` 190건 제거 ②집계 **증분**(전수는 하루 1회 별도 워크플로로 분리). 워크플로는 **한 실행 안에서 5분 간격 6사이클**을 돈다(cron `*/5` 는 GHA 정시성 때문에 안 쓴다). **요청 795→502/시간(−37%)** · **새 경기 94.7%가 5분 이내**(중앙 2.6분) · **최장 미조회 24.0시간** · **전수=증분 체크섬 3리그 전부 일치 + idempotent PASS**. **D-168** | 사용자 에이전트 | `.github/workflows/supply-incremental.yml` 개편 + `supply-rollup-full.yml` 신설. **배포는 B8 과 같은 `DATABASE_URL` 시크릿 하나에 걸려 있다.** 이번에 CI 결함 2건도 고쳤다 — 빈 작업공간에서 `--adaptive` 가 클랜을 0개 고르던 것, 큰 창에서 증분이 OOM 으로 죽던 것 |
| B16 | **UI 크기** — 모바일이 원본보다 큼 | **완료** | 모바일 루트 폰트 **16px → 14px** 회귀 수정(`packages/ui/src/styles.css`). 원본이 커 보인 것은 루트가 커서가 아니라 화면이 좁아 상대적으로 크게 보인 것이었고, 16px 로 올리자 rem 값이 전부 약 14% 커져 **원본보다 큰 화면**이 됐다. 원본은 PC·모바일 모두 루트 **14px**(D-009 실측). 접힌 매치 카드의 `1부리그 알수없음` 줄도 모바일에서 감췄다(원본에 없다) | 완료 | 미커밋 · 후속 커밋 2건: `ef45159`(모바일 kda 크기 + 카드 오른쪽 `알수없음` 을 실제 값으로) · `c84f9b6`(상세정보를 최상단으로 · 마크 1.5배 · 클랜 줄 가운데 정렬). 전부 `origin/main` 반영 |
| B18 | **점수를 실력순으로 · 잠수는 내려가게** (시즌0 우리 공식 반영) | **완료 — 운영 반영·확인 완료 (2026-08-29)** | 커밋 `8e7ea42` 가 `origin/main` 에 있고 운영 DB 에 반영됐다. 운영 실측(읽기만): 감점 대상 **773명** · 라플 TOP10 **전원 마지막 경기 6/18~6/30** · 3~5월에 멈춘 선수는 표시 **3000 · 무기 증감 0** · 운영 API `ranks/players?weapon=rifle` 1위가 로컬 replay 와 **동일**(4619 / +1623). 백테스트 14,408경기에서 v2 가 v1 대비 전 항목 우세(클랜 53.72→54.06 · 개인 57.48→58.22 · 판수↔순위 상관 0.155→0.113). 결정 문서 **D-170~D-173**(커밋 `82d5b82` 에서 작성) | 완료 | ⚠ `SACLOUD_RATING_OWNER=formula` 가 빠지면 30분마다 도는 rollup 이 점수를 원본으로 되돌린다(두 워크플로에 이미 있다). 무기 랭킹 테스트 6건·스냅샷 감사 1건이 이 변경으로 깨져 있던 것도 `82d5b82` 에서 고쳤다 |
| B17 | **경기별 포지션** — 배틀로그 좌표로 경기마다 `2층`/`바닥`/`숏`/`리베`/`스나` 표시 | **길은 뚫렸다 · 재료 대기 (2026-08-29 갱신)** | ~~"사용자 회신 대기"~~ 는 낡은 기록이었다. 좌표는 **이미 확인됐고**(`kill_x/kill_y` 실측 · `docs/PLAYER_TRAITS_SPEC.md`) 정확도 85%까지 측정돼 있었다. 다만 **코드·데이터가 저장소에 하나도 없었다.** 2026-08-29 에 채웠다 — 구역 지도 회수(`f3950c9`), 원문 표 `BarracksBattleLogRaw` + `nexon battlelog-import`(멱등), 판정기 `packages/nexon/src/position.ts` + `nexon position-build`, 테스트 29건. **D-174** | 사용자 | 남은 것 2개: ①**정답 20명 라벨**(파일로 안 남았다) → `data/barracks/position-labels.json` ②**배틀로그 원문 재수집**(브라우저로만 가능 · 서버는 403). 둘 다 들어오면 판정은 바로 돈다 |

---

## 2. 항상 지켜야 하는 제약 (사용자 지시 — 모든 담당에게 전달)

1. **광고는 절대 복원하지 않는다.** 원본 모바일에 쿠팡·유튜브 광고가 크게 있어도 자리도 여백도 만들지 않는다 (`CLAUDE.md` 4장).
2. **사용자에게 승인 요청하지 않는다.** 사용자는 자고 있다.
3. 모르는 규칙을 지어내지 않는다 → `[미확인]` 주석.
4. PC 레이아웃을 깨뜨리지 않는다.
5. `prisma migrate dev` 금지 · DB reset 금지 · 운영 DB 직접 **쓰기는 사용자만** 한다.
6. **Chrome 브라우저 도구(`mcp__claude-in-chrome__*`) 사용 금지** — 무한 대기로 10시간 정지 전례.
7. **dev 서버 의존 검증 금지** — 수집 중에는 요청당 10~30초.
8. 모든 셸 명령에 `timeout` 을 건다.

---

## 3. 멈춤(stall) 점검

**판정 기준**: 담당 파일 mtime 이 30분 이상 안 바뀌었는데 상태가 `진행중` 이면 의심.

```bash
git status --short --porcelain | sed 's/^...//' \
  | while read f; do [ -f "$f" ] && echo "$(stat -c '%y' "$f" | cut -c1-16) $f"; done \
  | sort -r | head -20
```

### 2026-08-28 07:40 점검

| 작업 | 최근 파일 변경 | 경과 | 판정 |
|---|---|---|---|
| B1 모바일 | `packages/ui/src/league/RankTable.tsx` 07:12 | 28분 → **40분** | **정지 확정 → 07:55 감독관이 인계** |
| B3/B4 쿼리 | `apps/web/lib/server/queries/search.ts` 07:23, `packages/mock/src/store.ts` 07:24 | 16분 | 정상 |
| B6 성능 | `packages/db/ops/_perf_b6.mts` 07:36 | 4분 | 정상 |
| B2 매치상세 | `packages/ui/src/record/matchDetailView.ts` 08-27 20:20 | **11시간** | **정지였음 → 07:45 담당 배정** |
| B7 UI 차이 | `docs/UI_PARITY_AUDIT.md` 08-27 21:23 | **10시간** | 실사 결과 상위 10건 중 8건은 **이미 구현돼 있었다**(미커밋). 남은 2건은 B2 담당에 포함 |

> 07:41 의 `[정지의심] B2-record` 알림은 **오탐**이다. 담당 에이전트를 07:45 에 띄웠고
> 감시의 첫 표본이 07:41 이라 아직 쓴 파일이 없었을 뿐이다.

> ### ⚠ 감독관 보고 정정 (2026-08-28 12:15)
> 내가 08:00 에 **"B7 #5 포지션/무기별 기록 블록 제거 = 완료"** 라고 보고했다. **절반이 틀렸다.**
> `UI_PARITY_AUDIT` 6-2 가 `포지션` 줄을 "원본에 없다" 고 판정한 것 자체가 오판이었고,
> 나는 그 판정을 **코드에 그렇게 적혀 있다는 이유로 그대로 옮겨 적었다.** 원본을 직접 확인하지 않았다.
>
> 실제: 원본 `상세정보` 에 `포지션` 줄이 **있다**(래더 바로 아래). 감사가 못 본 이유는
> **값이 있는 선수에게만 그 줄이 나오기 때문**이다 — `null` 이면 `-` 도 `알수없음` 도 아니고 **줄째로 사라진다**(D-099·D-106).
> 표본 선수들이 전부 `null` 이었다.
>
> **무기별 기록** 블록을 뺀 것은 옳았다(원본에 없는 개념). 잘못은 그와 함께 원본에 있는 줄까지 지운 것이다.
> 두 `포지션` 은 다른 것이다 — 원본은 **선수가 직접 설정하는 프로필 값**(`A 숏` 같은 맵 포지션, 숫자 코드로 옴),
> 우리가 만들었던 것은 **무기별 경기 수를 세어 계산한 값**(`스나이퍼`/`라이플`/`멀티`). 후자는 지운 게 맞다.
>
> **교훈**: "코드 주석에 제거했다고 적혀 있다" 는 원본 대조의 근거가 아니다. B7 의 나머지 항목도
> 같은 방식으로 확인했으므로 **동일한 오판이 더 있을 수 있다.** 45건 전체 재감사가 필요한 이유다.

### 2026-08-28 08:01 점검

| 작업 | 최근 파일 변경 | 판정 |
|---|---|---|
| B1 모바일(인계) | `packages/ui/src/home/SearchBar.tsx` · `HotPostList.tsx` · `apps/web/app/page.tsx` 08:01 | **정상 — 홈 화면 작업 중** |
| B2 매치상세 | `packages/ui/src/record/*` 07:44~07:47 | **완료** |
| B8 스케줄러 | `.github/workflows/supply-incremental.yml` 07:57, `apps/worker/src/cli.ts` 08:00 | 정상 |
| B4 clanId | `packages/db/ops/supplyRollup.ts` 08:00 (`clanId` 42회 언급) | **정상 — 사용자 에이전트 살아 있다** |
| B3 검색 | `search.ts` 07:23 / `store.ts` 07:24 이후 정지 | **정지 아님 — 작업이 끝난 것이다.** 6개 호출부 전부 `ci()`/`ciEquals()` 로 교체 완료, Mock 도 동기화됨 |

> **교훈**: mtime 정지 = 죽음이 아니다. **끝난 것과 멈춘 것을 코드 내용으로 구분해야 한다.**
> B3 은 `git diff` 로 변경이 완결됐는지 확인해 `완료` 로 판정했다.

### 감시 방식 교체 (2026-08-28 14:50)

처음에는 **구역별로**(모바일 / 쿼리 / 매치상세) 30분 무변화를 감시했다. **오탐이 계속 났다.**
작업이 그 구역을 끝내고 `apps/worker` · `packages/db/ops` 로 옮겨 가면, 감시는 그 이동을
보지 못하고 "정지" 라고 불렀다. 실제로 14:43 알림 때 저장소는 14:35 까지 활발했다.

**교훈: 구역 단위 mtime 은 "끝난 것"과 "멈춘 것"을 구분하지 못한다.**

바꾼 감시 기준:

1. **저장소 전체가 30분 무변화** 일 때만 정지로 본다 (`apps` · `packages` · `docs` · `.github` 전부).
   한 구역이 조용한 것은 정상적인 작업 이동이다.
2. **좀비 dev 서버 감시 추가** — 3000번이 `LISTENING` 인데 8초 무응답이면 경고한다.
   12:44 에 **26시간 멈춰 있던 dev 서버**가 테스트 7건 실패와 에이전트 정지를 만들었다(D-021 재발).
   같은 사고를 자동으로 잡으려는 것이다.
3. 구역이 조용할 때는 **`git diff` 로 변경이 완결됐는지 보고** "완료" 와 "정지" 를 가른다.
   (B3 검색이 이 방법으로 "정지 아님, 끝난 것" 으로 판정됐다.)

### 알려진 정지 원인과 대책

| 원인 | 증상 | 대책 |
|---|---|---|
| Chrome MCP 도구 무한 대기 | 에이전트가 응답 없이 10시간 정지 | 모든 지시문에 **Chrome 도구 금지** 명시. 화면 검증은 `curl` 로 HTML/JSON 확인 |
| dev 서버 응답 대기 | 수집 중 요청당 10~30초 → 타임아웃 | dev 서버 의존 검증 금지. 프로덕션 URL 또는 DB 직접 질의로 검증 |
| 운영이 옛 커밋 | 고친 것이 화면에 안 보임 → "아직 안 됐네" 로 오판 | **B9** 를 최우선으로 처리 |

---

## 4. 파일 담당 구획 (충돌 방지)

| 구역 | 담당 | 비고 |
|---|---|---|
| `packages/ui/src/layout/**`, `packages/ui/src/league/**`, `packages/ui/src/styles.css`, `apps/web/app/league/**` | B1 모바일 에이전트 (사용자 소유) | 다른 에이전트 접근 금지 |
| `apps/web/lib/server/queries/**`, `packages/mock/src/store.ts`, `packages/db/ops/supplyRollup.ts`, `Player.clanId` 계열 | B3/B4/B5 에이전트 (사용자 소유) | 다른 에이전트는 **읽기만** |
| `packages/ui/src/record/**`, `packages/ui/src/common/format.ts` | B2 에이전트 (감독관 소유) | 반응형 클래스는 손대지 말라고 지시함 |
| `.github/workflows/**`, `apps/worker/src/**` | B8 에이전트 (감독관 소유) | |
| 측정 전용, 파일 수정 없음 | B6 에이전트 (감독관 소유) | 임시 스크립트 `packages/db/ops/_perf_*.mts` 는 끝나면 삭제 |
| 조사 전용, 파일 수정 없음 | B10 에이전트 (감독관 소유) | |
| `docs/TASK_LEDGER.md` | 감독관 전용 | |
| `packages/ui/src/site-config.ts` | 감독관 (A4 잔여분 처리 완료) | |

---

## 5. 사용자가 직접 해야 하는 것

1. **`DATABASE_URL` 시크릿 등록** (B8) — 운영 DB 비밀번호를 외부에 등록하는 일이라 사용자만 한다.
   이것 하나면 증분 동기화가 돌기 시작한다. (결제 문제는 **없다** — 저장소가 public 이다.)
2. **`B17` 배틀로그 스니펫 회신** — `packages/db/legacy/barracks-sniff-snippet.js` 로 요청 경로를 잡아 줘야
   경기별 포지션이 진행된다. 수집은 **브라우저만 가능**(서버 403)하고 하루 440경기라
   자동화하려면 사용자 PC 러너가 필요하다.
3. **운영 DB 쓰기** — 감독관과 그 에이전트는 읽기만 한다.
4. **다음 커밋·push** — 2차 커밋 이후 작업분(B14·B15·B16 등).
5. **모바일 스크린샷** — 시각 대조는 사용자 육안이 유일한 수단이다(원본 HTML 은 WAF).
   감독관에게도 주면 항목 단위 대조표를 만들 수 있다.
6. **사용자가 직접 띄운 에이전트 관리** — 감독관 목록에 보이지 않는다.

---

## 6. 지시 대기 중인 열린 질문 (감독관이 임의로 정하지 않았다)

| # | 내용 | 근거 | 왜 물어보는가 |
|---|---|---|---|
| Q1 | 운영 API 가 클랜마크를 `https://static.3rd.supply/marks/...` 로 **그대로 물고 있다** | `/api/leagues` · `/api/clans/search/e2stro` 응답의 `mark.bg` / `mark.front` | `CLAUDE.md` 3장 4번(원본 자산 복사 금지) 저촉 여부 + 원본 서버가 죽으면 우리 화면의 마크가 전부 깨진다. 방침 없이 건드리지 않았다 |
| Q2 | 게시판 이름이 `3부게시판` 으로 남아 있다 | `packages/ui/src/board/boardCopy.ts:12` (원본 실측값) | A4 로 **리그**는 `3부리그` → `열산리그` 가 됐다. 게시판 이름도 따라가야 하는지, 원본 관측값을 지켜야 하는지 정해지지 않았다 → `[미확인]` |
| Q4 | 접힌 매치 카드의 상태 배지 `래더 미반영`(`NOT_RATED_BADGE`) 을 남길 것인가 | `packages/ui/src/record/officialCopy.ts:32` | 인라인 표기는 `알수없음` 으로 통일했으나(D-159), 이 배지는 매치 상세 표의 값 칸이 아니라 기록실 카드의 **상태 배지**다. `래더 알수없음` 으로 바꾸면 틀린 말이 된다. 원본 표기는 `[미확인]` |
| Q5 | MVP 표기 모양 `★` 이 맞는가 | `packages/ui/src/record/MatchCard.tsx:542-550` | `docs/UI_PARITY_AUDIT.md` 7장에서 원본 경기 상세 펼침 관찰에 **실패**해 원본 모양을 모른다 → `[미확인]` |
| Q6 | ~~증분 동기화를 어디서 돌릴 것인가~~ **해소됨 (2026-08-28)** | `GET api.github.com/repos/stockerboy/sacloud` → `"private": false` | **감독관이 틀렸던 항목이다.** 저장소가 public 이라 GitHub Actions 는 무제한 무료다. 결제 결정이 필요 없다. 남은 것은 `DATABASE_URL` 시크릿 등록 하나뿐이고 그건 사용자만 한다 |
| Q7 | 모바일 "90% 이상 똑같게" 를 **무엇으로 판정할 것인가** | **해소되는 중 — 사용자가 직접 대조하고 있다** | `packages/ui/src/styles.css` 13:26 변경 주석: *"사용자가 원본 화면과 나란히 비교해 지적했다 — 'UI 가 너무 크다'"*. 즉 **시각 판정을 사용자가 육안으로 수행 중**이다. 감독관의 자동 판정 수단은 여전히 없다(HTML 은 WAF) |
| Q3 | B4 `clanId` 채움률의 **목표치** | **답 나옴 — 100% 가 아니라 ~29% 가 천장이다** | D-160 실측: supply 는 **최신 경기에 클랜이 있는 선수가 2,978/10,324(28.8%)** 뿐이다. 그중 `Clan` 표에서 찾은 것이 2,635 → **달성 가능치의 88%**. 나머지는 클랜 행이 없어서 안 쓴 것이고, 지어내지 않는 게 맞다(D-160). → 완료 판정 기준은 "100%" 가 아니라 **"최신 경기에 클랜이 있는 선수 대비 몇 %"** 로 잡아야 한다 |

---

## 7. B6 성능 실측 결과 (2026-08-28, 운영 URL · 각 5회 중앙값)

측정 대상은 **현재 운영**(미국 리전, `icn1` 미적용 상태)이다.
`DB실행` 은 운영 DB `pg_stat_statements` 에서 읽은 **서버가 그 SQL 을 도는 데 쓴 시간**이다.

| 엔드포인트 | 운영 HTTP | Prisma 왕복 | DB 실행 | 설명 안 되는 시간 |
|---|---|---|---|---|
| `/api/maps` | 1.38s | 1 | **0.1ms** | 1.38s |
| `/api/players/search/huwho` | 1.23s | 1 | ~0.03ms | 1.23s |
| `/api/leagues` | 2.32s | 3 | 0.8ms | 2.32s |
| `/api/leagues/supply` | 2.80s | 5 | ~1.5ms | 2.80s |
| `/api/leagues/supply/ranks/clans?division=1` | 4.44s | 5 | ~1.5ms | 4.43s |
| `/api/leagues/supply/matches/{id}` | 5.52s | 7 | ~20ms | 5.50s |
| `/api/leagues/supply/ranks/players` | 5.91s | 6 | **578ms** | 5.33s |
| `/api/clans/lpcrew/leagues` | 6.22s | ~11 | ~2ms | 6.21s |
| `/api/health` | **11.5s** | 1 | 212ms(웜) | **~11.3s 미해명** |

### 판정

1. **리전 + 왕복 수가 90% 이상이다.** 회귀: `총시간 ≈ 0.6s + (질의 1건당 0.75s)`.
   질의 1건 0.75초는 미국↔서울 RTT(~0.18s)의 4배다 — pgbouncer transaction mode +
   `connection_limit=1` 이라 Prisma 가 prepared statement 캐시를 못 써 질의마다
   Parse/Bind/Execute/Sync 를 새로 왕복하는 것으로 보인다.
   → **`icn1` 배포만으로 `ranks/clans` 4.44s → 0.3~0.5s 예상.**
2. **`connection_limit=1` 이라 코드의 `Promise.all` 이 병렬로 돌지 않는다.**
   지금 병렬처럼 보이는 코드는 **전부 사실상 순차**다. (`apps/web/app/api/infos/route.ts:25`,
   `records.ts:325·348·378·431·478`)
3. **질의 자체가 느린 곳은 딱 하나** — `matchCountByPlayer`
   (`apps/web/lib/server/queries/leagues.ts:360`). 운영 평균 **578ms**, 최대 4,856ms.
   `EXPLAIN` 상 범인은 `Match` **Seq Scan 130,120행 / Rows Removed 235,462 / 652ms**.
   B5 에서 넣은 `OR origin='3rd.supply'` 조건이 인덱스를 못 타는 것이다.
   **B5 의 정확성 수정은 옳다. 다만 인덱스가 같이 필요하다.**
4. **`/api/health` 11.5s 는 미해명이다.** 왕복 1회, DB 실행 212ms 로 설명이 안 된다.
   감독관 재측정 **13.7 / 11.3 / 12.3초**(3회 전부 재현). 응답 본문의
   `publicMatches 362,582` · `publicLeagues 3` 이 운영 DB 와 일치하므로 **DB 는 같다.**
   원인 확정에는 **Vercel 함수 로그**가 필요하다 → 사용자만 볼 수 있다.

### 제안 인덱스 (하나도 만들지 않았다 — 문안만)

```sql
-- (A) 개인랭킹 matchCountByPlayer 의 Match Seq Scan 제거. 효과 제일 큼 (578ms → 60~120ms 예상)
--     주의: 단순 ("leagueId", origin) 복합 인덱스로는 안 된다.
--     플래너가 매칭률을 39%로 추정해 Seq Scan 을 고른다(실측 확인). 부분 인덱스여야 한다.
CREATE INDEX CONCURRENTLY "Match_ladder_by_league_idx"
  ON "Match" ("leagueId", "id")
  WHERE "redRatingUpdate" IS NOT NULL OR origin = '3rd.supply';

-- (B) 닉네임 부분일치 (Player 23,026행 Seq Scan 41ms → 1~3ms)
--     기존 btree "Player_name_idx" 는 ILIKE '%x%' 에 못 쓴다. icn1 이후 이게 그 화면 최대 항목이 된다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY "Player_name_trgm_idx" ON "Player" USING gin (name gin_trgm_ops);
```

**인덱스가 불필요하다고 확인된 곳** (만들지 말 것): `LeagueClan`·`LeaguePlayer` 랭킹은 이미
`LeagueClan_leagueId_division_rating_idx` / `LeaguePlayer_leagueId_rating_idx` 를 제대로 타고 있다
(실행 0.1~1.2ms). 매치 목록의 `redLeagueClanId/blueLeagueClanId OR` 도 BitmapOr 로 11ms.
`Clan.active` 조인 Seq Scan(495행, 0.3ms)도 무시해도 된다.

### 고쳐야 할 N+1 · 중복 왕복 (위치만 — 아직 아무도 안 고쳤다)

| 우선 | 위치 | 문제 | 실측 |
|---|---|---|---|
| 1 | `apps/web/lib/server/queries/clans.ts:131-132` | `getClanLeagues` 가 리그 행마다 `clanRankOf` → `leagues.ts:471`·`:473` 로 **행당 2왕복**. 리그 4개면 8왕복 | 6.22s |
| 2 | `apps/web/lib/server/queries/players.ts:89-90` | `getPlayerLeagues` 동일 패턴 (`leagues.ts:579`·`:584`) | 3.47s |
| 3 | `apps/web/lib/server/queries/leagues.ts:289` · `:386` | `getClanRanks`/`getPlayerRanks` 가 라우트의 `resolveLeagueId`(`leagues.ts:153`)와 **같은 `league.findUnique` 를 중복** 실행 | 라우트당 ~0.75s |
| 4 | `apps/web/lib/server/queries/matches.ts:426` · `:548` · `:447` · `:475` · `:509` | `loadLeagueClanContext` 순차 + `leagueId` 만 얻으려는 선행 `findUnique` | 6.14s |
| 5 | `packages/db/prisma/schema.prisma` | Prisma 중첩 `select` 가 관계 하나당 왕복 1회. `getLeague`(`leagues.ts:91`) 는 **응답 769바이트에 5왕복** | — |

> 두 함수(`clans.ts` · `players.ts`) 주석에 "리그 수가 소수라 N+1이 문제되지 않는다" 고 적혀 있다.
> **왕복 1회가 0.75초인 지금 환경에서는 그 전제가 깨졌다.** `icn1` 배포 후 다시 판단해야 한다.

---

## 8. B10 조사 결과 — 지난시즌(시즌1~6) 기록 (2026-08-28, 원본 요청 21건)

**답: (b) 시즌 최종 스냅샷만 가져올 수 있다. 경기 단위는 불가능하다.**

| 무엇 | 가능한가 | 근거 |
|---|---|---|
| 시즌1~6 **경기 단위** (참가자·K/D/A·딜량·경기별 `rating_update`) | **불가** | 원본 API 가 2024-05-24 이전을 주지 않는다. 커서 대조로 확인 — floor 가 자른 게 아니다 |
| 시즌1~6 **선수별** 최종 순위·모집단·승패·킬뎃 | **가능** | `/leagueplayers/{id}/seasons` → 200. 근면: `시즌6 rank 140/6934, 218승 173패, 3468킬 3197데스` — `docs/LEGACY_MIGRATION.md:90` 화면 실측값과 **완전 일치** |
| 시즌1~6 **클랜별** 최종 순위·모집단·부리그·승패 | **가능** | `/leagueclans/{id}/seasons` → 200. MiraGe. 시즌6~1 전부 반환 |
| 시즌1~4 의 승/패·킬/데스 **원시값** | **없음** | `win=null lose=null`, 비율만 남아 있다. **역산하지 않는다** |
| 시즌1~6 **래더 점수(rating)** | **없음** | 어느 응답에도 없다 |
| 탈퇴자·해체 클랜의 과거 시즌 | **영구 불가** | 아래 제약 참조 |
| `sanply` 리그에 과거 시즌이 있는가 | **[미확인]** | 클랜 표본 2개 모두 빈 배열. 시즌7부터 생긴 리그일 가능성 — 표본이 적어 단정 못 함 |

### 치명적 제약 — 과거 시즌 인원을 **열거**할 수 없다

지난시즌은 오직 **현재 리그에 등록된** `leaguePlayerId` / `leagueClanId` 로만 뒤진다.
`/leagueplayers/{id}` 단건은 404(역방향 조회 없음)이고, `/leagues/{id}/ranks/players` 는
`player.id` 만 주고 `leaguePlayerId` 를 주지 않는다. 과거 시즌 랭킹 목록 엔드포인트는 없다.

| 시즌 | 원본 모집단 | 우리가 도달 가능한 풀 |
|---|---|---|
| 시즌6 supply | 6,934명 | 시즌7 경기에 등장한 supply 선수 **10,330명** |
| 시즌5 supply | 24,987명 | 위와 같음 |

→ 시즌5·6 은 상당 부분 덮이지만 **시즌1~4 는 커버리지가 크게 떨어진다.**
실제 교집합 비율은 `[미확인]` — 재려면 실수집이 필요하다.

### 하려면 필요한 작업량

- 새 잡 1개(`apps/worker/src/jobs/supplySeasons.ts`) + CLI 서브커맨드. `supplyClient.ts` 재사용, 엔드포인트 2개 추가
- 요청 수: supply 만 약 **20,700건**(클랜 49 + 선수 10,330×2), 3개 리그 전부면 약 **60,000건**
- 소요: 현재 설정(간격 130ms · 동시 10)으로 supply 30~60분, 3리그 1~2시간. 경기 상세 36만 건 받던 것보다 작다
- 적재: 선수는 기존 `LegacyPlayerSeason` 테이블이 거의 그대로 맞는다(`finalRating` 은 `null`, **역산 금지**). 클랜은 `LegacyClanSeason` **신설 필요**
- **사용자 승인 사항** — D-153 과 같은 `SP-APP-*` 헤더 경로를 쓴다

### 문서 갱신이 필요한 기존 기록

`docs/MIGRATION_GAPS.md` 는 "과거 시즌 최종 기록 = 등급 B, 운영자 협조 외 없음"으로 적혀 있다.
그건 **2026-08-20 판정**이고 그때 막힌 것은 HTML 사이트(WAF)였다.
D-153(2026-08-27)으로 연 API 경로에서는 지난시즌 엔드포인트가 **200 을 준다.**
→ 이 판정은 갱신되어야 한다. (감독관이 임의로 고치지 않았다)

---

## 9. B9 커밋·배포 준비 (감독관이 대신 커밋하지 않았다 — 실행은 사용자)

### 안전 점검 결과 (감독관이 직접 확인)

| 항목 | 결과 |
|---|---|
| 운영 DB 자격증명 노출 | **안전.** `packages/db/.env.production.local` 은 `.gitignore:16` 의 `.env.*.local` 로 무시된다 (`git check-ignore -v` 확인) |
| 추적 중인 비밀 파일 | **없음.** `git ls-files` 결과 `.env.example` 3개뿐 |
| 대용량 파일 | **없음.** 100KB 초과는 `docs/DECISIONS.md`(200KB) · `docs/HANDOFF_CURRENT.md`(106KB) 문서 2개뿐 |
| 미러 수집 원본(수십~수백 MB) | **커밋 대상 0건.** `.gitignore` 에 `supply-mirror-*.jsonl` 등이 추가돼 있다 |
| 마이그레이션 | `packages/db/prisma/migrations/20260827180000_d155_match_per_league/migration.sql` 1개. **운영 DB 에는 이미 적용돼 있다**(다중리그 34,322건이 실제로 동작 중) |

### 커밋 전에 할 것

1. **에이전트가 전부 끝난 뒤에 시작해라.** 지금도 파일이 쓰이고 있다 (3절 점검표로 확인).
2. `pnpm verify` (typecheck + lint + test) 를 **전체로 한 번** 돌려라.
   감독관이 확인한 부분 결과: `packages/ui` 테스트 **162/162 통과**,
   `apps/worker` 스냅샷 감사 **8/8 통과**, `pnpm typecheck` 8개 패키지 통과.
   단 이건 B1 모바일 작업이 끝나기 **전** 시점의 값이다. 다시 돌려야 한다.

### 제안 커밋 분할

> `packages/ui/**` 는 B1(모바일)과 B2/B7(원본 대조)이 **같은 파일에 섞여 있다.**
> 억지로 쪼개면 중간 커밋이 깨진다. **UI 는 한 덩어리로 커밋하는 것을 권한다.**

| # | 범위 | 경로 |
|---|---|---|
| 1 | 배포 설정 · 리전 고정 | `apps/web/vercel.json` `apps/web/next.config.ts` `apps/web/tsconfig.json` `.gitignore` |
| 2 | 미러링 수집 · 다중리그 · 집계 | `apps/worker/**` `packages/db/**` `packages/contract/src/entities/match.ts` `apps/web/tests/matchPerLeague.test.ts` |
| 3 | 서버 질의 (검색 대소문자 · 평균킬 분모 · 공개범위) | `apps/web/lib/server/queries/**` `packages/mock/src/store.ts` |
| 4 | 화면 (모바일 + 원본 대조) | `packages/ui/**` `apps/web/app/**` `apps/web/lib/profileTabs.ts` |
| 5 | 증분 동기화 스케줄러 | `.github/workflows/supply-incremental.yml` |
| 6 | 문서 | `docs/**` |

```bash
# 예시 — 1번 커밋
git add apps/web/vercel.json apps/web/next.config.ts apps/web/tsconfig.json .gitignore
git commit -m "perf(deploy): Vercel 함수를 서울 리전(icn1)으로 고정 (D-151)"
# ... 2~6 반복 후
git push origin main
```

### 정리 대상 1건

`packages/db/ops/_qprod.mts` 는 운영 DB 현황을 찍어 보는 **임시 진단 스크립트**다
(자격증명은 안 들어 있고 `.env.production.local` 을 읽기만 한다).
커밋해도 위험하지는 않지만 저장소에 남길 물건은 아니다. **삭제하거나 `.gitignore` 에 넣어라.**

### 배포 후 반드시 재측정할 것

| 확인 | 명령 | 지금 값 → 기대값 |
|---|---|---|
| 검색 대소문자 | `curl .../api/players/search/Huwho` | `[]` → **1건** |
| 평균킬 | 개인랭킹 화면 | `0.0킬` → `8.3` `8.5` `11.1` 등 |
| 리전 | `curl -w "%{time_total}" .../api/leagues/supply/ranks/clans?division=1` | `4.44s` → **0.3~0.5s** |
| GNB 라벨 | 화면 | `3부리그` → `열산리그` |

---

## 10. 배포 후 운영 실측 (2026-08-28 09:5x, 커밋 `bf83348` 배포 반영 후)

감독관이 **운영 URL 에 직접 요청**해 잰 값이다. 예측치가 아니라 실측이다.

| 항목 | 배포 전 | 배포 후 | 판정 |
|---|---|---|---|
| **B3** `/api/players/search/Huwho` | `[]` | **1건**(`huwho`) | **해결** |
| **B3** `/api/players/search/HUWHO` | `[]` | **1건** | **해결** |
| **B5** 개인랭킹 `kill_per_match` | `0.0` | 근면 **8.29** · chococake **8.46** · 으어어어 **11.09** | **해결.** 감독관이 DB 로 예측한 8.3 / 8.5 / 11.1 과 일치 |
| **B6** `ranks/clans?division=1` | 4.44s | **0.33 / 0.30 / 0.34s** | **해결. 약 13배.** 예측(0.3~0.5s)대로 |
| **B6** `/api/leagues` | 2.32s | **0.63s** | **해결. 약 3.7배** |
| **B6** `/api/health` | 11.5s (원인 미해명) | **3.90s(콜드) / 0.33s(웜)** | **해결 + 원인 규명.** 미해명 10초의 정체는 **미국 리전**이었다. 별도 버그가 아니었다 |

### 아직 남은 것 — B4

개인랭킹 응답의 `clan` 이 **1~4위 전부 `null`** 이다.

```json
{"rank":1,"player":{"name":"근면"},"clan":null,"kill_per_match":8.29,"rating":3432}
```

→ 닉네임 옆 클랜마크가 안 나오는 원인이 화면이 아니라 **API 응답에 클랜이 비어 있는 것**임이
운영에서 확인됐다. `LeaguePlayer.clanId` 채우기(B4)가 끝나야 해결된다.

### `/api/health` 미해명 건은 종결

7절에서 "왕복 1회 · DB 실행 212ms 로 설명 안 되는 ~10초"라고 적었고
**Vercel 함수 로그가 필요하다**고 했다. 리전 이전만으로 11.5s → 0.33s(웜)가 됐으므로
**로그 조사는 불필요하다.** 원인은 리전이었다.

---

## 11. 사고 예방 기록

| 시각 | 무엇을 막았나 | 조치 |
|---|---|---|
| 2026-08-28 07:36 | A4(3부리그→열산리그)가 **GNB 라벨에서 누락**돼 있었다. 운영 DB 는 `열산리그` 인데 화면 상단만 `3부리그` | `packages/ui/src/site-config.ts:32` 수정. `bf83348` 에 포함되어 배포됨 |
| 2026-08-28 09:45 | `git push` 전 **운영 DB 자격증명 유출 여부** 확인 | `.gitignore:16` 의 `.env.*.local` 이 `packages/db/.env.production.local` 을 덮는 것을 `git check-ignore -v` 로 확인. 추적 중인 비밀 파일 0건 |
| 2026-08-28 10:25 | 지난시즌 수집 파일(`supply-seasons-*.jsonl`)이 **gitignore 에 없어 커밋될 뻔했다.** 수집 시작 20분 만에 이미 5MB, supply 한 리그만 요청 2만건이라 계속 커진다 | `.gitignore:70-73` 에 `supply-seasons-*.json` / `*.jsonl` 추가. 미러 파일(D-153)과 같은 원칙 |
| 2026-08-28 10:30 | `packages/ui/src/record/SeasonTable.tsx` 를 **두 작업이 동시에 고칠 뻔했다** (지난시즌 표시 작업 10:19 vs B2 모바일 인계 작업) | B2 담당에게 `SeasonTable.tsx` 를 소유에서 빼고 "넘치면 고치지 말고 보고만" 하도록 지시 |

| 2026-08-28 12:44 | **26시간째 멈춰 있던 dev 서버(PID 3276)** 를 찾아 정리했다. 3000번을 `LISTENING` 으로 물고 있으면서 요청에는 **8초 넘게 무응답**(`http=000`), CPU 2,876초를 태우고 있었다. 어제 10:33 기동분 | 그 PID 만 종료. `CLAUDE.md` D-021 이 경고한 바로 그 상황이다. **이것이 전체 테스트 7건 실패의 원인이었고, 에이전트들이 타임아웃으로 멈춘 원인이기도 하다** |

> `--dry-run` 이 실제로는 요청 1건을 보내고 있던 것(`CLAUDE.md` 7장 위반)은 B8 작업 중 발견·수정됐다.

### 전체 검증 결과 (2026-08-28 12:37~12:44, 감독관이 직접 실행)

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` | **8/8 패키지 통과** |
| `npx vitest run` (전체) | **1,112 통과 / 7 실패 / 17 skip** (78파일) |
| 그 7건 실패의 정체 | **전부 멈춘 dev 서버 탓**이었다. 서버 정리 후 같은 4개 파일 재실행 → **19 통과 / 22 skip / 실패 0** |
| B12 무소속리그 회귀 | `apps/web/tests/independentTier.test.ts` **15개 전부 통과**(DB 직접, dev 서버 불필요) |
| B13 선수 포지션 회귀 | `apps/web/tests/playerPosition.test.ts` **2개 통과** — 값 없으면 `null`(`-`·`알수없음` 으로 안 채움) 확인 |

> **즉 지금 작업 트리는 커밋 가능한 상태다.** 실패로 보이던 7건은 코드 문제가 아니었다.

---

## 12. 결정(D-) 번호 할당표 — **새 번호를 쓰기 전에 반드시 여기를 본다**

에이전트 여럿이 동시에 일하면서 **같은 번호를 세 작업이 가져가는 사고**가 실제로 났다.
번호는 코드 주석에서 인용되므로 중복되면 "그 결정이 뭔지" 를 추적할 수 없게 된다.

| 번호 | 주제 | 문서 | 코드 인용 |
|---|---|---|---|
| D-159 | 매치 상세 표기 (`미반영`→`알수없음` · 무기 `스나/라플` · 팀바 · MVP `★` · 안내문구 제거) | `DECISIONS.md` | `packages/ui/src/record/**` |
| D-160 | 선수의 현재 소속 클랜 = 가장 최근 경기 | `DECISIONS.md` | `packages/db/ops/supplyRollup.ts` |
| D-161 | 선수 `포지션` 복원 + 선수 프로필 수집(`position`·`note`·`renewed_at`) | `DECISIONS.md` | 23곳 (`supplyPlayerProfiles` · `RecordPanels` · `detail.ts` 등) |
| D-162 | 병영수첩 주소 파서 | **문서 없음 ⚠** | `packages/contract/src/barracksUrl.ts` · `search.ts` · `store.ts` |
| D-163 | *(비어 있음 — 쓰지 말 것. 한때 잘못 할당됐다가 회수됨)* | — | 코드·문서 인용 **0건** (확인함) |
| D-164 | 래더 반영 경기 판정 조건 일원화 | **문서 없음 ⚠** | `apps/web/lib/server/queries/ladderScope.ts` · `records.ts` |
| D-165 | 무소속리그: 티어 = 부리그(division) | `DECISIONS.md` | 8곳 (`independentLeague.ts` · `divisionLabel.ts` 등) |
| D-166 | 지난시즌 카드는 **가져오고**, 그리는 방식은 **표에서 카드로** | `DECISIONS.md:4064` | — |

### 2026-08-28 12:10 번호 충돌 정정 (감독관)

`D-161` 을 **세 작업이 동시에** 가져갔다. 코드 인용 수가 가장 많은 **선수 포지션/프로필이 `D-161` 을 유지**하고
나머지를 옮겼다. 문서 헤딩 · 코드 주석 · `CLAUDE.md` 를 전부 맞췄고, 옮긴 뒤 교차 오염이 없음을 확인했다
(`D-161` 인용 중 무소속/티어 **0건**, `D-165` 인용 중 포지션/프로필 **0건**).
회귀 확인: `vitest packages/contract + division-label` **20/20 통과**.

| 원래 | 바뀐 번호 | 인용 수 |
|---|---|---|
| D-161 (선수 포지션/프로필) | **D-161 유지** | 23 |
| D-161 (무소속리그 티어) | **→ D-165** | 8 |
| D-161 (래더 조회 조건) | **→ D-164** | 3 |

### 커밋 메시지의 번호 하나가 어긋나 있다 (고칠 필요는 없다)

`102d558 fix(mobile): UI 가 원본보다 크던 것 되돌림 + 지난시즌 카드 **(D-163)**` — `D-163` 은 번호 충돌 정리 때 **회수해 비워 둔 번호**다. 그 커밋이 실제로 담은 결정은 **`D-166`**(지난시즌 카드)으로 문서화돼 있고, 코드·문서 어디에도 `D-163` 인용은 **0건**이다.
이미 푸시된 커밋 메시지라 되돌리지 않는다. **문서와 코드가 정본**이며 `D-163` 은 계속 비워 둔다.

### ~~아직 문서가 없는 결정 2건~~ → **해소됨 (2026-08-28)**

`D-162`(병영수첩 주소 파서) · `D-164`(래더 반영 경기 판정 일원화) 를 감독관이 채웠다.
**코드 주석에 있던 근거만 옮겼고 새로 정한 사실은 없다** — 두 항목 머리에 그렇게 명시했다.

