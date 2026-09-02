# 3rd.supply(서플라이) 구조 완전 분석

> 조사일: 2026-08-20 · 방법: 실제 브라우저로 페이지 렌더링 + Angular TransferState 덤프 + JS 번들 정적 분석 + 네트워크 인터셉트
> 목적: sacloud(서든어택 사설 게임 기록 / 티어 정리 사이트) 설계 참고

---

## 0. 한 줄 요약

3rd.supply는 **넥슨 "병영수첩"의 클랜전 기록을 긁어와서, 유저가 직접 만든 "리그" 단위로 재집계하고 Elo(래더) 점수를 매기는 사이트**다.
경기 데이터를 직접 입력받지 않고 원본(넥슨)에서 가져오기 때문에 조작이 어렵고, 리그/디비전/시즌 개념만 사이트가 자체적으로 얹었다.

---

## 1. 기술 스택 / 인프라

| 항목 | 내용 |
|---|---|
| 프론트엔드 | **Angular (v17+, standalone + esbuild)**. 앱 셀렉터 `<sp-pc-root>`, 접두사 `sp-` |
| 렌더링 | **Angular Universal SSR**. `<script id="supplyPc-state" type="application/json">`에 TransferState 주입 (키 = API URL 원문) |
| 빌드 산출물 | `/main-<HASH>.js`(168KB) + `/polyfills-*.js` + `/scripts-*.js` + 지연 로딩 `chunk-<HASH>.js` 50여 개 |
| 공개 API | `https://api-v2.3rd.supply` |
| 내부 API | `http://api.v2.internal.3rd.supply` (SSR 서버 → API 서버 직결용) |
| 정적/이미지 | `https://static.3rd.supply/marks/...png` (클랜마크 bg/front 2장 합성) |
| 호스팅 | AWS (CloudFront, IP 3.170.19.x, Route53 NS) |
| 봇 차단 | UA 기반. 일반 크롤러/서버 fetch에는 **405**를 반환하고 검색엔진 봇만 SSR HTML을 받음 (`robots.txt`는 전면 Allow) |
| 기타 | Google reCAPTCHA v3(글쓰기·리그생성), AdSense/GA4, Quill 에디터 지연 로드 |
| 앱 구분 | 상태 키가 `supplyPc-state` → PC/모바일 별도 빌드를 UA로 분기하는 구조로 추정 |
| 도메인 | 2016-02 등록, 저작권 표기 `© 2016-2026 3RD.SUPPLY`, 문의 3rdsupply@naver.com |

---

## 2. 데이터 출처 — 여기가 핵심

리그에 클랜을 초대할 때 입력하는 값이 **넥슨 서든어택 병영수첩 클랜 홈페이지 주소**다.

```
https://barracks.sa.nexon.com/clan/{clanSlug}/clanMatch
```

- 3rd.supply의 클랜 slug(`/clan/togs4033`)는 **넥슨 병영수첩 slug와 동일**. 즉 넥슨 클랜을 그대로 식별자로 씀
- 병영수첩 내부 API (모두 POST):
  - `/api/ClanHome/GetClanInfo/{slug}` — 클랜 기본정보
  - `/api/ClanHome/GetClanUserList` — 클랜원
  - `/api/ClanHome/GetClanRankInfo` — 클랜 랭킹
  - **`/api/ClanHome/GetClanMatchList/`** — 클랜전 기록 (← 전적의 원천)
  - `/api/ClanHome/GetClanAgitInfo`
- 플레이어 ID(`587873689`)도 넥슨 유저 ID 체계를 그대로 사용
- 그래서 **양쪽 클랜이 모두 리그에 등록되어 있어야 경기가 기록됨** (리그 소개문에 "미등록 클랜이랑 클랜전 진행시 기록불가능합니다" 명시)
- 상대 클랜의 딜량/헤드샷은 `알수없음`으로 표시 → 원본에서 자기 팀 상세만 노출되는 한계를 그대로 물려받음
- 수동 갱신 버튼: 플레이어 `정보갱신`, 클랜 `전적갱신` (`renewed_at` 필드로 마지막 갱신 시각 표시)

**sacloud 시사점**: 사설 기록 사이트의 신뢰도는 "원본 데이터를 어디서 가져오는가"에서 나온다. 유저 입력 방식이면 조작 방지 설계(양측 승인, 스크린샷 검증, 리플레이 파일 등)가 반드시 필요하다.

---

## 3. 도메인 모델

