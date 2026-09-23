# HANDOFF 2026-09-23 밤 — 다음 세션이 이걸 먼저 읽는다

> 사장님이 「압축하지 말고 전부 전달」 하라 하셨다. 빠짐없이 적는다. `CLAUDE.md` 규칙(허락 안 구함 · 옛 판 남김 · typecheck 초록일 때만 push · 항목마다 PC·폰 캡쳐)은 그대로.
> 오늘 낮~밤 인계는 `docs/HANDOFF_2026-09-23.md`(오후) + `docs/STATE.md` 「0-진영판」「0-밤」 절에 있다. 이 파일은 ★그 뒤★ 다.

---

## 0. 지금 당장 남은 일 (우선순위 순)

| # | 무엇 | 상태 | 어디 |
|---|---|---|---|
| A | **누락 경기 되메우기** — deluxe/자이언트 건이 계기. 원인은 §2. 미리보기까지 돌렸고 **`--confirm` 은 아직 안 눌렀다** | ★진행 중★ | VPS `/root/log/backfill-preview.log` |
| B | 되메우기 재발 방지 — 밤마다 깊은 훑기(`PROJECT_REWIND_HOURS=24`) 예약 | 미착수 | VPS crontab · `scripts/quiet-hours.sh` |
| C | 만료(`expelledAt`) 찍힌 활성 클랜 21곳 복구 (§2-③) | 미착수 | `LeagueClan.expelledAt` |
| D | 사장님 마지막 UI 요청 둘 — 클랜 페이지 상대전적 **펼쳐진 채로** · PC 보드 폭을 **클랜랭킹(1120) 과 통일**하고 카드는 Canva 대각선처럼 **비율로 줄임** | 미착수 | §3-마지막 |
| E | 「경기 카드의 래더 증감 +29점」 층으로 못 적어 그대로 — 사장님 확인 필요 | 확인 대기 | |

---

## 1. 오늘 밤 사장님 지시와 처리 결과 (시간순 · 전부)

전부 `origin/main` (커밋 `cdfe3cc3` … `9bc75deb`). 로컬 QA 는 합성 데이터(`scratchpad/seed-flow.mjs`)로, 운영은 3rdcloud.my 캡쳐로 확인했다.

### 경기분석 / 라운드 흐름 (`RoundFlowChartV3.tsx` · `ClanDetailV3.tsx` · `PlayerDetailV3.tsx`)
- 진영판: 그래프 → 인원(사람 아이콘) · 전반전/후반전 · nR · % → 「레드 클랜 n:n 클랜 블루」(그 반의 점수 · 후반 0:0 · 좌우 바뀜) → 죽은 차례 두 칸(왼쪽 = 레드가 잡은 것) ✅
- 죽은 차례 칸 높이 고정 152(PC 176) ✅ · 재생 라운드당 5초 ✅ · 재생하면 선을 **처음부터 그리며** 진행 ✅
- ❚❚ 멈춤 → **그 자리에 딱 멈춤**(다시 ▶ 면 이어서) ✅ · 축 위 빨강/파랑 점 삭제 ✅
- **보일 때 한 번만 그림** (IntersectionObserver · 안 보이면 안 그림 · 다시 안 그림) ✅ — ⚠ 「육각 겹쳐서 버튼 누르면 가끔 그래프가 안 그려지고 멈춘다」 는 **재현·검수 못 함** (§4)
- 명단 칸: 플레이어 · 순위(리그 개인랭킹 · 계약 `league_rank`) · kda · 세이브 「n회」 · 포지션 ✅ · MVP 줄 닉네임 잘림 → ★만(compact) ✅
- PC 한 판 카드: 전체 폭(1316) · 명단|육각(360)|명단 · 밑에 라운드 그래프 **늘 보임**(HEX_CENTER_PC) · 접힌 머리줄 `zoom 1.3` · 경기분석 단추 PC 숨김 ✅ — ⚠ 사장님 「**너무 커서 한눈에 안 들어와**」 → §0-D 로 되돌리는 중

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
- ⚠ 사장님: 「상대전적 접혀 있다 **펼쳐 놔**」 → §0-D

### 랭킹
- 래더 **무조건 「31층」**(버림 · 소수점·점수 없음) · 래더 색 없앰 ✅ (`formatRating` · 옛 판 `formatRatingLegacyDecimal/Point`)
- 개인랭킹 폰: 마크 20 · 클랜명 안 적음 · 「n승 n패 n%」 · 킬뎃 %만 ✅ · 클랜랭킹 폰 「n승 n패」 ✅

