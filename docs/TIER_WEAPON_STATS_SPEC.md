# 동티어 · 무기별 킬뎃/승률 표시 사양 (지시 #21 · 2026-09-02)

> 계산팀(LANE B)이 총괄 지시서 #21 과 그 정정을 받아 쓴 **사양 초안**이다. 구현은 사양 승인 뒤.
> 숫자는 전부 **운영 DB 를 2026-09-02 14:5x 에 읽어서** 얻은 것이다 (읽기만 · 스크립트
> `apps/worker/src/dev/_tmp/tierWeaponFeasibility.ts` · 커밋 안 함). 로그를 보고 적은 것은 없다.

## 0. ★이 문장이 사양 전체를 정한다★ — 사장님 정정 (2026-09-02)

> "1티어끼리의 경기만 기록한다거나 2티어끼리의 경기만 기록한다거나 그런게 아니다.
>  기록은 모든경기를 하고 점수도 그에 맞게 받지만 **보이는 킬데스와 승률을 수정하는거 뿐**이다"

```
수집      전부 그대로. 모든 경기를 저장한다. 티어로 거르지 않는다
래더      전부 그대로. 다른 티어와 붙은 경기도 점수는 정상 반영된다. 3-B 공식에 한 줄도 손대지 않는다
바뀌는 것 화면에 보이는 킬뎃·승률의 **집계 범위** 하나 — 기본값을 「동티어 경기만」으로
```

즉 **표시 계층(집계 질의) 전용** 작업이다. `Match` · `MatchPlayerStat` 의 저장 모양, 수집기,
`rate.ts` · `season0.ts` 의 계산은 건드리지 않는다. 바뀌는 것은 「어느 행을 더해서 보여 주나」뿐이다.

## 1. 사장님 원문 (요지 · 총괄 지시서 그대로)

1. 기본값 = **자기 티어 상대 경기만**으로 계산한 킬뎃·승률. 클랜 기록도 같다
2. 기록실 **아래**에 티어별로 따로 다 보여준다 — 통합(1~6 합) / 1티어 / … / 6티어
3. 승률·킬뎃을 적을 때는 **항상 몇킬 몇데스 · 몇승 몇패**를 같이 적는다
4. **킬뎃은 무기별로만** — 스나킬뎃 = 스나 든 판만, 라플킬뎃 = 라플 든 판만. **통합킬뎃은 안 쓴다**
5. **대표 킬뎃 = 본인 포지션의 무기 킬뎃.** 라플킬뎃은 「궁금할까 봐」 따로
6. 시즌0에서 정해진 스나수/라플수 포지션은 **다음 시즌에도 그대로**
7. **신규 유저는 30판까지 통합킬뎃만.** 30판이 끝나면 포지션을 확정하고 그 무기 킬뎃으로

## 2. ★할 수 있는가 — 숫자 3개 (운영 실측 · 시즌0 창 7/1~)★

| | SPL (`supply`) | 10mountain (`sanply`) | IPL (`nolink`) |
|---|---|---|---|
| 참가행 | 33,496 | 78,600 | 15,620 |
| **① 무기 아는 행** | 33,465 (**99.9%**) · 스나 6,696 · 라플 26,769 | 78,600 (**100%**) · 스나 15,720 · 라플 62,880 | 15,355 (**98.3%**) · 스나 3,104 · 라플 12,251 |
| 킬뎃 아는 행 | 33,272 (99.3%) | 78,600 (100%) | 15,620 (100%) |
| **② 경기당시 티어 채움** | **100%** (NOT NULL 열) | **100%** | **100%** |
| 티어 값 분포 (경기) | (1,1) 291 · (1,2) 261 · (2,1) 275 · (2,2) 2,527 | (1,1) 7,860 — 티어가 하나뿐 | 2~6 티어끼리 25가지 조합 (1티어 클랜 **0곳**) |
| **③ 동티어 경기 비율** | 2,818 / 3,354 = **84.0%** | 7,860 / 7,860 = **100%** | 8,530 / 24,662 = **34.6%** |
| 동티어 **참가행** 비율 | 28,136 / 33,496 = 84.0% | 100% | 6,720 / 15,620 = **43.0%** |