```
User (이메일 계정, 네이버메일만 가입 가능)
 └─ 서든어택 계정 연동 (/me/link) → 연동해야 리그 생성 가능

Clan (= 넥슨 클랜)
 ├─ slug (넥슨 병영수첩 slug)
 ├─ mark_bg / mark_front (클랜마크 2레이어)
 ├─ master (클랜마스터 플레이어)
 ├─ established_at, notice, renewed_at
 └─ players[] (id, name, position=포지션 메모)

League (유저가 생성)
 ├─ id, name(한글 2~8자), slug(영문 4~16자, URL로 사용)
 ├─ description (HTML, 리그 규정 게시)
 ├─ user (리그 관리자)
 ├─ division_count (1 = 단일리그 / 2~ = N부리그)
 ├─ player_limits[] (5, 6 → 5vs5 / 6vs6 중 선택한 것만 기록)
 ├─ maps[] (선택한 맵에서 한 경기만 기록)
 └─ status, created_at

LeagueClan (리그↔클랜)
 ├─ rating(래더), division(부), win/lose/win_rate
 ├─ placement (배치고사 진행중 여부), status
 └─ joined_at

LeaguePlayer (리그↔플레이어)
 ├─ rating, win/lose/win_rate
 ├─ kill/death/assist/headshot, kd_rate, kill_per_match, mvp_count
 ├─ placement, rank, rank_count
 └─ seasons[] { season, rank, rank_count, win, lose, kill, death, ... }

Match
 ├─ id = "YYMMDDHHmmss" + 6자리 코드  (예: 260605000624124001 = 2026-06-05 00:06:24)
 ├─ map, player_count, start_at, end_at, play_time
 ├─ league_clan / opponent (각각 rating, division 스냅샷)
 ├─ win, blue_team, placement, rating_update(±점수), mvp_player_id
 └─ 팀별 라인업 red[] / blue[] + 플레이어별 상세
      kill, death, assist, headshot, damage,
      kd_rate, damage_percent, headshot_percent,
      weapon (0=라이플, 1=스나이퍼), rating, rating_update, dropout(탈주), win, placement
```

### 랭킹/티어 체계

- 티어명(브론즈/골드…) 같은 건 **없다**. 순수 **래더 점수(Elo)** + **N부리그(division)** 조합
- 클랜 래더 예: 1위 1,840점 · 20위 987점 / 플레이어 래더 예: 1위 3,432점
- 경기당 변동: 승 +7~+12, 패 −10~−19 (상대 레이팅 차이 반영, 전형적인 Elo)
- **배치고사(placement)**: 일정 경기 수 이전에는 순위 미표시, 상세에도 `배치고사`로 표기
- **랭킹은 1시간마다 갱신**, 배치 완료 대상만 노출
- 시즌제 운영 (현재 시즌 6). 시즌 종료 시 기록 스냅샷 → `지난시즌` 탭

---

## 4. 라우팅 전체 지도

Angular 라우트 정의에서 추출한 실제 트리.

```
/                                     메인 (로고 + 통합검색 + 실시간 인기게시글)
/leagues                              리그 소개 + 대표리그 목록
/leagues/create                       리그 만들기 (로그인+계정연동 필요)

/league/:leagueSlug                   → home 리다이렉트
/league/:leagueSlug/home/info         리그정보 (맵, 대전인원, 관리자, 참여 클랜)
/league/:leagueSlug/home/desc         리그소개 (규정 HTML)
/league/:leagueSlug/rank/clan         클랜랭킹
/league/:leagueSlug/rank/clan/:division  N부리그 탭
/league/:leagueSlug/rank/player       개인랭킹
/league/:leagueSlug/clan/:clanSlug    리그 내 클랜 기록실
/league/:leagueSlug/clan/:clanSlug/player   리그 참여 클랜원
/league/:leagueSlug/clan/:clanSlug/season   지난시즌
/league/:leagueSlug/player/:playerId        리그 내 개인 기록실
/league/:leagueSlug/player/:playerId/season 지난시즌
/league/:leagueSlug/setting           리그 관리 (관리자 전용)

/player/:playerId                     플레이어 기본정보 (참여중인 리그 목록)
/player/:playerId/setting

/clan/:clanSlug                       클랜 기본정보
/clan/:clanSlug/player                클랜원 목록
/clan/:clanSlug/setting

/board                                게시판 홈
/board/:category                      목록
/board/:category/write                글쓰기
/board/:category/:id                  글 보기
/board/:category/:id/update|delete

/auth/login  /auth/signup  /auth/email/verify
/auth/password/forget  /auth/password/reset
/me  /me/setting  /me/password  /me/link      마이페이지 / 서든어택 계정연동
/clause/service  /clause/policy
```

