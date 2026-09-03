/**
 * 로컬에서 만든 **운영 반영 스크립트**를 운영 DB 를 향해 돌린다.
 *
 * ```
 * node scripts/prod-run.mjs <이름> [인자...]
 * node scripts/prod-run.mjs --list          # 돌릴 수 있는 것 목록
 * ```
 *
 * ── 왜 감싸는가 (`scripts/prod-migrate.mjs` 와 같은 이유)
 *   1. 운영 접속 주소를 **명령줄에 노출하지 않는다.** 비밀번호가 들어 있다.
 *      `packages/db/.env.production.local` 에서 읽어 자식 프로세스에만 넘긴다.
 *   2. **아무 스크립트나 못 돌린다.** 아래 표에 적힌 것만 돌아간다.
 *   3. 주소가 로컬(127.0.0.1 · localhost)이면 **거부한다.** 이건 운영용이다 —
 *      로컬에 돌리려면 `pnpm --filter @sacloud/worker exec tsx ...` 를 그냥 쓰면 된다.
 *   4. 화면에는 **호스트만** 찍는다. 전체 주소는 절대 찍지 않는다.
 *
 * ── 이 스크립트 자체는 아무것도 쓰지 않는다
 *   쓰기 여부는 **자식 스크립트의 `--confirm`** 이 정한다. 붙이지 않으면 미리보기다.
 *   `--confirm` 을 붙일 때는 그 스크립트가 무엇을 지우는지 먼저 미리보기로 읽어라.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * 돌릴 수 있는 것. **여기 없는 이름은 거부한다.**
 * 값은 `apps/worker/src/dev/<값>.ts` 다.
 */
