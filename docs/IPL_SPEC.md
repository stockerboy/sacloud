# IPL(무소속리그) — 기록 이관 · 랭킹 · 포지션 사양

> 2026-08-29 사용자 지시. **원본 3rd.supply 복제가 아니다.**
> `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 명시적 예외이며, D-165(무소속리그 신설)의 연장이다.
> 지시 범위를 넘기지 않는다.

---

## 0. 이 문서의 상태

**아직 한 줄도 구현하지 않았다.** 사양을 받아 적은 것뿐이다.
클랜 명단(2장)만 실제 조사로 채웠다.

---

## 1. IPL 은 공식리그·열산리그와 **다른 리그**다

혼동하면 기록이 통째로 오염된다. 아래가 사용자가 정한 경계다.

| | |
|---|---|
| 공식리그 1·2부 등록 클랜 | **IPL 에 소속될 수 없다** |
| 열산리그 참가 중인 IPL 소속 클랜 | **IPL 중복 등록·기록을 허가한다** |

즉 배타는 **공식리그 1·2부 ↔ IPL** 한 방향뿐이고, 열산리그와는 겹쳐도 된다.

### IPL = 기존 무소속리그다 (2026-08-29 사용자 확정)

> "같은 리그가 맞다. 무소속 리그의 다른 이름이다. IPL 은 6단으로 진행하라."

**새 리그를 만들지 않는다.** `slug = nolink` · `category = independent` 그대로이고,
바뀌는 것은 티어 수 하나다.

| | D-165 | 지금 |
|---|---|---|
| `League.divisionCount` | 5 | **6** |
| `Clan.tier` 허용 범위 | 1~5 | **1~6** |

상한의 단일 출처는 `packages/db/ops/independentLeague.ts` 의 `INDEPENDENT_TIER_COUNT` 다.
`updateClan()` · `registerClanTier()` · CLI 도움말 · 테스트가 전부 이 상수를 읽는다.
**숫자를 다시 박지 마라.**

`ensureIndependentLeague()` 는 이미 있는 리그의 `divisionCount` 도 이 값으로 맞추므로,
아래를 한 번 더 돌리면 5 → 6 이 된다 (멱등).

```bash
pnpm --filter @sacloud/worker nexon independent-league --confirm
```

관리자 화면의 티어 select 는 `division_count` 에서 만들어지므로 **코드 변경 없이** 6칸이 된다.

---

## 2. 등록 클랜 명단 (2026-08-29 조사)

사용자가 티어와 이름을 주었고, 병영수첩에서 실제 클랜을 찾았다.
판정 조건은 **① 이름이 비슷하다 ② 최근까지 `제3보급창고` 클랜전을 했다** 둘 다다.

> ⚠ **사용자가 적은 이름과 실제 클랜명이 다른 경우가 많다.**
> 병영수첩 클랜명은 동형문자를 즐겨 쓴다 — 소문자 `l` 자리에 대문자 `I`,
> 라틴 `P` 자리에 키릴 `Р`, `B` 자리에 그리스 `Β`. 검색은 이 차이를 구분하므로
> 사용자가 적은 철자로는 **절대 안 나온다.**

| 티어 | 사용자 표기 | 실제 클랜명 | 병영수첩 URL | 확신도 |
|---|---|---|---|---|
| 1 | amarilys | `amaryllis` | https://barracks.sa.nexon.com/clan/fdd8 | 확실 |
| 1 | igloo | `igloo` | https://barracks.sa.nexon.com/clan/luverduck12 | 확실 |
| 1 | hing’ | `hingˇ` | https://barracks.sa.nexon.com/clan/adgeodud20 | 확실 |
| 1 | evermore | `evermore` | https://barracks.sa.nexon.com/clan/4473 | 사용자 제공 |
| 2 | deluxe | `deluxe` | https://barracks.sa.nexon.com/clan/042222741 | 확실 |
| 2 | sometimes | `sometimes` | https://barracks.sa.nexon.com/clan/minjihun | 확실 |
| 2 | veritas | `〃veritas` | https://barracks.sa.nexon.com/clan/01025606089 | 사용자 제공 |
| 2 | hardcores | `hardcores` | https://barracks.sa.nexon.com/clan/ckdals2457 | 확실 |
| 2 | vuvuzela | `vuvuzela` | https://barracks.sa.nexon.com/clan/uava01 | 사용자 제공 |
| 2 | grave | `grave` | https://barracks.sa.nexon.com/clan/saffggaaz | 사용자 제공 |
| 3 | Quassar | `QuasaR-` | https://barracks.sa.nexon.com/clan/pigforever | 확실 |
| 3 | Atraxia | `Atraxia` | https://barracks.sa.nexon.com/clan/eee07 | 사용자 제공 |
| 3 | nightbloom → **pIacebo** | `pIacebo` (대문자 I) | https://barracks.sa.nexon.com/clan/ytsys | 사용자 확정 |
| 3 | pleniue | `pleniIune` | https://barracks.sa.nexon.com/clan/JJUN | 사용자 제공 |
| 3 | celestial | `ceIestial` (대문자 I) | https://barracks.sa.nexon.com/clan/IrenecIan | 확실 |
| 3 | methodcrew | `methodcrew` | https://barracks.sa.nexon.com/clan/ssdko | 사용자 제공 |
| 3 | luvme | `luvme` | https://barracks.sa.nexon.com/clan/hanbi0302 | 확실 |
| 4 | dominator | `dominator:` | https://barracks.sa.nexon.com/clan/Reverse3 | 확실 |
| 4 | promise | `Рromise` (키릴 Р) | https://barracks.sa.nexon.com/clan/Ssnake | 확실 |
| 4 | imperium | `imperium:` | https://barracks.sa.nexon.com/clan/OhMyLoVe | 확실 |
| 4 | izmir | `izmir-` | https://barracks.sa.nexon.com/clan/dregonlif | 확실 |
| 4 | crucialrz | `crucialrz` | https://barracks.sa.nexon.com/clan/backspace00 | 확실 |
| 4 | Asterisk | `Asterisk` | https://barracks.sa.nexon.com/clan/clanhanul | 확실 |
| 4 | adererror | `adererror` | https://barracks.sa.nexon.com/clan/valentina2 | 확실 |
| 4 | 레트로폭탄 | `레트로폭탄` | https://barracks.sa.nexon.com/clan/wdasdw | 확실 |
| 5 | whitelie | `whitelie:` | https://barracks.sa.nexon.com/clan/tispfgid | 확실 |
| 5 | supernova | `supernova^` | https://barracks.sa.nexon.com/clan/dbghr | 확실 |
| 5 | overstep | `overstep` | https://barracks.sa.nexon.com/clan/rokasa12 | 확실 |
| 5 | publicity | `publicity` | https://barracks.sa.nexon.com/clan/adelioz | 확실 |
| 5 | needbackup | `NeedΒackup` (그리스 Β) | https://barracks.sa.nexon.com/clan/yoonsh1971 | 확실 |
| 5 | ~~swell~~ → **romantico** | `romantico` | https://barracks.sa.nexon.com/clan/zzim1 | 사용자 확정 |
| 5 | reBellion | `reBelIion` (대문자 I) | https://barracks.sa.nexon.com/clan/JosenFam | 확실 |
| 5 | major | `Major-` | https://barracks.sa.nexon.com/clan/jjangkangsu | 사용자 확정 |
| 6 | everwhite | `everwhite` | https://barracks.sa.nexon.com/clan/kelly123 | 확실 |
| 6 | Flexible | `FlexibIe` (대문자 I) | https://barracks.sa.nexon.com/clan/lee2 | 확실 |
| 6 | 베이직 | `베이직` | https://barracks.sa.nexon.com/clan/WebClanGood | 확실 |
| 6 | souffler | `souffler` | https://barracks.sa.nexon.com/clan/ircroger | 확실 |
| 6 | Lyrical | `Lyrical:` | https://barracks.sa.nexon.com/clan/DooLii | 확실 |
| 6 | Raze’ | `Raze'` | https://barracks.sa.nexon.com/clan/tjdwlsqhrdl | 확실 |