### 홈
- 배경 2차 그림(깃발·성·아가멤논 · `/brand/home-hero.webp` 1920 · 폰 900 · 옛 그림 `-v1`) · 검색창 **망토 위**(PC top 56vw−60 · 폰 230) · 로고 왼쪽 상단 홈버튼 · Hot게시판 840 ✅

### QA
- `scratchpad/qa.js`(잘림·칸밖·겹침) + `measure.mjs` 6번째 인자 클릭. 7화면 × PC/폰 가로넘침 0. 남은 잘림: 폰 죽은차례 긴 합성 이름뿐.

---

## 2. ★누락 경기 원인 조사 결과★ (사장님 「원인 조사하고 누락 싹 다 채워」)

### 계기
자이언트(deluxe · playerId `cmtler9ah00lavlew9wb734vt`)의 9/19 이후 IPL 경기가 우리 기록실에 없다. 병영수첩엔 있다.

### 실측 (운영 DB · VPS 에서 `node probe*.mjs` 로 잼 · 스크립트는 `scratchpad/vps_probe1~14.mjs`)
```
deluxe 를 subject 로 긁은 원문(BarracksClanMatchRaw)  ★0건★  (요청은 1,210번 · 전부 200 · 새 경기 0)
상대 클랜 원문에는 deluxe 경기가 들어 있다            9/19 하루 40건 중 ★7건 Match 없음★
시즌 창(9/3~) 전체 — 양쪽 다 활성 등록 클랜인데 Match 없음   ★5,944건★  (매일 140~570건)
```

### 원인 ① — 투영기 커서가 2시간만 뒤로 본다 (`apps/worker/src/jobs/unifiedProject.ts` ~L380)
`unified-project` 는 「이미 만든 가장 큰 경기키 − 2시간」부터 이어간다(`PROJECT_REWIND_HOURS` 기본 2).
누락 6건 중 4건은 **원문이 경기 시각보다 2~4.6시간 늦게 도착**했고 그때 커서는 이미 지나가 있었다 → 영영 안 본다.
주석엔 「늦게 오는 건 밤에 24시간 깊게 훑는 판이 줍는다」 고 적혀 있는데 **그 예약이 crontab 에 없다** (`grep REWIND` 0건).

### 원인 ② — 이름 충돌로 「모르는 클랜」 처리
`--from-start` 미리보기 「넘어간 사유」: `unknown_clan 39,536` · `map_not_in_league 419` · `before_cutoff 77,404` · `already_exists 8,884`.
「같은 이름 다른 클랜이라 뺀 이름」 목록에 deluxe · amaryllis · QuasaR- · Celebrity · afterpray … **주요 클랜이 거의 다** 들어 있다 — 옛 시드/미러 클랜과 이름이 겹쳐 `nameIndex` 가 모호로 보고 앉히지 않는다(`leagueVerdict.ts resolveSides` ②). subject(slug)로 앉히는 ①이 실패하면 ②도 막혀 `unknown_clan`.
⚠ **`--from-start --confirm` 을 그냥 누르면 이 39,536건은 그대로 안 만들어진다.** 이름 충돌을 먼저 풀어야 한다(§0-A 의 핵심 판단 지점).

### 원인 ③ — 활성 클랜 21곳이 `expelledAt` 로 수집 대상에서 빠졌다
`cpl-setup --sync` 가 2026-09-22 00:15:56Z 에 **CPL 명단에 없는 클랜을 전부 내렸다** (nolink 10 · sanply 10 · supply 1). 최근 7일 경기가 있는 곳들이다:
`SDFSD123451 wonju1 revivalcrew alsrmsgmlwn12 Cherish20 4and regg lllllr8 FEXPERT hhmk8299 20210223 thefirst100 sologame cutezzzz topGiJang yoonjae06 qwdklqhwkldq solbi0723 asdf2as Nineoneclan smilemiso`
→ 수집기 `pendingClans` 가 `expelledAt IS NULL` 만 보므로 9/22 이후 이 클랜들 원문이 안 들어온다.
복구: `UPDATE "LeagueClan" SET "expelledAt"=NULL WHERE "expelledAt"='2026-09-22 00:15:56.062' AND leagueId IN (nolink,sanply,supply)`. ⚠ CPL 리그(`cpl`) 것은 건드리지 말 것.