### 2-1. 무기 — D-034 와의 모순은 없다

`CLAUDE.md` D-034 「넥슨 API 는 무기를 안 준다 → null」은 **넥슨 Open API 로 들어온 경기**
이야기다. 시즌0 창의 경기는 미러(`3rd.supply` — 라인업에 `[S]` 표기가 있다)와 병영수첩
(`nexon_barracks` — 배틀로그에서 무기를 읽는다)에서 왔고, **둘 다 무기를 준다.** 그래서
`LeaguePlayerWeaponStat` 과 `sniperRatingDelta`/`rifleRatingDelta` 가 이미 채워져 있다.
무기를 모르는 행은 SPL 31 · IPL 265 뿐이다 → **4·5번은 할 수 있다.** 모르는 행은 어느 무기에도
넣지 않는다(지금도 그렇다 · `foldWeekly` · `season0Apply`).

⚠ 다만 IPL 의 「참가행」 자체가 **전체 경기의 6.3%** 다 (라인업 있는 경기 1,562 / 24,662 ·
HANDOFF 3-1). 무기 채움률 98.3% 는 **그 6.3% 안에서의** 숫자다. 병영수첩 소급 수집(LANE A)이
끝나야 IPL 선수의 킬뎃이 「그 사람이 뛴 전부」가 된다. 이 사양이 그것을 앞당기지는 않는다.

### 2-2. 경기 당시 티어 — 저장돼 있고 이미 쓰고 있다

`Match.redDivisionAtMatch/blueDivisionAtMatch` · `MatchPlayerStat.playerDivisionAtMatch/
opponentDivisionAtMatch` 는 **NOT NULL** 이라 채움률이 100% 다 (모든 투영기가 넣는다 —
`project.ts` · `reconstruct.ts` · `iplProject.ts` · `battlelogLineup.ts`).
그리고 `packages/contract/src/tierBreakdown.ts` 의 `buildTierBreakdown()` 이 이미
**상대 티어별 승률**을 `opponentDivisionAtMatch` 로 만든다 (10판 미만이면 `null`).
**현재 티어로 계산하지 않는다** — 그 파일 머리말이 3-B 4번과 같은 이유를 적어 두었다.

### 2-3. 「자기 티어」의 정의

- **IPL**: `LeagueClan.division` = 티어(1~6). `Clan.tier` 와 항상 같이 움직인다
  (`packages/db/ops/independentLeague.ts` 178행 · `--sync`). 실측: 43개 클랜 전부 `division == tier`
  ((2,2) 11 · (3,3) 7 · (4,4) 9 · (5,5) 10 · (6,6) 6). **1티어 클랜은 0곳**이다.
- **SPL**: `division` 1·2 = **부리그**. `Clan.tier` 는 null (1곳만 5). 사장님 말의 「티어」가
  부리그를 뜻하는지는 **[미확인]** — 5장 ①.
- **10mountain**: division 1 하나. 동티어 = 전부. **이 규칙으로 값이 바뀌지 않는다.**
- **선수의 티어** = 선수 개인의 값이 아니다. **그 경기에서 뛴 팀의 경기 당시 티어**
  (`playerDivisionAtMatch`)다. 용병으로 다른 티어 팀에서 뛴 판은 그 팀의 티어로 센다 —
  「소속 클랜 티어」로 세려면 `rosterLeagueClanId` 의 당시 티어가 필요한데 **저장돼 있지 않다.**
  총괄 가정: **뛴 팀의 티어**로 간다. 용병 판이 많은 선수는 값이 갈릴 수 있다 (5장 ④).

### 2-4. 포지션 — 사람이 적은 값은 0명, 30판 이상은 10~24%

