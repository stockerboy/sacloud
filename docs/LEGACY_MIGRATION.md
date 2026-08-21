# LEGACY_MIGRATION.md — 3rd.supply 과거 기록 이관

2026-08-21. `docs/MIGRATION_GAPS.md`의 조사 결과를 반영해 **목표를 축소한 뒤** 다시 세운 계획이다.

---

## 1. 무엇을 하려는가

원본 복제가 **아니다.** 목표는 하나다.

> 지금 활동 중인 약 5,000명이 새 SACLOUD에서
> **자기 과거 시즌의 승률 / 킬뎃 / 래더 / 순위**를 볼 수 있게 한다.

이 목표에 필요 없는 데이터는 가져오지 않는다.

### 이관 대상

시즌 **최종 요약 스냅샷**만. (`LegacyPlayerSeason`)

### 이관 대상에서 뺀 것 (기존 계획에서 폐기)

- 개별 경기 상세 (약 12만 건)
- 경기 참가자 10명 전체 · 경기별 kill/death · 상대 클랜
- 경기별 `rating_update`
- 게시판 데이터

---

## 2. 접근 원칙 — 바뀌지 않는다

운영자의 크롤링 **허가는 받았다.** 그래도 아래는 하지 않는다.

- CAPTCHA 자동 풀이
- WAF 우회
- 사람인 것처럼 브라우저 자동화
- 요청 헤더 위장
- rate limit 우회
- 비공개 endpoint 접근

허가는 "이 데이터를 써도 된다"는 뜻이지, **사업자가 걸어둔 기술적 접근 통제를 무력화해도 된다는 뜻이 아니다.**
(`CLAUDE.md` 3-A 5번)

### 그래서 지금 쓸 수 있는 경로

| 경로 | 가능 여부 |
|---|---|
| 사람이 브라우저로 정상 열람 | ✅ |
| 열어둔 페이지에서 사람이 수동/반자동 export | ✅ |
| CSV/JSON import | ✅ |
| 운영자가 주는 DB export / API / WAF 예외 | ✅ (받으면) |
| 자동 크롤러 | ❌ |

---

## 3. 과거 기록이 있는 화면

`docs/3rd-supply-structure.md` 조사 기준.

```
/league/:leagueSlug/player/:playerId/season     개인 지난시즌
/league/:leagueSlug/clan/:clanSlug/season       클랜 지난시즌   (이번 범위 아님)
```

내부 API는 `GET /leagueplayers/{leaguePlayerId}/seasons` 이고
응답은 `{ season, rank, rank_count, win, lose, kill, death, ... }` 형태다.

### ⚠ 지난시즌은 **리그마다 따로** 존재한다

한 사람의 "시즌 3"이 리그마다 다르다. 리그를 빼면 서로 덮어쓴다.
그래서 사용자 명세에 없던 `league_slug`를 **필수에 가깝게** 넣었다.
이 한 가지가 작업량 산정을 크게 바꾼다 (아래 6장).

### 화면에 실제로 있는 열 (2026-08-21 확인)

```
시즌 | 순위 | 승리 | 패배 | 승률 | 킬뎃 | 래더
```

값 예시:

```
시즌 7 | 배치고사 | 47승 | 40패 | 54%   | 73%   | 938점
시즌 6 | 8위      | 53승 | 56패 | 48.6% | 70.7% | 1,372점
```

> **주의**: 이 열 구성은 **우리 재현 화면**에서 확인한 것이다.
> 우리 화면은 원본 관측을 근거로 만들었지만, 원본과 100% 같다는 보장은 없다.
> **원본에서 한 번 확인한 뒤 확정한다.** (아래 9장)

### 확보 가능 / 불가능

| 필드 | 상태 |
|---|---|
| `season` `wins` `losses` `win_rate` `kd` `final_rating` `final_rank` | ✅ 화면에 있다 |
| `source_player_id` `league_slug` `source_url` | ✅ URL에서 얻는다 |
| `nickname` | ✅ 페이지 제목에서 얻는다 |
| `kills` `deaths` | ❌ 지난시즌 표에 **없다** (킬뎃%만 있다) → `null` |
| `division` | ❌ 개인 지난시즌 표에 없다 → `null` |
| `clan_name` | ❌ 개인 지난시즌 표에 없다 → `null` |
| `rank_count` | ⚠ 순위가 `360명중 8위` 형태면 얻고, `8위`면 `null` |