const ALLOWED = {
  /* 읽기만 한다 */
  'barracks-state': {
    file: 'barracksState',
    writes: false,
    what: '병영 클랜원 명단이 우리 선수와 얼마나 이어져 있나 (접속중 표시가 가능한 인원)',
  },
  'clan-mark-restore': {
    file: 'clanMarkRestore',
    writes: true,
    what: '클랜마크 주소를 static.3rd.supply -> img.sa.nexon.com 으로 되돌린다 (D-227) 백업 후 실행 · MatchPlayerStat 은 안 건드린다',
  },
  'perf-dist-index': {
    file: 'perfDistIndex',
    writes: true,
    what: '선수 상세(육각형)를 살리는 커버링 인덱스 (D-230 후속 2). CONCURRENTLY · 추가만 한다',
  },
  'perf-covering-index': {
    file: 'perfCoveringIndex',
    writes: true,
    what: '클랜 상세를 살리는 커버링 인덱스 (D-230 후속). CONCURRENTLY · 쓰기를 안 잠근다 · 옛 인덱스는 안 지운다',
  },
  'perf-probe': {
    file: 'perfProbe',
    writes: false,
    what: '어느 질의가 느린지 하나씩 잰다 (/api/home/top 이 던지는 질의 + 표 크기 + 인덱스)',
  },
  'prod-health': {
    file: 'prodHealthProbe',
    writes: false,
    what: '통계(ANALYZE) 갱신 여부 · 플래너가 아는 행 수 vs 실제 · 디스크 여유 · collation · 인덱스 (D-227 후속)',
  },
  'barracks-usn-search': {
    file: 'barracksUsnProbe',
    writes: false,
    what: '병영수첩 주소를 붙여 넣으면 그 선수·클랜이 나오는지 대조한다 (D-254 · 읽기만 한다)',
  },
  'bomb-quit-round': {
    file: 'bombQuitRoundProbe',
    writes: false,
    what: '라운드 단위로 설박튀를 가린다 (설치했는데 그 라운드를 졌는가) — 읽기만 한다',
  },
  'season-verify': {
    file: 'seasonVerify',
    writes: false,
    what: 'O-046 확인 칸 다섯 (읽기만 한다)',
  },
  'season-assign': {
    file: 'seasonAssign',
    writes: true,
    what: 'O-046 — 시즌 넷을 만들고 경기의 seasonId 를 채운다. ★--confirm 없으면 미리보기★',
  },
  'season-plan': {
    file: 'seasonPlanProbe',
    writes: false,
    what: 'O-046 — 시즌 경계로 나누면 어디에 몇 건이 떨어지나 (읽기만 한다)',
  },
  'clan-move': {
    file: 'clanMoveApply',
    writes: true,
    what: 'O-044 (나) — 경기를 제 리그로 옮긴다. ★--confirm 없으면 미리보기 · --revert 로 되돌린다★',
  },
  'dropout-meaning': {
    file: 'dropoutMeaningProbe',
    writes: false,
    what: 'dropout 이 무슨 뜻인가 — 이긴 팀 vs 진 팀 · 나간 사람 킬데스 · 경기당 인원 · 한 팀 전원 탈주 (읽기 전용)',
  },
  'ipl-stat-coverage': {
    file: 'iplStatCoverageProbe',
    writes: false,
    what: 'IPL 에 딜량·어시·헤드샷·무기가 있는가 — dropoutScope 의 damage>0 조건이 IPL 을 통째로 지우지 않는지 (읽기 전용)',
  },
  'bomb-quit-winner': {
    file: 'bombQuitCrossJoinProbe',
    writes: false,
    what: '설박튀 — C4 상태별로 ★나간 팀이 이긴 팀인가★ (평소 이긴 팀 탈주는 0.3~1% 뿐이라는 잣대로 가른다 · 읽기 전용)',
  },
  'battlelog-shape': {
    file: 'battleLogShapeProbe',
    writes: false,
    what: '배틀로그 이벤트 한 건의 칸 이름과 종류 (라운드 단위로 셀 수 있는지 · 읽기 전용)',
  },
  'bomb-round': {
    file: 'bombRoundProbe',
    writes: false,
    what: '라운드 단위로 C4 를 센다 — 설치/해체 라운드 수와 설치 뒤에 일어난 일 (읽기 전용)',
  },
  'bomb-round-sanity': {
    file: 'bombRoundSanity',
    writes: false,
    what: 'C4 라운드 칸을 믿을 수 있나 — 해체는 있는데 설치가 없는 라운드가 왜 나오나 (읽기 전용)',
  },
  'bomb-event-type': {
    file: 'bombEventTypeProbe',
    writes: false,
    what: '폭탄 사건이 event_type 에 있는가 — C4 설치를 event_text 로만 세면 놓치는지 (읽기 전용)',
  },
  'barracks-overlap': {
    file: 'barracksOverlapProbe',
    writes: false,
    what: 'O-051 - 같은 경기가 병영수첩과 미러에 겹쳐 들어와 있나 (자동화 켜기 전 바탕값 · 읽기 전용)',
  },
  'demo-player': {
    file: 'demoPlayerPick',
    writes: false,
    what: 'O-050 - 사장님께 보일 선수 두 명(기록 꽉 참 / 적음)의 주소를 뽑는다 (읽기 전용)',
  },
  'barracks-pending': {
    file: 'barracksPendingProbe',
    writes: false,
    what: 'O-051 - 아직 배틀로그를 안 받은 경기가 몇 건인가 (읽기 전용)',
  },
  'clan-number-gap': {
    file: 'clanNumberGapProbe',
    writes: false,
    what: 'O-051 - 못 이은 배틀로그가 버려지나 이을 수 있나 (읽기 전용)',
  },
  'ipl-stat-count': {
    file: 'iplStatCount',
    writes: false,
    what: 'IPL 참가 기록이 지금 몇 건인가 (읽기 전용)',
  },
  'ipl-demo-player': {
    file: 'iplDemoPlayerPick',
    writes: false,
    what: '사장님께 보일 IPL 선수 주소 - 스나·라플이 갈리는 사람 (읽기 전용)',
  },
  'ipl-mvp': {
    file: 'iplMvpProbe',
    writes: false,
    what: 'IPL 에 MVP 가 하나도 없나 - 원본이 안 준 것인가 우리가 안 넣은 것인가 (읽기 전용)',
  },
  'battlelog-no-match': {
    file: 'battlelogNoMatchProbe',
    writes: false,
    what: 'O-051 - 배틀로그는 있는데 우리 경기가 없는 5,255건이 결손인가 규칙대로인가 (읽기 전용)',
  },
  'ipl-gap-hour': {
    file: 'iplGapByHourProbe',
    writes: false,
    what: 'O-051 - PC 를 끄면 몇 %가 늦어지나 (IPL 경기 시간대 · 읽기 전용)',
  },
  'nexon-ipl-viability': {
    file: 'nexonIplViabilityProbe',
    writes: false,
    what: '넥슨 공식 API 로 IPL 을 재구성할 수 있나 - 10명이 다 오는가 (읽기 전용)',
  },
  'ipl-ouid': {
    file: 'iplOuidCoverageProbe',
    writes: false,
    what: 'IPL 선수 중 넥슨 ouid 를 아는 사람이 몇 % 인가 (읽기 전용)',
  },
  'independence': {
    file: 'independenceProbe',
    writes: false,
    what: '서플라이 없이 SPL·열산을 가져올 수 있나 - 클랜 수 · 병영수첩 번호 · 명부 출처 (읽기 전용)',
  },
  'roster-growth': {
    file: 'rosterGrowthProbe',
    writes: false,
    what: '명부가 정말 늘고 있나 아니면 이관한 날짜인가 (읽기 전용)',
  },
  'nexon-detail-shape': {
    file: 'nexonDetailShapeProbe',
    writes: false,
    what: '선수를 이어도 넥슨 공식 길이 열리는가 - 경기 상세가 10명을 주는가 (읽기 전용)',
  },
  'ipl-range': {
    file: 'iplRangeProbe',
    writes: false,
    what: 'IPL 기록이 언제부터 언제까지 있나 - 월별·시즌별·라인업 유무 (읽기 전용)',
  },
  'ipl-daily': {
    file: 'iplDailyProbe',
    writes: false,
    what: 'IPL 경기가 날짜별로 몇 건인가 - 언제 멈췄나 (읽기 전용)',
  },
  'tier2-kd': {
    file: 'tier2KdProbe',
    writes: false,
    what: '2티어끼리 한 경기의 선수별 킬뎃 (6월~8월 · 읽기 전용)',
  },
  'tier2-verify': {
    file: 'tier2VerifyProbe',
    writes: false,
    what: '「2티어끼리」가 정말 맞나 - 경기 5건을 펼쳐 본다 (읽기 전용)',
  },
  'matchlist-range': {
    file: 'matchListRangeProbe',
    writes: false,
    what: '병영수첩 매치목록이 과거를 얼마나 주나 (읽기 전용)',
  },
  'battlelog-yield': {
    file: 'battlelogYieldProbe',
    writes: false,
    what: '받은 배틀로그가 라인업까지 가나 — 어디서 새는지 (읽기 전용)',
  },
  'clan-slug-probe': {
    file: 'clanSlugProbe',
    writes: false,
    what: 'IPL 클랜 슬러그가 병영수첩에서 통하나 (읽기 전용)',
  },
  'league-mix': {
    file: 'leagueMixProbe',
    writes: false,
    what: 'IPL 경기가 다른 리그로 들어갔나 — 양쪽 다 IPL 인 경기를 센다 (읽기 전용)',
  },
  'lineup-ten': {
    file: 'lineupTenProbe',
    writes: false,
    what: '경기 상세에 10명이 다 보이나 — 인원수별로 센다 (읽기 전용)',
  },
  'lineup-twenty': {
    file: 'lineupTwentyProbe',
    writes: false,
    what: '20명짜리 경기 안에 무엇이 들었나 (읽기 전용)',
  },
  'lineup-side': {
    file: 'lineupSideProbe',
    writes: false,
    what: '한 팀에 몇 명이 정상인가 · 겹친 표시가 어디에 몰려 있나 (읽기 전용)',
  },
  'lineup-origin': {
    file: 'lineupOriginProbe',
    writes: false,
    what: '라인업이 미러에서 왔나 병영수첩에서 왔나 · 헛수고가 몇 건인가 (읽기 전용)',
  },
  'player-twin': {
    file: 'playerTwinProbe',
    writes: false,
    what: '같은 사람이 두 선수로 갈려 있는 것이 몇 쌍인가 (읽기 전용)',
  },
  'stat-richness': {
    file: 'statRichnessProbe',
    writes: false,
    what: '어느 출처가 정말 더 많이 아나 — 칸이 채워진 비율 (읽기 전용)',
  },
  'invariant-break': {
    file: 'invariantBreakProbe',
    writes: false,
    what: '불변식(통합 = 기본 + 스나 + 라플)이 어긋난 선수가 누구인가 (읽기 전용)',
  },
  'ladder-miss': {
    file: 'ladderMissProbe',
    writes: false,
    what: 'IPL 경기가 왜 전부 래더 미반영인가 — 리그별로 센다 (읽기 전용)',
  },
  'spring-gap': {
    file: 'springGapProbe',
    writes: false,
    what: '3~6월 배틀로그가 어디서 막혔나 (읽기 전용)',
  },
  'pending-dup': {
    file: 'pendingDupProbe',
    writes: false,
    what: '같은 경기를 두 번 부르고 있나 — 낭비를 센다 (읽기 전용)',
  },
  'season-table': {
    file: 'seasonTableProbe',
    writes: false,
    what: '확정된 시즌 구분이 코드·DB 와 맞나 (읽기 전용)',
  },
  'recent-raw': {
    file: 'recentRawProbe',
    writes: false,
    what: '방금 받은 배틀로그가 어느 달인가 — 기간 필터가 먹었나 (읽기 전용)',
  },
  'spring-match': {
    file: 'springMatchPick',
    writes: false,
    what: '3~6월 IPL 경기 하나를 골라 화면 주소를 만든다 (읽기 전용)',
  },
  'month-coverage': {
    file: 'monthCoverageProbe',
    writes: false,
    what: '3~9월 중 어느 달이 비었나 — 경기·라인업·병영수첩원문을 달마다 (읽기 전용)',
  },
  'backlog': {
    file: 'backlogProbe',
    writes: false,
    what: '밤새 받을 수 있는 것이 실제로 몇 건인가 (읽기 전용)',
  },
  'weekly-graph-probe': {
    file: 'weeklyGraphProbe',
    writes: false,
    what: 'O-045 주간 그래프를 되짚을 수 있나 — 리그별 킬뎃 유무 · 목요일 칸 · 선 규칙 세 경우 · Beta 창이 평평한가 (읽기 전용)',
  },
  'clan-move-plan': {
    file: 'clanMovePlanProbe',
    writes: false,
    what: 'O-044 (나) — 옮길 경기·감출 경기가 몇 건인가 (읽기만 한다)',
  },
  'clan-overlap-plan': {
    file: 'clanOverlapPlanProbe',
    writes: false,
    what: 'O-044 — 감추기 전 숫자. 사장님 43곳 분류가 DB 와 맞는지 · 몇 건이 안 보이게 되는지',
  },
  'battlelog-vocab': {
    file: 'battlelogVocabProbe',
    writes: false,
    what: '배틀로그에 어떤 이벤트 낱말이 있나 (C4 폭발이 찍히는지) — 읽기만 한다',
  },
  'bomb-quit-cross': {
    file: 'bombQuitCrossProbe',
    writes: false,
    what: 'C4 설치·해체 x 전원탈주 x 경기길이를 겹쳐 센다 (읽기만 한다)',
  },
  'bomb-quit-count': {
    file: 'bombQuitCountProbe',
    writes: false,
    what: '설박튀 후보를 조건 셋으로 겹쳐 센다 (사장님 기준 10판에 1판) — 읽기만 한다',
  },
  'c4-probe': {
    file: 'c4Probe',
    writes: false,
    what: '배틀로그 원문에 C4 설치·해체가 어떻게 찍혀 있나 (읽기만 한다)',
  },
  'dropout-trust': {
    file: 'dropoutTrustProbe',
    writes: false,
    what: 'dropout 칸을 믿을 수 있나 — 한 팀 통째 탈주 · 나간 쪽 승패 · 경기 길이 (읽기만 한다)',
  },
  'bomb-quit': {
    file: 'bombQuitProbe',
    writes: false,
    what: '설박튀 흔적이 우리 DB 에 있나 (승자 없음 · 5명뿐 · 배틀로그 원문) — 읽기만 한다',
  },
  'killdeath-null': {
    file: 'killDeathNullProbe',
    writes: false,
    what: '킬·데스가 없는 224명이 원본 탓인지 우리 병합 탓인지 가른다 (읽기만 한다)',
  },
  'barracks-406': {
    file: 'barracks406Probe',
    writes: false,
    what: '406 이 「로그 없음」인지 DB 로만 가른다 (넥슨을 안 부른다 · 읽기만 한다)',
  },
  'lineup-gap': {
    file: 'lineupGapProbe',
    writes: false,
    what: '참가자 10명이 다 오나 · 0/0/0 이 몇 명인가 · 킬데스 없는 사람이 몇 명인가 (읽기만 한다)',
  },
  'ipl-backfill': {
    file: 'iplBackfillProbe',
    writes: false,
    what: 'IPL 1~6월 규모와 넥슨에 물어볼 닉네임을 고른다 (읽기만 한다 · 넥슨을 안 부른다)',
  },
  'clan-league-move': {
    file: 'clanLeagueMoveProbe',
    writes: false,
    what: '겹친 클랜마다 어느 리그가 나중인가 (joinedAt 은 못 믿는다 · 경기 날짜로 본다 · 읽기만 한다)',
  },
  'cross-league-clans': {
    file: 'crossLeagueClanProbe',
    writes: false,
    what: '한 클랜이 두 리그에 동시에 있는가 · 남의 리그 클랜을 문 경기가 있는가 (읽기만 한다)',
  },
  'season-window': {
    file: 'seasonWindowProbe',
    writes: false,
    what: '기록이 언제까지 거슬러 올라가나 · 월별 경기 수 · 래더 증감 보존율 · Season 행 (읽기만 한다)',
  },
  'ipl-state': { file: 'iplState', writes: false, what: 'IPL 리그·등록 클랜·경기 수를 읽는다' },
  'ipl-source': { file: 'iplSource', writes: false, what: 'IPL 기록이 어디까지 있는지 센다' },
  'ipl-match': { file: 'iplMatch', writes: false, what: '명단 39곳이 DB 에 있는지 대조한다' },
  'sanply-check': { file: 'sanplyCheck', writes: false, what: '열산에서 IPL 이 빠졌는지 대조한다' },
  'sync-freshness': {
    file: 'syncFreshness',
    writes: false,
    what: '증분 동기화 신선도 — 최신 경기 시각 vs 마지막 적재 시각 · 미러가 훑을 클랜 수 (D-225)',
  },
  'db-snapshot-probe': {
    file: 'dbSnapshotProbe',
    writes: false,
    what: 'CI 가 도는 무결성 검사를 여기서 재서 러너(미국)와의 배수를 본다 (D-229 후속)',
  },
  'ipl-sanply-forensics': {
    file: 'iplSanplyForensics',
    writes: false,
    what: '열산에 남은 IPL끼리 경기를 한 건씩 찍는다 (원인 규명 · 역방향 포함)',
  },

  /* `--confirm` 을 붙여야 쓴다 */
  'league-rename': {
    file: 'leagueRename',
    writes: true,
    what: '리그 이름 SPL / IPL / 10mountain + 게시판 카테고리 → SPL',
  },
  'ipl-register': {
    file: 'iplRegister',
    writes: true,
    what: 'IPL 39곳을 티어별로 등록한다 (1티어는 비운다). 없는 클랜은 만든다',
  },
  'league-clan-count': {
    file: 'leagueClanCount',
    writes: false,
    what: '리그별 클랜 수 — 등록 · 활성 · 랭킹표시 · 경기한곳 (고용가능 클랜 설계용 · 읽기만)',
  },
  'ipl-lineup-state': {
    file: 'iplState2',
    writes: false,
    what: 'IPL 참가 기록 적재 상태 — MatchPlayerStat · BRK 선수 · LeaguePlayer 수를 센다 (읽기만)',
  },
  'ipl-lineup-push': {
    file: 'iplLineupPush',
    writes: true,
    what: 'IPL 참가 기록(선수·MatchPlayerStat)을 운영에 넣는다 (D-255). 계정(user_nexon_sn)으로 기존 선수를 먼저 찾아 붙여 중복을 막는다 · 계획 파일로 --revert 가능 · 집계는 season0-apply 가 따로 한다',
  },
  'season0-apply': {
    file: 'season0ApplyProd',
    writes: true,
    what: '시즌0 창 + 배치고사 10판 규칙을 운영에 적용한다 (--leagues <slug> 필요) ⚠ 백업 후 --revert 가능',
  },
  /* dev 스크립트에서 **정식 잡으로 승격**됐다 (D-210). `nexon` CLI 를 통해 부른다 */
  'clan-mark-audit': {
    file: 'clanMarkAudit',
    writes: false,
    what: '리그에 등록된 클랜 중 마크가 안 그려지는 곳을 리그별로 찍는다 (판정거짓 / 마크없음)',
  },
  'match-first-side-check': {
    file: 'matchFirstSideCheck',
    writes: false,
    what: '전반 공수 백필의 재료(배틀로그 원문·클랜번호)와 채워진 건수를 센다',
  },
  'match-first-side-push': {
    file: 'matchFirstSidePush',
    writes: true,
    what: '로컬에서 정한 전반 공수(선레드/선블루)를 운영 Match 에 채운다 (D-207)',
  },
  'match-first-side': {
    file: 'matchFirstSideBuild',
    writes: true,
    what: '경기별 전반 공수(선레드/선블루)를 배틀로그 폭탄 근거로 채운다 (D-207)',
  },
  'ipl-mark-fill': {
    file: 'iplMarkFill',
    writes: true,
    what: 'IPL 클랜의 클랜마크 주소를 채운다 (이미 있는 곳은 안 덮는다)',
  },
  'admin-ensure': {
    file: 'adminEnsure',
    writes: true,
    what: '관리자 계정을 만들거나 비밀번호를 새로 정한다 (--email 필요) ⚠ 비밀번호가 화면에 한 번 찍힌다',
  },
  'mock-orphan-purge': {
    file: 'mockOrphanPurge',
    writes: true,
    what: '가짜 시드 삭제 뒤 남은 고아 선수·클랜을 치운다 ⚠ 백업을 뜬다',
  },
  'mock-league-purge': {
    file: 'mockLeaguePurge',
    writes: true,
    what: '가짜 시드 리그(공식전·세컨드·친목전·토너먼트)를 지운다 ⚠ 지우기 전에 백업을 뜬다',
  },
  'ipl-clan-rollup': {
    cli: ['nexon', 'ipl-clan-rollup'],
    writes: true,
    what: 'IPL 경기 결과로 LeagueClan 의 승패·래더·배치고사를 다시 매긴다 (결정적 replay)',
  },
  'ipl-project-push': {
    file: 'iplProjectPush',
    writes: true,
    what: '로컬에서 투영한 IPL 경기를 운영 Match 에 밀어 넣는다 (안정된 키만 옮긴다). 멱등',
  },
  'ipl-sanply-check': { cli: ['nexon', 'ipl-sanply-check'], writes: false, what: '열산에 남은 IPL끼리 경기를 센다 (0 이어야 한다)' },
  'ipl-sanply-purge': { cli: ['nexon', 'ipl-sanply-purge'], writes: true, what: '열산에서 IPL끼리의 경기를 지우고 등록 해제한다 ⚠ 지우기 전에 백업을 뜬다' },
  /*
   * 클랜 육각형 V2 집계 (D-217 사양 · D-235 결정).
   *
   * **추가만 한다.** `MatchClanHexV2` 에만 쓰고 다른 표는 읽기만 한다. DROP 도 UPDATE 도 없다.
   * 같은 경기를 다시 만나면 `upsert` 로 덮으므로 몇 번을 돌려도 행이 안 늘어난다.
   * 중간에 죽어도 같은 명령을 다시 돌리면 이어서 간다 (같은 formulaVersion 은 건너뛴다).
   *
   * ⚠ 처음 돌릴 때는 `--limit 20` 으로 소량부터 대 보고 숫자를 대조해라 (3-A 6번).
   */
  'clan-hex-v2-build': {
    cli: ['nexon', 'clan-hex-v2-build'],
    writes: true,
    what: '클랜 육각형 V2 를 배틀로그에서 집계해 MatchClanHexV2 에 쌓는다 (D-235). 멱등 · 재개 가능 · 추가만 한다',
  },
  /*
   * ⛔ **밀기 전에 이걸 먼저 돌려라.** 이것이 사실상 유일한 되돌리기다 (2026-09-02).
   *
   * 두 표의 유니크 키에 `formulaVersion` 이 없다
   * (`@@unique([matchId, leagueClanId])` · `@@unique(leagueClanId)`).
   * 그래서 새 판을 밀면 **같은 줄의 옛 판이 덮인다** — 두 판을 나란히 둘 자리가 없다.
   * 게다가 육각형의 원재료인 배틀로그 원문은 **로컬에만 있어서**(D-236)
   * 운영에서 다시 접는 길도 없다. **안 뜨면 옛 값을 못 되살린다.**
   */
  'clan-hex-v2-backup': {
    file: 'clanHexV2Backup',
    writes: false,
    what: '운영의 MatchClanHexV2 · ClanHexV2Summary 현재값을 JSON 두 개로 뜬다 (읽기 전용 · 밀기 전 되돌림 지점). 뜬 파일이 그대로 push 의 입력이 된다',
  },
  /*
   * 위 `clan-hex-v2-build` 는 **로컬용으로 그대로 둔다.** 운영에서는 재료가 없어 0건이다
   * (실측 2026-09-01: 원문 줄=0 · 집계한 경기=0). 그래서 로컬에서 집계한 결과를 옮긴다 —
   * `matchFirstSideExport` / `matchFirstSidePush` 와 같은 관례다.
   */
  'clan-hex-v2-push': {
    file: 'clanHexV2Push',
    writes: true,
    what: '로컬에서 집계한 클랜 육각형 V2 를 운영 MatchClanHexV2 에 밀어 넣는다 (배틀로그 원문이 운영에 없다). 멱등 · 추가만 한다',
  },
  /*
   * 클랜 육각형 V2 **요약** (D-238 후속).
   *
   * ⛔ **이 표가 없으면 클랜 페이지 육각형이 안 뜬다.** 질의가 읽는 것은 이제
   *    `ClanHexV2Summary` 하나뿐이다 — `MatchClanHexV2` 를 아무리 밀어 넣어도
   *    요약이 없으면 전부 `null` 이다. 경기 행을 넣었으면 **반드시 이어서 접어라.**
   *
   * 길이 둘이다. 어느 쪽이든 결과는 같다.
   *   ① clan-hex-v2-summary        운영에서 직접 접는다 (원재료가 운영에 이미 있다)
   *   ② clan-hex-v2-summary-push   로컬에서 접어 옮긴다 (운영이 읽는 양이 훨씬 작다)
   *
   * 처음 한 번은 ②를 권한다 — 로컬에서 값을 먼저 확인할 수 있고 운영 DB 를 오래 안 붙든다.
   * **원재료(`MatchClanHexV2`)는 둘 다 안 건드린다.** 요약은 사본이고, 틀리면
   * `--rebuild` 로 원재료에서 다시 만든다.
   */
  'clan-hex-v2-summary': {
    cli: ['nexon', 'clan-hex-v2-summary'],
    writes: true,
    what: '운영의 MatchClanHexV2 를 클랜별로 접어 ClanHexV2Summary 에 넣는다 (D-238). 멱등 · 재개 가능 · 원재료는 안 건드린다',
  },
  'clan-hex-v2-summary-push': {
    file: 'clanHexV2SummaryPush',
    writes: true,
    what: '로컬에서 접은 클랜 육각형 V2 요약을 운영 ClanHexV2Summary 에 밀어 넣는다. 멱등 · 추가만 한다',
  },
}