| | SPL | 10mountain | IPL |
|---|---|---|---|
| 시즌0 선수 | 1,450 | 2,356 | 1,456 |
| **30판 이상** (포지션 확정 대상) | 258 (17.8%) | 567 (24.1%) | 138 (9.5%) |
| **30판 미만** (통합킬뎃 대상) | 1,192 | 1,789 | 1,318 |
| 30판 이상 중 두 무기 다 든 선수 | 151 (58.5%) | 408 (72.0%) | 75 (54.3%) |
| 후보 A — 스나 판 ≥ 50% → 스나수 (기존 `isMain` 규칙) | 41 | 70 | 20 |
| 후보 B — 스나 판 ≥ 60% → 스나수 | 38 | 50 | 17 |
| 스나 40~60% (두 안이 갈리는 구간) | 5 | 47 | 6 |
| 스나 < 40% (라플수 확정) | 215 | 470 | 115 |
| 사람이 직접 적은 포지션 (`Player.position`) | 0 | 0 | 0 |

좌표 판정(`PlayerPositionProfile`)은 전체 1,280행이지만 **스나수는 좌표로 정하지 않는다**
(`playerPosition.ts` — 스나수는 무기, 2F/B/숏이 좌표). 이 사양에 필요한 것은 「스나수냐
라플수냐」 둘뿐이므로 좌표 판정은 쓰지 않는다.

## 3. 규칙 (못 박는 것)

### 3-1. 동티어

```
선수   MatchPlayerStat 행 중  playerDivisionAtMatch == opponentDivisionAtMatch
클랜   Match 행 중            redDivisionAtMatch   == blueDivisionAtMatch
```
- 티어를 모르는 경기는 없다 (NOT NULL). 만약 생기면 **제외**한다 — 0 으로 세지 않는다.
- 모집단은 지금 화면과 같다: 시즌0 창(`season0Scope`) + 래더 반영 경기(`withLadderMatch`).
  여기만 다르게 세면 같은 카드 안에서 숫자가 어긋난다.

### 3-2. 표기 — 항상 원값 병기

```
승률   62.2% (145승 88패)
킬뎃   134% (2,145킬 1,601데스)      ← 지금 화면의 킬뎃 단위(%)를 그대로 쓴다
```
- 0판 → **「기록 없음」**. 값이 없음(무기 미상 등) → **null → 「알수없음」**. 절대 0 으로 채우지 않는다.
- 승률은 기존 `TIER_WIN_RATE_MIN_GAMES = 10` 미만이면 티어별 표에서 `null`(「—」). 기본값 카드에도
  같은 기준을 쓸지는 **[미확인]** — 지금 정보줄은 1판부터 승률을 적는다. 총괄 가정: **정보줄은 지금대로
  1판부터, 티어별 표만 10판**.

### 3-3. 킬뎃은 무기별로만

```
스나킬뎃  weapon = 1 인 판의 (kill, death) 합      ← 이미 LeaguePlayerWeaponStat 이 이렇게 센다
라플킬뎃  weapon = 0 인 판의 합
통합킬뎃  30판 미만 선수에게만 보인다 (3-4)
```
- K/D 를 모르는 행은 분모에서 뺀다 (D-148 · `knownStatGames`). 무기를 모르는 행은 어느 쪽에도 안 넣는다.

### 3-4. 대표 킬뎃 (정보줄·랭킹표에 적는 하나)

```
role 이 정해졌다          → 그 무기의 (동티어) 킬뎃. 다른 무기 킬뎃은 옆에 작게
role 이 아직 없다 (30판 미만) → 통합 (동티어) 킬뎃            ← 통합을 쓰는 유일한 경우
```

### 3-5. 포지션(role) 확정 — **30판 시점에 한 번**

- **30판** = 그 리그 안 · 시즌0 창 · 래더 반영 판수 (총괄 가정. 리그마다 role 이 다를 수 있다 —
  같은 사람이 SPL 스나수 · IPL 라플수일 수 있고, 데이터도 리그별로 따로 있다).