### 원인 ④ — deluxe/crucialrz/NeedBackup 은 slug 로 200 을 받는데 경기가 0
`ferwfwfwfwf`(deluxe · origin 3rd.supply) · `ipl-backspace00` · `ipl-yoonsh1971` — 병영 목록 API 가 빈 목록을 준다. slug 가 실제 병영 주소가 아닐 가능성. `clan-find-missing` 으로 다시 찾거나 `BarracksClanNumber`(deluxe 는 150531000663 있음)로 번호 기반 수집이 필요. 미해결.

### 되메우기 실행 방법 (아직 안 함)
```
ssh -i ~/.ssh/sacloud_vps root@49.247.203.71
cd /root/sacloud && . /root/sacloud.env && export SACLOUD_DB_SESSION_POOLER=1
# 1) 이름 충돌 먼저 확인 — 왜 deluxe 가 ambiguous 인지 (Clan 표에 같은 name 두 줄?)
# 2) 미리보기:  pnpm --filter @sacloud/worker nexon unified-project --from-start        (4분 34초 · DB 세션 풀러)
# 3) 적재:      … --from-start --confirm   ← 잠금: flock /var/lock/sac-project.lock 잡고
# 4) 그 뒤 battlelog-lineup --all-leagues --confirm · player-hex-build · clan-hex-v2-build 가 크론으로 따라온다
```
⚠ VPS 는 git pull 자동 아님(메모리 `vps-batch-server-manual-deploy`). 워커 코드를 고치면 잠금 4개 잡고 pull·install·generate.
⚠ DB 질의 statement_timeout 이 짧다 — 긴 조사는 `SET statement_timeout='240s'` 먼저.

---

## 3. 사장님이 말한 것 중 아직 못 한 것 (전부)

1. **클랜 페이지 상대전적 펼친 채로** (`ClanDetailV3.tsx` `HeadToHeadCard` `folded` 기본 false 인데 사장님 화면은 접혀 있음 → `ClanVsTiersCard`/`vsOpen` 쪽 확인)
2. **PC 보드 크기 통일** — 「모든 페이지 보드 크기를 클랜랭킹 페이지(1120)와 통일」 + 「카드가 부담스럽게 커 · Canva 대각선처럼 비율로 줄여」 → `.sac-player-page .pc-container 1360`→1120 되돌리고, 한 판 카드의 `zoom 1.3` 을 빼거나 `.v3-board` 전체에 `zoom .85` 같은 비율 축소. 폰은 그대로.
3. 「육각 겹쳐서 버튼 누를 때 가끔 그래프 안 그려지고 멈춤 · 킬뎃 누적 그래프도」 — 검수 요청. 지금 라운드 그래프는 IO 로 한 번만 arm 하므로 **칩(pick) 바꿔도 다시 안 그림** = 멈춘 것처럼 보일 수 있다. `MatchHexagonV3` 는 `useDrawIn(1800, id, svgRef)` 로 id(pick 포함)가 바뀌면 다시 그리는데, IO 가 이미 disconnect 된 뒤라 `armed` 가 false 로 리셋되어 안 그려질 수 있음 → `useDrawIn` 의 restartKey 변경 시 IO 재부착 로직 점검.
4. 래더 증감 「+29점」 표기 확인(§0-E)
5. 누락 되메우기 §2

---

## 4. 함정 (오늘 밤 새로 밟은 것)

- 로컬 dev 의 캡쳐가 **뼈대(skeleton)** 로 찍힐 때가 있다 → `curl` 로 두세 번 데운 뒤 찍는다. `shot.mjs` 는 단추가 토글이라 4초 기다렸다 판단하게 고쳤다.
- `measure.mjs`/`shot.mjs` 로 운영을 찍을 때 배포가 붙기 전 옛 화면이 나온다 → HTML 에 새 문자열(예: `라이플</span>`)이 있는지 curl 로 확인하고 찍는다.
- 템플릿 리터럴 CSS 주석 안에 백틱을 쓰면 TS 가 깨진다(`.sac-player-page` 주석에서 한 번 당했다).
- apps/web DB 테스트 9건은 로컬 합성 데이터 때문에 깨진다 — 운영 코드 문제 아님. `pnpm vitest run packages/ui` 로 본다.
- 로컬 DB 안 뜨면 `postmaster.pid` 지우고 `pg_ctl start` (경로는 STATE.md 「로컬 QA 길」).

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

## 6. 다음 세션 첫 줄
```
docs/HANDOFF_2026-09-23_NIGHT.md 읽고 0절 순서대로. 누락 되메우기는 2절 원인② 이름 충돌부터 풀고 --confirm.
```