리그 slug 실제 예: `supply`(서플라이공식) `sanply`(3부) `daerule`(대룰) `main`(서브친목) `SAJS`(서든) `aleague` `1stleague` `Asupply1` `abolg` `dpqhclsahr3` `gkdkt1231`

---

## 5. API 명세 (관측 기준)

Base: `https://api-v2.3rd.supply` · 응답 공통 래퍼 `{ "message": "success", "data": ..., "metadata": {...} }`

### 공통
| 엔드포인트 | 설명 |
|---|---|
| `GET /infos` | 부트스트랩. `configs`(글쓰기 rate limit 5분, ENTRY_TIME_LIMIT 3600), `categories[]`(게시판 목록), `user`(로그인 정보) |
| `GET /remote_configs` | 원격 설정 |
| `POST /auth/login` `/auth/signup` `/auth/token` `/auth/password/forget` | 인증 |
| `GET/PUT /me` `/me/setting` `/me/password` `/me/link` | 마이페이지·계정연동 |
| `POST /uploads` | 이미지 업로드 |

### 검색
| 엔드포인트 | 설명 |
|---|---|
| `GET /players/name/{encodeURIComponent(nick)}` | 닉네임 정확일치 → `/player/{id}`로 이동 |
| `GET /players/search/{q}` | 자동완성 |
| `GET /clans/name/{q}` · `/clans/search/{q}` | 클랜 |
| `GET /leagues/name/{q}` · `/leagues/search/{q}` | 리그 |

### 전적
| 엔드포인트 | 설명 |
|---|---|
| `GET /players/{playerId}` | 플레이어 기본 (id, name, clan, note, position, renewed_at) |
| `GET /players/{playerId}/leagues` | 참여중인 리그별 요약 |
| `GET /clans/{clanSlug}` | 클랜 기본 (master, established_at, notice) |
| `GET /clans/{clanSlug}/players` | 클랜원 (커서) |
| `GET /clans/{clanSlug}/leagues` | 클랜의 리그별 성적 |
| `GET /leagues` | 리그 목록 (clan_count, 대표 클랜 3개 마크 포함) |
| `GET /leagues/{slug}` | 리그 상세 (maps, player_limits, division_count, description) |
| `GET /leagues/{slug}/clans` | 리그 참여 클랜 (커서) |
| `GET /leagues/{slug}/clans/{clanSlug}/show` | 리그 내 클랜 상세 |
| `GET /leagues/{slug}/players/{playerId}` | 리그 내 플레이어 상세 (+ match_summary: 최근 20전 요약, 상대 클랜별 승률) |
| `GET /leagues/{id}/ranks/clans?division=N` | 클랜랭킹 |
| `GET /leagues/{id}/ranks/players` | 개인랭킹 |
| `GET /leagues/{id}/players/{playerId}/matches?cursor=` | 개인 기록실 |
| `GET /leagueclans/{leagueClanId}/matches` | 클랜 기록실 |
| `GET /leagues/{id}/matches/{matchId}` | 경기 상세 (red[]/blue[] 전원 스탯) |
| `GET /leagueplayers/{leaguePlayerId}/seasons` | 지난시즌 |

### 커뮤니티
| 엔드포인트 | 설명 |
|---|---|
| `GET /boards?category={slug}&cursor=` | 글 목록 (notice 카테고리 별도 호출로 공지 상단 고정) |
| `GET /boards/{id}` | 글 상세 |
| `POST/PUT/DELETE /boards` | 작성/수정/삭제 |
| `GET /comments?board_id={id}` | 댓글 (1단계 대댓글 `comments[]` 중첩) |

### 페이지네이션 규칙 (전 API 공통)
```
metadata.cursor = { prev: null|string, next: null|string }
cursor = base64url("next__<마지막 id>")  또는  base64url("prev__<첫 id>")
예) "bmV4dF9fMjQ" → "next__24"
    "cHJldl9fNDU3MzIz" → "prev__457323"
```
페이지 번호 없이 무한스크롤(`더 불러오기`) 전용. 랭킹은 20개, 게시판은 15개 단위.

---

## 6. 리그 시스템 (사이트의 정체성)

### 리그 생성 규칙 (`/leagues/create`)
- **서든어택 계정 연동 완료 유저만** 생성 가능
- 리그이름: 한글/영어/숫자, 2~8자, "리그"로 끝날 수 없음
- 리그영문이름: 영숫자 4~16자, URL slug로 사용, 중복 불가
- 리그타입: 단일리그 / N부리그
- 리그맵: 최소 1개 — **선택한 맵의 경기만 기록**
- 대전인원: 5vs5 / 6vs6 최소 1개 — **선택한 종류만 기록**
- 필수 동의 3항목:
  1. 클랜초대의 대가로 금전적 보상을 요구하지 않겠다
  2. 리그 관리자로서 책임감 있게 운영하겠다
  3. 부적절 행위 적발 시 운영자 재량으로 리그 삭제 가능함에 동의
