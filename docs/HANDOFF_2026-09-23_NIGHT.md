# HANDOFF 2026-09-23 밤 — 다음 세션이 이걸 먼저 읽는다

> 사장님이 「압축하지 말고 전부 전달」 하라 하셨다. 빠짐없이 적는다. `CLAUDE.md` 규칙(허락 안 구함 · 옛 판 남김 · typecheck 초록일 때만 push · 항목마다 PC·폰 캡쳐)은 그대로.
> 오늘 낮~밤 인계는 `docs/HANDOFF_2026-09-23.md`(오후) + `docs/STATE.md` 「0-진영판」「0-밤」 절에 있다. 이 파일은 ★그 뒤★ 다.
> ★3차 갱신(2026-09-24 새벽 · 인계 세션)★ — 사장님 사진 5장을 ★파일로 받아 `docs/ref/board2/` 에 넣었다★(§7). §7-6·§7-8 이 쓸 배틀로그 필드를 코드에서 읽어 §8 에 적었다 — **권총(보조무기) weapon 값만 [미확인]**. ★코드는 한 줄도 안 고쳤다.★
> ★2차 갱신(23:40)★ — 누락 경기 원인이 ②·⑤ 로 바뀌었다(§2). 되메우기 코드는 다 밀었고 **VPS 반영·적재만 남았다**(§0-A). 사장님 진영판 2차 요청 8건은 §7 — **다음 세션이 한다.**

---

## 0. 지금 당장 남은 일 (우선순위 순)

| # | 무엇 | 상태 | 어디 |
|---|---|---|---|
| A | **누락 경기 되메우기 마무리** — ★끝 (2026-09-24 01:48 · 만듦합 637)★ · STATE.md 「0-새벽2」 | 끝 | VPS `/root/sacloud` |
| B | 진영판 2차 요청 8건 (§7) — ★끝 (`dd61c369` · 2026-09-24 새벽)★ · STATE.md 「0-진영판2」 | 끝 | `RoundFlowChartV3.tsx` 등 |
| C | 「아직 옛 경기분석 버전이 남아 있다」 — 코드상 경기분석 판은 둘(ClanScoreboardV3 · PlayerDetailV3 사본)뿐이고 같은 RoundFlowChartV3. 사장님이 보신 건 배포 전 캐시로 추정 · 이후 지적 없음 | 닫음(추정) | |
| D | 「육각 겹쳐서 칩 바꿀 때 가끔 그래프 안 그려짐」 — 라운드 그래프 arm 에 스크롤/리사이즈 안전판 추가(dd61c369) · 그래프 3종 폭 재측정(bb927196). 이후 지적 없음 | 조치함 | `RoundFlowChartV3` |
| E | 경기 카드 래더 증감 「+29점」 표기 — 층으로 못 적어 그대로. 사장님 확인 | 확인 대기 | |
| F | deluxe — 병영 clan_id 042222741 로 바꿔 부름(06181e59 · 수집 살아남) · crucialrz 는 클랜 줄 둘(backspace00 진짜 / ipl-backspace00 껍데기) 합치기 사장님 답 대기 · NeedBackup 은 병영에 같은 클랜 없음 | deluxe 끝 | `barracksCollect.BARRACKS_CLAN_ID_OVERRIDE` |
| G | ~~`cpl-setup --sync` 가 다른 리그 활성 클랜을 또 내리지 않게~~ → **정정: cplSetup 은 CPL 만 건드린다. 내린 것은 `clan-one-league`(한 클랜=한 리그 도구)** · ★정책 충돌 — 사장님 결정★ (§2-③ 정정 상자) | 사장님 결정 대기 | `dev/clanOneLeagueApply.ts` |

---

## 1. 오늘 밤 사장님 지시와 처리 결과 (시간순 · 전부)

전부 `origin/main` (커밋 `cdfe3cc3` … `782f508c`). 로컬 QA 는 합성 데이터(`scratchpad/seed-flow.mjs`)로, 운영은 3rdcloud.my 캡쳐로 확인했다.

