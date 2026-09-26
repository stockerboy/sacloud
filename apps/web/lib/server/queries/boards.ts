import { randomInt } from 'node:crypto'
import { compareSync, hashSync } from 'bcryptjs'
import { prisma } from '@sacloud/db'
import { hidesSeedData, SEED_ORIGIN } from './publicScope'
import type { Prisma } from '@sacloud/db'
import {
  ANONYMOUS_LIST_LABEL,
  BoardPinInput,
  BoardWriteInput,
  CommentWriteInput,
  DeleteInput,
  POST_WRITER_LABEL,
  VoteInput,
  assignAnonymousLabels,
  decodeCursor,
  encodeCursor,
  isAnonymousDisclose,
  type Board,
  type BoardListItem,
  type BoardWriter,
  type Comment,
  type CommentReply,
  type VoteType,
} from '@sacloud/contract'
import { sanitizePostContent } from '@sacloud/ui/sanitize'
import type { CursorPage } from '../cursorPage'
import { toKstIso, toKstIsoOrNull } from '../format'
import {
  PLAYER_CLAN_FALLBACK_SELECT,
  playerClanOf,
  toClanSummaryOrNull,
  toPlayerSummaryOrNull,
} from '../mappers'
import { BOARD_WRITE_INTERVAL } from '../configs'
import { ADMIN_ROLE, currentUserId, voterKey } from '../session'

/**
 * 게시판 · 댓글 조회/명령.
 *
 * **읽기 응답은 Mock(`packages/mock/src/store.ts` 909~1040행)과 같은 형태여야 한다.**
 * 정렬·필터·파생값 규칙을 그대로 옮겼고, 아래 "Mock과 의도적으로 다른 점"만 다르다.
 *
 * Mock과 의도적으로 다른 점
 * 1. **정렬 기준.** Mock은 `Number(b.id) - Number(a.id)`(숫자 id 내림차순)로 최신순을 만든다.
 *    실제 DB의 id는 cuid라 숫자가 아니므로 `createdAt desc, id desc`로 정렬한다.
 *    같은 "최신순"이지만 픽스처를 그대로 시드한 DB에서는 두 순서가 완전히 일치하지 않는다
 *    (픽스처의 createdAt이 무작위라 id 순서와 어긋난다).
 *    댓글도 같은 이유로 `createdAt asc, id asc`로 정렬한다 (Mock은 숫자 id 오름차순).
 * 2. **`me` / `like_type`.** Mock은 `me: false`, `like_type: 0` 고정이지만
 *    실제 서버는 요청자 기준으로 계산한다.
 * 3. **정렬 타이브레이커.** `hot`(인기)은 Mock에 동점 처리 규칙이 없다. 커서 페이지네이션이
 *    흔들리지 않도록 `id desc`를 마지막 기준으로 붙였다.
 *
 * 쓰기(생성/수정/삭제/추천)는 Mock에 없던 동작이다. 아래 각 함수 주석 참고.
 *
 * ---
 *
 * **반익명 표시 (SITE_SPEC_V2 2절 · 에브리타임 방식)**
 *
 * `disclose_type` 이 0 이 아니면 작성자를 **서버에서** 지우고 표시 이름만 내보낸다.
 * 번호(`익명1` · `익명2` …)는 `packages/contract/src/anonymity.ts` 의 순수 함수가 매기고,
 * **그 글 안에서만** 유효하다. 소속 클랜은 익명이어도 나간다(에브리타임의 학교 이름).
 * Mock(`packages/mock/src/store.ts`)도 같은 규칙으로 맞춰 두었다.
 */

/* -------------------------------------------------------------------------- */
/* 반익명 표시 (SITE_SPEC_V2 2절)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 작성자 조회 범위.
 *
 * `USER_SUMMARY_SELECT`(mappers) 에 **소속 클랜과 연동 선수**를 더한 것이다.
 * 소속은 `User → UserPlayerLink → Player → Clan` 으로만 온다. 연동이 없으면 소속도 없다.
 */
const BOARD_USER_SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
  role: true,
  playerLink: {
    select: {
      player: {
        select: {
          id: true,
          name: true,
          clan: {
            select: {
              id: true,
              slug: true,
              name: true,
              markBgUrl: true,
              markFrontUrl: true,
              sourceClanId: true,
              category: true,
              tier: true,
            },
          },
          /*
           * ★★소속은 `Player.clan` 에만 있는 게 아니다★★ (2026-09-20 사장님:
           *   「소속클랜도 안뜨고」)
           *
           *   우리 자료에서 소속은 ★리그 명부(`LeaguePlayer.clan`)★ 에 들어 있는 줄이
           *   훨씬 많다. `Player.clan` 만 보면 ★대부분 무소속★ 으로 나온다 —
           *   실측으로 chococake 가 그랬다(명부엔 deluxe, `Player.clan` 은 비어 있음).
           *
           *   ★검색 화면이 쓰는 그 함수(`playerClanOf`)를 게시판도 똑같이 쓴다.★
           *   두 화면이 같은 눈으로 봐야 「여기선 소속이 있고 저기선 없는」 일이 안 생긴다.
           */
          ...PLAYER_CLAN_FALLBACK_SELECT,
        },
      },
    },
  },
} as const

type BoardUserRow = Prisma.UserGetPayload<{ select: typeof BOARD_USER_SELECT }>

/** `Board.adminAsClan`/`Comment.adminAsClan` 이 고르는 칸 — `PLAYER_CLAN_FALLBACK_SELECT` 의 클랜 칸과 같은 모양 */
const ADMIN_AS_CLAN_SELECT = {
  select: {
    id: true,
    slug: true,
    name: true,
    markBgUrl: true,
    markFrontUrl: true,
    sourceClanId: true,
    category: true,
    tier: true,
  },
} as const

type AdminAsClanRow = Prisma.ClanGetPayload<typeof ADMIN_AS_CLAN_SELECT>

interface WriterSource {
  user?: BoardUserRow | null
  anonAlias: string | null
  discloseType: number
  /** ★관리자 대리 클랜★ — 있으면 실제 소속 대신 이 클랜으로, 무조건 익명으로 보여준다 */
  adminAsClan?: AdminAsClanRow | null
}

/**
 * 게시글·댓글 작성자 (반익명).
 *
 * **여기가 익명의 마지막 방어선이다.** 익명이면 `id`·`avatar_url`·`role`·`player` 를
 * 전부 비우고 표시 이름만 내보낸다. 아바타와 운영자 배지도 신원이므로 함께 지운다.
 * 소속 클랜만은 익명이어도 내보낸다 — 사양이 요구하는 표시다(에브리타임의 학교 이름).
 *
 * `mappers.toWriter` 를 쓰지 않는 이유: 그 함수는 `disclose_type` 을 보지 않아
 * 익명 글에도 실제 닉네임과 user id 를 그대로 실어 보낸다.
 *
 * @param anonLabel 익명일 때 쓸 표시 이름 (`글쓴이` · `익명3` · 목록이면 `익명`)
 */