- reCAPTCHA 검증

### 리그 관리 (`/league/:slug/setting`)
- **클랜초대**: 넥슨 병영수첩 클랜 주소를 붙여넣기 → 클랜 조회 → 초대. 초대링크 복사 지원
- 초대 제한: 클랜당 최대 참여 리그 수, 리그당 최대 클랜 수 존재. 클랜측이 초대 차단 가능
- **부리그 변경**: 특정 클랜을 1부↔2부로 이동
- **클랜변경(승계)**: 클랜명 변경이 아니라 *완전히 다른 새 클랜*으로 갈아탈 때 사용. 기존 전적 데이터를 새 클랜이 그대로 승계. 새 클랜 마스터의 수락 필요
- **클랜삭제**: 삭제대기 상태로 두고 **1주일 후 자동 삭제**
- **추방**: 되돌릴 수 없고 재가입 불가. `추방합니다` 문자열 직접 입력 확인
- 리그정보/리그소개 편집

### 운영 실태 (관측)
`/leagues` 기준 대표 리그 15개, 공식 배지 3개(3부 96클랜 / 대룰 54 / 서플라이공식 48). 나머지는 친목리그(에보친목 시즌1·3·4·5처럼 시즌마다 새 리그를 파는 패턴). 대룰리그 규정문에는 금지무기 목록, 이중리그 참여 금지, 경고 3회 누적 시 방출, 카카오 오픈채팅 문의 링크 등이 그대로 들어있다.

---

## 7. 화면별 정보 구조

### 메인 `/`
로고 → 통합검색(플레이어 검색 셀렉터 + 닉네임 입력) → 실시간 인기게시글 10개. 상단 GNB: 공식리그 / 3부리그 / 대룰리그 / 리그 / 게시판 / 로그인.
※ 대표 리그 3개를 GNB에 하드코딩(`/league/supply`, `/league/sanply`, `/league/daerule`).

### 클랜랭킹 `/league/supply/rank/clan/1`
`순위 | 클랜(마크+이름) | 승리 | 패배 | 승률 | 래더`, 상단에 1부/2부 탭, "랭킹은 1시간마다 갱신되며, 배치고사가 종료된 클랜만 표시됩니다."

### 개인랭킹 `/league/supply/rank/player`
`순위 | 닉네임 | 승리 | 패배 | 승률 | 킬뎃 | 평균킬 | 래더`

### 개인 기록실 `/league/:slug/player/:id`
- 탭: 기본정보(전역) / 기록실 / 지난시즌
- 상단: 최근 20전 승률 도넛 + 연승/연패 + 상대 클랜별 전적(승률·킬뎃)
- 매치 카드: 맵 / 플레이시간 / 승패 / 상대시간 / **래더 ±점** / 본인 K/D/A + 킬뎃% / MVP 뱃지 / 양팀 클랜명+부리그+래더 / 양팀 라인업(스나이퍼는 `[S]`)
- 카드 펼치면: 선레드·선블루, 게임시작시간, N vs N, 팀별 표 `플레이어 | 래더 | kda | 무기 | 딜량 | 헤드샷`
- 우측 사이드: 상세정보(래더·승률·킬뎃·평균킬·MVP·랭킹·소속) + **최근 같이한 플레이어** 승률표

### 클랜 기록실 `/league/:slug/clan/:slug`
개인 기록실과 동일 레이아웃, 카드에 개인 KDA 대신 팀 단위 정보 + 라인업. 사이드에 **최근 클랜전 플레이어 승률** 표.

### 클랜 페이지 `/clan/:slug`
클랜마스터, 클랜설립일, 참여중인 리그별 성적 / 클랜원 탭(포지션 메모 표시: "2층", "B 사이트")

---

## 8. 커뮤니티

