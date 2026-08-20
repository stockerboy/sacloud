# IMPLEMENTATION_PLAN.md — sacloud V1

3rd.supply의 **사용자에게 보이는 기능·화면·흐름**을 기준 버전(V1)으로 재구현하기 위한 실행 계획.

- 기준 문서: `claude/3rd-supply-structure.md` (2026-08-20 조사)
- 원칙: 원본 코드·이미지·텍스트 자산을 복사하지 않는다. 관찰된 **동작과 정보 구조**만 재현한다.
- 원칙: V1 범위에서는 신규 기능·UX 개선을 추가하지 않는다. 개선 아이디어는 `V2 후보`로만 기록한다.
- 원칙: 확인되지 않은 사항은 추측하지 않고 `[미확인]`으로 표기한다.
- 예외: **광고는 복원 대상에서 완전히 제외한다** (`CLAUDE.md` 4장). 광고 코드·컴포넌트·placeholder·광고용 여백을 만들지 않는다.

---

## 0. 개발 전략 요약

```
Phase 0~1   기반 + 공통 레이아웃
   ↓
Phase 2~6   Mock 데이터로 전 화면·전 흐름 완성   ← "서플라이 화면/기능 복원"
   ↓
Phase 7     DB + 실제 API 구현 (Mock을 계약 그대로 교체)
   ↓
Phase 8~9   실제 전적 수집 + 레이팅/랭킹 엔진   ← "실제 전적 작동"
   ↓
Phase 10    SSR/SEO/성능/운영 → V1 완료
```

핵심 장치는 **API 계약(Contract)을 Phase 0에서 먼저 확정**하는 것이다.
Mock 서버와 실제 서버가 동일한 스키마를 구현하므로, Phase 7에서 프론트엔드 코드를 고칠 일이 거의 없다.

---

## 1. 기술 스택 선정

배포 환경이 미정이므로 **관리형 플랫폼에 바로 올라가되, 나중에 컨테이너로 옮기기 쉬운 구성**을 택한다.

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 15 (App Router) + TypeScript** | 전적 사이트는 검색 유입이 생명이라 SSR이 필수. 원본도 Angular Universal SSR을 쓴다. 페이지·API·SSR을 한 저장소에서 관리 가능 |
| 스타일 | **Tailwind CSS** + 자체 디자인 토큰 | 테이블/랭킹/카드 위주 UI라 유틸리티 CSS가 빠르다. 컴포넌트 라이브러리 의존을 최소화해 유지보수 부담을 줄임 |
| UI 프리미티브 | **Radix UI** (Dialog, Tabs, Select, Accordion 등 헤드리스만) | 매치 카드 아코디언·부리그 탭·모달이 반복 등장. 접근성 처리를 직접 안 해도 됨 |
| 서버 상태 | **TanStack Query** | 커서 기반 무한스크롤(`useInfiniteQuery`)이 원본 페이지네이션과 정확히 맞음 |
| 스키마/검증 | **Zod** | API 계약을 타입과 런타임 검증에 동시에 재사용. Mock↔실서버 계약 일치를 강제 |
| DB | **PostgreSQL** | 랭킹 집계·시즌 스냅샷·복합 인덱스가 많다 |
| ORM | **Prisma** | 마이그레이션 관리와 타입 안전성. 팀 규모가 작을 때 유지보수 비용이 가장 낮음 |
| 인증 | **Auth.js (NextAuth v5)** Credentials + 이메일 인증 | 원본이 이메일/비밀번호 단일 방식. OAuth 미사용 |
| 에디터 | **Tiptap** + `sanitize-html` | 원본 Quill과 동등한 리치텍스트. 저장 시 서버 측 화이트리스트 새니타이즈 필수 |
| 백그라운드 작업 | **별도 Node 워커 프로세스 + BullMQ(Redis)** | 수집·랭킹 배치는 웹 요청과 수명주기가 다르다. 서버리스 타임아웃에 묶이면 안 됨 |
| 캐시 | **Redis** | 랭킹 캐시(1시간), rate limit, 작업 큐 겸용 |
| 테스트 | **Vitest**(단위) / **MSW**(Mock API) / **Playwright**(E2E) | MSW를 Phase 2~6의 Mock 백엔드로 쓰고, Phase 7 이후엔 테스트 격리용으로 계속 재사용 |
| 로깅/모니터링 | **Pino** + Sentry | |

**저장소 구조 (모노레포, pnpm workspace)**

```
apps/
  web/          Next.js (페이지 + API Route Handlers)
  worker/       수집·랭킹 배치 워커
packages/
  contract/     Zod 스키마 + 타입 + API 경로 정의  ← 단일 진실 원천
  db/           Prisma 스키마 + 클라이언트
  mock/         MSW 핸들러 + 픽스처 생성기
  ui/           공용 컴포넌트
```

---

## 2. V1 범위 확정

### 포함
- 홈 / 통합검색
- 플레이어 페이지, 클랜 페이지(기본정보·클랜원)
- 리그 목록, 리그 생성, 리그홈(리그정보·리그소개)
- 클랜랭킹(부리그 탭), 개인랭킹
- 리그 내 클랜 기록실 / 개인 기록실 / 매치 상세 / 지난시즌
- 게시판 7종 + 공지, 글 작성/수정/삭제, 댓글·대댓글, 추천/비추천, 익명 글쓰기, 검색
- 회원가입/로그인/비밀번호 재설정/이메일 인증, 마이페이지, 서든어택 계정 연동
- 리그 관리(클랜 초대·부리그 변경·클랜 승계·삭제·추방), 클랜 설정, 플레이어 설정
- Elo 래더, 부리그, 배치고사, 시즌, 1시간 주기 랭킹 갱신
- 넥슨 병영수첩 기반 전적 수집
- 어뷰징 방지: 글쓰기 rate limit, 캡차, 이메일 인증