function toBoardWriter(source: WriterSource, anonLabel: string): BoardWriter {
  const user = source.user ?? null

  /*
   * ★관리자 대리 클랜★ (2026-09-25 사장님 「관리자는 클랜 아무거나 선택해서 마음대로
   *   글 쓸 수 있게 (…) 베리타스 고르고 쓰면 베리타스로 나오고(익명) 관리자 아닌것처럼」)
   *
   *   값이 있으면 ★그 글 전체가 완전 익명★ 이다 — 누가 썼는지 알 길이 없어야 하므로
   *   로그인 여부·disclose_type 과 무관하게 여기서 끊는다. 클랜만 그 클랜으로 보여준다.
   *   서버가 `isAdmin` 을 확인한 뒤에만 이 칸이 채워지므로(아래 `createBoard`/`createComment`),
   *   여기서는 값이 있다는 사실 자체를 믿어도 된다.
   */
  if (source.adminAsClan) {
    return {
      id: null,
      nickname: anonLabel,
      avatar_url: null,
      role: 0,
      anonymous: true,
      clan: toClanSummaryOrNull(source.adminAsClan),
      player: null,
    }
  }

  // 비로그인 글 — 원본 3rd.supply 방식의 자동 별칭을 그대로 둔다 (앞 버전 보존).
  // 계정이 없으므로 소속도 개인기록도 없다.
  if (!user) {
    return {
      id: null,
      nickname: source.anonAlias ?? ANONYMOUS_LIST_LABEL,
      avatar_url: null,
      role: 0,
      anonymous: true,
      clan: null,
      player: null,
    }
  }

  const player = user.playerLink?.player ?? null
  /* ★`Player.clan` 이 먼저, 없으면 리그 명부★ — 검색과 같은 규칙이다 */
  const clan = player === null ? null : toClanSummaryOrNull(playerClanOf(player))

  if (isAnonymousDisclose(source.discloseType)) {
    /*
     * ★★익명이어도 클랜은 나간다 — 이건 버그가 아니다★★ (2026-09-20 사장님)
     *
     * > 「우리게시판 에타처럼하기로 했잖아 ★클랜마크랑 클랜명만 뜨고 익명1★ 이런식으로」
     * > 「빨간색에 글쓴이 소속 클랜마크 / 옆에 형광펜에 ★클랜명+익명★ 표시」
     *
     *   에브리타임이 학교를 띄우는 것과 같다. ★어느 클랜 사람이 썼나★ 가 보여야
     *   글이 읽을 만해진다는 것이 사장님 판단이다.
     *
     * ⚠ ★그래서 클랜만 남기고 나머지는 전부 지운다.★ `id`·`avatar_url`·`role`·
     *   `player` 는 ★사람을 집어낼 수 있는 것★ 이라 여기서 끊는다.
     *   ★클랜을 지우러 오지 마라★ — 지우면 사장님 지시를 되돌리는 것이다.
     *
     * ⚠ ★한계를 알고 쓴다★ (2026-09-20 비판 검수가 짚었다)
     *   사람이 적은 클랜이면 ★클랜 하나로 누군지 좁혀진다.★ 다섯 명짜리 클랜에서
     *   「〃xx · 익명1」 은 사실상 실명에 가깝다. 이건 ★사장님이 알고 고른 값★ 이고,
     *   숨기고 싶은 사람에게는 ★클랜 없는 계정으로 쓰는 길★ 이 남아 있다.
     *   나중에 「작은 클랜은 클랜도 감춘다」 로 바꾸려면 ★여기 한 줄★ 만 고치면 된다.
     */
    return {
      id: null,
      nickname: anonLabel,
      avatar_url: null,
      role: 0,
      anonymous: true,
      clan,
      player: null,
    }
  }

  return {
    id: user.id,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    role: user.role,
    anonymous: false,
    clan,
    player: toPlayerSummaryOrNull(player),
  }
}

/* -------------------------------------------------------------------------- */
/* 공통                                                                         */
/* -------------------------------------------------------------------------- */

const BOARD_LIST_SELECT = {
  id: true,
  categorySlug: true,
  title: true,
  userId: true,
  anonAlias: true,
  discloseType: true,
  writerApp: true,
  viewCount: true,
  likeCount: true,
  dislikeCount: true,
  commentCount: true,
  hasImage: true,
  notice: true,
  pinnedAt: true,
  createdAt: true,
  lastEdited: true,
  user: { select: BOARD_USER_SELECT },
  adminAsClan: ADMIN_AS_CLAN_SELECT,
} as const

const BOARD_DETAIL_SELECT = {
  ...BOARD_LIST_SELECT,
  content: true,
  anonPasswordHash: true,
} as const

type BoardListRow = Prisma.BoardGetPayload<{ select: typeof BOARD_LIST_SELECT }>
type BoardDetailRow = Prisma.BoardGetPayload<{ select: typeof BOARD_DETAIL_SELECT }>

/**
 * @param anonLabel 익명 글의 표시 이름.
 *   목록은 번호 없는 `익명`(번호는 글 안에서만 뜻이 있다), 글 상세는 `글쓴이` 다.
 */
function toBoardListItem(row: BoardListRow, anonLabel: string = ANONYMOUS_LIST_LABEL): BoardListItem {
  return {
    id: row.id,
    category: row.categorySlug,
    title: row.title,
    writer: toBoardWriter(row, anonLabel),
    writer_app: row.writerApp === 1 ? 1 : 0,
    disclose_type: row.discloseType,
    comment_count: row.commentCount,
    view_count: row.viewCount,
    like_count: row.likeCount,
    dislike_count: row.dislikeCount,
    has_image: row.hasImage,
    created_at: toKstIso(row.createdAt),
    last_edited: toKstIsoOrNull(row.lastEdited),
    notice: row.notice,
    pinned: row.pinnedAt !== null,
  }
}

function toBoard(row: BoardDetailRow, me: boolean, likeType: VoteType): Board {
  return {
    // 글 상세에서는 익명 작성자가 `글쓴이` 다 (`익명1` 부터는 댓글 차례)
    ...toBoardListItem(row, POST_WRITER_LABEL),
    content: row.content,
    login: row.userId !== null,
    me,
    like_type: likeType,
  }
}

/**
 * 익명 별칭.
 *
 * 픽스처(`packages/mock/src/dataset.ts`)가 쓰는 `<말머리>-<3자리 숫자>` 형태를 따랐다.
 * **원본의 생성 규칙은 [미확인]이며 이 형태가 원본과 동일함은 검증되지 않았다.**
 * (원본의 검색 옵션 이름이 `ipname`인 것으로 보아 IP 기반 별칭일 가능성이 있으나 확인 못 했다.)
 */
const ANON_ALIAS_STEM = [
  '무명',
  '나그네',
  '지나가던',
  '구경꾼',
  '초보',
  '고인물',
  '눈팅',
  '떠돌이',
] as const

function generateAnonAlias(): string {
  const stem = ANON_ALIAS_STEM[randomInt(0, ANON_ALIAS_STEM.length)] ?? '무명'
  return `${stem}-${randomInt(100, 1000)}`
}

/** 본문에 이미지가 들어 있는지. 원본이 어떻게 판정하는지는 [미확인] — 새니타이즈 결과로 판정한다. */
function detectImage(html: string): boolean {
  return /<img[\s/>]/i.test(html)
}