**분포 4 / 6 / 7 / 8 / 8 / 6 = 39곳. 전부 URL 이 확정됐다.**

> `[미확인]` 이관 지시문에는 `40개의 등록된 클랜`이라고 적혀 있는데 명단은 **39곳**이다.
> `swell` 을 빼고 `romantico` 를 넣어도 수는 그대로다. **한 곳이 비는지 확인 필요.**

### 조사로 못 찾았고, 사용자가 직접 정해 준 세 곳 (2026-08-29)

조사가 막힌 자리를 **추측으로 메우지 않고 남겨 두었더니** 사용자가 답을 주었다.
아래 세 줄이 그 결말이다. **명단의 정본은 사용자다.**

| 조사 결과 | 사용자 지시 | 확정 |
|---|---|---|
| `nightbloom` 미확인 | "nightbloom → pIacebo" | `pIacebo` · `/clan/ytsys` |
| `swell` 미확인 | "swell 제거 후 romantico 등록" | `romantico` · `/clan/zzim1` |
| `Major-` 추정 | "major 이 병영으로 등록" | `Major-` · `/clan/jjangkangsu` |

클랜명은 병영수첩에서 직접 확인했다 — `zzim1` = `romantico`, `ytsys` = `pIacebo`(대문자 I).
`pIacebo` 는 조사 단계에서 리그 클랜들의 **상대 명단에 이미 잡혀 있던 이름**이다.
이름이 `nightbloom` 과 전혀 달라 우리 쪽에서는 이어 붙일 수 없었다.