const args = process.argv.slice(2)
const name = args[0]

if (!name || name === '--list' || name === '-h' || name === '--help') {
  console.info('돌릴 수 있는 것 — node scripts/prod-run.mjs <이름> [--confirm]\n')
  for (const [key, v] of Object.entries(ALLOWED)) {
    console.info(`  ${key.padEnd(18)} ${v.writes ? '쓰기' : '읽기'}  ${v.what}`)
  }
  console.info('\n`--confirm` 없이 돌리면 미리보기다. 먼저 미리보기로 확인해라.')
  process.exit(0)
}

const entry = ALLOWED[name]
if (!entry) {
  console.error(`'${name}' 은 여기서 돌릴 수 없다. 목록은 node scripts/prod-run.mjs --list`)
  process.exit(1)
}

let url
try {
  const text = readFileSync('packages/db/.env.production.local', 'utf8')
  url = (text.match(/DATABASE_URL="([^"]+)"/) ?? [])[1]
} catch {
  console.error('packages/db/.env.production.local 을 읽지 못했다. 저장소 루트에서 실행해야 한다.')
  process.exit(1)
}
if (!url) {
  console.error('그 파일에 DATABASE_URL 이 없다.')
  process.exit(1)
}

const host = new URL(url).host
if (/^(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(host)) {
  console.error(`대상이 로컬이다 (${host}). 이 스크립트는 운영용이다.`)
  process.exit(1)
}

const rest = args.slice(1)
const willWrite = entry.writes && rest.includes('--confirm')

console.info(`대상 : ${host}`)
console.info(`작업 : ${entry.what}`)
console.info(`모드 : ${willWrite ? '⚠ 실제로 쓴다' : '미리보기 (쓰지 않는다)'}\n`)

/* `cli` 가 있으면 정식 명령, `file` 이면 `src/dev/*.ts` 스크립트다 */
const argv = entry.cli
  ? ['--filter', '@sacloud/worker', ...entry.cli, ...rest]
  : ['--filter', '@sacloud/worker', 'exec', 'tsx', `src/dev/${entry.file}.ts`, ...rest]

const result = spawnSync(
  'pnpm',
  argv,
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  },
)
process.exit(result.status ?? 1)