### 경기분석 / 라운드 흐름 (`RoundFlowChartV3.tsx` · `ClanDetailV3.tsx` · `PlayerDetailV3.tsx`)
- 진영판: 그래프 → 인원(사람 아이콘) · 전반전/후반전 · nR · % → 「레드 클랜 n:n 클랜 블루」(그 반의 점수 · 후반 0:0 · 좌우 바뀜) → 죽은 차례 두 칸(왼쪽 = 레드가 잡은 것) ✅
- 죽은 차례 칸 높이 고정 152(PC 176) ✅ · 재생 라운드당 5초 ✅ · 재생하면 선을 **처음부터 그리며** 진행 ✅
- ❚❚ 멈춤 → **그 자리에 딱 멈춤**(다시 ▶ 면 이어서) ✅ · 축 위 빨강/파랑 점 삭제 ✅
- **보일 때 한 번만 그림** (IntersectionObserver · 안 보이면 안 그림 · 다시 안 그림) ✅ — ⚠ 「육각 겹쳐서 버튼 누르면 가끔 그래프가 안 그려지고 멈춘다」 는 **재현·검수 못 함** (§3-3)
- 명단 칸: 플레이어 · 순위(리그 개인랭킹 · 계약 `league_rank`) · kda · 세이브 「n회」 · 포지션 ✅ · MVP 줄 닉네임 잘림 → ★만(compact) ✅
- PC 한 판 카드: 명단|육각|명단 · 밑에 라운드 그래프 **늘 보임**(HEX_CENTER_PC) · 경기분석 단추 PC 숨김 ✅
- ★`b6fa5285`★ 사장님 「너무 커 · 클랜랭킹(1120)과 보드 통일 · 대각선으로 비율 축소」 → `.sac-player-page .pc-container` 1360→**1120** · 접힌 카드 `zoom 1.05` · 펼친 한 판 `.v3-board zoom 0.82` ✅ (운영 캡쳐로 확인 · 명단 「거친수달19」 3px 잘림 하나 남음)

### 선수 페이지
- 마크 64 · 닉네임 30 · 래더 30 오른쪽 위 ✅ · 기록실/지난시즌 탭 삭제 · 그래프판 바로 붙임 ✅
- 추이 그래프: 2단 왼쪽 칸 안 · 세로 배율 1.1 · 누적 먼저 · 판 꽉 채움(plotBox hScale 는 띠에만) · 「CLOUD 0」 워터마크 제거 ✅
- 오른쪽 카드: 제목 = 닉네임 · 포지션 「라이플/스나이퍼」 · 래더 빨강 · 판킬 · MVP 「n판 중」 · 핵의심+신고 · sticky 105 · **3rd.supply 색 체계**(`supplyRateColor` / `supplyRankColor` · `.sac-info-card`) ✅
- 최근매치 오른쪽 「최근 20전 승률 · 킬뎃」 ✅ · 「최근 같이한 플레이어」 PC·폰 삭제 ✅
- 경기 목록은 2단 **밖** 전체 폭 ✅ · 경기 카드 MVP 는 K/D/A **위** ✅
- 머리 카드 「스나」 칩·라플/스나 탭 끔(HEAD_WEAPON_CHIPS) ✅
- 폰: 상세정보를 머리 카드 안으로 · 「기록실 | 플레이분석」 탭 · **플레이분석 = 육각만**(추이 그래프 X) ✅

### 클랜 페이지 = 선수 페이지 양식 (`ClanHeaderV3.tsx` 새 파일 · `ClanDetailV3.tsx` BODY_LIKE_PLAYER)
- 머리 카드 · 승률 추이(계약 `LeagueClanShow.trend`) · 2단 · 폰 탭 ✅ · 클랜 폰 플레이분석도 육각만 ✅
- 상대전적 「접혀 있다 펼쳐 놔」 → `HeadToHeadCard` `showAll` 기본 **true** (`b6fa5285`) ✅

### 랭킹
- 래더 **무조건 「31층」**(버림 · 소수점·점수 없음) · 래더 색 없앰 ✅ (`formatRating` · 옛 판 `formatRatingLegacyDecimal/Point`)
- 개인랭킹 폰: 마크 20 · 클랜명 안 적음 · 「n승 n패 n%」 · 킬뎃 %만 ✅ · 클랜랭킹 폰 「n승 n패」 ✅

### 홈
- 배경 2차 그림(깃발·성·아가멤논 · `/brand/home-hero.webp` 1920 · 폰 900 · 옛 그림 `-v1`) · 검색창 **망토 위**(PC top 56vw−60 · 폰 230) · 로고 왼쪽 상단 홈버튼 · Hot게시판 840 ✅

### QA
- `scratchpad/qa.js`(잘림·칸밖·겹침) + `measure.mjs` 6번째 인자 클릭. 7화면 × PC/폰 가로넘침 0. 남은 잘림: 폰 죽은차례 긴 합성 이름 · PC 명단 「거친수달19」 3px.