**`swell` 은 명단에서 빠졌다.** 조사 기록만 남긴다 — `swell`(qwrqwrqwrq) 은 최근 200전에
제3보급창고가 **0전**이었다(듀오 130 · A보급창고 70). 판정 조건을 못 넘긴 것이 맞았다.

---

## 3. 기록 이관 범위

```
대상   위 등록 클랜들끼리 한 경기
기간   2026-01-01 ~ 2026-08-29
이후   8/30 부터는 끊지 않고 이어서 기록한다
```

시즌0 창(`2026-04-01 KST ~ 열린 구간` · D-175)과 **시작이 다르다.** 섞지 마라.

---

## 4. 랭킹

### 4-1. 클랜랭킹 — **먼저 1~40위를 보고한다**

우리 점수 시스템(D-172 v2)으로 계산해 **순위표를 사용자에게 보고**한다.
사용자가 그것을 보고 티어를 정한다. **우리가 티어를 정하지 않는다.**

### 4-2. 티어 이동은 **관리자가 정한다**

> 점수가 더 높다고 해서 3티어가 2티어로 자동으로 올라가지 않는다.
> **티어 이동은 관리자(사용자)가 결정한다.**

승격·강등 자동화를 만들지 마라.

### 4-3. 개인랭킹 — **킬데스만 숨긴다**

```
같다   통합 / 스나 / 라플 3분할 · 점수 시스템 · 표·커서·배치고사 표기 — 전부 서플라이와 동일
다르다 킬데스를 절대 노출하지 않는다.  그것 하나뿐이다
```

이것은 **D-107 을 그대로 따르는 것**이고 새 규칙이 아니다.
킬·데스는 **계산해서 저장한다.** `null` 로 넣지 않는다. 감추는 것은 **누적 킬뎃 표시**뿐이고,
경기 한 판의 K/D/A 는 그대로 보인다.

---

## 5. 포지션 판정 — 리그마다 다르다

| 리그 | 대상 기간 | 대상 선수 | 배틀로그 수집 | 화면 |
|---|---|---|---|---|
| **IPL** | 2026-01-01 ~ 08-29 | **30판 이상** | 인당 **100판** | 포지션을 개인프로필에 등록 |
| **공식리그(supply)** | **4월** ~ 현재 | **30판 이상** | 인당 **100판** (제3보급창고 배틀로그) | 포지션을 개인프로필에 등록 |
| **열산리그(sanply)** | — | **하지 않는다** | 하지 않는다 | **킬데스와 승률만** 뜨게 한다 |

### 100판을 고르는 규칙

```
좋은 쪽   등록 클랜끼리 한 경기만 골라서 100판
안 되면   제3보급창고이기만 하면 전부 뽑아 배틀로그를 확인해도 된다
```

판정 방법은 `docs/PLAYER_TRAITS_SPEC.md` 3장(격자 분포 + 코사인 + leave-one-out)을 그대로 쓴다.
자동 판정 값은 원본이 준 `Player.position`(선수가 직접 등록한 값)과 **다른 값이다. 섞지 않는다** (D-174).

---

## 6. 진행 방식

> 병렬로 진행 가능하면 진행하고, 아니라면 충분한 여유가 있을 때 섬세하고 꼼꼼하게 작업하라.

수집은 `CLAUDE.md` 3-A 를 지킨다 — 요청 간격 320ms · 원문(raw) 보존 · idempotent ·
접근 통제 우회 금지 · 검증 없이 완료 처리 금지.

---

## 7. 병영수첩 API (2026-08-29 실측)

서버에서 직접 부르면 **403**(WAF 봇차단)이다. **브라우저 페이지 안에서** `fetch` 로 부른다.
UA 를 위조해 뚫지 않는다 (`CLAUDE.md` 3-A 5번).

### 클랜 검색