- 카테고리: `hot`(인기) `free`(자유) `sanply`(3부) `asupply`(에보) `rankedplay`(랭크전) `champs`(대룰) `streamer`(방송) + `notice`(공지, 상단 고정)
- 게시판이 리그 진영별로 나뉨(3부=`sanply`, 에보=`asupply`, 대룰=`champs`) → 리그 slug와 정확히 같지는 않지만 **리그 커뮤니티마다 전용 게시판**을 배정한 구조
- **비로그인 익명 글쓰기 허용**. 작성자는 `히노캥-721` 같은 자동 별칭(IP 기반 추정)으로 표시, 삭제용 **게시글 비밀번호**를 직접 지정
- 로그인 유저도 익명 선택 가능 (`disclose_type`, 목록에 빨간 `익명` 표기)
- 글 스키마: `id, title, content(HTML), writer{id,nickname,avatar_url,role}, writer_app(0=웹,1=앱), comment_count, view_count, like_count, dislike_count, has_image, disclose_type, login, me, like_type, last_edited, category`
- 댓글: 1단계 대댓글(`comments[]`), 추천/비추천, `deleted` 플래그(내용만 가림), `board_writer`(글쓴이 표시)
- 에디터: Quill 기반 리치텍스트(폰트 크기/색/정렬/이미지/링크) — 지연 로드
- 검색 옵션: `board`(제목+내용) / `ipname`(작성자 별칭) / `nickname`(작성자 닉네임)
- 어뷰징 방지: **5분당 1글** rate limit, reCAPTCHA, 회원가입은 **네이버 메일만** 허용 + 이메일 인증
- 이용규칙: 불법프로그램(핵) 언급·은어까지 금지, 클랜스카웃/추천서 매매 금지

---

## 9. sacloud에 그대로 가져올 만한 설계 포인트

1. **리그 = 사용자 생성 컨테이너**. 사이트가 리그를 운영하지 않고 "리그를 만들 수 있는 도구"만 제공 → 커뮤니티가 알아서 증식. 공식 3개만 배지로 큐레이션.
2. **기록 조건을 리그 생성 시 못박기** (맵 + 인원수). 조건 밖 경기는 아예 안 잡히므로 분쟁이 줄어든다.
3. **Elo 래더 + N부리그 + 배치고사 + 시즌**. 티어 이름 없이도 충분히 작동. 랭킹은 실시간 대신 1시간 배치로 부하 관리.
4. **원본 데이터 신뢰**. 게임사 공개 페이지를 slug 단위로 그대로 물려받아 식별자 충돌·조작을 피함.
5. **커서 페이지네이션 통일** (`base64url(next__id)`) — 정렬이 id 기준이라 구현이 단순하고 무한스크롤에 딱 맞음.
6. **전적 페이지에 커뮤니티를 붙임**. 리그 진영별 전용 게시판 + 익명 글쓰기가 트래픽 엔진. 대신 rate limit·네이버메일·reCAPTCHA로 어뷰징을 막음.
7. **클랜 승계(클랜변경) 기능**. 클랜이 깨지고 다시 만들어지는 게 일상인 커뮤니티라 전적 이전이 필수 기능.
8. **SSR + TransferState**. 전적 페이지는 SEO가 유입의 핵심이므로 서버 렌더링이 사실상 필수.

### 반대로 개선할 여지
- 상대팀 딜량/헤드샷 `알수없음` — 양측 데이터를 합쳐 보정할 수 있으면 큰 차별점
- 티어 뱃지/시각화 부재 (숫자 점수만)
- 매치 상세가 아코디언이라 개별 URL이 없음 → 공유·SEO 손해
- `/league/:slug/rank/clan` 진입 시 `/rank/rank/clan/1`로 잘못 리다이렉트되는 버그 존재
- 광고 밀도가 매우 높음(본문 사이 인피드 광고 다수)

---

## 부록: 코드 값
| 필드 | 값 |
|---|---|
| `weapon` | 0 = 라이플, 1 = 스나이퍼 (라인업에 `[S]` 표기) |
| 전반 진영 / 표기 | 선레드 = 레드진영(공격)을 먼저 한 팀 · 선블루 = 블루진영(수비)을 먼저 한 팀 (2026-08-30 사용자 확정 · D-207). 우리 계약은 `first_side`(보는 쪽 기준), 우리 DB 는 `Match.firstHalfAttackSide`(슬롯 기준). 원본 응답의 `blue_team` 은 **보는 클랜이 블루였나**라 이것과 다르다 |
| `division` | 1 = 1부리그, 2 = 2부리그 … `division_count`가 1이면 단일리그 |
| `placement` | true = 배치고사 진행중 (랭킹 미표시, 래더 대신 "배치고사" 표시) |
| `dropout` | 탈주 |
| `writer_app` | 0 = 웹, 1 = 앱 |
| `disclose_type` | 0 = 일반, 그 외 = 익명 공개 수준 |
| `role` | 0 = 일반, 2 = 운영자(관측값) |
| `status`(LeagueClan) | 0 = 대기/배치, 1 = 정상 |
