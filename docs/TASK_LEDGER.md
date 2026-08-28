# TASK_LEDGER — 작업 대장

감독관이 유지하는 **단일 작업 목록**이다. 사용자가 시킨 일을 하나도 빠뜨리지 않고 적고,
상태는 **에이전트의 말이 아니라 저장소·DB 실측**으로만 바꾼다.

- 최초 작성: 2026-08-28 07:40 (KST)
- 마지막 갱신: 2026-08-28 08:25 (KST)
- 상태 값: `완료` / `진행중` / `대기` / `막힘`
- **근거 칸에 확인 가능한 숫자나 파일 절대경로가 없으면 그 줄은 검증되지 않은 것이다.**
  "완료했다고 함" 은 근거가 아니다.

---

## 0. 지금 당장 알아야 할 것 (한 줄 요약)

> **운영에 배포된 코드는 `ba5aeab` 다. 로컬 `main` 은 그보다 9커밋 앞서 있고,
> 그 위에 미커밋 변경이 71개 있다.** D-152 ~ D-159 (미러링 · 클랜랭킹 수정 · 다중리그 기록 ·
> 대소문자 무시 검색 · 평균킬 분모 · 매치 상세 표기 · 모바일 · 리전 고정) 중
> **어느 것도 운영 화면에 반영돼 있지 않다.**
> 운영 **DB** 는 최신이다(362,446경기). 화면 코드만 옛날 것이다.
> → `B9` 를 풀기 전에는 `B2` · `B3` · `B5` · `B6` · `B7` · `B1` 의 "고쳤다" 가 사용자 눈에 보이지 않는다.
>
> **성능도 같은 뿌리다.** 응답시간의 90% 이상이 미국↔서울 왕복이고,
> 그걸 없애는 `vercel.json` 의 `"regions":["icn1"]` 역시 **미커밋**이다 (7절).

---

## 1. 대장

### 완료로 보고됐던 항목 — 감독관 재검증 결과

| 번호 | 요구사항 (사용자 표현 그대로) | 상태 | 근거 (감독관 실측) | 담당 | 다음 행동 |
|---|---|---|---|---|---|
| A1 | D-150 3rd.supply 미수입 624경기 감사 | **완료** | `a681ca4` 가 `HEAD` 의 조상임을 `git merge-base --is-ancestor` 로 확인. `docs/DECISIONS.md:3161` D-150 존재 | — | 없음 |
| A2 | Vercel 운영 배포 | **완료(단 옛 커밋)** | `https://sacloud-web-softgw01-8957s-projects.vercel.app/api/leagues` → HTTP 200, 대룰리그 포함 응답. 다만 배포된 코드는 `origin/main = ba5aeab` (B9 참조) | — | B9 처리 |
| A3 | 시즌7 전량 미러링 "하나도 빠짐없이" | **완료** | 운영 DB 실측: `supply 130,022 · sanply 202,727 · daerule 29,697` = **362,446**. `MatchPlayerStat 3,658,446행` | — | 없음 |
| A4 | 3부리그 → **열산리그** 이름 변경 (slug `sanply` 유지) | **완료** (감독관이 잔여 1건 수정) | 운영 DB `League.name = 열산리그`. **단 GNB 라벨이 `3부리그` 로 남아 있었다** → `packages/ui/src/site-config.ts:32` 를 `열산리그` 로 고침 (2026-08-28 07:36) | 감독관 | 커밋 대기 |
| A5 | 두 리그 동시 소속 클랜 경기를 양쪽 리그에 다 기록 | **완료** | 운영 DB: 2개 이상 리그에 기록된 `sourceMatchId` = **34,322건**. `docs/DECISIONS.md:3458` D-155 | — | 없음 |
| A6 | 클랜랭킹이 원본과 안 맞던 문제 | **완료** | 운영 DB 랭킹 클랜 수: `supply 1부 22 · 2부 27` / `daerule 1부 15 · 2부 30` / `sanply 1부 96`. `docs/DECISIONS.md:3549` D-157 | — | **운영에 미배포**(B9) |
| A7 | D-151~D-158 문서화 | **완료** | `docs/DECISIONS.md` 3226 · 3303 · 3341 · 3402 · 3458 · 3504 · 3549 · 3606 행에 D-151~D-158 전부 존재 | — | 없음 |
| A8 | 스냅샷 감사 테스트 3건 실패 → 통과 | **완료** | `npx vitest run apps/worker/src/__tests__/snapshotAuditSafety.test.ts` → **8 passed (8)**, 50.32s (2026-08-28 07:36 실행) | — | 없음 |