```
POST /api/Search/GetSearchClanAll/<encodeURIComponent(검색어)>/<페이지>
→ { rtnCode: 0, result: { clanInfo: [{ clan_id, clan_name, clan_mark1, clan_mark2 }],
                          total_cnt, page_no } }
```

- 부분문자열 · 대소문자 무시. **동형문자는 구분한다** (`flexible` 로 `FlexibIe` 가 안 나온다)
- 한 페이지 15~20건. `total_cnt` 로 페이지를 넘긴다
- `clan_id` 가 곧 URL slug → `https://barracks.sa.nexon.com/clan/<clan_id>`

### 클랜전 목록

```
POST /api/ClanHome/GetClanMatchList/          ← 끝 슬래시가 필요하다
{ "clan_id": "<slug>", "seq_no": 0, "mode_flag": "ALL", "min_seq_no": 0 }
→ { rtnCode: 20, message: "<마지막 match_key>", result: [ ...20건 ] }
```

- 키 이름은 정확히 `clan_id` 여야 한다. `clanId`/`clan_no` 는 `rtnCode:-999`
- 값은 **URL slug** 다. 응답 안의 `clan_no`(숫자)가 아니다
- `rtnCode` 가 0 이 아니라 **20** 이어도 정상이다
- 전적이 아예 없는 클랜은 `rtnCode:0, result:""` — **배열이 아니라 빈 문자열**이다. 파싱 주의
- 페이징: `seq_no` 에 직전 페이지 마지막 항목의 `match_key` 를 넣는다. 20건 미만이면 끝

**주요 필드**

| 필드 | 내용 |
|---|---|
| `match_key` | `YYMMDDHHMMSS` + 3자리 + 3자리. **앞 12자리가 경기 시각**이다 |
| `map_name` | `제3보급창고` / `A보급창고` / `듀오` — **리그 경기 판별은 이 값** |
| `plimit` | 인원 제한 (제3보급창고 5 · A보급창고 3) |
| `red_clan_name` / `blue_clan_name` | **한 응답에 양 팀이 다 온다** — 넥슨 Open API 의 D-044 제약이 여기엔 없다 |
| `red_win_cnt` / `blue_win_cnt` | 라운드 스코어 |
| `result_wdl` | 조회 주체 기준 승/패/무 |
| `match_time` | `"3분 전"` 같은 **상대시각 문자열** |
| `match_time_date` | **항상 `0001-01-01` — 쓸모없다.** 절대시각은 `match_key` 에서 뽑는다 |

> ⚠ **`red_clan_name`/`blue_clan_name` 이 한 응답에 같이 온다는 것은 큰 의미가 있다.**
> 넥슨 Open API 는 한 경기 응답에 양 팀을 주지 않아(D-044) 팀 판정이 계속 문제였다.
> 병영수첩 클랜전 목록에는 그 제약이 없다.

### 선수 → 소속 클랜

```
POST /api/Profile/GetProfileMain/<식별자>SA     (본문 없음)
→ result.characterInfo.clan_name / clan_id      ← clan_id 가 곧 clan URL slug
```

### 실전 주의

- 상대 클랜의 slug 는 매치 목록에 **안 나온다** (이름만 온다). 이름 → slug 는 검색으로 한 번 더 조회한다
- 이름이 같은 클랜이 여럿이다. slug 를 확정할 땐 **그 클랜 매치 목록에 리그 클랜들이 상대로 나오는지** 확인한다
- 연속 호출 시 간헐적으로 `TypeError: Failed to fetch` 가 난다. 재시도 2~3회 + 대기로 흡수한다
- 요청 간격 320~400ms 로 돌렸고 차단은 없었다

---

## 8. 아직 정해지지 않은 것

- ~~`[미확인]` IPL = 기존 `nolink` 리그인가~~ → **확정: 같은 리그다. 6단으로 간다** (1장)
- `[미확인]` 등록 클랜이 39곳인가 40곳인가 (사용자 목록 39 · 지시문 40)
- ~~`[미확인]` `nightbloom` · `swell` 의 실제 클랜~~ → **확정: `pIacebo` · `romantico`** (2장)
- `[미확인]` 공식리그 1·2부 ↔ IPL 배타를 **코드로 막을지, 경고만 할지**
  (D-165 는 "막지 않고 경고만 한다" 로 두었다)
- `[미확인]` 열산리그 "킬데스와 승률만" 이 **다른 수치를 감추라는 뜻인지**,
  기존 화면에서 무엇을 빼라는 것인지 범위 확정 필요