- **판정 규칙 — 후보 A 를 권한다**: 무기 아는 판 중 **스나 ≥ 50% → 스나수, 아니면 라플수.**
  이미 `LeaguePlayerWeaponStat.isMain` (D-173) · `mainWeaponOf()` (traits) · 무기 랭킹 모집단이
  같은 규칙이라 **화면마다 다른 답이 나오지 않는다.** 정확히 반반이면 `mainWeaponOf` 는 `null`
  인데 role 은 하나여야 하므로 **라플수**로 (총괄 가정 — 라플 판이 4배 많다).
  후보 B(≥ 60%)와 갈리는 선수는 SPL 5 · 10mountain 47 · IPL 6 명 (2-4 표).
- 확정 뒤에는 **바꾸지 않는다** (사장님 6번). 무기 비중이 나중에 뒤집혀도 그대로다.
  사람이 직접 적은 값(`Player.position` = 스나수)이 있으면 그것이 이긴다 (`resolvePlayerPositionOf` 1순위).
- 다음 시즌: `startSeason` 은 `LeaguePlayer` 행을 지우지 않고 점수만 초기화한다 → role 열을
  **초기화 목록에서 빼면** 그대로 넘어간다. 별도 이관 작업 없음.

## 4. 영향 — 저장 · 질의 · 화면

### 4-1. 지금 데이터로 되는 것 / 안 되는 것

| 항목 | 되나 | 근거 |
|---|---|---|
| 동티어 승률 (선수·클랜) | **된다** | 티어 100% 저장 · 이미 `buildTierBreakdown` 이 상대 티어별로 센다 |
| 동티어 무기별 킬뎃 | **된다** | 무기 98.3~100% |
| 티어별 표 (통합/1~6) | **된다** — 단 IPL 1티어는 0판 「기록 없음」 | 1티어 클랜 0곳 |
| 30판 규칙 | **된다** | 판수는 이미 센다 |
| 포지션 확정 저장 | **표/열이 필요하다** | 지금은 매 조회마다 다시 계산 → 시즌 넘어가면 못 지킨다 |
| **랭킹 목록**의 동티어 승률·킬뎃 | **집계 열이 필요하다** | 2,400명을 목록마다 행 단위로 다시 셀 수 없다 |
| IPL 「그 사람이 뛴 전부」 | **안 된다 (이 사양 밖)** | 라인업 6.3% — LANE A 소급 수집 뒤 |

### 4-2. 필요한 DB 변경 (총괄이 넣는다 — 길목 파일)

**① 포지션 확정** — `LeaguePlayer` 에 열 3개 (표를 따로 두지 않는 이유: 리그별 값이고 행이 이미 있다)

```prisma
  /// 무기 포지션 — "sniper" | "rifle" | null(아직 30판 미만). **한 번 정하면 바꾸지 않는다** (지시 #21 · 6번).
  /// 시즌이 바뀌어도 초기화하지 않는다 — `startSeason` 의 초기화 목록에서 뺀다.
  weaponRole          String?
  /// 확정 시각과 그때의 판수·무기 비중 — 「왜 스나수인가」를 나중에 설명할 수 있게 남긴다
  weaponRoleDecidedAt DateTime?
  weaponRoleSniperGames Int?
  weaponRoleRifleGames  Int?
  /// "auto30"(30판 자동) | "user"(선수가 적음) | "admin"
  weaponRoleSource    String?
```

**② 동티어 누적** — `LeaguePlayer` 에 열 2개 · `LeaguePlayerWeaponStat` 에 열 5개.
`season0Apply` 가 이미 참가행을 선수별로 접고 있으므로(`acc`) 같은 자리에서 동티어 버킷을 하나 더
세면 된다. select 에 `playerDivisionAtMatch` · `opponentDivisionAtMatch` 두 열만 추가.