### 진행 중 / 남은 항목

| 번호 | 요구사항 (사용자 표현 그대로) | 상태 | 근거 (감독관 실측) | 담당 | 다음 행동 |
|---|---|---|---|---|---|
| B1 | 모바일 최적화 — "자고 일어났을 때 모바일 최적화 완료돼 있고 서플라이랑 90% 이상 똑같게" | **거의 완료 (정지 → 09:35 인계분 완료)** | 사용자 에이전트가 07:12 이후 **40분간 저장소 전체에 한 줄도 안 씀** → 07:55 감독관 인계 → 완료. 검증: **vitest 162/162 · typecheck 8/8 · eslint(16파일) 0건**. 완료 화면: 홈(로고 `max-w-full`+검색바 전체폭) · 게시판 목록 · 프로필 헤더 4종 · 참여중인 리그 카드 · 기록실 본문 2단→세로 쌓기. **"90% 똑같게" 는 검증 불가 — 아래 주의 참조** | 감독관 배정 에이전트 (완료) | 잔여 2건: ①`RecordPanels.tsx` 블록 **내부** 여백 → B2 에 인계함(09:40) ②검색 드롭다운 `최근검색/즐겨찾기` → **미구현, 의도적** |

> **⚠ B1 검증 한계 — 원본을 더 이상 볼 수 없다.**
> 모바일 User-Agent 로 `https://3rd.supply/` 요청 시 **HTTP 405 + AWS WAF "Human Verification" CAPTCHA** 가 돌아온다.
> `CLAUDE.md` 3-A 5번(CAPTCHA/봇차단 우회 금지)에 따라 **우회하지 않았다**(요청 1회로 중단).
> 따라서 이번 모바일 작업은 **원본 대조 없이** 저장소의 기존 관측 기록(`styles.css` 주석 ·
> `LeagueSubNav.tsx` · `RankTable.tsx` · `UI_PARITY_AUDIT.md` 부록 A)만 근거로 했다.
> **"서플라이랑 90% 이상 똑같은지"는 현재 아무도 판정할 수 없다.**
> 사용자가 보낸 모바일 스크린샷 10장이 유일한 대조 수단이며, 그 이미지는 감독관 세션에 없다.
>
> **`최근검색 / 즐겨찾기` 드롭다운은 일부러 만들지 않았다.** 저장소 전체에 `최근검색` 문자열이
> 하나도 없고 원본을 볼 수 없어, 없는 기능을 지어내면 `CLAUDE.md` 3장 3번(임의 기능 추가 금지)
> 위반이 된다. 원본 관측이 되면 그때 추가한다.
| B2 | 매치 상세 UI "하나도 틀림없이 똑같이" | **완료 (감독관 독립 검증)** | 11시간 정지였던 것을 07:45 재기동 → 08:10 완료. **감독관이 직접 재실행해 확인**: `npx vitest run packages/ui/src/__tests__/` → **17파일 / 162 테스트 통과**, `matchWeaponLabel` 이 `'스나'`/`'라플'` 반환(`matchDetailView.ts:136-140`), `COMPOSITION_NOTICE`·`ladderNotice`·`NOT_RATED_INLINE` **소스에서 사라짐**. 10개 항목 중 **내가 고침 4**(무기 축약·팀바 선레드/선블루 항상표시·MVP `★`·설명문구 제거+`미반영`→`알수없음`), **이미 되어 있었음 6**(10명 킬/데스·딜량막대·래더점수 셀·닉네임 링크·기본 클랜마크·평균킬 `9.6킬` 포맷) | 완료 | **D-159 로 문서화함**(감독관). 미배포 → B9 |
| B3 | 검색 기능이 제대로 작동 안 함 (`Huwho` 넣었더니 **선수가 아니라 게시글 같은 것**이 나옴) | **완료(코드) / 미배포 — 원인 전부 규명** | **① 왜 0건인가**: 운영 실측 `/api/players/search/Huwho` → `[]`, `huwho` → 1건, `HUWHO` → `[]`, `Uwho` → `[]` = 대소문자 구분. 같은 운영 DB 에 Prisma `mode:'insensitive'` 로 직접 질의하면 `Huwho`/`HUWHO` 모두 1건 → **DB·Prisma 문제 아님, 배포된 코드가 옛것.** **② 왜 게시글이 보였나**: `apps/web/app/page.tsx:54-56` — 정확일치 실패 시 **화면 전환 없이 홈에 머문다**(원본 동작). 홈 화면이 곧 `실시간 인기게시글`(`HotPostList`)이라 사용자 눈에는 "게시글이 나온" 것으로 보인다. **두 현상이 같은 원인이다.** 수정: `search.ts` 의 6개 호출부 전부 `ci()`/`ciEquals()` 로 교체 + `packages/mock/src/store.ts` 도 같은 규칙으로 맞춰 Mock↔실제 응답 일치 유지 | 완료 | **B9 배포만 남음.** 배포되면 두 증상이 함께 사라진다 |
| B4 | 개인랭킹 닉네임 옆 클랜마크가 안 나온다 | **진행중** | 운영 DB: `Player.clanId` **1,041/23,026** · `LeaguePlayer.clanId` **1,463/31,207**. 사용자 보고 시점(0/21,107 · 113/10,388)보다 올라갔다 = 채우기 작업이 실제로 돌고 있다. 최근 수정 `apps/web/lib/server/queries/publicScope.ts` 07:20 | 사용자 에이전트 | 채움률 목표치 합의 필요. 100% 는 원래 불가(무소속 선수 존재) |
| B5 | 평균킬이 전부 `0.0킬` | **완료(코드·데이터) / 미배포** | `apps/web/lib/server/queries/leagues.ts:373` 에 `OR: [{redRatingUpdate:{not:null}}, {origin: MIRROR_ORIGIN}]` 적용됨. 운영 DB 실측 — 3rd.supply 경기 362,446건 중 `redRatingUpdate != null` 은 **0건**(수정 전 분모 0 = `0.0킬` 원인 확정). 수정 후 분모/평균킬: 근면 2,150→**8.3** · chococake 3,065→**8.5** · 으어어어 1,189→**11.1** · kinder 768→**8.6** · mozz'a' 976→**9.1** | 감독관 검증 완료 | **B9 배포만 남음** |
| B6 | 성능 | **원인 규명 완료 / 수정 미착수** | 실측 완료 — 아래 **7절** 참조. 핵심: 응답시간의 **90% 이상이 미국↔서울 왕복**이다. `/api/maps` 는 DB 실행 **0.1ms** 인데 HTTP **1.38s**. 회귀식 `≈ 0.6s + 질의당 0.75s`. `vercel.json` 의 `icn1` 은 **미커밋 = 미적용** | 감독관 (수정은 미배정) | ①`icn1` 배포(B9) ②`matchCountByPlayer` 인덱스 ③`/api/health` 11.5s **미해명** |
| B7 | UI 차이 45건 (`docs/UI_PARITY_AUDIT.md`) | **심각도 상위 10건은 거의 완료 / 전부 미배포** | 감독관 코드 실사(2026-08-28 07:55). ①클랜원 탭 → `apps/web/lib/profileTabs.ts:22-29` 3탭 복원 ②클랜 사이드 `상세정보` → `packages/ui/src/record/RecordPanels.tsx:264,296` ③`전적갱신`+`최근갱신` → `apps/web/app/league/[leagueSlug]/clan/[clanSlug]/layout.tsx` (`useRefresh`·`renewedAt`) ④`즐겨찾기` → `packages/ui/src/profile/LeagueRecordHeader.tsx:28` ⑤포지션·무기별 기록 블록 **제거됨** → `RecordPanels.tsx:232`, `player/[playerId]/page.tsx:134` ⑥브레드크럼 → `LeagueRecordHeader.tsx:58,142,150` (`{리그명} - {N}부리그 - {순위}위`, 배치고사면 순위 조각 생략) ⑦GNB 리그 3개 → `packages/ui/src/site-config.ts:30-34` ⑧`Beta Season` 배지·안내박스 **제거됨** → `LeagueSubNav.tsx:73`, `home/layout.tsx:42` ⑨인기게시판 글쓰기·검색폼 **숨김** → `packages/ui/src/board/boardCopy.ts:30` ⑩게시판 소제목 → `boardCopy.ts:12`. 평균킬 `9.6킬` 포맷 · `미반영`→`알수없음` · `- / - / -` 도 **08:10 완료**(B2, D-159) | 상위 10건 완료 | 45건 전체 재감사는 **미착수**(`UI_PARITY_AUDIT.md` 는 상위 10건만 요약). 전부 미커밋이라 운영에 없다 → B9 |
| B8 | 실시간 증분 동기화 — "새로 쌓이는 기록들도 전부 반영" | **코드 완료 / 가동 불가 — 사용자 결정 필요** | `.github/workflows/supply-incremental.yml` **209줄** 생성 확인. cron `0,30 * * * *`(30분), `concurrency` + `cancel-in-progress:false`, `timeout-minutes:55`, `secrets.DATABASE_URL`. `--dry-run` 검증: 요청 **0건**(`SUPPLY_API_BASE_URL` 을 연결거부 주소로 걸어 확인) · DB쓰기 0 · 파일쓰기 0, 인식 건수 supply 130,022 / daerule 29,697 / sanply 202,727 **전부 DB 와 일치**. typecheck 8/8, eslint 0건 | 감독관 배정 에이전트 (완료) | **아래 ⚠ 참조 — GitHub Actions 분 초과 문제가 실질 blocker** |