/** LIKE 패턴에 쓸 키워드 이스케이프 (Postgres 기본 이스케이프 문자는 `\`) */
function escapeLike(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function nextCursorOf(ids: string[]): string | null {
  const last = ids[ids.length - 1]
  return last ? encodeCursor('next', last) : null
}

function prevCursorOf(ids: string[]): string | null {
  const first = ids[0]
  return first ? encodeCursor('prev', first) : null
}

/* -------------------------------------------------------------------------- */
/* 추천/비추천 조회                                                              */
/* -------------------------------------------------------------------------- */

type VoteTarget = 'board' | 'comment'

function toVoteType(value: number | undefined | null): VoteType {
  return value === 1 ? 1 : value === -1 ? -1 : 0
}

/** 요청자의 추천 상태 (`like_type`). Mock은 0 고정이지만 여기서는 실제로 계산한다. */
async function voteTypeOf(
  targetType: VoteTarget,
  targetId: string,
  key: string,
): Promise<VoteType> {
  const vote = await prisma.vote.findUnique({
    where: { targetType_targetId_voterKey: { targetType, targetId, voterKey: key } },
    select: { type: true },
  })
  return toVoteType(vote?.type)
}

/** 여러 대상의 추천 상태를 한 번에 읽는다 (댓글 목록용) */
async function voteTypesOf(
  targetType: VoteTarget,
  targetIds: string[],
  key: string,
): Promise<Map<string, VoteType>> {
  if (targetIds.length === 0) return new Map()
  const votes = await prisma.vote.findMany({
    where: { targetType, targetId: { in: targetIds }, voterKey: key },
    select: { targetId: true, type: true },
  })
  return new Map(votes.map((vote) => [vote.targetId, toVoteType(vote.type)]))
}

/* -------------------------------------------------------------------------- */
/* 게시글 목록                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hot`(인기) 점수.
 *
 * Mock의 `hotScore`(`likeCount*3 + commentCount*2 + viewCount/100`)를 그대로 옮겼다.
 * **원본의 인기글 선정 알고리즘은 [미확인]이며, 이 가중치는 우리가 정한 임시 규칙이다.**
 * 정수 나눗셈이 되지 않도록 `100.0`으로 나누고 `double precision`으로 캐스팅한다.
 */
const HOT_SORT =
  '(("Board"."likeCount" * 3 + "Board"."commentCount" * 2 + "Board"."viewCount" / 100.0))::double precision'

/**
 * ⚠ ★옛 기준★ (2026-09-20 ~ 2026-09-21). 지우지 않는다 — 되돌릴 때 쓴다.
 *
 * ★Hot 에 오르는 최소 점수★ (2026-09-20 사장님).
 *
 * 점수 = 추천×3 + 댓글×2 + 조회÷100. 그러니 ★3★ 은
 *   추천 한 개  ·  댓글 두 개  ·  조회 300회
 * 중 하나면 닿는다. ★사람이 반응한 글★ 이라는 뜻이다.
 *
 * ⚠ 0 으로 두면 방금 쓴 글이 바로 Hot 1위가 된다 — 그게 옛 판이었다.
 * ⚠ 너무 높이면 Hot 이 계속 비어 보인다. 글이 쌓이면 올릴 수 있다.
 */
export const HOT_MIN_SCORE_V1 = 3

/**
 * ★★Hot 에 오르는 기준 — 사장님이 정하셨다★★ (2026-09-21)
 *
 * > 「hot 게시판에 올라오는 기준: ★공지사항, 좋아요10개 댓글10개이상의 글★」
 *
 * 옛 기준(`HOT_MIN_SCORE` 3점)은 ★추천 하나면 올라왔다.★ 그래서 「나 송뚱인데」
 * 같은 글이 메인에 걸렸다. ★옛 값은 위에 그대로 남겼다★ (`CLAUDE.md` 1-4).
 */
/**
 * ⚠ ★2026-09-25 정정★ — 사장님이 문턱을 낮췄다 (「인기글 기준은 좋아요 5개 이상 댓글 5개 이상」).
 * 위 10/10(2026-09-21)은 Hot이 계속 비어 보였다. 값만 바꾼다 — OR 로직은 그대로다.
 */
const HOT_MIN_LIKES = 5
const HOT_MIN_COMMENTS = 5

/** 최신순 정렬키. Mock의 숫자 id 내림차순 대신 작성시각을 쓴다 (상단 주석 1번). */
const RECENT_SORT = '(extract(epoch from "Board"."createdAt"))::double precision'

/**
 * 파라미터를 모아 두는 SQL 조립기.
 *
 * **`Prisma.sql` 태그드 템플릿을 쓰지 않는 이유**
 *   Next의 서버 번들에서는 `Prisma.Sql` 인스턴스 검사가 통과하지 못해, 조각으로 넣은 SQL이
 *   그대로 바인드 파라미터(jsonb)로 직렬화된다 (`argument of WHERE must be type boolean,
 *   not type jsonb`). `$queryRawUnsafe` + 번호 플레이스홀더로 직접 조립한다.
 *
 * **주의: 사용자 입력은 반드시 `bind()`를 거쳐 `$n`으로만 넣는다.**
 * 문자열 결합으로 값을 끼워 넣으면 SQL 인젝션이 된다.
 * 테이블·컬럼명과 정렬식은 이 파일 안의 리터럴만 쓴다.
 */
class SqlParams {
  readonly values: unknown[] = []

  bind(value: unknown): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

export interface BoardListQuery {
  category: string
  cursor: string | null
  size: number
  type?: string | null
  q?: string | null
}

/**
 * 목록 필터.
 *
 * - `hot`은 저장된 카테고리가 아니라 **집계 결과**다. 공지를 뺀 전체가 대상이다.
 * - `notice`는 `notice: true`인 글만, 나머지 카테고리는 `notice: false`인 글만 본다
 *   (공지는 목록 상단에 따로 호출해 고정하므로 일반 목록에서 제외한다).
 * - 검색 3종은 Mock의 `listBoards`와 같다. Mock은 `String.includes`(대소문자 구분)이므로
 *   `ILIKE`가 아니라 `LIKE`를 쓴다.
 */
/**
 * ★상단 고정★ (2026-09-25 사장님 「이 글은 일단 핫게시판 상단 고정, 자유게시판 상단 고정해줘.
 * 관리자 권한으로 아무글이나 상단 고정하고 내릴 수 있게」).
 *
 * 관리자가 `pinnedAt` 을 찍은 글은 ★검색이 아닌 첫 쪽★ 에서 Hot·자유 어느 목록이든 맨 위에
 * 최근 고정순으로 얹힌다(공지든 아니든 · 어느 카테고리든). 그 줄은 평소 목록에서 뺀다 —
 * 같은 글이 위에 한 번, 아래에 또 한 번 나오지 않게. `notice` 목록에는 얹지 않는다(거기가 공지의 출처다).
 *
 * 몇 줄까지: `PIN_LIMIT`. 넘긴 글은 사라지지 않고 평소 목록에 그대로 남는다.
 * (옛 D-261 「관리자 글 자동 고정」은 서버에 구현된 적이 없다 — Mock 에만 있다. 이제 ★사람이 고르는★ 고정이다.)
 */
const PIN_LIMIT = 5

/** 2026-09-25 — 글 상세에서 조회수 세기가 실패해도 글은 보여 준다 (false 면 옛 판 · 그대로 500) */
const VIEW_COUNT_BEST_EFFORT = true

function pinsApply(query: BoardListQuery): boolean {
  return !query.cursor && !query.q?.trim() && query.category !== 'notice'
}

async function pinnedBoardIds(): Promise<string[]> {
  const rows = await prisma.board.findMany({
    /*
     * ⚠ ★2026-09-25 — 공지 글은 고정 줄에 얹지 않는다★ (사장님 「공지가 지금 두개라 하나 삭제했는데 삭제가 안돼」)
     *
     *   공지는 이미 목록 맨 위에 ★제 자리★ 가 있다 (`EtaNoticeCard` — `category=notice` 로 따로 받아 카드로 그린다).
     *   그런데 `notice=true` 인 글에 `pinnedAt` 까지 찍히면 ★공지 카드에 한 번, 고정 줄에 또 한 번★ 나온다.
     *   사장님 눈에는 ★공지가 두 개★ 로 보이고, 하나를 지워도 ★나머지 한 벌이 남아★ 「삭제가 안 된다」가 된다.
     *   (실제 운영에서 `cmufogemb…` 「SA CLOUD 안내 및 서약」 이 notice=true · pinned 둘 다였다.)
     *
     *   고정 자체는 그대로 둔다 — 공지가 아닌 글은 예전처럼 얹힌다. 공지만 빠진다.
     */
    where: { pinnedAt: { not: null }, notice: false, deletedAt: null, ...(hidesSeedData() ? { origin: { not: SEED_ORIGIN } } : {}) },
    orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
    take: PIN_LIMIT,
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

function boardFilter(query: BoardListQuery, params: SqlParams, excludeIds: readonly string[] = []): string {
  const parts: string[] = ['"Board"."deletedAt" IS NULL']

  // 개발용 시드 글은 공개 목록·인기글·검색에 넣지 않는다 (D-116)
  if (hidesSeedData()) parts.push(`"Board"."origin" <> ${params.bind(SEED_ORIGIN)}`)

  /* 고정 줄(첫 쪽 맨 위에 따로 얹는 글)은 평소 목록에서 뺀다. ★모든 쪽★ 에서 뺀다 — 커서 목록은
     첫 쪽과 같은 집합이어야 페이지가 안 밀린다. 상한을 넘긴 고정 글은 이 목록에 안 들어오므로 그대로 남는다 */
  if (excludeIds.length > 0) {
    parts.push(`"Board"."id" NOT IN (${excludeIds.map((id) => params.bind(id)).join(', ')})`)
  }

  if (query.category === 'hot') {
    /*
     * ★★Hot 은 「인기 있는 글」 이다★★ (2026-09-20 사장님: 「글이 바로 hot게시판으로 가는데」)
     *
     *   옛 판은 ★공지가 아닌 글 전부★ 를 인기순으로 늘어놓기만 했다. 그래서
     *   방금 쓴 글(추천 0 · 댓글 0 · 조회 1)이 ★바로 Hot 1위★ 가 됐다.
     *   Hot 이 그냥 「최신글」 이 되어 버려 ★자유 게시판과 구별이 안 된다.★
     *
     *   ★문턱을 둔다★ — 추천·댓글·조회를 섞은 점수가 이만큼은 돼야 올라온다.
     *   에브리타임도 일정 추천을 넘어야 Hot 에 간다.
     *
     * ⚠ 문턱이 높으면 Hot 이 계속 비어 보인다. 그래서 ★낮게 잡았다★ —
     *   추천 한 개(3점)나 댓글 두 개(4점)면 올라온다. 사람이 반응한 글이다.
     * ⚠ 글이 사라지는 게 아니다. 원래 카테고리(자유·공지)에는 그대로 있다.
     */
    parts.push('"Board"."notice" = false')
    /*
     * ⚠ ★2026-09-21 — 사장님이 기준을 직접 정하셨다★
     *
     * > 「hot 게시판에 올라오는 기준: ★공지사항, 좋아요10개 댓글10개이상의 글★
     * >  ★송뚱인데 저딴글은 올라오면 안되지★」
     *
     *   옛 기준은 ★추천 한 개면 올라왔다★ (점수 3). 그래서 「나 송뚱인데」 같은
     *   글이 메인 Hot 에 걸렸다.
     *   이제 ★좋아요 10 이상★ 또는 ★댓글 10 이상★ 이라야 한다. 공지는 따로 얹는다.
     */
    parts.push(`("Board"."likeCount" >= ${HOT_MIN_LIKES} OR "Board"."commentCount" >= ${HOT_MIN_COMMENTS})`)
  } else if (query.category === 'notice') {
    parts.push('"Board"."notice" = true')
  } else {
    parts.push(`"Board"."categorySlug" = ${params.bind(query.category)} AND "Board"."notice" = false`)
  }

  const keyword = query.q?.trim()
  if (keyword) {
    const like = `%${escapeLike(keyword)}%`
    const type = query.type ?? 'board'
    if (type === 'ipname') {
      parts.push(`"Board"."anonAlias" LIKE ${params.bind(like)}`)
    } else if (type === 'nickname') {
      /* 닉네임 검색은 **공개 글만** 본다 (SITE_SPEC_V2 2절).
         익명 글까지 걸리면 닉네임을 넣어 보는 것만으로 익명이 풀린다. */
      parts.push(
        `"Board"."discloseType" = 0 AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "Board"."userId" AND u."nickname" LIKE ${params.bind(like)})`,
      )
    } else {
      const pattern = params.bind(like)
      parts.push(`("Board"."title" LIKE ${pattern} OR "Board"."content" LIKE ${pattern})`)
    }
  }

  return parts.join(' AND ')
}

/** 커서 앵커 글의 정렬키 값. 글이 사라졌으면 null(첫 페이지로 취급). */
async function anchorSortValue(sort: string, id: string): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<{ sort: number }[]>(
    `SELECT ${sort} AS sort FROM "Board" WHERE "Board"."id" = $1`,
    id,
  )
  return rows[0]?.sort ?? null
}

/**
 * 목록 한 페이지의 id를 정렬 순서대로 구한다.
 *
 * `hot`은 저장 컬럼이 아니라 계산식으로 정렬해야 해서 Prisma의 `cursor` 옵션을 쓸 수 없다.
 * 두 정렬(`hot` / 최신순) 모두 같은 방식으로 처리하려고 keyset 페이지네이션을 SQL로 직접 썼다.
 * (`lib/server/cursorPage.ts`의 `cursorPage`는 Prisma 컬럼 정렬 전용이고,
 *  `paginateArray`는 게시글처럼 큰 목록에 쓰지 말라고 되어 있다.)
 */
async function boardIdPage(query: BoardListQuery, excludeIds: readonly string[] = []): Promise<CursorPage<string>> {
  const sort = query.category === 'hot' ? HOT_SORT : RECENT_SORT
  const params = new SqlParams()
  const where = boardFilter(query, params, excludeIds)
  const take = query.size + 1
  const decoded = query.cursor ? decodeCursor(query.cursor) : null
  const anchor = decoded ? await anchorSortValue(sort, decoded.id) : null

  if (!decoded || anchor === null) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "Board"."id" FROM "Board"
       WHERE ${where}
       ORDER BY ${sort} DESC, "Board"."id" DESC
       LIMIT ${params.bind(take)}`,
      ...params.values,
    )
    const items = rows.slice(0, query.size).map((row) => row.id)
    return {
      items,
      cursor: { prev: null, next: rows.length > query.size ? nextCursorOf(items) : null },
    }
  }

  const at = `${params.bind(anchor)}::double precision`
  const anchorId = params.bind(decoded.id)

  if (decoded.direction === 'next') {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "Board"."id" FROM "Board"
       WHERE ${where}
         AND (${sort} < ${at} OR (${sort} = ${at} AND "Board"."id" < ${anchorId}))
       ORDER BY ${sort} DESC, "Board"."id" DESC
       LIMIT ${params.bind(take)}`,
      ...params.values,
    )
    const items = rows.slice(0, query.size).map((row) => row.id)
    return {
      items,
      cursor: {
        prev: prevCursorOf(items),
        next: rows.length > query.size ? nextCursorOf(items) : null,
      },
    }
  }

  // prev: 정렬을 뒤집어 거꾸로 읽고, 표시 순서로 되돌린다
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "Board"."id" FROM "Board"
     WHERE ${where}
       AND (${sort} > ${at} OR (${sort} = ${at} AND "Board"."id" > ${anchorId}))
     ORDER BY ${sort} ASC, "Board"."id" ASC
     LIMIT ${params.bind(take)}`,
    ...params.values,
  )
  const hasPrev = rows.length > query.size
  const items = rows
    .slice(0, query.size)
    .map((row) => row.id)
    .reverse()
  return {
    items,
    // 이전 페이지로 왔다는 것은 뒤에 페이지가 있다는 뜻이다
    cursor: { prev: hasPrev ? prevCursorOf(items) : null, next: nextCursorOf(items) },
  }
}

export async function listBoards(query: BoardListQuery): Promise<CursorPage<BoardListItem>> {
  /* 고정 글은 검색·공지 목록이 아니면 어느 쪽에서든 뺀다(위 `boardFilter`) — 첫 쪽에만 맨 위에 얹는다 */
  const excludes = !query.q?.trim() && query.category !== 'notice' ? await pinnedBoardIds() : []
  const pinnedIds = pinsApply(query) ? excludes : []

  const page = await boardIdPage(query, excludes)
  const ids = [...pinnedIds, ...page.items]
  if (ids.length === 0) return { items: [], cursor: page.cursor }

  const rows = await prisma.board.findMany({
    where: { id: { in: ids } },
    select: BOARD_LIST_SELECT,
  })
  const byId = new Map(rows.map((row) => [row.id, row]))

  return {
    items: ids
      .map((id) => byId.get(id))
      .filter((row): row is BoardListRow => row !== undefined)
      .map((row) => toBoardListItem(row)),
    cursor: page.cursor,
  }
}

/**
 * ★상단 고정/해제★ — 관리자만 (2026-09-25). 어느 글이든(공지·자유·남의 글) 된다.
 * 고정은 `pinnedAt` 을 지금으로, 해제는 null 로. 글 자체는 한 글자도 안 바뀐다.
 */
export async function setBoardPinned(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Board>> {
  const parsed = BoardPinInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const userId = await currentUserId(request)
  if (!(await isAdmin(userId))) return denied('관리자만 고정할 수 있습니다')

  const row = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true, deletedAt: true } })
  if (!row || row.deletedAt) return missing('글을 찾을 수 없습니다')

  await prisma.board.update({
    where: { id: boardId },
    data: { pinnedAt: parsed.data.pinned ? new Date() : null },
  })

  const board = await boardResponse(boardId, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

/* -------------------------------------------------------------------------- */
/* 게시글 상세                                                                   */
/* -------------------------------------------------------------------------- */

async function findBoardRow(boardId: string): Promise<BoardDetailRow | null> {
  const row = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    select: BOARD_DETAIL_SELECT,
  })
  return row
}

/**
 * 글 상세.
 *
 * ── ★★새로고침만 해도 조회수가 오르던 것★★ (2026-09-20 사장님)
 *
 * > 「게시판에서 새로고침만 계속 해도 조회수가 오르는 문제도 해결해줘」
 *
 *   옛 판은 ★들어올 때마다 무조건 +1★ 이었다 (원본 규칙이 [미확인]이라 단순하게 뒀다).
 *   그러면 ★글쓴이가 새로고침 몇 번으로 조회수를 만들 수 있다.★ Hot 점수에도
 *   조회수가 들어가므로 인기글까지 만들어진다.
 *
 *   ★같은 사람이 같은 글을 다시 열면 한동안 안 올린다.★ 쓰기 제한에 쓰던
 *   그 장치(`consumeWriteQuota`)를 그대로 쓴다 — 창이 지나면 다시 한 번 오른다.
 * ⚠ ★막는 것이 아니라 세지 않는 것이다.★ 글은 언제나 정상으로 보인다.
 */

/**
 * ★같은 사람의 같은 글은 이 시간 안에 한 번만 센다★ (2026-09-20).
 *
 * 30분으로 둔다 — 댓글을 보러 몇 번 오가는 동안은 한 번이고,
 * 한참 뒤 다시 들어오면 그건 ★새 방문★ 이라고 볼 만하다.
 */
const VIEW_COUNT_WINDOW_SECONDS = 30 * 60

export async function getBoard(boardId: string, request: Request): Promise<Board | null> {
  const row = await findBoardRow(boardId)
  if (!row) return null

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  /*
   * ⚠ ★2026-09-25 — 조회수는 ★부수 작업★ 이다. 실패해도 글은 보여 준다★
   *   (사장님 「따봉 눌러도 게시물에 따봉수가 안올라가」)
   *   `consumeWriteQuota` 는 트랜잭션이라 DB 풀이 막힌 순간(육각 빌드 등) `Unable to start a transaction`
   *   으로 던졌고, 그러면 ★글 상세 GET 전체가 500★ 이었다 (Vercel 로그로 확인). 화면은 추천 뒤 이 GET 으로
   *   글을 다시 읽는데 그게 실패하면 옛 추천수가 그대로 남아 「안 올라간다」 로 보였다 (DB 엔 올라가 있었다).
   *   조회수 하나 못 세는 것과 글을 못 보여 주는 것 중 후자가 훨씬 나쁘다 — 조회수 쪽만 삼킨다.
   *   옛 판(그대로 던짐)은 VIEW_COUNT_BEST_EFFORT=false.
   */
  let counted = false
  try {
    /*
     * ★관리자는 조회수를 마음대로 올릴 수 있다★ (2026-09-25 사장님 「글 올린거 조회수도
     * 관리자가 맘대로 올릴 수 잇게 해주라」) — 평소엔 위 주석대로 같은 사람이 30분 안에
     * 다시 열어도 안 세지만, 관리자가 보면 그 창을 건너뛰고 열 때마다(=새로고침마다) 그냥 +1.
     */
    counted = (await isAdmin(userId)) || (await consumeWriteQuota(`board:view:${boardId}:${key}`, VIEW_COUNT_WINDOW_SECONDS))
    if (counted) {
      await prisma.board.update({ where: { id: boardId }, data: { viewCount: { increment: 1 } } })
    }
  } catch (error) {
    if (!VIEW_COUNT_BEST_EFFORT) throw error
    console.warn('[board] 조회수 세기 실패 — 글은 그대로 보여 준다', error instanceof Error ? error.message : error)
  }

  const likeType = await voteTypeOf('board', boardId, key)

  return toBoard(
    { ...row, viewCount: row.viewCount + (counted ? 1 : 0) },
    isOwner(row, userId),
    likeType,
  )
}

/** 상세를 다시 읽어 응답에 쓴다 (쓰기 계열의 반환값). 조회수는 올리지 않는다. */
async function boardResponse(boardId: string, request: Request): Promise<Board | null> {
  const row = await findBoardRow(boardId)
  if (!row) return null
  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  return toBoard(row, isOwner(row, userId), await voteTypeOf('board', boardId, key))
}

/**
 * 요청자가 작성자인지 (`me`).
 *
 * 비로그인 익명 글은 작성자를 식별할 수단을 저장하지 않으므로 항상 false다.
 * (원본이 익명 글에 `me: true`를 주는지는 [미확인].)
 */
function isOwner(row: { userId: string | null }, userId: string | null): boolean {
  return row.userId !== null && row.userId === userId
}

/* -------------------------------------------------------------------------- */
/* 권한 · rate limit                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 수정/삭제 권한.
 * - 로그인 글: 작성자 본인만
 * - 비로그인 글: 작성 시 정한 비밀번호가 맞을 때만 (평문은 저장하지 않는다)
 */
function canModify(
  row: { userId: string | null; anonPasswordHash: string | null },
  userId: string | null,
  password: string | null,
): boolean {
  if (row.userId) return row.userId === userId
  if (!password || !row.anonPasswordHash) return false
  return compareSync(password, row.anonPasswordHash)
}

/**
 * 댓글 도배 방지 간격(초). **원본 관측값이 아니다** — 댓글에 걸린 실제 간격은 [미확인]이라
 * `/infos`의 `BOARD_WRITE_INTERVAL`처럼 값으로 내려주지 않는다.
 * 2026-09-25 보안검사에서 댓글 작성엔 아무 제한이 없던 게 드러나서(글쓰기만 있었다)
 * 사람이 답글 두 개를 빠르게 쓰는 것도 막지 않을 만큼 짧게, 자동화 도배만 끊을 값으로 넣는다.
 */
const COMMENT_WRITE_INTERVAL = 3

/**
 * 글쓰기 rate limit — **서버에서 강제한다.**
 *
 * 원본 관측값은 5분에 1글이다 (`/infos`의 `BOARD_WRITE_INTERVAL`).
 * 창(window)이 지났으면 새 창을 열고, 안 지났는데 이미 한도를 채웠으면 false를 돌려준다.
 */
async function consumeWriteQuota(key: string, seconds: number, limit = 1): Promise<boolean> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + seconds * 1000)

  return prisma.$transaction(async (tx) => {
    const current = await tx.rateLimit.findUnique({ where: { key } })
    if (!current || current.windowEnd <= now) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowEnd },
        update: { count: 1, windowEnd },
      })
      return true
    }
    if (current.count >= limit) return false
    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    return true
  })
}

/* -------------------------------------------------------------------------- */
/* 게시글 쓰기                                                                   */
/* -------------------------------------------------------------------------- */

export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 401 | 403 | 404 | 429; message: string }

const invalid = (message: string) => ({ ok: false as const, status: 400 as const, message })
const denied = (message: string) => ({ ok: false as const, status: 403 as const, message })
const missing = (message: string) => ({ ok: false as const, status: 404 as const, message })

/** 운영자 권한. 상수는 `session.ts` 의 `ADMIN_ROLE` 하나만 쓴다 — 여기 따로 2를 박아두면 어긋날 수 있다. */
async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role === ADMIN_ROLE
}

/**
 * ★관리자 대리 클랜★ 을 푼다 (2026-09-25 사장님 「관리자는 클랜 아무거나 선택해서
 * 마음대로 글 쓸 수 있게」). `as_clan_slug` 가 와도 ★요청자가 진짜 관리자일 때만★ 적용한다 —
 * 비관리자가 이 값을 보내면 ★조용히 무시한다★ (에러로 「이 기능이 있다」는 힌트를 주지 않는다).
 * 관리자인데 슬러그가 못 찾으면 그건 실수일 가능성이 커서 에러로 알린다.
 */
async function resolveAdminAsClanId(
  userId: string | null,
  asClanSlug: string | null,
): Promise<{ ok: true; clanId: string | null } | { ok: false; message: string }> {
  if (!asClanSlug) return { ok: true, clanId: null }
  if (!(await isAdmin(userId))) return { ok: true, clanId: null }
  const clan = await prisma.clan.findUnique({ where: { slug: asClanSlug }, select: { id: true } })
  if (!clan) return { ok: false, message: '그 클랜을 찾을 수 없습니다' }
  return { ok: true, clanId: clan.id }
}

export async function createBoard(request: Request, body: unknown): Promise<WriteResult<Board>> {
  const parsed = BoardWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  // TODO(Phase 7 후반): `captcha_token` 실검증. 지금은 계약대로 받기만 한다.

  if (input.category === 'hot') return invalid('인기 카테고리에는 글을 쓸 수 없습니다')
  const category = await prisma.boardCategory.findUnique({ where: { slug: input.category } })
  if (!category) return invalid('없는 카테고리입니다')

  const userId = await currentUserId(request)

  // 공지 카테고리는 운영자만 쓸 수 있게 했다. 원본의 권한 규칙은 [미확인]이다.
  if (category.notice && !(await isAdmin(userId))) return denied('공지는 운영자만 작성할 수 있습니다')

  /*
   * ★2026-09-25 — 비로그인 글쓰기를 다시 연다★ (사장님 「게시판 글 로그인 안해도
   *   쓸 수 있게 해줘」 → 「익명으로」).
   *
   *   2026-09-20 에는 「로그인해야 쓴다」로 막아 뒀다 — 그 근거(`packages/contract/src/boardOpen.ts`)는
   *   ★실제로 도배를 겪은 게 아니라★ 2026-09-02 공개 전 「개폐 검사도 rate limit 도 아예 없던」
   *   상태에서 «이대로 열면 위험하다» 고 미리 걸어 둔 안전장치였다.
   *   그 뒤로 글쓰기에 진짜 도배 방지(`BOARD_WRITE_INTERVAL` 5분당 1글, IP·쿠키 열쇠 `voterKey`)가
   *   생겼으니 지금은 그때와 사정이 다르다.
   *
   *   ★비로그인 글은 비밀번호를 반드시 받는다★ — 댓글(`createComment`)과 같은 규칙이다.
   *   비밀번호가 있어야 나중에 본인이 수정·삭제할 수 있고, 관리자도 근거 없이 지우지 않는다.
   *   ⚠ 옛 길(로그인 필수)은 지우지 않았다 (`CLAUDE.md` 1-4) — 되돌리려면 아래 검사를 되살린다:
   *     `if (!userId) return denied('로그인이 필요합니다')`
   */
  if (!userId && !input.password) return invalid('비로그인 글은 삭제용 비밀번호가 필요합니다')

  const adminAsClan = await resolveAdminAsClanId(userId, input.as_clan_slug)
  if (!adminAsClan.ok) return invalid(adminAsClan.message)

  /*
   * ★관리자는 글쓰기 한도가 없다★ (2026-09-26 사장님 「관리자는 글 계속 쓸 수 있게 해줘
   * 한도 걸리니까 답답해」) — 대리 클랜으로 옮겨 다니며 여러 글을 빠르게 써야 하는데
   * 5분당 1글 제한에 매번 걸렸다. 관리자만 이 창을 건너뛴다 — 일반 사용자는 그대로다.
   */
  const key = await voterKey(request)
  if (!(await isAdmin(userId)) && !(await consumeWriteQuota(`board:write:${key}`, BOARD_WRITE_INTERVAL))) {
    return { ok: false, status: 429, message: '잠시 후 다시 시도해주세요' }
  }

  // 저장 전에 서버에서 새니타이즈한다. 클라이언트 검증만 믿으면 API를 직접 호출해 스크립트를 심을 수 있다.
  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('본문을 입력해주세요')

  const created = await prisma.board.create({
    data: {
      categorySlug: category.slug,
      title: input.title,
      content,
      userId,
      anonAlias: userId ? null : generateAnonAlias(),
      // 평문 비밀번호를 저장하지 않는다
      anonPasswordHash: userId || !input.password ? null : hashSync(input.password, 10),
      discloseType: input.disclose_type,
      // 앱 클라이언트가 없으므로 항상 웹(0)이다
      writerApp: 0,
      hasImage: detectImage(content),
      notice: category.notice,
      adminAsClanId: adminAsClan.clanId,
    },
    select: { id: true },
  })

  const board = await boardResponse(created.id, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

export async function updateBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Board>> {
  const parsed = BoardWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, input.password)) return denied('수정 권한이 없습니다')

  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('본문을 입력해주세요')

  // 카테고리 이동은 지원하지 않는다. 원본에 카테고리 변경 UI가 있는지 [미확인]이라
  // 입력의 `category`는 무시하고 원래 카테고리를 유지한다.
  await prisma.board.update({
    where: { id: boardId },
    data: {
      title: input.title,
      content,
      discloseType: input.disclose_type,
      hasImage: detectImage(content),
      lastEdited: new Date(),
    },
  })

  const board = await boardResponse(boardId, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

/** 글 삭제는 soft delete다. 행을 지우지 않고 `deletedAt`만 채운다. */
export async function deleteBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<{ ok: true }>> {
  const parsed = DeleteInput.safeParse(body ?? { password: null })
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  /*
   * ★관리자는 아무 글이나 지울 수 있다★ (2026-09-25 사장님 「관리자는 글 아무거나 다
   * 삭제할 수 있게 해줘 기본권한으로」) — 본인 글·비밀번호 조건과 별개로, ★기본 권한★ 이다.
   * 댓글도 같은 규칙(`deleteComment`) — 도배·욕설 같은 글은 대부분 남의 글이라 본인 확인만
   * 있으면 관리자가 손 쓸 길이 없었다.
   */
  if (!canModify(row, userId, parsed.data.password) && !(await isAdmin(userId))) {
    return denied('삭제 권한이 없습니다')
  }

  await prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } })
  return { ok: true, value: { ok: true } }
}

/* -------------------------------------------------------------------------- */
/* 추천 / 비추천                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 추천/비추천 적용.
 *
 * `(targetType, targetId, voterKey)` 유니크로 한 사람당 1행만 남긴다.
 * 같은 사람이 다시 누르면 갱신하고, `type: 0`이면 취소(행 삭제)한다.
 * 집계 컬럼(`likeCount`/`dislikeCount`)은 같은 트랜잭션에서 함께 옮긴다.
 */
async function applyVote(
  targetType: VoteTarget,
  targetId: string,
  key: string,
  type: VoteType,
  unlimited: boolean = false,
): Promise<void> {
  /*
   * ★관리자는 좋아요를 무제한으로 누를 수 있다★ (2026-09-25 사장님 「관리자는 좋아요 제한 없이
   * 누를 수 있게 해줘」, 이어서 「내가 누른 좋아요는 바깥에 안떠」). 평소엔 위 주석대로
   * voterKey 하나당 1표만 세지만, 관리자가 추천을 누르면 그 유일함을 건너뛰고 누를 때마다
   * 그냥 집계만 +1 한다 — ★이전에 이미 눌렀었는지는 안 본다★ (그래서 토글 없이 계속 오른다).
   *
   * ⚠ ★2026-09-25 정정★ — 첫 판은 `Vote` 행을 아예 안 남겼다. 그러면 서버가 늘 `like_type: 0`
   * 을 돌려줘서 화면의 추천 단추가 ★한 번도 안 눌린 것처럼★ 보였다(「내가 누른 좋아요는
   * 바깥에 안떠」). 이제 `type:1` 로 행을 올려/갱신한다 — 단추는 계속 눌린(빨간) 채로 보이고,
   * 그와 별개로 집계는 클릭마다 무조건 +1 이다. 프런트(`PostView`/`CommentList` 의
   * `adminUnlimitedLike`)가 클릭마다 토글 대신 항상 1을 보내야 이 지름길을 계속 탄다.
   * 비추천/취소는 이 지름길을 안 탄다(1이어야만).
   */
  if (unlimited && type === 1) {
    const where = { targetType_targetId_voterKey: { targetType, targetId, voterKey: key } }
    const data = { likeCount: { increment: 1 } }
    await prisma.$transaction([
      targetType === 'board'
        ? prisma.board.update({ where: { id: targetId }, data })
        : prisma.comment.update({ where: { id: targetId }, data }),
      prisma.vote.upsert({ where, create: { targetType, targetId, voterKey: key, type: 1 }, update: { type: 1 } }),
    ])
    return
  }

  await prisma.$transaction(async (tx) => {
    const where = { targetType_targetId_voterKey: { targetType, targetId, voterKey: key } }
    const existing = await tx.vote.findUnique({ where, select: { type: true } })
    const previous = toVoteType(existing?.type)
    if (previous === type) return

    if (type === 0) {
      if (existing) await tx.vote.delete({ where })
    } else {
      await tx.vote.upsert({
        where,
        create: { targetType, targetId, voterKey: key, type },
        update: { type },
      })
    }

    const likeDelta = (type === 1 ? 1 : 0) - (previous === 1 ? 1 : 0)
    const dislikeDelta = (type === -1 ? 1 : 0) - (previous === -1 ? 1 : 0)
    const data = {
      likeCount: { increment: likeDelta },
      dislikeCount: { increment: dislikeDelta },
    }

    if (targetType === 'board') {
      await tx.board.update({ where: { id: targetId }, data })
    } else {
      await tx.comment.update({ where: { id: targetId }, data })
    }
  })
}

export async function voteBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Board>> {
  const parsed = VoteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  await applyVote('board', boardId, key, parsed.data.type, await isAdmin(userId))

  const board = await boardResponse(boardId, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

/* -------------------------------------------------------------------------- */
/* 댓글                                                                          */
/* -------------------------------------------------------------------------- */

const COMMENT_SELECT = {
  id: true,
  boardId: true,
  parentId: true,
  content: true,
  userId: true,
  anonAlias: true,
  anonPasswordHash: true,
  discloseType: true,
  writerApp: true,
  likeCount: true,
  dislikeCount: true,
  deleted: true,
  createdAt: true,
  lastEdited: true,
  user: { select: BOARD_USER_SELECT },
  adminAsClan: ADMIN_AS_CLAN_SELECT,
} as const

type CommentRow = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>

/** 익명 번호를 매길 때 쓰는 정렬 — 화면에 보이는 순서와 **같아야** 번호가 흔들리지 않는다 */
const COMMENT_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as const

/**
 * 글 하나 안의 익명 번호표.
 *
 * 번호는 **그 글 안에서만** 유효하다 (`packages/contract/src/anonymity.ts`).
 * 그래서 한 댓글만 응답할 때도 그 글의 댓글 전체를 같은 순서로 읽어 표를 다시 만든다.
 * 부분만 보고 번호를 매기면 새로고침마다 번호가 바뀐다.
 */
async function commentAnonLabels(boardId: string, boardUserId: string | null) {
  const all = await prisma.comment.findMany({
    where: { boardId },
    orderBy: [...COMMENT_ORDER],
    select: { id: true, userId: true, discloseType: true, parentId: true, adminAsClanId: true },
  })
  return assignAnonymousLabels({
    postAuthorKey: boardUserId,
    subjects: nestedOrder(all)
      // 공개 댓글은 번호를 소비하지 않는다 — 소비하면 `익명2` 다음이 `익명5` 가 된다
      .filter((comment) => isAnonymousDisclose(comment.discloseType))
      .map((comment) => ({
        id: comment.id,
        /*
         * ★관리자가 대리 클랜으로 위장하면 「글쓴이」 표를 안 받는다★ (2026-09-26 사장님
         * 「내가 쓴글 나 관리자 아닌척하고 댓글 쓸라고 하면 글쓴이라고 나와 익명1이라고
         * 안나오도」).
         *
         *   `assignAnonymousLabels` 는 「글쓴이」 규칙(원문 사양 그대로 — 글 작성자 본인이
         *   자기 글에 익명으로 달면 번호 대신 「글쓴이」)을 그대로 쓴다 — 일반 사용자는
         *   이 규칙이 맞다. 그런데 관리자가 ★남의 클랜인 척★ 위장할 때는 「글쓴이」 표가
         *   「이 계정이 이 글 주인이다」를 그대로 드러내 위장이 깨진다.
         *
         *   `authorKey` 를 `null` 로 주면(비로그인처럼) `assignAnonymousLabels` 가 그
         *   자체로 「글쓴이 특례」를 안 타고 새 번호를 준다 — 순수 함수는 안 건드리고
         *   ★위장한 댓글만★ 입력에서 골라 낸다.
         */
        authorKey: comment.adminAsClanId !== null ? null : comment.userId,
      })),
  })
}

/**
 * 번호를 매길 **차례**를 화면에 그려지는 순서로 맞춘다 (교차검증 [중간 5]).
 *
 * 사양 원문은 "글 안에서 **등장 순서**" 다. 그런데 댓글은 평면이 아니라
 * `부모 → 그 밑의 대댓글` 로 그려진다(`listComments`). 작성시각만으로 번호를 매기면
 * 늦게 달린 부모에 붙은 이른 대댓글이 낮은 번호를 가져가, 화면에서
 * `익명1 · 익명5 · 익명2` 처럼 뒤섞여 보인다.
 *
 * 그래서 **그리는 순서 그대로** 늘어놓고 번호를 준다.
 */
function nestedOrder<T extends { id: string; parentId: string | null }>(all: T[]): T[] {
  const roots = all.filter((comment) => comment.parentId === null)
  return roots.flatMap((root) => [root, ...all.filter((child) => child.parentId === root.id)])
}

/**
 * 댓글 → 대댓글 응답.
 *
 * 지켜야 하는 규칙 (Mock `toCommentReply`와 동일)
 * - 삭제된 댓글은 **행은 남기고 `content`만 빈 문자열**로 내린다.
 * - `parent_id`는 최상위 댓글일 때 **자기 id**가 들어간다.
 *   (`Comment`(최상위) 응답에서는 `null`로 덮어쓴다. 원본이 그렇게 내려준다.)
 */
function toCommentReply(
  comment: CommentRow,
  boardUserId: string | null,
  userId: string | null,
  likeType: VoteType,
  anonLabel: string,
): CommentReply {
  return {
    id: comment.id,
    board_id: comment.boardId,
    parent_id: comment.parentId ?? comment.id,
    content: comment.deleted ? '' : comment.content,
    writer: toBoardWriter(comment, anonLabel),
    writer_app: comment.writerApp === 1 ? 1 : 0,
    disclose_type: comment.discloseType,
    like_count: comment.likeCount,
    dislike_count: comment.dislikeCount,
    like_type: likeType,
    deleted: comment.deleted,
    board_writer: boardUserId !== null && comment.userId !== null && boardUserId === comment.userId,
    login: comment.userId !== null,
    me: isOwner(comment, userId),
    created_at: toKstIso(comment.createdAt),
    last_edited: toKstIsoOrNull(comment.lastEdited),
  }
}

/**
 * 글의 댓글 목록. 대댓글은 **1단계까지만** 중첩한다.
 * 없는 글이면 빈 배열이다 (Mock과 동일).
 */
export async function listComments(boardId: string, request: Request): Promise<Comment[]> {
  const all = await prisma.comment.findMany({
    where: { boardId },
    orderBy: [...COMMENT_ORDER],
    select: COMMENT_SELECT,
  })
  if (all.length === 0) return []

  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    select: { userId: true },
  })
  if (!board) return []

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  const likeTypes = await voteTypesOf(
    'comment',
    all.map((comment) => comment.id),
    key,
  )
  const anonLabels = await commentAnonLabels(boardId, board.userId)
  const map = (comment: CommentRow) =>
    toCommentReply(
      comment,
      board.userId,
      userId,
      likeTypes.get(comment.id) ?? 0,
      anonLabels.get(comment.id) ?? ANONYMOUS_LIST_LABEL,
    )

  return all
    .filter((comment) => comment.parentId === null)
    .map((root) => ({
      ...map(root),
      parent_id: null,
      comments: all.filter((child) => child.parentId === root.id).map(map),
    }))
}

async function commentResponse(commentId: string, request: Request): Promise<Comment | null> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: COMMENT_SELECT,
  })
  if (!comment) return null

  const board = await prisma.board.findUnique({
    where: { id: comment.boardId },
    select: { userId: true },
  })
  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])

  // 대댓글은 자기 밑에 다시 댓글을 달 수 없으므로 `comments`는 항상 비어 있다.
  const children =
    comment.parentId === null
      ? await prisma.comment.findMany({
          where: { parentId: commentId },
          orderBy: [...COMMENT_ORDER],
          select: COMMENT_SELECT,
        })
      : []

  const votes = await voteTypesOf('comment', [comment.id, ...children.map((row) => row.id)], key)
  const anonLabels = await commentAnonLabels(comment.boardId, board?.userId ?? null)
  const map = (row: CommentRow) =>
    toCommentReply(
      row,
      board?.userId ?? null,
      userId,
      votes.get(row.id) ?? 0,
      anonLabels.get(row.id) ?? ANONYMOUS_LIST_LABEL,
    )

  return {
    ...map(comment),
    parent_id: comment.parentId,
    comments: children.map(map),
  }
}

export async function createComment(
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = CommentWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  const board = await prisma.board.findFirst({
    where: { id: input.board_id, deletedAt: null },
    select: { id: true },
  })
  if (!board) return missing('글을 찾을 수 없습니다')

  // 대댓글은 1단계까지만 — 부모가 이미 대댓글이면 거절한다
  let parentId: string | null = null
  if (input.parent_id) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parent_id },
      select: { id: true, boardId: true, parentId: true },
    })
    if (!parent || parent.boardId !== board.id) return invalid('부모 댓글을 찾을 수 없습니다')
    if (parent.parentId !== null) return invalid('대댓글에는 다시 댓글을 달 수 없습니다')
    parentId = parent.id
  }

  const userId = await currentUserId(request)
  if (!userId && !input.password) return invalid('비로그인 댓글은 삭제용 비밀번호가 필요합니다')

  const adminAsClan = await resolveAdminAsClanId(userId, input.as_clan_slug)
  if (!adminAsClan.ok) return invalid(adminAsClan.message)

  /* ★관리자는 댓글 한도도 없다★ — `createBoard` 와 같은 이유·같은 지시 (2026-09-26) */
  const rateKey = await voterKey(request)
  if (!(await isAdmin(userId)) && !(await consumeWriteQuota(`comment:write:${rateKey}`, COMMENT_WRITE_INTERVAL))) {
    return { ok: false, status: 429, message: '잠시 후 다시 시도해주세요' }
  }

  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('내용을 입력해주세요')

  const created = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        boardId: board.id,
        parentId,
        content,
        userId,
        anonAlias: userId ? null : generateAnonAlias(),
        anonPasswordHash: userId || !input.password ? null : hashSync(input.password, 10),
        discloseType: input.disclose_type,
        writerApp: 0,
        adminAsClanId: adminAsClan.clanId,
      },
      select: { id: true },
    })
    await tx.board.update({ where: { id: board.id }, data: { commentCount: { increment: 1 } } })
    return comment
  })

  const comment = await commentResponse(created.id, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}

export async function updateComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = CommentWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, anonPasswordHash: true, deleted: true },
  })
  if (!row || row.deleted) return missing('댓글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, parsed.data.password)) return denied('수정 권한이 없습니다')

  const content = sanitizePostContent(parsed.data.content)
  if (!content.trim()) return invalid('내용을 입력해주세요')

  await prisma.comment.update({
    where: { id: commentId },
    data: { content, lastEdited: new Date() },
  })

  const comment = await commentResponse(commentId, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}

/**
 * 댓글 삭제 — **물리 삭제하지 않는다.** `deleted: true`로 두고 응답에서 내용만 가린다.
 *
 * `Board.commentCount`는 줄이지 않는다. Mock의 `comment_count`는 삭제된 댓글까지 포함한
 * "댓글 행 수"이고(`store.ts`의 `commentCountOf`), 시드된 값도 그렇게 계산돼 있다.
 * 여기서 감소시키면 같은 데이터에 대해 Mock과 다른 숫자가 나온다.
 * **원본이 삭제된 댓글을 세는지는 [미확인]이다.**
 */
export async function deleteComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<{ ok: true }>> {
  const parsed = DeleteInput.safeParse(body ?? { password: null })
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, anonPasswordHash: true },
  })
  if (!row) return missing('댓글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  /* ★관리자는 아무 댓글이나 지울 수 있다★ — `deleteBoard` 와 같은 규칙 (2026-09-25) */
  if (!canModify(row, userId, parsed.data.password) && !(await isAdmin(userId))) {
    return denied('삭제 권한이 없습니다')
  }

  await prisma.comment.update({ where: { id: commentId }, data: { deleted: true } })
  return { ok: true, value: { ok: true } }
}

export async function voteComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = VoteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
  if (!row) return missing('댓글을 찾을 수 없습니다')

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  await applyVote('comment', commentId, key, parsed.data.type, await isAdmin(userId))

  const comment = await commentResponse(commentId, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}