### 제외 (V1 아님)
- 모바일 전용 별도 빌드 → V1은 반응형 단일 레이아웃으로 대응 (원본의 모바일 화면은 `[미확인]`)
- **광고 전면 제외 (V1 복원 예외사항)** — 원본에 광고가 존재하지만 재현하지 않는다.
  AdSense 등 광고 코드, 배너·인피드 광고 컴포넌트, 광고 placeholder·빈 광고 영역을 만들지 않으며,
  광고 때문에 존재하는 여백도 제거하고 실제 콘텐츠가 자연스럽게 이어지도록 구성한다.
  광고는 V1 완료 후 별도 기능으로 다룬다. 상세 규칙은 `CLAUDE.md` 4장 참조.
- 알림, 쪽지, 신고 기능 (원본 존재 여부 `[미확인]`)
- 앱(`writer_app=1`) 클라이언트

---

## 3. Phase별 계획

---

### Phase 0 — 기반 세팅 & API 계약 확정

**1) 구현 대상**
모노레포 초기화, 공통 설정, 그리고 **전체 API 계약과 Mock 데이터 생성기**. 이 Phase의 산출물이 이후 모든 Phase의 기준이 된다.

**2) 생성할 주요 페이지**
없음 (인프라 Phase). 단, `/` 에 빈 레이아웃 셸만 배치해 빌드 확인.

**3) 필요한 컴포넌트**
- 없음. 대신 디자인 토큰 정의: 색상(다크 헤더 / 라이트 본문), 타이포 스케일, 테이블·카드 spacing, 승/패 색(승=파랑 계열, 패=빨강 계열 — 원본 관찰값), 래더 점수 강조색

**4) 필요한 데이터**
`packages/contract` 에 Zod 스키마로 정의:
- `Player`, `Clan`, `ClanMark`, `League`, `LeagueClan`, `LeaguePlayer`, `LeaguePlayerSeason`
- `Match`, `MatchSummaryEntry`, `MatchPlayerStat`
- `Board`, `BoardListItem`, `Comment`, `Category`, `Writer`
- `User`, `Infos`
- 공통 래퍼 `ApiResponse<T> = { message, data, metadata? }`
- 커서 규격: `metadata.cursor = { prev: string|null, next: string|null }`, `cursor = base64url("next__<id>" | "prev__<id>")`
- 코드 값 enum: `Weapon(0=라이플,1=스나이퍼)`, `Division`, `Placement`, `WriterApp`, `DiscloseType`, `Role`

**5) API/DB 의존성**
- DB 없음
- `packages/mock`: seed 고정(deterministic) 픽스처 생성기
  - 리그 4개(단일리그 1 + 2부리그 3, 그중 공식 배지 2)
  - 클랜 60개, 플레이어 900명, 매치 3,000건, 게시글 400건, 댓글 1,200건
  - 래더 분포·승률·배치중 상태가 실제와 비슷하도록 난수 시드 고정