```prisma
  // LeaguePlayer
  /// 동티어(경기 당시 내 티어 == 상대 티어) 경기만 센 승패 — 화면 기본값 (지시 #21)
  sameTierWin  Int @default(0)
  sameTierLose Int @default(0)

  // LeaguePlayerWeaponStat
  /// 동티어 경기만 센 값 — 화면 기본값 (지시 #21). 전체 값(위 games·kill·death)은 그대로 둔다
  sameTierGames          Int @default(0)
  sameTierKnownStatGames Int @default(0)
  sameTierWin            Int @default(0)
  sameTierLose           Int @default(0)
  sameTierKill           Int @default(0)
  sameTierDeath          Int @default(0)
```

**③ 클랜** — `LeagueClan` 에 `sameTierWin Int @default(0)` · `sameTierLose Int @default(0)`.
`season0Apply` 의 클랜 plan 에 `Match.red/blueDivisionAtMatch` 비교로 채운다.

옛 열(전체 누적)은 **지우지 않는다** — 「통합(1~6티어 합)」 줄과 30판 미만 선수가 그 값을 쓴다.

### 4-3. 재계산 비용

- 새 열은 전부 `season0Apply`(매시간 자동)가 채운다. 이미 읽는 참가행 127,716개(33,496 + 78,600 + 15,620)를
  **한 번 더 읽지 않는다** — 같은 루프에서 버킷만 하나 더. 추가 DB 왕복 0.
- 쓰기: `LeaguePlayer` upsert 는 이미 선수마다 한 번 한다 → 열이 늘 뿐 행 수는 그대로 (5,262행).
- 포지션 확정(①)은 **한 번만 쓴다**: `weaponRole IS NULL AND 판수 ≥ 30` 인 선수만. 첫 실행 시
  258 + 567 + 138 = **963행**, 그 뒤엔 새로 30판을 넘긴 선수만.
- 화면 쪽은 열을 읽기만 하므로 왕복이 늘지 않는다. 티어별 표는 이미 있는 `buildTierBreakdown` 질의에
  무기별 kill/death 두 쌍을 더한다 (같은 행에서).

### 4-4. 영향 받는 화면·질의 (저장소 전수 조사 · 2026-09-02)

**지금 상태 요약**
- 티어별 집계는 **승률만** 있다 — `contract/tierBreakdown.ts` + `queries/tierBreakdown.ts`(선수 · 상대 티어별)
  · `contract/clanMetrics.ts` `clanTierRecords`(클랜). **티어별 킬뎃은 어디에도 없다.**
- 무기별 킬뎃은 있다 — `LeaguePlayerWeaponStat` · `queries/playerTotals.ts` `weaponTotals` · `contract/weekly.ts` `foldWeekly`.
- 「주무기」는 **판수 많은 쪽**으로 4곳이 각자 정한다 (`records.ts` 825~829 · `ui/record/playerHeadCopy.ts` 75~78
  · `ui/record/RecordPanels.tsx` 438~443 · `LeaguePlayerWeaponStat.isMain`). 포지션 판정기(`playerPosition.ts`)와
  **연결돼 있지 않다.** 이 사양의 `weaponRole` 하나로 모아야 한다.
- 랭킹표 · 정보줄 · 리그 카드는 전부 **`LeaguePlayer.win/lose/kill/death` 평면 누적**을 읽는다 (티어 무관).

**A. 기본값이 동티어로 바뀌는 곳 (집계 열 `sameTier*` 를 읽게 바꾼다)**