> **⚠ B8 은 만들어졌지만 지금은 돌 수 없다.** 사용자 결정이 필요한 것 3가지.
> 1. **저장소가 private 이면 무료 2,000분/월로 못 돌린다.** 추정 소모 **≈ 380분/일 ≈ 11,500분/월**.
>    → public 전환 · 유료 플랜 · self-hosted runner 중 하나를 골라야 한다.
>    (`origin = https://github.com/stockerboy/sacloud.git` — 공개 여부는 감독관이 확인 못 했다)
> 2. **`DATABASE_URL` Secret 등록** 필요. D-151 에 따라 transaction pooler(6543)는 사용자명이
>    `postgres.<project-ref>` 여야 하고 `pgbouncer=true` 가 필요하다. 장시간 대량 작업이라
>    **session pooler / 직결(5432) 권장.**
> 3. **`schedule` 은 기본 브랜치에서만 돈다** → 또 `B9 push` 다.
>
> 부수 수정 2건(둘 다 `apps/worker`): ①`--dry-run` 이 실제로는 `/leagues/{slug}` 를 1회 호출하고
> 있었다 — `CLAUDE.md` 7장("요청을 한 건도 보내지 않는다")이 깨져 있던 것을 고쳤다.
> ②`--seen-from-db` 신설 — 미러 파일이 **2.07GB**(supply 733MB/sanply 1.16GB/daerule 179MB)라
> CI 러너에 못 올린다. 없으면 매번 36만 경기를 통째로 다시 받는다. `Match.sourceMatchId` 를
> 읽어(읽기 전용) 대신하게 했다. 원본 부하도 낮췄다(동시 10→3, 간격 130→250ms).
>
> 미해결 위험: 집계 실측을 **운영 DB 에 대고 재 본 적이 없다**(로컬 추정). 세 리그 합쳐
> 55분 timeout 을 넘을 수 있다. 넘으면 리그별로 워크플로를 쪼개야 한다.
| B9 | 커밋·배포 | **막힘 — 사용자만 할 수 있음. 최우선** | `git status --porcelain` = **71개 변경**(08:25 기준). `git branch -vv` = `main ... [ahead 9]`, `origin/main = ba5aeab`. **운영은 ba5aeab 를 돌리고 있다.** 이 하나가 B2·B3·B5·B6·B7·A4 를 전부 막고 있다 | **사용자** | 검증 후 `git push`. 감독관은 커밋 금지 지시를 받아 손대지 않았다 |
| B10 | 지난시즌(시즌1~7) 기록 가능한가 — "작업하던 거 계속 하면서 대답만 해" | **조사 완료 — 답: (b) 시즌 최종 요약만 가능** | 원본 요청 21건으로 확인. **경기 단위는 2024-05-24 에서 끊긴다**(커서 대조 실측: `next__240524235109124001` → 6건 / `next__240524220309124001` → **0건, next=null**). = 시즌7 시작일. `season=` 파라미터는 **무시**되고 `/leagues/{id}/seasons` 는 404. 반면 `/leagueplayers/{id}/seasons` · `/leagueclans/{id}/seasons` 는 **200 을 준다**. 교차검증: MiraGe. 사이트 표기 `4229승 4523패` = 우리 미러 집계 **완전 일치**, supply 49클랜 중 32클랜 완전일치 · 나머지 오차 0~8 | 조사 완료 | 아래 **8절** 참조. 실제 수집은 **사용자 승인 사항**(D-153 과 같은 헤더 경로) |
| B11 | BattleLog — 탈주자 K/D 복원 + 무기 분류 | **대기** | D-114 파서 존재. 통합 안 됨 | **미배정** | B2 · B7 정리 후 착수 |

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