**6) 테스트 방법**
- `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과
- 계약 스키마 라운드트립 테스트: 생성된 Mock 픽스처 전량이 Zod 파싱을 통과
- MSW 핸들러가 모든 계약 엔드포인트를 커버하는지 검사하는 테스트(경로 목록 대조)

**7) 완료 조건**
- 모든 API 엔드포인트가 Zod 스키마와 MSW 핸들러로 존재한다
- `pnpm dev` 로 앱이 뜨고, 브라우저 콘솔에서 Mock API 호출이 계약대로 응답한다
- 커서 인코딩/디코딩 유틸의 단위 테스트가 통과한다

---

### Phase 1 — 공통 레이아웃 & 홈

**1) 구현 대상**
전역 셸(헤더/푸터), 통합검색, 홈 화면.

**2) 생성할 주요 페이지**
- `/` 홈
- `/clause/service`, `/clause/policy` (정적 문서 — 문구는 자체 작성)
- `/notfound` 및 catch-all 404

**3) 필요한 컴포넌트**
- `SiteHeader` — 로고, 대표 리그 3개 바로가기(설정으로 지정 가능하게), 리그, 게시판, 로그인/유저메뉴
- `SiteFooter` — 이용약관·개인정보·문의
- `SearchBar` — 검색 타입 셀렉터 + 입력 + 제출. 엔터 시 `players/name` 조회 후 결과 페이지로 이동
- `HotPostList` — 실시간 인기게시글 10건 (제목 + 댓글수 + 상대시간)
- `RelativeTime` — "3시간 전", "2달 전" 포맷터 (한국어, `Asia/Seoul`)
- `Skeleton`, `EmptyState`, `ErrorState`

**4) 필요한 데이터**
- `GET /infos` (카테고리 목록, 설정값, 로그인 유저)
- `GET /boards?category=hot` (상위 10건)

**5) API/DB 의존성**
Mock only.

**6) 테스트 방법**
- 컴포넌트 단위 테스트: `RelativeTime` 경계값(방금/분/시간/일/달/년)
- Playwright: 홈 진입 → 인기글 10건 렌더 → 닉네임 검색 → 플레이어 페이지 이동(스텁)
- 반응형 스냅샷 3종(1280 / 1024 / 390)

**7) 완료 조건**
- 모든 페이지가 동일한 헤더/푸터 셸을 공유한다
- 검색 → 이동 흐름이 Mock 기준으로 동작한다
- 404 라우트가 원본과 같은 위치에서 잡힌다

---

### Phase 2 — 전적 조회 (플레이어 / 클랜)

**1) 구현 대상**
리그에 종속되지 않는 전역 프로필 화면.

**2) 생성할 주요 페이지**
- `/player/[playerId]` — 참여중인 리그별 요약
- `/clan/[clanSlug]` — 리그정보 탭
- `/clan/[clanSlug]/player` — 클랜원 탭

**3) 필요한 컴포넌트**
- `PlayerHeader` — 닉네임, 소속 클랜, `정보갱신` 버튼, `최근갱신: N일 전`
- `ClanHeader` — 클랜마크(bg+front 2레이어 합성), 클랜명, 클랜마스터, 클랜설립일
- `ClanMark` — 2장 이미지를 겹쳐 렌더하는 전용 컴포넌트 (크기 프리셋 sm/md/lg)
- `LeagueParticipationCard` — 리그명 + 공식 배지 + 래더 + 전/승/패 + 승률 + 킬뎃
- `ClanMemberList` — 닉네임 + 포지션 메모, 커서 무한스크롤
- `TabNav` — 페이지 하위 탭 (URL 기반)
- `RefreshButton` — 갱신 요청/진행중/실패 상태 표시

**4) 필요한 데이터**
- `GET /players/{id}`, `GET /players/{id}/leagues`
- `GET /clans/{slug}`, `GET /clans/{slug}/leagues`, `GET /clans/{slug}/players`

**5) API/DB 의존성**
Mock only. 갱신 버튼은 Mock에서 지연 후 성공/실패를 시뮬레이션.

**6) 테스트 방법**
- Playwright: 검색 → 플레이어 → 리그 카드 클릭 → 리그 기록실 이동(스텁)
- 무한스크롤 커서 동작 테스트(클랜원 20건 단위)
- 리그 미참여 플레이어, 클랜 없는 플레이어 등 빈 상태 렌더 확인

**7) 완료 조건**
- 원본과 동일한 항목이 동일한 위계로 표시된다
- 커서 페이지네이션이 `next` 소진 시 버튼을 숨긴다
- 갱신 버튼의 3가지 상태(대기/진행중/실패)가 모두 렌더된다

---

### Phase 3 — 리그 & 랭킹

**1) 구현 대상**
리그 목록, 리그홈, 클랜랭킹, 개인랭킹.

**2) 생성할 주요 페이지**
- `/leagues` — 리그 소개 + 대표리그 목록
- `/league/[leagueSlug]` → `/home/info` 리다이렉트
- `/league/[leagueSlug]/home/info` — 리그정보
- `/league/[leagueSlug]/home/desc` — 리그소개(HTML)
- `/league/[leagueSlug]/rank/clan/[division]` — 클랜랭킹
- `/league/[leagueSlug]/rank/player` — 개인랭킹

**3) 필요한 컴포넌트**
- `LeagueListRow` — 리그명, 공식 배지, 참여 클랜 수, 관리자, 개설일, 대표 클랜마크
- `LeagueSubNav` — 리그홈 / 클랜랭킹 / 개인랭킹
- `LeagueInfoPanel` — 리그관리자, 리그맵 목록, 대전인원, 참여중인 클랜 그리드
- `LeagueDescription` — 저장된 HTML을 새니타이즈 후 렌더
- `DivisionTabs` — `division_count`에 따라 1부/2부… 탭 생성, 단일리그면 미표시
- `ClanRankTable` — 순위 / 클랜 / 승리 / 패배 / 승률 / 래더
- `PlayerRankTable` — 순위 / 닉네임 / 승리 / 패배 / 승률 / 킬뎃 / 평균킬 / 래더
- `RankNotice` — "랭킹은 1시간마다 갱신되며, 배치고사가 종료된 …" 안내 문구(자체 문구로 작성)
- `LoadMoreButton` — 20건 단위

**4) 필요한 데이터**
- `GET /leagues`, `GET /leagues/{slug}`, `GET /leagues/{slug}/clans`
- `GET /leagues/{id}/ranks/clans?division=N`, `GET /leagues/{id}/ranks/players`

**5) API/DB 의존성**
Mock only.

**6) 테스트 방법**
- 단일리그(division_count=1)와 2부리그 두 케이스의 탭 렌더 분기 테스트
- 배치 완료자가 0명인 리그의 빈 상태 문구 확인
- `sanitize-html` 정책 테스트: `<script>`, `on*` 속성, `javascript:` URL 제거 확인
- Playwright: 리그 목록 → 리그홈 → 클랜랭킹 → 클랜 기록실 이동

**7) 완료 조건**
- 리그 slug 기반 라우팅이 전 화면에서 일관되게 동작한다
- 랭킹 테이블 컬럼과 숫자 포맷(천 단위 콤마, 소수점 1자리 %)이 원본과 일치한다
- 리그소개 HTML 렌더가 XSS 테스트를 통과한다

---

### Phase 4 — 기록실 & 매치 상세

가장 복잡하고, 사이트의 핵심 가치가 나오는 Phase.

**1) 구현 대상**
리그 내 개인/클랜 기록실, 매치 카드, 매치 상세 아코디언, 지난시즌.

**2) 생성할 주요 페이지**
- `/league/[leagueSlug]/player/[playerId]` — 개인 기록실
- `/league/[leagueSlug]/player/[playerId]/season` — 개인 지난시즌
- `/league/[leagueSlug]/clan/[clanSlug]` — 클랜 기록실
- `/league/[leagueSlug]/clan/[clanSlug]/player` — 리그 참여 클랜원
- `/league/[leagueSlug]/clan/[clanSlug]/season` — 클랜 지난시즌

**3) 필요한 컴포넌트**
- `RecordHeader` — "리그명 - 개인랭킹 N위" 배지, 닉네임/클랜명, 즐겨찾기 버튼
- `RecordTabNav` — 기본정보 / 기록실 / 클랜원 / 지난시즌
- `RecentSummary` — 최근 20전 승률 도넛, 연승·연패, 상대 클랜별 전적(승·패·승률·킬뎃)
- `MatchCard` — 맵, 플레이시간, 승/패, 상대시간, 래더 ±점, 본인 K/D/A + 킬뎃%, MVP 배지, 양팀 클랜(부리그·래더), 양팀 라인업(스나이퍼 표식), 상세보기 토글
- `MatchDetailPanel` — 선공 진영, 게임시작시간, N vs N, 팀별 표
  - 컬럼: 플레이어 / 래더 / kda / 무기 / 딜량 / 헤드샷
  - 배치중 플레이어는 래더 대신 `배치고사`
  - 값 미확보 시 `알수없음` (원본과 동일한 결측 처리)
  - 딜량은 팀 내 비중 막대로 함께 표시
- `SideStatsPanel` — 래더 / 승률 / 킬뎃 / 평균킬 / MVP / 랭킹 / 소속
- `TeammateWinRateTable` — 최근 같이한 플레이어 / 최근 클랜전 플레이어 승률
- `SeasonHistoryTable` — 시즌, N명중 M위, 승패, 승률, 킬뎃

**4) 필요한 데이터**
- `GET /leagues/{slug}/players/{playerId}` (`match_summary` 포함)
- `GET /leagues/{slug}/clans/{clanSlug}/show`
- `GET /leagues/{id}/players/{playerId}/matches?cursor=`
- `GET /leagueclans/{leagueClanId}/matches?cursor=`
- `GET /leagues/{id}/matches/{matchId}` (아코디언 펼칠 때 지연 로드)
- `GET /leagueplayers/{leaguePlayerId}/seasons`

**5) API/DB 의존성**
Mock only. Mock 매치 ID는 실제 규칙을 따른다: `YYMMDDHHmmss` + 6자리 코드.

**6) 테스트 방법**
- 아코디언 지연 로드: 최초 펼침에만 상세 요청, 재펼침 시 캐시 사용 (TanStack Query 캐시 검증)
- 20건 단위 무한스크롤 + 커서 소진 처리
- 결측(`알수없음`), 배치중, 탈주(`dropout`), MVP 등 특수 케이스 렌더 스냅샷
- Playwright: 기록실 진입 → 3번째 카드 펼침 → 양팀 10명 스탯 표시 확인 → 더 불러오기 2회

**7) 완료 조건**
- 개인/클랜 기록실이 동일 컴포넌트를 공유하면서 카드 상단부만 다르게 렌더된다
- 매치 상세의 모든 컬럼이 원본과 동일 항목을 표시한다
- 100건 이상 로드해도 스크롤 성능이 유지된다(가상화 필요 시 도입 판단)

---

### Phase 5 — 커뮤니티 게시판

**1) 구현 대상**
게시판 목록/상세/작성/수정/삭제, 댓글·대댓글, 추천/비추천, 익명, 검색.

**2) 생성할 주요 페이지**
- `/board` — 게시판 홈(기본 카테고리로 리다이렉트)
- `/board/[category]` — 목록
- `/board/[category]/write` — 작성
- `/board/[category]/[id]` — 상세
- `/board/[category]/[id]/update` — 수정
- `/board/[category]/[id]/delete` — 삭제 확인

**3) 필요한 컴포넌트**
- `BoardSideNav` — 인기 / 자유 / 3부 / 에보 / 랭크전 / 대룰 / 방송
- `BoardTable` — 추천·비추천, 제목 + `[댓글수]`, 이미지 아이콘, 작성시간, 조회수, 작성자
- `NoticeRows` — 공지 상단 고정(별도 호출 결과를 목록 위에 병합)
- `BoardSearch` — 검색 타입(제목+내용 / 작성자 별칭 / 작성자 닉네임) + 검색어
- `PostView` — 제목, 조회수, 추천/비추천, 작성자, 작성일, 본문 HTML
- `VoteButtons` — 추천/비추천, 중복 방지 상태(`like_type`)
- `CommentList` / `CommentItem` — 1단계 대댓글, 글쓴이 표식, 삭제된 댓글 처리
- `CommentForm`
- `RichTextEditor` — Tiptap(굵게/기울임/밑줄/취소선/정렬/폰트크기/색/이미지/링크)
- `AnonymousPasswordField` — 비로그인 작성 시 삭제용 비밀번호
- `CommunityRules` — 이용규칙 안내(자체 문구)

**4) 필요한 데이터**
- `GET /boards?category={slug}&cursor=`, `GET /boards?category=notice`
- `GET /boards/{id}`, `POST/PUT/DELETE /boards`
- `GET /comments?board_id={id}`, `POST/PUT/DELETE /comments`
- `POST /uploads`

**5) API/DB 의존성**
Mock only. Mock에서 rate limit(5분)·캡차 성공/실패를 시뮬레이션.

**6) 테스트 방법**
- 새니타이즈 라운드트립: 에디터 출력 → 서버 정책 → 렌더 결과에 위험 태그가 남지 않음
- 비로그인 작성 → 비밀번호로 삭제 성공 / 잘못된 비밀번호로 삭제 실패
- rate limit 초과 시 안내 표시
- 대댓글 2단계 이상 입력 시도가 차단되는지
- Playwright: 목록 → 상세 → 댓글 작성 → 대댓글 → 추천 → 삭제

**7) 완료 조건**
- 7개 카테고리 + 공지가 모두 동작한다
- 익명 작성자 표기 방식이 일관되게 렌더된다 (별칭 생성 규칙 자체는 Phase 7에서 서버가 결정)
- 검색 3종이 모두 결과를 반환한다

---

### Phase 6 — 인증 · 마이페이지 · 관리 화면

**1) 구현 대상**
계정 흐름과 권한이 필요한 관리 화면. 여전히 Mock 기반.

**2) 생성할 주요 페이지**
- `/auth/login` (`?returnUrl=` 지원), `/auth/signup`, `/auth/email/verify`
- `/auth/password/forget`, `/auth/password/reset`
- `/me`, `/me/setting`, `/me/password`, `/me/link` (서든어택 계정 연동)
- `/leagues/create`
- `/league/[leagueSlug]/setting`
- `/clan/[clanSlug]/setting`
- `/player/[playerId]/setting`

**3) 필요한 컴포넌트**
- `AuthCard` — 로그인/가입 공용 카드 레이아웃
- `AuthGuard` — 미인증 시 `?returnUrl=` 붙여 로그인으로 이동
- `LeagueCreateForm` — 리그이름(한글/영문/숫자 2~8자, "리그"로 끝날 수 없음), 리그영문이름(영숫자 4~16자), 리그타입(단일/N부), 리그맵 다중선택, 대전인원 다중선택, 동의 3항목, 캡차
- `ClanInviteForm` — 넥슨 클랜 주소 입력 → 조회 → 미리보기 → 초대. 초대링크 복사
- `LeagueClanAdminTable` — 참여 클랜 목록 + 부리그 변경 / 클랜변경(승계) / 삭제(대기) / 추방
- `ConfirmTypeToProceed` — 지정 문자열 입력해야 실행되는 위험 작업 모달(추방용)
- `LeagueContentEditor` — 리그정보·리그소개 편집
- `PositionEditor` — 클랜원 포지션 메모
- `AccountLinkPanel` — 서든어택 계정 연동 상태/해제

**4) 필요한 데이터**
- `POST /auth/*`, `GET/PUT /me*`
- `POST /leagues/create`
- 리그 관리용 초대/변경/삭제/추방 엔드포인트 (계약에 정의, 경로는 자체 설계)

**5) API/DB 의존성**
Mock only. 세션은 Mock 사용자 3종(비로그인 / 일반 / 리그관리자)으로 전환 가능한 개발 스위치 제공.

**6) 테스트 방법**
- 리그 생성 폼 검증 규칙 전수 단위 테스트(경계값 포함)
- 권한 테스트: 일반 유저가 `/league/x/setting` 접근 시 차단
- Playwright: 비로그인 → `/leagues/create` 진입 → 로그인 → `returnUrl`로 복귀
- 추방 모달에서 문자열 불일치 시 실행 버튼 비활성

**7) 완료 조건**
- 인증 3역할 각각에서 전 화면 접근 권한이 의도대로 동작한다
- 리그 생성 폼이 원본과 동일한 제약을 모두 강제한다
- **이 시점에 UI/흐름 재현이 100% 완료된다 (Mock 기반 "서플라이 화면/기능 복원" 완료)**

---

### Phase 7 — DB 스키마 & 실제 API 구현

**1) 구현 대상**
Mock을 실제 백엔드로 교체. 프론트엔드 변경 최소화.

**2) 생성할 주요 페이지**
없음 (기존 페이지가 실 API로 전환).

**3) 필요한 컴포넌트**
- 없음. 대신 `apps/web/app/api/**` Route Handler 전체
- 공통 미들웨어: 인증 세션, 커서 파서, 응답 래퍼, 에러 매퍼, rate limiter

**4) 필요한 데이터**
Prisma 스키마 (핵심 테이블):

```
User(id, email, passwordHash, nickname, role, emailVerifiedAt, createdAt)
UserPlayerLink(userId, playerId, verifiedAt)          -- 서든어택 계정 연동
Player(id, name, clanId, note, position, renewedAt)
Clan(id, slug, name, markBgUrl, markFrontUrl, masterPlayerId, notice, establishedAt, renewedAt)
League(id, slug, name, description, ownerUserId, divisionCount, status, createdAt)
LeagueMap(leagueId, mapId)         Map(id, name)
LeaguePlayerLimit(leagueId, playerCount)
LeagueClan(id, leagueId, clanId, rating, division, win, lose, placement, status, joinedAt, deleteRequestedAt)
LeaguePlayer(id, leagueId, playerId, rating, win, lose, kill, death, assist, headshot, mvpCount, placement)
LeaguePlayerSeason(id, leaguePlayerId, season, rank, rankCount, win, lose, kill, death)
Season(id, leagueId, number, startedAt, endedAt)
Match(id, leagueId, mapId, playerCount, startAt, endAt, redLeagueClanId, blueLeagueClanId, winnerSide, mvpPlayerId, sourceRef)
MatchPlayerStat(matchId, playerId, side, kill, death, assist, headshot, damage, weapon, dropout, ratingBefore, ratingUpdate, placement)
RankSnapshot(leagueId, kind, division, generatedAt, payload)   -- 1시간 배치 결과
Board(id, categorySlug, title, content, userId, anonAlias, anonPasswordHash, discloseType, viewCount, likeCount, dislikeCount, hasImage, createdAt, lastEditedAt)
Comment(id, boardId, parentId, content, userId, anonAlias, anonPasswordHash, deleted, createdAt)
Vote(targetType, targetId, voterKey, type)
Upload(id, url, ownerKey, createdAt)
```

인덱스: `Match(leagueId, startAt desc)`, `MatchPlayerStat(playerId, matchId)`, `LeaguePlayer(leagueId, rating desc)`, `LeagueClan(leagueId, division, rating desc)`, `Board(categorySlug, id desc)`

**5) API/DB 의존성**
- PostgreSQL, Redis 기동
- Auth.js 세션 테이블
- 이메일 발송(가입 인증/비밀번호 재설정) — 개발은 Mailpit, 운영은 SMTP 제공자
- 캡차 실연동

**6) 테스트 방법**
- **계약 준수 테스트**: 실제 API 응답을 `packages/contract` Zod 스키마로 파싱. Mock과 동일 스키마이므로 어긋나면 즉시 실패
- 통합 테스트: 테스트용 Postgres 컨테이너 + 시드 → 각 엔드포인트 CRUD
- Playwright E2E 전체 스위트를 Mock 모드와 실 API 모드에서 **양쪽 다** 통과
- N+1 쿼리 검사(Prisma 쿼리 로그 기반)

**7) 완료 조건**
- `NEXT_PUBLIC_API_MODE=mock|live` 스위치만으로 전환되며 두 모드 모두 E2E 통과
- 시드 데이터로 전 화면이 정상 렌더된다
- 커서 페이지네이션이 실제 인덱스를 타고 동작한다(EXPLAIN 확인)

---

### Phase 8 — 전적 수집 파이프라인

**1) 구현 대상**
넥슨 병영수첩에서 클랜전 기록을 가져와 `Match` / `MatchPlayerStat`로 정규화.

**2) 생성할 주요 페이지**
- (관리자 전용) 수집 상태 대시보드 — 최근 수집 시각, 실패 큐, 재시도 버튼
  - 원본에 동일 화면이 있는지는 `[미확인]`. 운영에 필요하므로 내부용으로만 추가

**3) 필요한 컴포넌트**
- `apps/worker`: `ClanSyncJob`, `MatchIngestJob`, `PlayerRefreshJob`
- `SourceAdapter` 인터페이스 — 수집원 교체 가능하게 추상화
- 정규화기: 원본 응답 → 내부 스키마 매핑, 중복 제거(matchId 기준 upsert)
- 결측 처리: 상대팀 딜량·헤드샷이 없으면 `null`로 저장하고 UI에서 `알수없음`

**4) 필요한 데이터**
- 확인된 수집원 (조사 시점 관찰값):
  - `POST https://barracks.sa.nexon.com/api/ClanHome/GetClanInfo/{slug}`
  - `POST .../GetClanUserList`
  - `POST .../GetClanMatchList/`
- 요청 파라미터 형식, 페이지네이션 방식, 인증/토큰 필요 여부, 호출 제한: **모두 `[미확인]`** → Phase 8 착수 시 실측 필요
- 이용약관/robots 상 수집 허용 범위: `[미확인]` → 착수 전 확인 필요

**5) API/DB 의존성**
- BullMQ 큐 + Redis
- 스케줄: 클랜별 주기 동기화 + 사용자 `정보갱신`/`전적갱신` 요청 시 온디맨드 작업 투입
- 기록 조건 필터: 리그의 `maps` / `playerLimits`에 맞고 **양쪽 클랜이 모두 해당 리그 소속**인 경기만 저장

**6) 테스트 방법**
- 어댑터 단위 테스트: 저장해 둔 응답 픽스처로 정규화 결과 검증(네트워크 미사용)
- 멱등성 테스트: 동일 매치 3회 수집 → 레코드 1건, 스탯 중복 없음
- 필터 테스트: 맵/인원/미등록 클랜 조합에서 저장 제외 확인
- 장애 주입: 429/5xx/타임아웃 시 백오프 재시도 후 실패 큐 적재

**7) 완료 조건**
- 실제 클랜 1개를 등록해 최근 경기가 기록실에 뜬다
- 재수집 시 중복이 생기지 않는다
- 수집 실패가 사용자 화면을 깨뜨리지 않는다(부분 데이터로 렌더)

---

### Phase 9 — 레이팅 · 배치고사 · 시즌 · 랭킹 배치

**1) 구현 대상**
"실제 전적이 작동하는" 마지막 조각.

**2) 생성할 주요 페이지**
없음. (기존 랭킹/기록실 페이지가 실제 값을 표시)

**3) 필요한 컴포넌트**
- `RatingEngine` — 클랜 래더 / 개인 래더 각각 산출
- `PlacementPolicy` — 배치고사 진행/종료 판정
- `SeasonManager` — 시즌 시작·종료, 종료 시 `LeaguePlayerSeason` 스냅샷 생성, 래더 초기화 정책
- `RankSnapshotJob` — 1시간 주기, 배치 완료 대상만 순위 산출 후 캐시
- `MatchSummaryBuilder` — 최근 20전 요약, 연승/연패, 상대 클랜별 전적, 같이한 플레이어 승률

**4) 필요한 데이터**
- 관찰된 사실: 승 +7~+12, 패 −10~−19 범위. 상대 레이팅 차이를 반영하는 Elo 계열
- **`[미확인]`**: 정확한 K값, 초기 레이팅, 클랜 래더와 개인 래더의 결합 방식, 배치고사 판정 경기 수, 시즌 전환 시 래더 이월(소프트 리셋) 여부, 부리그 승강 규칙
- → V1에서는 **관찰 범위를 재현하는 파라미터화된 Elo**로 구현하고, 모든 상수를 설정값으로 분리해 이후 조정 가능하게 한다. 문서에 "원본과 동일함이 검증되지 않음"을 명시

**5) API/DB 의존성**
- 랭킹은 `RankSnapshot` 테이블 + Redis 캐시에서 읽는다(요청 시 실시간 집계 금지)
- 매치 저장 시점에 레이팅 증분 반영, 시간당 배치로 순위 재계산

**6) 테스트 방법**
- 레이팅 엔진 골든 테스트: 고정 경기 시퀀스 → 기대 점수표와 대조
- 배치고사 경계 테스트(직전/직후 랭킹 노출 여부)
- 시즌 전환 시뮬레이션: 스냅샷 생성 + 지난시즌 화면 렌더
- 배치 작업 성능: 리그 100개 / 클랜 5,000개 규모에서 1시간 배치 소요 시간 측정

**7) 완료 조건**
- 실제 수집 데이터로 클랜랭킹·개인랭킹이 생성된다
- 매치 카드의 래더 ±점이 저장값과 일치한다
- 랭킹 갱신 주기(1시간)가 안내 문구와 실제 동작이 일치한다

---

### Phase 10 — SSR / SEO / 성능 / 운영 → V1 완료

**1) 구현 대상**
검색 유입과 운영 안정성.

**2) 생성할 주요 페이지**
- `/sitemap.xml` (동적), `/robots.txt`
- 오류 페이지, 유지보수 페이지

**3) 필요한 컴포넌트**
- 페이지별 메타데이터 생성기 — 제목 패턴(`{닉네임} - {리그명} | 사이트명` 등 자체 패턴)
- OG 이미지 생성 (플레이어/클랜/리그)
- 캐시 정책: 랭킹 페이지 ISR, 기록실은 짧은 revalidate, 프로필은 요청 시 갱신
- 관측: 요청 로그, 느린 쿼리 알림, 수집 실패 알림

**4) 필요한 데이터**
- 색인 대상 URL 목록(리그·클랜·플레이어 상위 N)

**5) API/DB 의존성**
- 배포 파이프라인(CI: typecheck → lint → unit → build → E2E → deploy)
- DB 마이그레이션 자동화, 백업

**6) 테스트 방법**
- Lighthouse: 주요 5개 페이지 성능/접근성/SEO 측정
- SSR 검증: JS 비활성 상태에서 전적·랭킹·게시글 본문이 HTML에 존재하는지
- 부하 테스트: 랭킹·기록실 동시 접속 시나리오

**7) 완료 조건**
- 주요 페이지가 서버 렌더 HTML만으로 핵심 콘텐츠를 노출한다
- sitemap이 실제 데이터 기준으로 생성된다
- 스테이징에서 E2E 전 스위트 통과 → **V1 릴리스**

---

## 4. 가장 효율적인 개발 순서

### 4-1. 권장 실행 순서

```
1. Phase 0   계약 + Mock 생성기            ← 여기에 시간을 아끼지 말 것
2. Phase 1   레이아웃 + 홈
3. Phase 3   리그 & 랭킹                   ← Phase 2보다 먼저
4. Phase 2   플레이어 & 클랜 프로필
5. Phase 4   기록실 & 매치 상세            ← 가장 오래 걸림, 앞당겨 착수
6. Phase 6   인증 & 관리 화면
7. Phase 5   게시판
8. Phase 7   DB + 실제 API
9. Phase 8   수집 파이프라인
10. Phase 9  레이팅/랭킹 배치
11. Phase 10 SSR/SEO/운영 → V1
```

**Phase 3을 2보다 먼저 하는 이유**: 랭킹 테이블에서 `ClanMark`, `LoadMoreButton`, 숫자 포맷터, `DivisionTabs` 같은 공용 컴포넌트가 먼저 확정된다. 프로필 화면은 이것들을 재사용하기만 하면 되므로 총 작업량이 줄어든다.

**Phase 5(게시판)를 뒤로 미루는 이유**: 전적 도메인과 결합도가 거의 없어 언제 해도 되고, 에디터·새니타이즈 등 독립 작업이라 병렬 처리하기 좋다.

### 4-2. 병렬화 가능한 구간

| 동시 진행 가능 | 조건 |
|---|---|
| Phase 4(기록실) ∥ Phase 5(게시판) | 공용 컴포넌트가 Phase 1·3에서 확정된 이후 |
| Phase 7(API) ∥ Phase 5(게시판 UI) | 계약이 고정되어 있으므로 충돌 없음 |
| Phase 8(수집) ∥ Phase 9(레이팅 엔진) | 레이팅 엔진은 픽스처로 개발·테스트 가능 |
| Phase 10 일부(SEO 메타·sitemap) | Phase 7 완료 직후부터 착수 가능 |

### 4-3. 리스크 순으로 미리 확인해야 할 것

가장 불확실한 것부터 앞당겨 **탐색(spike)** 한다. 각 spike는 반나절~하루 규모.

1. **수집원 실측** (Phase 8 리스크) — Phase 0~1과 병행해 `GetClanMatchList` 요청 형식·응답 구조·호출 제한·약관을 실측한다. 여기서 막히면 전체 계획이 바뀌므로 **가장 먼저** 확인한다
2. **레이팅 공식 역산** (Phase 9 리스크) — 원본 매치의 `래더 ±점`과 양팀 레이팅 쌍을 다수 수집해 K값·공식을 회귀로 추정한다. 실패해도 파라미터화 구현으로 대체 가능
3. **매치 상세 UI 복잡도** (Phase 4 리스크) — Phase 1 직후 카드 1개 프로토타입만 먼저 만들어 본다

### 4-4. 마일스톤

| 마일스톤 | 완료 시점 | 판정 기준 |
|---|---|---|
| **M1 — 화면 복원** | Phase 6 종료 | Mock만으로 원본의 모든 화면·흐름을 클릭으로 재현 가능 |
| **M2 — 실데이터 연결** | Phase 7 종료 | 시드 DB 기준 전 화면 동작, Mock/Live 양쪽 E2E 통과 |
| **M3 — 전적 작동** | Phase 9 종료 | 실제 클랜 경기가 수집되어 랭킹·기록실에 반영 |
| **M4 — V1 릴리스** | Phase 10 종료 | SEO/성능/운영 기준 충족 |

---

## 5. 미확인 목록 (착수 전 확인 필요)

구현 중 추측으로 메우지 말고, 실측하거나 자체 정책으로 결정한 뒤 그 사실을 기록한다.

**레이팅·랭킹**
- Elo K값, 초기 레이팅, 상대 레이팅 반영 공식
- 클랜 래더와 개인 래더의 산출 관계
- 배치고사 판정 기준(경기 수 / 기간)
- 시즌 길이, 시즌 전환 시 래더 초기화 정책
- 부리그(division) 간 승격·강등 규칙 — 관리자 수동 변경만 확인됨
- MVP 선정 기준

**데이터 수집**
- 병영수첩 API 요청 파라미터·페이지네이션·인증 요구사항
- 호출 빈도 제한 및 차단 정책
- 수집 허용 범위(약관·robots)
- 플레이어 `정보갱신` 버튼의 실제 rate limit
- 상대팀 상세 스탯이 결측되는 정확한 조건

**커뮤니티**
- `인기(hot)` 게시판 선정 알고리즘(조회수·추천·시간 가중)
- 익명 별칭(`히노캥-721` 형태) 생성 규칙 — IP 기반으로 추정되나 미검증
- `disclose_type` 값 체계, `role` 값 전체 목록
- `ENTRY_TIME_LIMIT=3600`의 정확한 용도
- 이미지 업로드 용량·개수 제한
- 신고/차단 기능 존재 여부

**계약 설계 중 발견 (Phase 0, 2026-08-20)**
- 공식 리그 배지의 실제 필드명 (계약에서는 `official`로 확정)
- `blue_team`의 정확한 의미 (선공 진영 표기로 추정, 미검증)
- 매치 ID 뒤 6자리 코드의 의미
- 매치 상세에서 "어느 클랜 기준으로 보는지"를 전달하는 방식 — 결측(`알수없음`) 처리에 필요
- 클랜 지난시즌 / 리그 참여 클랜원 목록 / 리그 관리(초대·승계·추방) 엔드포인트 경로와 본문
- 인증 API 요청·응답 본문, 에러 응답 포맷
- 응답의 날짜/시각 문자열 포맷
- 승률·킬뎃 등 파생값을 서버가 내려주는지 클라이언트가 계산하는지
- 리그맵 실제 목록

**기타 화면**
- 모바일 전용 레이아웃 구성 (별도 빌드로 추정되나 미확인)
- `/me`, `/me/setting`, `/clan/:slug/setting`, `/player/:id/setting` 화면 상세 (로그인 필요로 미확인)
- `즐겨찾기` 기능의 저장 위치와 노출 지점
- 리그 `가입` 버튼의 실제 흐름
- 클랜 최대 참여 리그 수 / 리그 최대 클랜 수의 구체적 상한값
- 리그 `status`, LeagueClan `status` 값 체계
- 알림 기능 존재 여부

---

## 6. V2 후보 (V1에서는 구현하지 않음)

원본 분석 중 발견한 개선 여지(**미확정 아이디어**). **V1 완료 전까지 착수 금지.**

> 별도로, V1 이후에 만들기로 **확정된** 요구사항은 `docs/POST_V1_REQUIREMENTS.md`에 있다.
> 이 절의 목록과 성격이 다르므로 섞지 않는다. 두 가지 모두 V1에서는 구현하지 않는다.

- 양측 클랜 데이터를 병합해 `알수없음` 결측 보정
- 매치 상세에 개별 URL 부여 (공유·SEO)
- 래더 점수 외 티어 배지·시각화
- `/league/:slug/rank/clan` 리다이렉트 버그에 해당하는 문제 없는 라우팅 설계 (V1에서 버그까지 재현하지는 않음)