### 데이터 (누락 경기) — §2 에 자세히
- `a73877ce` 이름표 오염 수정 + `clan-alias-rebuild` 잡 + 밤 예약(①-2 이름표 · ①-3 30시간 되감기) ✅ **VPS 반영·실행 완료** (이름표 66,063 → 451 · 모호 이름 310 → 9)
- `--from-start --confirm` 1차 적재 ✅ **765건 만듦** (IPL 338 · SPL 53 · 열산 374)
- 만료(`expelledAt`) 찍힌 활성 클랜 **23곳 복구** ✅ (nolink 10 · sanply 12 · supply 1 — `probe22.mjs` · cpl 리그는 안 건드림)
- `782f508c` 무승부 오인 수정(승수 같은데 승/패 있는 경기) — main 에 있음 · ⚠ **VPS 미반영 · 미적재** (SSH 끊김)

---

## 2. ★누락 경기 원인 조사 결과★ (사장님 「원인 조사하고 누락 싹 다 채워」)

### 계기
자이언트(deluxe · playerId `cmtler9ah00lavlew9wb734vt`)의 9/19 아마릴리스전이 우리 기록실에 없다. 병영수첩엔 있다.

### 실측 (운영 DB · VPS 에서 `node probe*.mjs` · 스크립트는 `scratchpad/vps_probe1~22.mjs`)
```
deluxe 를 subject 로 긁은 원문(BarracksClanMatchRaw)   ★0건★  (요청 1,210번 · 전부 200 · 빈 목록)
deluxe 의 Match 는 3,318건 있다 (최신 260923225353)   → 「전부 빠진 것」 이 아니라 ★특정 종류만★ 빠진다
빠진 3건: 260919140127124001 deluxe–amaryllis 5:5 「패」 / 260919211033124002 deluxe–evermore 6:6 「승」 / 260919045247124001 hardcores–deluxe 6:6 「패」
9/20~9/23 나흘: 승수 같은데 승/패 있는 경기 867건 / 전체 11,368건 (★7.6%★)
```

### 원인 ⑤ ★진짜 원인★ — 「라운드 승수가 같으면 무승부」 라서 안 만들었다 (`matchNormalize.ts`)
원문의 `red_win_cnt`/`blue_win_cnt` 가 같은데 `result_wdl` 은 「승」/「패」 인 경기가 7.6% 다. 투영기는 승수만 보고 `draw` 로 넘겼다(미리보기 무승부 9,931건 중 상당수가 이것).
**고침 `782f508c`**: payload 를 준 subject(원문을 긁은 클랜)가 어느 편인지 이름으로 알고, 그 클랜의 승/패로 승자를 정한다. 스위치 `TIE_BREAK_BY_RESULT_WDL`(unifiedProject.ts). 모르면 옛날처럼 draw. CLI 요약에 「무승부풀림」 칸. 테스트 `matchNormalize.test.ts` 3건 추가(30/30 초록).
⚠ 승수 5:5 로 저장되고 승자만 있다 — 화면에서 「5:5 승」 으로 보일 수 있다. 원문이 그렇다.