1. **`git push`** — 로컬 `main` 이 `origin/main` 보다 9커밋 앞서 있고 미커밋 67개가 있다.
   이걸 하지 않으면 B3·B5·B6·B7·B1 의 수정이 **운영 화면에 나타나지 않는다**.
2. **운영 DB 쓰기** — 감독관과 그 에이전트는 읽기만 했다.
3. **사용자가 직접 띄운 에이전트 관리** — 감독관 목록에 보이지 않는다. 위 3절 점검표 참조.

---

## 6. 지시 대기 중인 열린 질문 (감독관이 임의로 정하지 않았다)

| # | 내용 | 근거 | 왜 물어보는가 |
|---|---|---|---|
| Q1 | 운영 API 가 클랜마크를 `https://static.3rd.supply/marks/...` 로 **그대로 물고 있다** | `/api/leagues` · `/api/clans/search/e2stro` 응답의 `mark.bg` / `mark.front` | `CLAUDE.md` 3장 4번(원본 자산 복사 금지) 저촉 여부 + 원본 서버가 죽으면 우리 화면의 마크가 전부 깨진다. 방침 없이 건드리지 않았다 |
| Q2 | 게시판 이름이 `3부게시판` 으로 남아 있다 | `packages/ui/src/board/boardCopy.ts:12` (원본 실측값) | A4 로 **리그**는 `3부리그` → `열산리그` 가 됐다. 게시판 이름도 따라가야 하는지, 원본 관측값을 지켜야 하는지 정해지지 않았다 → `[미확인]` |
| Q4 | 접힌 매치 카드의 상태 배지 `래더 미반영`(`NOT_RATED_BADGE`) 을 남길 것인가 | `packages/ui/src/record/officialCopy.ts:32` | 인라인 표기는 `알수없음` 으로 통일했으나(D-159), 이 배지는 매치 상세 표의 값 칸이 아니라 기록실 카드의 **상태 배지**다. `래더 알수없음` 으로 바꾸면 틀린 말이 된다. 원본 표기는 `[미확인]` |
| Q5 | MVP 표기 모양 `★` 이 맞는가 | `packages/ui/src/record/MatchCard.tsx:542-550` | `docs/UI_PARITY_AUDIT.md` 7장에서 원본 경기 상세 펼침 관찰에 **실패**해 원본 모양을 모른다 → `[미확인]` |
| Q6 | 증분 동기화를 **어디서 돌릴 것인가** | 추정 소모 ≈ 11,500분/월 vs 무료 2,000분/월 | private 저장소면 GitHub Actions 무료 한도로 불가능하다. public 전환 / 유료 플랜 / self-hosted runner 중 선택이 필요하다. 이걸 정하기 전에는 B8 이 **코드만 있고 안 도는 상태**로 남는다 |
| Q7 | 모바일 "90% 이상 똑같게" 를 **무엇으로 판정할 것인가** | 원본이 AWS WAF CAPTCHA 로 막혔다(HTTP 405). `CLAUDE.md` 3-A 5번상 우회 금지 | 사용자가 보낸 모바일 스크린샷 10장이 유일한 대조 수단인데 **감독관 세션에 그 이미지가 없다.** 다시 붙여 주면 대조를 걸 수 있다 |
| Q3 | B4 `clanId` 채움률의 **목표치** | `Player.clanId 1,041/23,026` · `LeaguePlayer.clanId 1,463/31,207` | 무소속 선수가 실제로 있으므로 100% 는 원래 불가능하다. "몇 %면 완료" 인지 기준이 없으면 완료 판정을 할 수 없다 |

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