| 질의 (`apps/web/lib/server/queries/`) | 화면 | 지금 읽는 것 |
|---|---|---|
| `leagues.ts` `getPlayerRanks` · `getClanRanks` · `getLeagueClans` | 개인랭킹 · 클랜랭킹 · 리그 클랜 목록 (`ui/league/RankTable.tsx`) | `LeaguePlayer` / `LeagueClan` 누적 |
| `rankings.ts` `getPlayerRanksByWeapon` | 스나/라플 랭킹 | `LeaguePlayerWeaponStat` |
| `leagues.ts` `weaponStatOf` · `playerWeaponRank(s)Of` · `records.ts` `toWeaponStats` | 정보줄 무기 킬뎃 · 무기 랭크 | `LeaguePlayerWeaponStat` |
| `players.ts` `getPlayerLeagues` · `clans.ts` `getClanLeagues` | 프로필 리그 카드 (`ui/profile/LeagueEntryCards.tsx`) | 누적 |
| `ladders.ts` `toRow` | 통합/무소속/티어 래더 | `LeagueClan` 누적 |
| `records.ts` `getLeaguePlayerDetail` · `getLeagueClanShow` · `getLeagueClanPlayers` | 선수 기록실 정보줄(`PlayerHeadCard`) · 클랜 기록실(`ClanHeadCard`) · 클랜원 표 | 누적 + `playerLadderTotals` |
| `playerTotals.ts` `playerLadderTotals*` | 정보줄 · 오늘의 성적 기준값 | `MatchPlayerStat` 행 → 여기서 `sameTier` 로 거른다 |
| `playerWeekly.ts` · `clanMetrics.ts`(`foldWeekly*`) | 주간 그래프 | 행 → 5장 ③ 가정대로 거른다 |
| `records.ts` `getLeaguePlayerSeasons` · `getLeagueClanSeasons` | 시즌 카드 | `LeaguePlayerSeason.winRate/kdRate` 저장값 — **스냅샷이라 못 바꾼다.** 옛 시즌은 그대로 (표기로 알린다) |
| Mock `packages/mock/src/store.ts` 같은 이름 함수 전부 | mock 모드 | 같은 계약 함수를 불러야 `pnpm compare` 가 맞는다 |

**B. 그대로 두는 곳 (경기 단위 · 최근 N · 흐름은 「전체 경기」가 맞다)**
`matches.ts` `toMatchPlayerStat`(경기 한 판 킬뎃) · `records.ts` `buildMatchSummary`/`buildTeammates`(최근 20판)
· `recentDays.ts` · `playerForm.ts`(월별 폼) · `todayPerformance.ts`(오늘) · `homeTop.ts`(승률·킬뎃 없음).
→ **[미확인]** 이것들도 동티어로 걸러야 하는지 사장님 말에 없다. 총괄 가정: **안 거른다** — 「최근 20판」이
동티어만 세면 20판이 아니게 된다.

**C. 새로 만드는 것**
- 티어별 표: `buildTierBreakdown` 의 `TierTally` 에 `sniperKill/Death/KnownGames` · `rifle…` 을 더한다 (같은 행에서).
  「통합」 줄 = 전체 합. UI `ui/record/TierBreakdown.tsx` 에 킬뎃 두 칸 + 원값 병기. 클랜은 `ClanMetrics.tsx` `ClanTierTable`.
- 대표 킬뎃: `resolvePlayerPositionOf` 의 `mainWeapon` 입력을 `weaponRole` 로 바꾸고, 4곳의 「판수 많은 쪽」을 전부 그 하나로.
- 계약(`packages/contract/src/entities/*`)에 `win`·`lose`·`kill`·`death` **원값 칸**이 없는 스키마
  (`league.ts` 랭킹 행 등)는 칸을 더한다 — 「몇승 몇패 병기」는 원값이 API 로 나가야 화면이 적을 수 있다.

**D. API 라우트** — 위 질의를 부르는 `apps/web/app/api/leagues/[league]/ranks/*` · `players/[playerId]` · `clans/[clan]/show|players`
· `players/[playerId]/leagues` · `clans/[clanSlug]/leagues` · `leagueplayers|leagueclans/*/seasons`. 라우트 코드는 안 바뀌고 값만 바뀐다.

## 5. ★충돌 — 총괄이 사장님께 물어야 하는 것★