### 원인 ② (정정) — 이름표(`BarracksClanAlias`)가 상대 이름까지 「내 옛 이름」 으로 담았다
옛 `clan-name-backfill` 이 한 줄의 red·blue 를 **둘 다** subject 의 옛 이름으로 저장 → afterpray 가 12개 slug 의 이름표에, QuasaR- 가 11개에. 투영기가 그 이름을 「같은 이름 다른 클랜」 으로 **310개** 뺐다(deluxe · amaryllis 포함).
어제 판단 「옛 시드/미러 클랜과 이름 겹침」 은 **틀렸다** — `Clan` 표엔 중복 이름이 9개뿐(probe15).
**고침 `a73877ce`**: `clan-alias-rebuild`(덮기 set cover · 무게 GROUP BY · 남의 지금 이름 제외) → 이름표 66,063 → **451** · 모호 이름 310 → **9**(진짜 중복: Mentalist- · NeedΒackup · crucialrz · daytona · des'per@do · grave · hurricanewc · maybe · recent.wct-). `clanNameBackfill` 은 이름표를 안 쓴다(`ALIAS_FROM_BACKFILL=false`). `buildNameIndex` 도 한 번 더 거른다.

### 원인 ① — 투영기 커서가 2시간만 뒤로 본다
`PROJECT_REWIND_HOURS` 기본 2. 늦게 도착한 원문은 영영 안 본다. **고침**: `scripts/quiet-hours.sh` ①-3 이 매일 아침 `PROJECT_REWIND_HOURS=30` 으로 되감는다(VPS 에 반영됨 · 첫 실행은 내일 07:05).

### 원인 ③ — 활성 클랜 23곳이 `expelledAt` 로 수집 대상에서 빠졌다
`cpl-setup --sync` 가 2026-09-22 00:15:56Z 에 CPL 명단에 없는 클랜을 내렸다. **복구 완료**(23행 · probe22). ⚠ `cpl-setup --sync` 를 다시 돌리면 또 내린다 — `cplSetup.ts` L195-225 를 cpl 리그에만 적용하도록 고쳐야 한다(§0-G).

> ⚠ **2026-09-24 새벽 정정 (코드를 읽었다).** `cplSetup.ts` 의 sync 는 이미 `leagueId: league.id`(CPL 리그 한 곳)로만 내린다 — nolink/sanply/supply 행을 건드릴 수 없다.
> `expelledAt` 을 찍는 코드는 저장소에 둘뿐이고 다른 하나가 `apps/worker/src/dev/clanOneLeagueApply.ts:150` — **「한 클랜 = 한 리그」(사장님 2026-09-05)** 를 nolink·supply·sanply 에 적용해 두 리그에 활성인 클랜의 한쪽을 내리는 도구다. 되돌린 23행이 딱 그 세 리그였다.
> → §0-G 의 「cplSetup 고치기」는 **할 일이 아니다.** 진짜 물음은 정책이다: 지금 26곳이 두 리그에 활성이다(되메우기 미리보기 로그 머리). **09-05 규칙(한 리그만)과 09-23 복구(둘 다 활성)가 서로 반대다 — 사장님 결정 필요.** 코드는 안 고쳤다.
>
> ⚠⚠ **2026-09-24 02:10 재정정 (이번엔 증거로).** 그 23줄은 clan-one-league 도 아니었다. **`657b0cd8` 「개잡사와 한 경기는 기록하지 않는다」가 09-22 00:15 에 숨긴 — clan-find-missing 이 잘못 등록한 미등록 클랜 23곳** 이었다
> (Clan.createdAt 2026-09-21 16:35~16:36 · arcenciel · hiemis · legend1st …). probe22 가 그것을 되살렸고, 되메우기가 그 클랜들의 경기 193건을 다시 만들었다(76건은 새로 · 117건은 이미 supersededAt).
> 사장님 「arcenciel 등록도 안 됐는데 왜 자꾸 떠」 로 드러났다. **`scratchpad/vps_fix_findmissing_revert.mjs` 로 다시 숨겼다** (등록 22 → expelledAt · 경기 76 → supersededAt · Clan.active=false · 백업 VPS `apps/worker/../data/findmissing-revert/`).
> **원인 ③ 「활성 클랜 23곳이 수집 대상에서 빠졌다」는 틀린 진단이었다 — 빠진 게 맞았다.** 두 리그 활성 26곳 문제는 별개로 남는다.

### 원인 ④ — deluxe/crucialrz/NeedBackup 은 slug 로 200 을 받는데 경기가 0
`ferwfwfwfwf`(deluxe) · `ipl-backspace00` · `ipl-yoonsh1971` — 병영 목록 API 가 빈 목록. 상대 클랜 원문으로 경기는 들어오니 급하진 않다. `BarracksClanNumber`(deluxe 150531000663) 로 번호 기반 수집이 답. 미해결.

### 실행 순서 (다음 세션이 제일 먼저)
```
ssh -i ~/.ssh/sacloud_vps root@49.247.203.71          # 23:30 부터 kex 끊김/타임아웃 — 될 때까지 재시도
cd /root/sacloud && git pull origin main && git log --oneline -1     # 782f508c 이상이어야 한다
. /root/sacloud.env && export SACLOUD_DB_SESSION_POOLER=1
pnpm --filter @sacloud/worker nexon unified-project --from-start > /root/log/backfill-preview3.log 2>&1
grep -n "본경기=\|draw \|무승부풀림" /root/log/backfill-preview3.log   # 무승부풀림 이 수천 · draw 가 줄어야 한다
nohup sh -c "flock /var/lock/sac-project.lock pnpm --filter @sacloud/worker nexon unified-project --from-start --confirm" > /root/log/backfill-confirm2.log 2>&1 &
# 확인: node probe22.mjs 의 첫 줄(deluxe 3키가 Match 에 있나) — probe 파일은 /root/sacloud/probe*.mjs 에 그대로 있다
# 그 뒤 battlelog-lineup · player-hex-build · clan-hex-v2-build 는 크론이 따라온다 (2분/5분)
```
⚠ VPS 는 git pull 자동 아님. `pnpm install`/`prisma generate` 는 이번엔 불필요(스키마·의존성 안 바뀜).
⚠ DB 질의는 `SET statement_timeout='500s'` + 세션 풀러로. payload JSON 을 넓게 읽는 질의는 4일 범위도 240초를 넘긴다.

---

## 3. 사장님이 말한 것 중 아직 못 한 것 (전부)

1. §7 진영판 2차 요청 8건 (사장님: 다음 세션이)
2. 「아직 옛 경기분석 버전이 남아 있다」 — 어느 화면인지 못 물어봤다. 후보: 경기 목록 페이지(`/league/*/match`)의 카드 · 폰 경기분석 · `AnalysisPanelV3`(선수 플레이분석 설명 칸 · about 페이지). `RoundFlowChartV3` 는 Clan/PlayerDetailV3 두 곳에서만 쓴다.
3. 「육각 겹쳐서 버튼 누를 때 가끔 그래프 안 그려지고 멈춤 · 킬뎃 누적 그래프도」 — 검수 요청. 라운드 그래프는 IO 로 한 번만 arm 하므로 칩(pick) 바꿔도 다시 안 그림 = 멈춘 것처럼 보일 수 있다. `MatchHexagonV3` 는 `useDrawIn(1800, id, svgRef)` 로 id 가 바뀌면 다시 그리는데 IO 가 disconnect 된 뒤라 `armed` 가 false 로 리셋될 수 있음 → `useDrawIn` restartKey 시 IO 재부착 점검.
4. 래더 증감 「+29점」 표기 확인(§0-E)
5. 되메우기 §2 실행 순서 · `cplSetup --sync` 재발 방지 · 원인 ④

---

## 4. 함정 (오늘 밤 새로 밟은 것)

- 로컬 dev 캡쳐가 **뼈대(skeleton)** 로 찍힐 때가 있다 → `curl` 로 두세 번 데운 뒤 찍는다. `shot.mjs` 는 단추가 토글이라 4초 기다렸다 판단하게 고쳤다.
- 운영을 찍을 때 배포가 붙기 전 옛 화면이 나온다 → HTML 에 새 문자열이 있는지 curl 로 확인하고 찍는다.
- 템플릿 리터럴 CSS 주석 안에 백틱 → TS 깨짐.
- apps/web DB 테스트 9건은 로컬 합성 데이터 때문에 깨진다 — 운영 코드 문제 아님. `pnpm vitest run packages/ui` 로 본다.
- 로컬 DB 안 뜨면 `postmaster.pid` 지우고 `pg_ctl start` (경로는 STATE.md 「로컬 QA 길」).
- **Bash 히어독 안의 Python 에서 `\n` 이 먹힌다**(메모리 `bash-heredoc-eats-backslashes`) — 패치 스크립트는 Write 도구로 파일을 만들고 `python scratchpad/x.py` 로 돌린다. 오늘 두 번 당했다.
- 워커 파일은 LF 인 것과 CRLF 인 것이 섞여 있다 — 패치 함수 `rep` 는 파일의 개행을 보고 맞춘다.
- `pnpm --filter @sacloud/worker exec tsc` 가 exit 2 를 내며 아무 것도 안 보여줄 때가 있다 → `cd apps/worker && npx tsc --noEmit -p .`. vitest 는 **repo 루트에서** 경로를 주고 돌린다(worker 안에서 돌리면 「No test files」).
- VPS SSH: `kex_exchange_identification: Software caused connection abort` / `banner exchange timed out` — 23:30 부터. KingsNET(메모리 `kingsnet-tdi-breaks-sockets`) 일 가능성. 몇 분 뒤 재시도.

---

## 5. 스위치 (오늘 밤 추가분)

| 파일 | 스위치 | 뜻 |
|---|---|---|
| `ClanDetailV3.tsx` / `PlayerDetailV3.tsx` | `HEX_CENTER_PC` · `PILLAR_HEX` · `PHONE_ANALYSIS_IN_LIST` · `SHOW_MVP_WHY` · `SHOW_TEAMMATES` · `BODY_LIKE_PLAYER` | 경기분석 배치 · 카드 |
| `RoundFlowChartV3.tsx` | `HALF_SUMMARY` · `CREW_ABOVE` · `PLAY_MS_PER_ROUND` | 옛 요약 상자 · 옛 인원 줄 · 재생 속도 |
| `PlayerHeaderV3.tsx` | `HEAD_WEAPON_CHIPS` | 머리 카드 무기 칩/탭 |
| `TrendChartV3.tsx` | `TREND_H_SCALE` · `TREND_WATERMARK` | 추이 판 세로 · CLOUD 0 |
| `_home/heroV2.ts` | `HOME_HERO_ART` | 홈 배경 그림 |
| player/clan `layout.tsx` | `PLAYER_LINK_TABS` · `CLAN_HEADER_LIKE_PLAYER` | 링크 탭 · 클랜 머리 카드 |
| `common/format.ts` | `formatRatingLegacyDecimal/Point` | 옛 래더 표기 |
| `supply-skin.css` | `.sac-player-page .pc-container{max-width:1120px}` · `.mc-card > .mc-pc{zoom:1.05}` · `.mc-card > .v3-board{zoom:.82}` | 보드 폭 · 카드 비율 |
| `clanNameBackfill.ts` | `ALIAS_FROM_BACKFILL` (false) | 옛 이름표 쓰기 |
| `unifiedProject.ts` | `TIE_BREAK_BY_RESULT_WDL` (true) | 승수 같은 경기 승/패 풀기 |

---

## 6. 다음 세션 첫 줄 (사장님이 칠 말)
```
docs/HANDOFF_2026-09-23_NIGHT.md 읽고 0절 순서대로 이어서 해. A(되메우기 VPS 반영·적재)부터 하고, 7절 진영판 2차 요청 8건 만들어. 허락 묻지 말고 항목 하나 끝날 때마다 PC·폰 캡쳐 보내.
```

---

## 7. ★진영판 2차 요청★ (사장님 2026-09-23 23:2x · 원문 그대로 + 해석 · ★이 세션은 손대지 않았다★)

원문:
> 아직 옛 경기분석 버전이 남아있어
> 그리고 재생버튼을 밑에 둬줘 위에 재생 누르고 마우스 밑으로 내리면서 그래프를 마우스로 실수로 지나가면 재생이 멈춰버려
> 그리고 클랜마크 단추가 그래프가 그려질때든 아니면 축을 이동할때든 따라와야하는데 오른쪽 끝에 고정이 돼있어
> 그리고 그래프를 좀더 복잡하고 역동적으로 그려줘 약간 찌글찌글 하게 더 복잡해보이게
> 그리고 전반 후반 구분 선을 좀 더 잘보이게 확실하게 그어줘
> 그리고 밑에 누가 누구를 죽였는지 표시해줄때 haeil >>> 현물 이 사이의 화살표말고 진짜 누가봐도 이 사람이 얘 쏴 죽였다는걸 알 수 있게끔 잘 보이고 직관적이게 이 로고들을 그대로 이용해서 표시해줘. 레드팀이 블루팀 죽인거면 이 색깔로 쓰고 블루팀이 레드팀 죽인거면 지금 이 빨간색 배경을 연한파란색으로 해줘
> 그리고 하나 더 추가해야해 폭탄설치, 헤체 로그를 경기분석에 추가해줘 누가 설치했고 누가 해체했는지 그리고 설치에 성공하거나 헤체에 성공한 팀 라운드 옆에 설점:1 3:2 설점:0 이런식으로 써줘 설점2 4:2 설점1 후반넘어가면 이거 역시 초기화
> 이제 설치칸이 하나 늘어날 수 있으니 세로길이를 한칸 더 늘려야할거야
> 그리고 보조무기로 죽인건지 투척으로 죽인건지 저격총인지 돌격소총인지 구분해서 로그를 만들어줘 배틀로그에 다 나오는 정보들이니까
> 이 작업은 너가 하지말고 다음 세션에 넘겨 사진도 다 첨부해서 넘겨

★사장님이 붙인 사진 5장 — ★파일로 받았다 (2026-09-23 23:37)★ · `docs/ref/board2/` 에 넣었다:
```
docs/ref/board2/killlog-1-보조무기.png      [킬]  권총(리볼버 실루엣 · 짙은 회색)   보조무기    ← 무기명 ★보라★
docs/ref/board2/killlog-2-미션-C4해체.png   [미션] C4(타이머에 「05」 · 회색)        C4해체     ← 「미션」 줄은 킬이 아니다
docs/ref/board2/killlog-3-저격소총.png      [킬]  저격총(스코프 달린 볼트액션)      저격소총    ← 무기명 ★주황빨강★
docs/ref/board2/killlog-4-돌격소총.png      [킬]  돌격소총(AK 실루엣)              돌격소총    ← 무기명 ★빨강★
docs/ref/board2/killlog-5-투척무기.png      [킬]  투척물(화염병/수류탄 실루엣)      투척무기    ← 무기명 ★보라★ · ★오른쪽 끝이 화살표(꺾인 깃발) 모양★
```
공통 모양: 가로로 긴 한 줄 · ★연한 살구색(거의 흰) 바탕★ · 왼쪽 종류 글씨(킬/미션) · 가운데 무기 그림(회색 실루엣) · 오른쪽 무기 이름(색이 종류마다 다르다) · 글씨 크기 다 같음.
⚠ **CLAUDE.md 2-4 — 원본 사이트 그림을 복사하지 않는다.** 이 5장은 ★모양 참고용★ 이다.
   화면에 나갈 아이콘은 **우리가 그린 SVG** 로 만든다 (`packages/ui/src/v3/` 에 `WeaponIconV3.tsx` 같은 새 파일).
   바탕색도 그대로 베끼지 않는다 — 우리 톤(레드킬 = 지금 빨강 톤 · 블루킬 = 연한 파랑)으로 옮긴다.

해석·할 일 (번호 = 사장님 순서):
0. **옛 경기분석이 남아 있다** — 어디인지 먼저 찾는다(§3-2 후보). 찾으면 그 화면도 진영판(`RoundFlowChartV3`)으로. 옛 판은 스위치로 남긴다.
1. **재생 단추를 판 아래로.** 지금은 위 HUD 줄에 있어 마우스를 내리다 그래프 위를 지나면 hover 가 재생을 끊는다 → 단추를 죽은 차례 칸 위/아래로 내리고, **재생 중엔 hover 로 안 끊기게**(재생 중 hover 무시 또는 hover 는 멈춤 상태에서만).
2. **클랜마크 단추(축 위 커서)가 축을 따라와야 한다.** 지금은 오른쪽 끝에 고정 — 그리는 중이든 재생/hover 로 축이 움직이든 마크가 x 위치를 따라가게. `RoundFlowChartV3` 의 커서 x 와 마크 렌더 위치를 같은 값으로.
3. **그래프를 더 찌글찌글·역동적으로.** 라운드 사이를 직선/부드러운 곡선으로 잇지 말고 라운드 안의 킬 하나하나(배틀로그 시각 순)를 점으로 찍어 꺾이게 — 데이터가 있으면 킬 단위, 없으면 라운드 안에서 킬 수만큼 계단. 옛 곡선은 스위치.
4. **전반/후반 구분선을 확실하게** — 굵은 세로선 + 「전반 | 후반」 라벨 + 배경 톤 차이.
5. **죽은 차례 칸**: `haeil >>> 현물` 화살표 대신 **[킬러 마크+닉] [무기 그림] [피해자 마크+닉]** 처럼 누가 봐도 「쐈다」 가 보이게. 배경색: **레드가 블루를 죽임 = 지금 빨강 톤 그대로**, **블루가 레드를 죽임 = 연한 파랑**. 마크는 지금 쓰는 클랜마크/사람 아이콘 그대로.
6. **폭탄 설치/해체 로그 추가** — 누가 설치했고 누가 해체했는지 죽은 차례 칸에 「미션」 줄로. 배틀로그 이벤트 종류를 봐야 한다(`packages/nexon` battlelog → C4 plant/defuse 필드 확인 · `zone-means-victim-position` 메모리 참고). **라운드 점수 옆 「설점」 표기**: 설치 성공/해체 성공한 팀 쪽에 `설점:1  3:2  설점:0` → 다음 라운드 `설점:2  4:2  설점:1` 처럼 반마다 누적, **후반 넘어가면 0 으로 초기화**(half 점수와 같은 규칙).
7. **세로 한 칸 더** — 설치 줄이 생기니 죽은 차례 칸 고정 높이(폰 152 · PC 176)를 한 줄 더(≈ +26/+30).
8. **킬 로그에 무기 종류** — 보조무기 / 투척 / 저격소총 / 돌격소총 구분해서 줄마다 표시(위 사진 형식). 배틀로그에 무기 코드가 있다(`0=라이플 1=스나이퍼` 는 포지션용 — 킬 무기는 배틀로그 줄의 weapon 필드 · `packages/nexon` 스키마 확인).

캡쳐 규칙: 항목 하나 끝날 때마다 PC·폰 캡쳐(`scratchpad/shot.mjs` · 로컬은 `seed-flow.mjs` 합성 데이터 · 운영은 배포 후).

---

## 8. ★§7-6·§7-8 사전 조사★ (2026-09-24 새벽 · 인계 세션이 코드만 읽고 적음 · ★코드는 안 고쳤다★)

§7 의 6번(폭탄 설치/해체)과 8번(킬 무기 종류)은 **배틀로그에 뭐가 들어 있는지**가 제일 큰 미지수였다. 읽어서 확인한 것만 적는다.

### 이미 있는 것 (새로 안 만들어도 된다)
| 무엇 | 어디 | 내용 |
|---|---|---|
| 폭탄 설치/해체 사건 뽑기 | `packages/nexon/src/roundSide.ts:117` `bombEvidenceOf()` | `{ round, team, action: 'install' \| 'dismantle', x, y }` 목록을 낸다. 진영 판정이 이미 이걸 쓴다 |
| 그걸 쓰는 곳 | `roundFlow.ts:159` · `clanRound.ts:394` · `clanHexV2.ts:1070` | ★라운드 흐름(`roundFlow.ts`)이 이미 bomb 을 읽고 있다★ — §7-6 의 「설점」은 여기서 세면 된다 |
| 경기별 선수 무기 | `weapon.ts` `classifyWeapon()` | 이건 ★포지션(라플/스나)★ 판정이다. **킬 한 줄의 무기와 다르다** — §7-8 에 쓰면 안 된다 |

### 배틀로그 한 줄의 실측 필드 (`docs/PLAYER_TRAITS_SPEC.md:186` · `roundSide.ts:75`)
```
round          라운드 번호
event_time     "MM:SS" — ★경기 전체 누적 시간★ (라운드 기준 아님)
event_type     kill | death | bomb | g_death
weapon         riple | sniper | throw | assist | close | c4-install   ← ★여기에 c4-dismantle 도 온다★ (roundSide.ts 가 실제로 읽는다)
target_weapon  같은 값. ★폭탄 줄은 행위자가 target_* 쪽에 실려 오는 경우가 있다★ — 둘 다 봐야 한다
kill_x/kill_y  죽인 사람 자리. ★폭탄 줄에서는 설치 자리★ (death_x/y 는 0,0)
user_nick / target_user_nick   죽인 사람 / 죽은 사람
```
- `riple` 은 오타가 아니라 ★넥슨이 실제로 쓰는 철자★ 다 (`DECISIONS.md:7173`). 고쳐 쓰면 하나도 안 맞는다.
- 한 줄은 ★가해자·피해자 두 관점★ 으로 두 번 온다 → `event_type === 'kill'` 만 센다. 두 관점 다 세면 킬이 두 배다.

### ★[미확인] — 다음 세션이 제일 먼저 확인할 것★
```
사장님 사진의 「보조무기(권총)」에 해당하는 weapon 값이 ★문서에 없다★.
weapon.ts:19 주석은 「권총·근접·투척·특수」 넷을 뺀다고 적었는데, 실측 목록에는 close(근접)·throw(투척) 뿐이고
권총·특수의 실제 문자열은 아무 데도 안 적혀 있다.  ★지어내지 말 것.★

확인 방법 (VPS · §0-A 로 접속한 김에 같이):
  SELECT ev->>'weapon' AS w, count(*)
  FROM "BarracksBattleLogRaw", jsonb_array_elements(payload->'events') ev
  WHERE ev->>'event_type' = 'kill'
  GROUP BY 1 ORDER BY 2 DESC;
  (statement_timeout='500s' + 세션 풀러. 범위를 최근 며칠로 좁혀서 먼저 볼 것 — payload 를 넓게 읽으면 240초를 넘긴다)

나온 값 그대로 화면 이름에 짝지운다:
  riple → 돌격소총 · sniper → 저격소총 · throw → 투척무기 · (권총 값) → 보조무기
  close(근접) · assist(어시스트) · 못 본 값 → ★모르는 것은 그림 없이 이름만★ 적는다. 임의로 묶지 않는다
```