**없는 값은 `null`이다. 역산하지 않는다.**
승률만 있으면 승/패를 만들어내지 않고, 킬뎃%만 있으면 킬·데스를 만들어내지 않는다.

---

## 4. 데이터 모델

`LegacyPlayerSeason` — 운영 데이터와 **완전히 분리**한다.

- `LeaguePlayerSeason`(신규)과 별도 테이블. 조인하지 않는다.
- **신규 래더 공식으로 재계산하지 않는다.** 원본 값을 그대로 둔다.
- `rawSnapshot`에 원문을 남겨, 변환이 틀려도 다시 만들 수 있게 한다.

### 중복 방지

`dedupeKey` 컬럼 하나로 처리한다.

```
<source>|<sourcePlayerId ?? "nick:"+nickname>|<leagueSlug ?? "-">|<season>
```

복합 유니크를 쓰지 않은 이유: Postgres는 NULL을 서로 다른 값으로 봐서
`sourcePlayerId`나 `leagueSlug`가 비면 중복이 걸러지지 않는다.

### 동일인 문제

- **닉네임을 영구 ID로 보지 않는다.**
- `sourcePlayerId`가 있으면 보존한다.
- 닉네임만으로 현재 사용자와 **자동 병합하지 않는다.** 연결은 별도 검증 절차로 미룬다.

---

## 5. 도구

| 명령 | 하는 일 |
|---|---|
| `pnpm legacy:import <파일.csv>` | CSV 적재. **여러 번 넣어도 행이 안 늘어난다** |
| `pnpm legacy:import <파일.csv> --dry-run` | 저장하지 않고 검사만 |
| `packages/db/legacy/extract-snippet.js` | 열어둔 페이지에서 사람이 실행하는 추출 스니펫 |

### CSV 형식

```
source_player_id,nickname,league_slug,season,division,clan_name,
wins,losses,win_rate,kills,deaths,kd,final_rating,final_rank,rank_count,source_url
```

- 빈 칸 = `null`. 채워 넣지 않는다.
- 숫자는 `1,082점` `55%` `8위` 같은 화면 표기 그대로 넣어도 된다 (import가 정리한다).
- 모르는 열이 있으면 **경고를 띄운다** (오타로 열이 통째로 사라지는 것을 막는다).
- 잘못된 줄은 **줄 번호와 사유를 그대로 보고**하고, 나머지는 넣는다. 종료 코드는 실패로 남는다.

### 검증한 것

- 같은 파일 2회 적재 → 4행 유지 (`새로 넣음 4` → `덮어씀 4`)
- 승률만 있는 행 → `wins`/`losses` = null
- `"1,082"` → 1082 · `배치고사` → null
- 잘못된 줄 3건을 줄 번호와 함께 보고, 정상 1줄만 통과
- 변환 규칙 단위 테스트 12건 (스니펫과 매핑이 어긋나면 실패)

---

## 6. 작업량 — 수동으로는 5,000명이 안 된다

| 항목 | 추정 |
|---|---|
| 대상 유저 | 약 5,000명 |
| 유저당 리그 수 | 1~3 (평균 1.5 가정) |
| **유저당 열어야 하는 페이지** | **리그 수만큼** (지난시즌이 리그별) |
| 총 페이지 | 약 7,500 |
| 페이지당 사람 작업 | 이동 + 스니펫 실행 + 붙여넣기 ≈ 15초 |
| **총 사람 작업 시간** | **약 30시간 (쉬지 않고)** |
| 예상 행 수 | 유저당 리그 1.5 × 시즌 3~4 → **약 25,000행** (범위 15,000~50,000) |

여기에 **유저 5,000명 목록을 얻는 작업**이 별도로 붙는다.
개인랭킹이 20건 단위라 리그당 250페이지다.