### ① D-265 ③ 「IPL 1·2부 표기 전부 제거」(커밋 `9ecf1ce`) vs 「티어별 기록을 보여 달라」
- D-265 ③ 은 IPL 화면에서 **티어를 갈라 보이는 것을 없앴다** (데이터는 남김 — 총괄 가정).
- #21 의 2번은 기록실 아래에 **1티어 ~ 6티어 표**를 보여 달라고 한다 — 티어가 화면에 다시 나온다.
- 어긋나는 지점은 정확히 하나다: **「티어라는 축을 화면에 보여 주는가」.** 1번(동티어 기본값)은
  티어를 안 보여 줘도 계산은 된다. **2번(티어별 표)은 티어를 보여 줘야만 된다.**
- 물을 것: (a) D-265 ③ 이 「랭킹 탭의 1부/2부 분리」만 없애라는 뜻이었나, 아니면 티어라는 개념을 화면에서
  통째로 없애라는 뜻이었나. (b) 후자라면 #21 의 2번(티어별 표)은 어디까지 보여 주나.
- 그리고 **SPL 의 1부·2부는 「티어」인가.** 사장님은 IPL 인플레이션을 말했지만 규칙을 일반화하면 SPL 도
  경기의 16.0%(536 / 3,354)가 기본값에서 빠진다. 10mountain 은 티어가 하나라 아무것도 안 바뀐다.
  총괄 가정: **세 리그 같은 규칙** (CLAUDE.md 9장 「리그별로 칸을 감추는 분기를 만들지 않는다」).

### ② 래더 공식은 그대로다 (3-B) — 경계
- 이 사양은 **표시 계층 전용**이다. `rate.ts` · `season0.ts` · `@sacloud/rating` 에 한 줄도 손대지 않는다.
- 동티어 승률·킬뎃은 **점수 계산에 들어가지 않는다.** 활동 페널티 · 승률 자격선(`displayScore` 의
  winRate 입력)도 지금처럼 **전체 승률**을 쓴다 — 여기를 동티어로 바꾸면 래더가 바뀐다. 바꾸지 않는다.
- 무기 랭킹(`sniperRatingDelta` 순)도 그대로다. 대표 킬뎃은 랭킹 정렬에 쓰이지 않는다.

### ③ 주간 그래프(지시 #19 · `foldWeekly`)의 킬뎃·승률도 이 규칙을 따르나
- 지금 주간 추이는 **전체 경기 누적**이다. 정보줄이 동티어로 바뀌면 그래프 마지막 점과 정보줄 값이
  어긋난다 (`playerWeekly.ts` 머리말이 이 정합을 지키라고 적어 두었다).
- 총괄 가정: **그래프도 동티어 기본값**을 따른다. `WeeklyRow` 에 `sameTier: boolean` 을 더해 거른다.
  단, 순위 선(#19)은 래더 순위이므로 **그대로**다.

### ④ 용병 판의 티어
- 2-3 대로 「뛴 팀의 티어」로 센다. 「소속 클랜의 티어」로 세고 싶으면 당시 소속 티어 저장이 필요하다 (지금 없다).

### ⑤ 무소속리그 킬뎃 top100 규칙 (`INDEPENDENT_KD_RANK_LIMIT` · D-107 대체)
- 그대로 산다. 보이는 선수에게 **어느 킬뎃을** 보여 주느냐만 이 사양이 정한다.

## 6. 한 줄 요약 (보고용)

```
무기 채움률   SPL 99.9% · 10mountain 100% · IPL 98.3%  (IPL 은 라인업 있는 6.3% 안에서)
경기당시티어  세 리그 100% (NOT NULL). 이미 buildTierBreakdown 이 쓴다
동티어 경기   SPL 84.0% · 10mountain 100% · IPL 34.6% (참가행 43.0%)
30판 이상     SPL 258명(17.8%) · 10mountain 567명(24.1%) · IPL 138명(9.5%) — 나머지는 통합킬뎃
포지션 후보A  스나≥50%: 41 · 70 · 20명 / 후보B 스나≥60%: 38 · 50 · 17명 / 갈리는 구간 5 · 47 · 6명
```