**결론: 수동 추출은 샘플 검증과 소규모 보정용이다. 전량 이관 수단이 아니다.**

---

## 7. 가장 현실적인 방법 — 운영자에게 한 번 받기

전량 이관에 필요한 최소 데이터는 **CSV 한 장**이다.

```sql
-- 3rd.supply 쪽에서 한 번만 실행하면 되는 형태
SELECT p.id                AS source_player_id,
       p.name              AS nickname,
       l.slug              AS league_slug,
       s.season,
       s.win               AS wins,
       s.lose              AS losses,
       s.kill              AS kills,
       s.death             AS deaths,
       s.rating            AS final_rating,
       s.rank              AS final_rank,
       s.rank_count
  FROM league_player_seasons s
  JOIN league_players lp ON lp.id = s.league_player_id
  JOIN players p         ON p.id  = lp.player_id
  JOIN leagues l         ON l.id  = lp.league_id;
```

- 컬럼명이 달라도 된다. **매핑은 우리가 맞춘다.**
- `win_rate` / `kd`는 안 줘도 된다 — 승·패·킬·데스가 있으면 화면에서 계산한다.
  (다만 **DB에 저장할 때는 원본에 있는 값만 저장한다.**)
- 이 한 장이면 5,000명 × 전 시즌이 **한 번의 `pnpm legacy:import`로 끝난다.**

운영자가 바빠서 당장 어렵다면, 우선순위는 이렇다.

1. **CSV 한 장** (위 쿼리) — 가장 좋다
2. 읽기 전용 API 키 또는 WAF 예외 IP — 그 다음
3. 그것도 어려우면 → 상위 랭커 등 **범위를 좁혀** 수동 추출

---

## 8. 자동화할 수 있는 것 / 사람이 해야 하는 것

| 단계 | 누가 |
|---|---|
| 페이지 열기 | **사람** (WAF 때문) |
| 화면 → CSV 변환 | 자동 (스니펫) |
| CSV 검사·정규화 | 자동 (`--dry-run`) |
| DB 적재·중복 제거 | 자동 (`legacy:import`) |
| 숫자 대조·오류 보고 | 자동 |
| 동일인 연결 판정 | **사람** (자동 병합 금지) |

---

## 9. 다음에 확인해야 할 것

- [ ] **원본 지난시즌 화면의 실제 열 이름** — 우리 재현과 같은지.
      다르면 `HEADER_MAP`만 고치면 된다 (`packages/db/legacy/extract.ts`).
- [ ] 원본에 `division` / `clan_name`이 지난시즌 표에 있는지
- [ ] 순위 표기가 `8위`인지 `360명중 8위`인지
- [ ] 한 유저가 참여한 리그 목록을 어디서 얻는지 (플레이어 페이지의 "참여중인 리그")
- [ ] 운영자에게 CSV를 받을 수 있는지 / 언제쯤 가능한지

---

## 10. Phase 8(신규 수집)과의 분리

| | Legacy | 신규 |
|---|---|---|
| 출처 | 3rd.supply (사람이 추출 / 운영자 제공) | 넥슨 Open API |
| 테이블 | `LegacyPlayerSeason` | `Match` / `MatchPlayerStat` / `LeaguePlayerSeason` |
| 기간 | 시즌 1~7 | **2025-01-24 이후** (넥슨 API 제약) |
| 래더 | 원본 값 **그대로**. 재계산 안 함 | SACLOUD 공식으로 계산 (`formula_version` 기록) |
| 갱신 | 한 번 넣고 고정 | 30일 이내 재갱신 **의무** (넥슨 고지) |
| 화면 | "지난시즌 (3rd.supply 기록)" 별도 표기 | 정규 기록 |

두 데이터는 **섞이지 않는다.** 조인하지 않고, 합산하지 않고, 같은 표에 넣지 않는다.

---

## 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-08-21 | 목표를 "전체 복제"에서 "시즌 요약 보존"으로 축소. `LegacyPlayerSeason` + CSV import + 추출 스니펫 신설 |
